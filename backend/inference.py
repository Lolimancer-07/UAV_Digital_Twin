"""
backend/inference.py
---------------------
Digital Twin Core Intelligence Layer — MALE UAV Aero Piston Engine.

Extended pipeline integrating all Digital Twin modules:
  1. MQTT Telemetry Ingestion (14-channel live sensor streams)
  2. Sensor Integrity Monitoring (7 detection methods per channel)
  3. Physics-Informed Engine Model (Otto cycle, BHP, BSFC, residuals)
  4. AI Anomaly Detection & 8-Fault Classifier (Isolation Forest)
  5. Monte Carlo Dropout RUL Prediction with Uncertainty Estimation
  6. AI+Physics Twin Consistency Cross-Validation (Cases A-D)
  7. Multi-Subsystem Composite Health Index + Failure Probability
  8. Explainable AI (XAI) Root Cause Attribution
  9. Mission Risk Assessment (completion probability, safe time)
  10. Counterfactual What-If Simulation Engine
  11. Operating Point Optimizer (scipy L-BFGS-B)
  12. Prescriptive Maintenance & Operational Recommendations
  13. AI Mission Engineer (grounded NL explanations)
  14. Multi-UAV Fleet State Manager
  15. Telemetry Integrity Monitoring
  16. Demo Mode Controller
  17. ATA-Spec Autonomous Maintenance Advisor
  18. Bidirectional WebSocket GCS Server (ws://localhost:8765)
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

# ── Project Core Intelligence Modules ─────────────────────────────────────────
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

# ── Paths & Config ────────────────────────────────────────────────────────────
ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTROL_FILE = os.path.join(ROOT, 'simulator', 'current_profile.json')
MODEL_PATH   = os.path.join(ROOT, 'backend', 'uav_rul_model.h5')
SCALER_PATH  = os.path.join(ROOT, 'backend', 'scaler.pkl')
ANOMALY_PATH = os.path.join(ROOT, 'backend', 'anomaly_model.pkl')

print("=" * 60)
print("  UAV DIGITAL TWIN — DEFENSE GRADE PROPULSION CORE v2.0")
print("=" * 60)

# ── Load AI Models ────────────────────────────────────────────────────────────
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

# ── State Buffers ─────────────────────────────────────────────────────────────
WINDOW_SIZE    = 50
MC_DROPOUT_SAMPLES = 10  # Monte Carlo dropout passes for uncertainty estimation
engine_buffer  = deque(maxlen=WINDOW_SIZE)
latest_payload = json.dumps({"status": "INITIALIZING", "message": "Digital Twin Core v2.0 starting up..."})
last_engine_id = None

# Latest full state for AI Engineer and What-If (kept in memory)
latest_state: Dict[str, Any] = {}

# ── Monte Carlo Dropout RUL Prediction ────────────────────────────────────────
def predict_rul_with_uncertainty(lstm_input: np.ndarray) -> tuple:
    """
    Uses MC Dropout to estimate RUL uncertainty.
    Runs the model with dropout active (training=True) N times.
    Returns: (mean_rul, std_rul, ci_lower, ci_upper)
    """
    predictions = []
    for _ in range(MC_DROPOUT_SAMPLES):
        pred = float(lstm_model(lstm_input, training=True)[0][0])
        predictions.append(max(0.0, pred))
    mean_rul = float(np.mean(predictions))
    std_rul  = float(np.std(predictions))
    # 90% confidence interval (±1.645σ)
    ci_lower = max(0.0, mean_rul - 1.645 * std_rul)
    ci_upper = mean_rul + 1.645 * std_rul
    return mean_rul, std_rul, ci_lower, ci_upper


# ── MQTT Telemetry Consumer ───────────────────────────────────────────────────
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

    # Handle engine ID transition
    cur_engine = data.get("engine_id", 1)
    if last_engine_id is not None and cur_engine != last_engine_id:
        engine_buffer.clear()
        reset_health_state(95.0)
    last_engine_id = cur_engine

    # ── 1. Telemetry Integrity Check ─────────────────────────────────────────
    tel_integrity = telemetry_integrity_monitor.evaluate(data)

    # ── 2. Physics-Informed Thermodynamic Evaluation ──────────────────────────
    physics_results = physics_model.evaluate_performance(data)

    # ── 3. Sensor Integrity Monitoring ───────────────────────────────────────
    sensor_integrity = sensor_integrity_monitor.evaluate(
        data, physics_residuals=physics_results.get("residuals", {})
    )

    # ── 4. Anomaly Detection & Fault Classification ───────────────────────────
    is_anomaly, anomaly_score, fault_events = anomaly_detector.predict(data)
    fault_names = [f["name"] for f in fault_events]

    # ── 5. Monte Carlo Dropout LSTM RUL Prediction ────────────────────────────
    raw3 = pd.DataFrame([[data['rpm'], data['cht'], data['egt']]], columns=['rpm', 'cht', 'egt'])
    norm3 = scaler.transform(raw3)[0]
    engine_buffer.append(norm3)

    predicted_rul = 0.0
    rul_std       = 0.0
    rul_lower     = 0.0
    rul_upper     = 0.0

    if len(engine_buffer) == WINDOW_SIZE:
        lstm_input = np.array(engine_buffer).reshape(1, WINDOW_SIZE, 3)
        predicted_rul, rul_std, rul_lower, rul_upper = predict_rul_with_uncertainty(lstm_input)

    # ── 6. Multi-Subsystem Composite Health Index ─────────────────────────────
    health_results = compute_health_index(data, predicted_rul, anomaly_score, fault_names)
    health_index = health_results["health_index"]
    failure_probability = compute_failure_probability(
        predicted_rul, is_anomaly, anomaly_score, len(fault_events), health_index
    )

    # ── 7. Twin Consistency Cross-Validation ─────────────────────────────────
    twin_consistency = compute_twin_consistency(
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
        physics_residuals=physics_results.get("residuals", {}),
        sensor_integrity_score=sensor_integrity["integrity_score"],
    )

    # ── 8. Explainable AI (XAI) Attribution ──────────────────────────────────
    xai_results = XAIDiagnosticEngine.explain_anomaly(
        telemetry=data,
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
        active_faults=fault_events
    )

    # ── 9. Mission Risk Assessment ────────────────────────────────────────────
    mission_risk = compute_mission_risk(
        data=data,
        health_index=health_index,
        predicted_rul=predicted_rul,
        failure_probability=failure_probability,
        fault_events=fault_events,
    )

    # ── 10. Prescriptive Recommendations ─────────────────────────────────────
    prescriptive = generate_prescriptive_recommendations(
        fault_events=fault_events,
        predicted_rul=predicted_rul,
        health_index=health_index,
        twin_consistency=twin_consistency,
        mission_risk=mission_risk,
    )

    # ── 11. ATA-Spec Maintenance Advisories ──────────────────────────────────
    maintenance_advisories = AutonomousMaintenanceAdvisor.generate_advisories(
        telemetry=data,
        fault_events=fault_events,
        predicted_rul=predicted_rul,
        health_index=health_index
    )

    # ── 12. Global Alert Status ───────────────────────────────────────────────
    has_critical = any(f["severity"] == "CRITICAL" for f in fault_events)
    has_warning  = any(f["severity"] == "WARNING"  for f in fault_events)

    if has_critical or (predicted_rul > 0 and predicted_rul < 20):
        alert_status = "CRITICAL"
    elif has_warning or is_anomaly:
        alert_status = "WARNING"
    else:
        alert_status = "NOMINAL"

    # ── 13. Fleet Update ──────────────────────────────────────────────────────
    active_uav = f"UAV-0{cur_engine}" if cur_engine in (1, 2, 3, 4) else "UAV-01"

    # ── 14. Complete Synchronized Digital Twin Payload v2.0 ──────────────────
    payload = {
        # Telemetry Channels
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

        # AI Prognostics & Diagnostics
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

        # Core Subsystems
        "physics":                physics_results,
        "health":                 health_results,
        "xai":                    xai_results,
        "advisories":             maintenance_advisories,
        "can_frames":             data.get("can_frames", []),

        # NEW: Extended Intelligence
        "sensor_integrity":       sensor_integrity,
        "twin_consistency":       twin_consistency,
        "mission_risk":           mission_risk,
        "prescriptive":           prescriptive,
        "telemetry_integrity":    tel_integrity,
        "fleet_status":           fleet_manager.get_fleet_status(),
        "demo_state":             demo_controller.get_state(),

        # Cached What-If & Optimize results (updated via commands)
        "whatif_result":          latest_state.get("whatif_result"),
        "optimize_result":        latest_state.get("optimize_result"),
        "ai_engineer_response":   latest_state.get("ai_engineer_response"),
    }

    # Update fleet state for active UAV
    fleet_manager.update_uav("UAV-01", payload)

    latest_state.update(payload)
    latest_payload = json.dumps(payload)


# ── Bidirectional Telecommand Processing ──────────────────────────────────────
def process_gcs_command(cmd: Dict[str, Any]):
    """Handles commands received from the GCS Web Interface."""
    global latest_state

    action = cmd.get("command")

    # Load existing state
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
        # Counterfactual simulation
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
        # Operating point optimization
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

    # Save to shared control file
    os.makedirs(os.path.dirname(CONTROL_FILE), exist_ok=True)
    with open(CONTROL_FILE, 'w') as f:
        json.dump(current_cfg, f, indent=2)


async def ws_handler(websocket):
    """Bidirectional WebSocket Server: Streams state at 10Hz, receives commands."""
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


# Start WebSocket Background Thread
ws_thread = Thread(target=start_ws_thread, daemon=True)
ws_thread.start()

# ── MQTT Loop ─────────────────────────────────────────────────────────────────
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.on_message = on_message
client.connect("localhost", 1883, 60)
print("[MQTT] Connecting to MQTT broker at localhost:1883...")
client.loop_forever()
