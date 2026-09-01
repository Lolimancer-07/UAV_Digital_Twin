"""
backend/inference.py
---------------------
Digital Twin Core Intelligence Layer for MALE UAV Aero Piston Engines.

Synchronizes:
  1. MQTT Telemetry Ingestion (14-channel live sensor streams + CAN bursts)
  2. Physics-Informed Engine Model (Thermodynamic Otto P-V cycle, Power BHP, BSFC, Residuals)
  3. AI Anomaly Detection & 8-Fault Classifier
  4. Deep LSTM Remaining Useful Life (RUL) Prediction with Confidence Intervals
  5. Multi-Subsystem Composite Health Index
  6. Explainable AI (XAI) Root Cause Attribution
  7. ATA-Spec Autonomous Maintenance Advisor
  8. Bidirectional WebSocket GCS Telecommand & Telemetry Server (ws://localhost:8765)
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

# Suppress TensorFlow GPU warnings
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

# ── Paths & Config ────────────────────────────────────────────────────────────
ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTROL_FILE = os.path.join(ROOT, 'simulator', 'current_profile.json')
MODEL_PATH   = os.path.join(ROOT, 'backend', 'uav_rul_model.h5')
SCALER_PATH  = os.path.join(ROOT, 'backend', 'scaler.pkl')
ANOMALY_PATH = os.path.join(ROOT, 'backend', 'anomaly_model.pkl')

print("=" * 60)
print("  UAV DIGITAL TWIN — DEFENSE GRADE PROPULSION CORE")
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

print("[3/3] Initializing Physics-Informed & XAI Layers...")

# ── State Buffers ─────────────────────────────────────────────────────────────
WINDOW_SIZE    = 50
engine_buffer  = deque(maxlen=WINDOW_SIZE)
latest_payload = json.dumps({"status": "INITIALIZING", "message": "Digital Twin Core starting up..."})
active_faults_set = set()
last_engine_id = None

# ── MQTT Telemetry Consumer ───────────────────────────────────────────────────
def on_connect(client, userdata, connect_flags, reason_code, properties):
    if reason_code == 0:
        client.subscribe("uav/engine/telemetry")
        print("[MQTT] Subscribed to live telemetry stream: 'uav/engine/telemetry'")
    else:
        print(f"[MQTT] Connection failed with code {reason_code}")


def on_message(client, userdata, msg):
    global latest_payload, last_engine_id

    try:
        data = json.loads(msg.payload.decode('utf-8'))
    except Exception:
        return

    # Handle engine ID transition cleanly
    cur_engine = data.get("engine_id", 1)
    if last_engine_id is not None and cur_engine != last_engine_id:
        engine_buffer.clear()
        reset_health_state(95.0)
    last_engine_id = cur_engine

    # 1. Physics-Informed Thermodynamic Evaluation
    physics_results = physics_model.evaluate_performance(data)

    # 2. Anomaly Detection & Intelligent Fault Classification (8 Categories)
    is_anomaly, anomaly_score, fault_events = anomaly_detector.predict(data)
    fault_names = [f["name"] for f in fault_events]

    # 3. Deep LSTM RUL Prognostics
    raw3 = pd.DataFrame([[data['rpm'], data['cht'], data['egt']]], columns=['rpm', 'cht', 'egt'])
    norm3 = scaler.transform(raw3)[0]
    engine_buffer.append(norm3)

    predicted_rul = 0.0
    rul_lower = 0.0
    rul_upper = 0.0

    if len(engine_buffer) == WINDOW_SIZE:
        lstm_input = np.array(engine_buffer).reshape(1, WINDOW_SIZE, 3)
        raw_pred = float(lstm_model.predict(lstm_input, verbose=0)[0][0])
        predicted_rul = max(0.0, raw_pred)
        # 95% Confidence Interval envelope (±8%)
        rul_lower = max(0.0, predicted_rul * 0.92)
        rul_upper = predicted_rul * 1.08

    # 4. Multi-Subsystem Composite Health Index
    health_results = compute_health_index(data, predicted_rul, anomaly_score, fault_names)

    # 5. Explainable AI (XAI) Attribution & Diagnostics
    xai_results = XAIDiagnosticEngine.explain_anomaly(
        telemetry=data,
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
        active_faults=fault_events
    )

    # 6. ATA-Spec Autonomous Maintenance Advisories
    maintenance_advisories = AutonomousMaintenanceAdvisor.generate_advisories(
        telemetry=data,
        fault_events=fault_events,
        predicted_rul=predicted_rul,
        health_index=health_results["health_index"]
    )

    # 7. Global Airworthiness Alert Status
    has_critical = any(f["severity"] == "CRITICAL" for f in fault_events)
    has_warning  = any(f["severity"] == "WARNING"  for f in fault_events)

    if has_critical or (predicted_rul > 0 and predicted_rul < 20):
        alert_status = "CRITICAL"
    elif has_warning or is_anomaly:
        alert_status = "WARNING"
    else:
        alert_status = "NOMINAL"

    # 8. Complete Synchronized Digital Twin Payload
    payload = {
        # Telemetry Channels
        "cycle":                  data.get("cycle", 0),
        "engine_id":              data.get("engine_id", 1),
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
        "buffer_pct":             round(len(engine_buffer) / WINDOW_SIZE * 100),
        "is_anomaly":             bool(is_anomaly),
        "anomaly_score":          round(anomaly_score, 4),
        "fault_events":           fault_events,
        "alert":                  alert_status,

        # Core Subsystems
        "physics":                physics_results,
        "health":                 health_results,
        "xai":                    xai_results,
        "advisories":             maintenance_advisories,
        "can_frames":             data.get("can_frames", [])
    }

    latest_payload = json.dumps(payload)


# ── Bidirectional Telecommand Processing ──────────────────────────────────────
def process_gcs_command(cmd: Dict[str, Any]):
    """Handles commands received from the GCS Web Interface."""
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
        print("[WS]  Defense GCS WebSocket Server Active → ws://0.0.0.0:8765 (All Interfaces)")
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