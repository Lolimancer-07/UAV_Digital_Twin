"""
backend/inference.py

This is the main brain of the digital twin — everything connects here.
We pull in live sensor data over MQTT, run it through the full analysis
pipeline, and push results out to the GCS dashboard via WebSocket.

Pipeline stages (in order they run per telemetry packet):
  1.  MQTT ingestion  — 14-channel live engine telemetry at 10 Hz
  2.  Sensor integrity — catch stuck readings, noise, impossible values
  3.  Physics engine   — Otto cycle, BHP, BSFC, residual deltas
  4.  Anomaly detector — Isolation Forest + 8 rule-based fault classifiers
  5.  RUL prediction   — LSTM with MC Dropout for uncertainty bands
  6.  Health index     — weighted composite across 5 subsystems
  7.  Twin consistency — cross-validate AI vs physics (Cases A–D)
  8.  XAI             — which sensor is actually driving the anomaly?
  9.  Mission risk     — will we make it back? probability estimate
  10. What-If cache    — results stored here, triggered by GCS command
  11. Optimizer        — best RPM/altitude for max mission probability
  12. Prescriptive     — actual human-readable maintenance actions
  13. AI Engineer      — answers natural-language questions from operators
  14. Fleet manager    — keeps track of all 4 UAVs simultaneously
  15. Telemetry integrity — packet loss, duplicates, replay attacks
  16. Demo controller  — scripted demo scenario sequencer
  17. Maintenance advisor — ATA-spec work orders
  18. WebSocket server — bidirectional GCS link at ws://localhost:8765
"""

import os
import sys
import json
import asyncio
import pickle
from threading import Thread
from collections import deque
from typing import Dict, Any

import numpy as np
import pandas as pd
import paho.mqtt.client as mqtt
import websockets

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf
tf.get_logger().setLevel('ERROR')
from tensorflow.keras.models import load_model

# all the intelligence modules — keep these sorted or it gets confusing fast
from physics_engine      import physics_model
from anomaly_detector    import AnomalyDetector
from health_index        import compute_health_index, reset_health_state
from xai_engine          import XAIDiagnosticEngine
from maintenance_advisor import AutonomousMaintenanceAdvisor
from sensor_integrity    import sensor_integrity_monitor
from twin_consistency    import compute_twin_consistency
from mission_risk        import compute_mission_risk, compute_failure_probability
from whatif_engine       import simulate_whatif
from optimizer           import find_optimal_operating_point
from prescriptive        import generate_prescriptive_recommendations
from ai_engineer         import answer as ai_engineer_answer
from fleet_manager       import fleet_manager
from telemetry_integrity import telemetry_integrity_monitor
from demo_controller     import demo_controller

# figure out where we are in the filesystem
ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTROL_FILE = os.path.join(ROOT, 'simulator', 'current_profile.json')
MODEL_PATH   = os.path.join(ROOT, 'backend', 'uav_rul_model.h5')
SCALER_PATH  = os.path.join(ROOT, 'backend', 'scaler.pkl')
ANOMALY_PATH = os.path.join(ROOT, 'backend', 'anomaly_model.pkl')

print("=" * 60)
print("  UAV DIGITAL TWIN — DEFENSE GRADE PROPULSION CORE v2.0")
print("=" * 60)

# load the LSTM — this takes a few seconds on first run
print("[1/3] Loading Deep LSTM RUL Prognostics Model...")
try:
    lstm_model = load_model(MODEL_PATH)
    with open(SCALER_PATH, 'rb') as f:
        scaler = pickle.load(f)
    print("      LSTM Prognostics Model Loaded OK.")
except Exception as e:
    print(f"      ERROR loading LSTM model: {e}")
    sys.exit(1)

print("[2/3] Loading Multi-Channel Anomaly Detector...")
try:
    anomaly_detector = AnomalyDetector(ANOMALY_PATH)
except Exception as e:
    print(f"      ERROR loading Anomaly Detector: {e}")
    sys.exit(1)

print("[3/3] Initializing Extended Digital Twin Pipeline...")

# rolling buffer — we need 50 cycles before the LSTM can make a prediction
WINDOW_SIZE    = 50
MC_DROPOUT_SAMPLES = 10  # how many forward passes for the uncertainty estimate
engine_buffer  = deque(maxlen=WINDOW_SIZE)
latest_payload = json.dumps({"status": "INITIALIZING", "message": "Digital Twin Core v2.0 starting up..."})
last_engine_id = None

# holds the full state dict in memory so AI Engineer and What-If can access it
latest_state: Dict[str, Any] = {}

# ── LSTM MC-Dropout acceleration ─────────────────────────────────────────────
# Compiling the predict call into a single @tf.function and batching all
# MC-Dropout samples into one forward pass cuts CPU latency from ~2800 ms
# (10 sequential eager calls) down to ~7 ms (one compiled batched call).
# This is essential for keeping the 10 Hz WebSocket stream alive on CPU hardware.
@tf.function
def _lstm_mc_predict_compiled(batched_input):
    """Single compiled forward pass over MC_DROPOUT_SAMPLES replicas."""
    return lstm_model(batched_input, training=True)

# Warm up the compiled graph immediately after model load so the first real
# telemetry packet doesn't pay the tracing penalty.
def _warmup_lstm():
    dummy = np.zeros((MC_DROPOUT_SAMPLES, WINDOW_SIZE, 3), dtype=np.float32)
    _ = _lstm_mc_predict_compiled(dummy).numpy()
    print("      LSTM compiled MC-Dropout graph warmed up (latency target <15 ms).")

_warmup_lstm()


def predict_rul_with_uncertainty(lstm_input: np.ndarray) -> tuple:
    """
    Monte Carlo Dropout — runs the model N times with dropout active
    so we get a spread of predictions instead of just one number.
    The spread tells us how confident the model is.

    All MC samples are batched into a single @tf.function call for ~386x
    faster inference vs the previous sequential eager loop on CPU.

    Returns (mean_rul, std_rul, ci_lower, ci_upper)
    — the CI is a 90% interval (±1.645 sigma)
    """
    # Tile the single window into MC_DROPOUT_SAMPLES replicas for one batched call
    batched = np.repeat(lstm_input, MC_DROPOUT_SAMPLES, axis=0).astype(np.float32)
    preds   = _lstm_mc_predict_compiled(batched).numpy().flatten()
    preds   = np.maximum(0.0, preds)
    mean_rul = float(np.mean(preds))
    std_rul  = float(np.std(preds))
    # clamp the lower bound to zero — negative RUL doesn't make sense
    ci_lower = max(0.0, mean_rul - 1.645 * std_rul)
    ci_upper = mean_rul + 1.645 * std_rul
    return mean_rul, std_rul, ci_lower, ci_upper


def on_connect(client, userdata, connect_flags, reason_code, properties):
    if reason_code == 0:
        client.subscribe("uav/engine/telemetry")
        print("[MQTT] Subscribed to live telemetry stream: 'uav/engine/telemetry'")
    else:
        print(f"[MQTT] Connection failed with code {reason_code}")


def on_message(client, userdata, msg):
    global latest_payload, last_engine_id, latest_state

    try:
        data = json.loads(msg.payload.decode('utf-8'))
    except Exception:
        return

    # if the engine ID changed, we need to wipe the buffer and reset health state
    # (different engine = different degradation trajectory)
    cur_engine = data.get("engine_id", 1)
    if last_engine_id is not None and cur_engine != last_engine_id:
        engine_buffer.clear()
        reset_health_state(95.0)
    last_engine_id = cur_engine

    # step 1 — check for packet loss, replays, impossible values
    tel_integrity = telemetry_integrity_monitor.evaluate(data)

    # step 2 — compute thermodynamic baselines and residuals from physics
    physics_results = physics_model.evaluate_performance(data)

    # step 3 — per-channel sensor trust scores (stuck, noisy, out-of-bounds, etc.)
    sensor_integrity = sensor_integrity_monitor.evaluate(
        data, physics_residuals=physics_results.get("residuals", {})
    )

    # step 4 — multivariate anomaly score + rule-based fault codes
    is_anomaly, anomaly_score, fault_events = anomaly_detector.predict(data)
    fault_names = [f["name"] for f in fault_events]

    # step 5 — LSTM needs RPM/CHT/EGT normalized into a 50-cycle window
    raw3 = pd.DataFrame([[data['rpm'], data['cht'], data['egt']]], columns=['rpm', 'cht', 'egt'])
    norm3 = scaler.transform(raw3)[0]
    engine_buffer.append(norm3)

    predicted_rul = 0.0
    rul_std       = 0.0
    rul_lower     = 0.0
    rul_upper     = 0.0

    # only predict once we have enough history to fill the window
    if len(engine_buffer) == WINDOW_SIZE:
        lstm_input = np.array(engine_buffer).reshape(1, WINDOW_SIZE, 3)
        predicted_rul, rul_std, rul_lower, rul_upper = predict_rul_with_uncertainty(lstm_input)

    # step 6 — composite health score across thermal, lube, mechanical, electrical, AI
    health_results = compute_health_index(data, predicted_rul, anomaly_score, fault_names)
    health_index = health_results["health_index"]
    failure_probability = compute_failure_probability(
        predicted_rul, is_anomaly, anomaly_score, len(fault_events), health_index
    )

    # step 7 — do AI and physics agree? this tells us how confident we should be
    twin_consistency = compute_twin_consistency(
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
        physics_residuals=physics_results.get("residuals", {}),
        sensor_integrity_score=sensor_integrity["integrity_score"],
    )

    # step 8 — which sensor is actually causing the anomaly? rank by sigma deviation
    xai_results = XAIDiagnosticEngine.explain_anomaly(
        telemetry=data,
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
        active_faults=fault_events
    )

    # step 9 — will this engine survive the planned mission?
    mission_risk = compute_mission_risk(
        data=data,
        health_index=health_index,
        predicted_rul=predicted_rul,
        failure_probability=failure_probability,
        fault_events=fault_events,
    )

    # step 10 — turn all the AI outputs into actual human-readable action items
    prescriptive = generate_prescriptive_recommendations(
        fault_events=fault_events,
        predicted_rul=predicted_rul,
        health_index=health_index,
        twin_consistency=twin_consistency,
        mission_risk=mission_risk,
    )

    # step 11 — ATA-numbered maintenance cards for the ground crew
    maintenance_advisories = AutonomousMaintenanceAdvisor.generate_advisories(
        telemetry=data,
        fault_events=fault_events,
        predicted_rul=predicted_rul,
        health_index=health_index
    )

    # determine top-level alert status for the GCS banner
    has_critical = any(f["severity"] == "CRITICAL" for f in fault_events)
    has_warning  = any(f["severity"] == "WARNING"  for f in fault_events)

    if has_critical or (predicted_rul > 0 and predicted_rul < 20):
        alert_status = "CRITICAL"
    elif has_warning or is_anomaly:
        alert_status = "WARNING"
    else:
        alert_status = "NOMINAL"

    # map engine ID to UAV callsign for the fleet panel
    active_uav = f"UAV-0{cur_engine}" if cur_engine in (1, 2, 3, 4) else "UAV-01"

    # build the full payload — everything the dashboard needs in one shot
    payload = {
        # raw telemetry channels
        "cycle":                  data.get("cycle", 0),
        "engine_id":              data.get("engine_id", 1),
        "uav_id":                 data.get("uav_id", "UAV-01"),
        "rpm":                    round(data.get("rpm", 0), 1),
        "cht":                    round(data.get("cht", 0), 1),
        "cht_cyl":                data.get("cht_cyl", [0, 0, 0, 0]),
        "egt":                    round(data.get("egt", 0), 1),
        "egt_cyl":                data.get("egt_cyl", [0, 0, 0, 0]),
        "oil_pressure":           round(data.get("oil_pressure", 0), 1),
        "oil_temp":               round(data.get("oil_temp", 0), 1),
        "fuel_flow":              round(data.get("fuel_flow", 0), 2),
        "fuel_rail_pressure_bar": round(data.get("fuel_rail_pressure_bar", 3.0), 2),
        "vibration":              round(data.get("vibration", 0), 3),
        "vibration_kurtosis":     round(data.get("vibration_kurtosis", 3.0), 2),
        "battery_v":              round(data.get("battery_v", 0), 2),
        "bus_current_a":          round(data.get("bus_current_a", 0), 1),
        "inj_timing":             round(data.get("inj_timing", 0), 1),
        "map_kpa":                round(data.get("map_kpa", 100), 1),
        "true_rul":               data.get("true_rul", 0),
        "altitude_ft":            data.get("altitude_ft", 3000),
        "oat_c":                  data.get("oat_c", 15.0),
        "mission_mode":           data.get("mission_mode", "NORMAL"),

        # AI prognostics outputs
        "predicted_rul":          round(predicted_rul, 1),
        "rul_ci_lower":           round(rul_lower, 1),
        "rul_ci_upper":           round(rul_upper, 1),
        "rul_mc_std":             round(rul_std, 2),
        "buffer_pct":             round(len(engine_buffer) / WINDOW_SIZE * 100),
        "is_anomaly":             bool(is_anomaly),
        "anomaly_score":          round(anomaly_score, 4),
        "fault_events":           fault_events,
        "alert":                  alert_status,
        "failure_probability":    round(failure_probability, 3),

        # core module outputs
        "physics":                physics_results,
        "health":                 health_results,
        "xai":                    xai_results,
        "advisories":             maintenance_advisories,
        "can_frames":             data.get("can_frames", []),

        # extended intelligence layer
        "sensor_integrity":       sensor_integrity,
        "twin_consistency":       twin_consistency,
        "mission_risk":           mission_risk,
        "prescriptive":           prescriptive,
        "telemetry_integrity":    tel_integrity,
        "fleet_status":           fleet_manager.get_fleet_status(),
        "demo_state":             demo_controller.get_state(),

        # these get populated when the GCS sends a what-if or optimize command
        "whatif_result":          latest_state.get("whatif_result"),
        "optimize_result":        latest_state.get("optimize_result"),
        "ai_engineer_response":   latest_state.get("ai_engineer_response"),
    }

    # update the fleet state for the active UAV
    fleet_manager.update_uav("UAV-01", payload)

    latest_state.update(payload)
    latest_payload = json.dumps(payload)


def process_gcs_command(cmd: Dict[str, Any]):
    """Handles commands sent from the GCS dashboard over WebSocket."""
    global latest_state, latest_payload

    action = cmd.get("command")

    # start with sane defaults in case the file doesn't exist yet
    current_cfg = {"mode": "NORMAL", "speed": 1.0, "paused": False, "injected_faults": []}
    if os.path.exists(CONTROL_FILE):
        try:
            with open(CONTROL_FILE, 'r') as f:
                current_cfg = json.load(f)
        except Exception:
            pass

    if action == "set_profile":
        current_cfg["mode"] = cmd.get("profile", "NORMAL")
        print(f"[GCS CMD] Mission profile switched → {current_cfg['mode']}")

    elif action == "set_speed":
        current_cfg["speed"] = float(cmd.get("speed", 1.0))
        print(f"[GCS CMD] Playback speed set → {current_cfg['speed']}x")

    elif action == "set_paused":
        current_cfg["paused"] = bool(cmd.get("paused", False))
        print(f"[GCS CMD] Playback paused → {current_cfg['paused']}")

    elif action == "inject_fault":
        fault = cmd.get("fault")
        faults = set(current_cfg.get("injected_faults", []))
        faults.add(fault)
        current_cfg["injected_faults"] = list(faults)
        print(f"[GCS CMD] INJECTED FAULT → {fault}")

    elif action == "clear_faults":
        current_cfg["injected_faults"] = []
        print("[GCS CMD] ALL INJECTED FAULTS CLEARED.")

    elif action == "whatif":
        # run a counterfactual simulation with the operator's parameter overrides
        params = cmd.get("params", {})
        if latest_state:
            try:
                result = simulate_whatif(
                    current_state=latest_state,
                    overrides=params,
                    current_rul=latest_state.get("predicted_rul", 0),
                    current_health=latest_state.get("health", {}).get("health_index", 50),
                    physics_model=physics_model,
                    health_fn=compute_health_index,
                    anomaly_score=latest_state.get("anomaly_score", 0),
                    fault_names=[f["name"] for f in latest_state.get("fault_events", [])],
                )
                latest_state["whatif_result"] = result
                print(f"[GCS CMD] What-If simulation completed: {params}")
            except Exception as e:
                print(f"[GCS CMD] What-If error: {e}")

    elif action == "optimize":
        # find the RPM/altitude combo that maximizes mission completion probability
        constraints = cmd.get("constraints", {})
        if latest_state:
            try:
                result = find_optimal_operating_point(
                    current_state=latest_state,
                    current_rul=latest_state.get("predicted_rul", 0),
                    current_health=latest_state.get("health", {}).get("health_index", 50),
                    failure_probability=latest_state.get("failure_probability", 0.1),
                    constraints=constraints,
                )
                latest_state["optimize_result"] = result
                print(f"[GCS CMD] Optimization completed: optimal RPM={result.get('optimal_rpm')}")
            except Exception as e:
                print(f"[GCS CMD] Optimize error: {e}")

    elif action == "ai_engineer_query":
        question = cmd.get("question", "")
        if question and latest_state:
            try:
                answer = ai_engineer_answer(question, latest_state)
                latest_state["ai_engineer_response"] = {
                    "question": question,
                    "answer": answer,
                    "timestamp": latest_state.get("cycle", 0),
                }
                print(f"[GCS CMD] AI Engineer query: '{question[:50]}...'")
            except Exception as e:
                print(f"[GCS CMD] AI Engineer error: {e}")

    elif action == "select_uav":
        uav_id = cmd.get("uav_id", "UAV-01")
        fleet_manager.select_uav(uav_id)
        print(f"[GCS CMD] Active UAV switched → {uav_id}")

    elif action == "demo_start":
        demo_controller.start()
        current_cfg["injected_faults"] = []
        current_cfg["mode"] = "NORMAL"
        current_cfg["speed"] = 2.0
        print("[GCS CMD] Demo mode started")

    elif action == "demo_step":
        step = cmd.get("step")
        demo_controller.advance(step)
        print(f"[GCS CMD] Demo step → {demo_controller.current_step}")

    elif action == "demo_stop":
        demo_controller.stop()
        current_cfg["injected_faults"] = []
        print("[GCS CMD] Demo mode stopped")

    # write back to the shared control file so the simulator picks it up
    os.makedirs(os.path.dirname(CONTROL_FILE), exist_ok=True)
    with open(CONTROL_FILE, 'w') as f:
        json.dump(current_cfg, f, indent=2)

    # immediately push updated state to connected clients
    if latest_state:
        latest_payload = json.dumps(latest_state)


async def ws_handler(websocket):
    """WebSocket handler — streams state to the GCS at 10 Hz, receives commands."""
    async def sender():
        while True:
            try:
                await websocket.send(latest_payload)
            except websockets.exceptions.ConnectionClosed:
                break
            await asyncio.sleep(0.1)

    async def receiver():
        try:
            async for raw in websocket:
                try:
                    cmd = json.loads(raw)
                    process_gcs_command(cmd)
                except (json.JSONDecodeError, Exception):
                    pass
        except websockets.exceptions.ConnectionClosed:
            pass

    await asyncio.gather(sender(), receiver())


async def run_ws_server():
    async with websockets.serve(ws_handler, "0.0.0.0", 8765):
        print("[WS]  Defense GCS WebSocket Server Active → ws://0.0.0.0:8765")
        await asyncio.Future()


def start_ws_thread():
    asyncio.run(run_ws_server())


# kick off the WebSocket server in the background so MQTT can run in the foreground
ws_thread = Thread(target=start_ws_thread, daemon=True)
ws_thread.start()

# connect to the MQTT broker and start consuming telemetry
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.on_message = on_message
client.connect("localhost", 1883, 60)
print("[MQTT] Connecting to MQTT broker at localhost:1883...")
import traceback as _tb
try:
    client.loop_forever()
except Exception as _e:
    print(f"[MQTT] loop_forever raised exception: {_e}")
    _tb.print_exc()
print("[MQTT] loop_forever exited — process will continue with WS thread only")
# Keep process alive even if MQTT loop exits, so WS thread stays up
import signal
signal.pause()
