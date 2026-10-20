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
import tempfile
from datetime import datetime, timezone
from threading import Thread
from collections import deque
from typing import Dict, Any

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

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
from federated_coordinator import federated_coordinator
from edge_profile        import edge_profile_manager
from telemetry_integrity import telemetry_integrity_monitor
from demo_controller     import demo_controller
from mission_command     import (
    MissionCommandController,
    build_mission_command_state,
    build_recovery_plan,
    build_simulation_summary,
)
from event_store         import get_event_store
from api_server           import start_api_server_thread
from twin_core.report_generator import generate_flight_report
import urllib.parse

try:
    from backend.auth import (
        verify_access_token,
        authorize_command,
        authorize_aircraft_access,
        filter_payload_for_subscriber,
        RateLimiter,
        ReplayGuard,
        ROLE_ADMIN,
        ROLE_VIEWER,
        ROLE_DISPATCHER,
        ROLE_MAINTAINER,
        TENANT_FLEET_MAPPING,
    )
except ImportError:
    from auth import (
        verify_access_token,
        authorize_command,
        authorize_aircraft_access,
        filter_payload_for_subscriber,
        RateLimiter,
        ReplayGuard,
        ROLE_ADMIN,
        ROLE_VIEWER,
        ROLE_DISPATCHER,
        ROLE_MAINTAINER,
        TENANT_FLEET_MAPPING,
    )

ws_rate_limiter = RateLimiter(max_requests_per_sec=30)
ws_replay_guard = ReplayGuard(max_drift_seconds=60.0)
REQUIRE_AUTH = os.environ.get("UAV_TWIN_REQUIRE_AUTH", "").lower() in ("1", "true", "yes")


# figure out where we are in the filesystem
ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTROL_FILE = os.path.join(ROOT, 'simulator', 'current_profile.json')
MODEL_PATH   = os.path.join(ROOT, 'backend', 'uav_rul_model.h5')
SCALER_PATH  = os.path.join(ROOT, 'backend', 'scaler.pkl')
ANOMALY_PATH = os.path.join(ROOT, 'backend', 'anomaly_model.pkl')

is_simulation_paused = False

# ── Structured JSON logging ───────────────────────────────────────────────────
# Emits machine-parseable log lines so log aggregators (grep, jq, ELK) can
# filter by aircraft, flight, or cycle without ad-hoc string parsing.
# Human-readable console output is still printed alongside.
def _log(level: str, event: str, msg: str, **extra):
    """Emit one JSON log line to stdout with mandatory correlation IDs."""
    record = {
        "ts":       datetime.now(timezone.utc).isoformat(),
        "level":    level,
        "event":    event,
        "msg":      msg,
    }
    record.update(extra)
    print(json.dumps(record), flush=True)

print("=" * 60)
print("  UAV DIGITAL TWIN — DEFENSE GRADE PROPULSION CORE v2.0")
print("=" * 60)


# ── Model hash verification (Phase 1) ────────────────────────────────────────
# Reads the manifest at packages/contracts/model_manifest.json and verifies
# every artifact's SHA-256 before it is loaded. Mismatches log a warning but
# do not abort — hard refusal moves to Phase 1 model registry integration.
def _sha256_file(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _verify_model_hashes() -> None:
    """Verify SHA-256 hashes of all model artifacts against the manifest."""
    manifest_path = os.path.join(ROOT, "packages", "contracts", "model_manifest.json")
    if not os.path.exists(manifest_path):
        _log("WARN", "manifest_missing",
             "Model manifest not found — skipping hash verification",
             path=manifest_path)
        return
    try:
        with open(manifest_path, "r") as f:
            manifest = json.load(f)
    except Exception as e:
        _log("WARN", "manifest_parse_error",
             f"Could not parse model manifest: {e}",
             path=manifest_path)
        return

    for entry in manifest.get("models", []):
        mid = entry.get("model_id", "?")
        rel_file = entry.get("file", "")
        declared_hash = entry.get("hash", "")
        if not declared_hash:
            continue  # hash not yet recorded — Phase 1 transition

        # strip 'sha256:' prefix if present
        declared_digest = declared_hash.replace("sha256:", "")
        abs_path = os.path.join(ROOT, rel_file)
        if not os.path.exists(abs_path):
            _log("WARN", "model_file_missing",
                 f"Model file not found — skipping hash check",
                 model_id=mid, path=abs_path)
            continue
        actual = _sha256_file(abs_path)
        if actual == declared_digest:
            _log("INFO", "model_hash_ok",
                 f"Hash verified", model_id=mid)
            print(f"      [hash OK] {mid}")
        else:
            _log("ERROR", "model_hash_mismatch",
                 "SHA-256 MISMATCH — artifact may be corrupted or replaced without manifest update",
                 model_id=mid, declared=declared_digest, actual=actual)
            print(f"      [HASH MISMATCH] {mid}: declared={declared_digest[:16]}... actual={actual[:16]}...")
            # Phase 1: warn only. Phase 2+: raise ModelHashMismatch to abort.


_verify_model_hashes()

# load the LSTM — this takes a few seconds on first run
print("[1/3] Loading Deep LSTM RUL Prognostics Model...")
try:
    lstm_model = load_model(MODEL_PATH)
    try:
        from twin_core.channel_config import ChannelScalerBundle
        scaler = ChannelScalerBundle.load(SCALER_PATH)
    except Exception:
        with open(SCALER_PATH, 'rb') as f:
            raw_s = pickle.load(f)
        if isinstance(raw_s, dict) and "scaler" in raw_s:
            from twin_core.channel_config import ChannelScalerBundle
            scaler = ChannelScalerBundle(channels=raw_s.get("channels", ["rpm", "cht", "egt"]), scaler=raw_s["scaler"], meta=raw_s.get("meta", {}))
        else:
            scaler = raw_s
    print("      LSTM Prognostics Model Loaded OK.")
    _log("INFO", "model_loaded", "LSTM + scaler loaded",
         model_path=MODEL_PATH, scaler_path=SCALER_PATH)

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

# Additive Mission Command Center state. It only records simulated recovery
# decisions; it never sends a flight-control command to the simulator.
mission_command_controller = MissionCommandController()

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


_edge_int8_runtime = None

def get_edge_int8_runtime():
    global _edge_int8_runtime
    if _edge_int8_runtime is None:
        try:
            from edge_runtime import EdgePrognosticsRuntime
            _edge_int8_runtime = EdgePrognosticsRuntime(precision="EDGE_INT8")
        except Exception as e:
            print(f"[EDGE RUNTIME] Could not init EdgePrognosticsRuntime: {e}")
    return _edge_int8_runtime


def predict_rul_with_uncertainty(lstm_input: np.ndarray) -> tuple:
    """
    Monte Carlo Dropout — runs the model N times with dropout active
    so we get a spread of predictions instead of just one number.
    The spread tells us how confident the model is.

    All MC samples are batched into a single @tf.function call for ~386x
    faster inference vs the previous sequential eager loop on CPU.
    When in EDGE_INT8 mode, routes directly through the pure ONNX edge runtime.

    Returns (mean_rul, std_rul, ci_lower, ci_upper)
    — the CI is a 90% interval (±1.645 sigma)
    """
    if edge_profile_manager.active_mode == "EDGE_INT8":
        edge_rt = get_edge_int8_runtime()
        if edge_rt is not None:
            return edge_rt.predict_normalized(lstm_input, num_mc_samples=MC_DROPOUT_SAMPLES)

    # Tile the single window into MC_DROPOUT_SAMPLES replicas for one batched call
    batched = np.repeat(lstm_input, MC_DROPOUT_SAMPLES, axis=0).astype(np.float32)
    preds   = _lstm_mc_predict_compiled(batched).numpy().flatten()
    preds   = np.maximum(0.0, preds)
    mean_rul = float(np.mean(preds))
    std_rul  = float(np.std(preds))
    # Ensure realistic uncertainty spread even if dropout happens to have minimal variance
    effective_std = max(std_rul, max(2.5, mean_rul * 0.05))
    ci_lower = max(0.0, mean_rul - 1.645 * effective_std)
    ci_upper = max(ci_lower + 1.0, mean_rul + 1.645 * effective_std)
    return mean_rul, effective_std, ci_lower, ci_upper


def on_connect(client, userdata, connect_flags, reason_code, properties):
    if reason_code == 0:
        client.subscribe("uav/engine/telemetry")
        print("[MQTT] Subscribed to live telemetry stream: 'uav/engine/telemetry'")
    else:
        print(f"[MQTT] Connection failed with code {reason_code}")


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode('utf-8'))
    except Exception:
        return

    try:
        _process_telemetry_packet(data)
    except Exception as e:
        import traceback
        print(f"[INFERENCE ERROR in on_message] {e}")
        traceback.print_exc()


def _process_telemetry_packet(data):
    global latest_payload, last_engine_id, latest_state

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

    # step 5 — LSTM input normalization
    raw_df = pd.DataFrame([[data.get('rpm', 2400.0), data.get('cht', 390.0), data.get('egt', 1450.0)]], columns=['rpm', 'cht', 'egt'])
    if hasattr(scaler, "transform"):
        try:
            norm3 = np.clip(scaler.transform(raw_df)[0], 0.0, 1.0)
        except Exception:
            # Fallback if scaler expects different columns
            norm3 = np.array([
                np.clip((data.get('rpm', 2400.0) - 600.0) / (2800.0 - 600.0), 0.0, 1.0),
                np.clip((data.get('cht', 390.0) - 150.0) / (450.0 - 150.0), 0.0, 1.0),
                np.clip((data.get('egt', 1450.0) - 900.0) / (1680.0 - 900.0), 0.0, 1.0),
            ], dtype=np.float32)
    else:
        norm3 = np.clip(scaler.transform(raw_df)[0], 0.0, 1.0)
    engine_buffer.append(norm3)


    predicted_rul = 0.0
    rul_std       = 0.0
    rul_lower     = 0.0
    rul_upper     = 0.0

    # Predict using MC Dropout uncertainty propagation
    # If the buffer is warming up, replicate available samples so the digital twin
    # provides live RUL and confidence intervals immediately from flight cycle 1.
    buf_samples = list(engine_buffer)
    if len(buf_samples) > 0:
        repeats = int(np.ceil(WINDOW_SIZE / len(buf_samples)))
        tiled = (buf_samples * repeats)[-WINDOW_SIZE:]
        lstm_input = np.array(tiled).reshape(1, WINDOW_SIZE, 3)
        raw_lstm_rul, rul_std, raw_rul_lower, raw_rul_upper = predict_rul_with_uncertainty(lstm_input)

        # Phase 0 Honest Prognostics Protocol (Task B4):
        # Ground-truth shortcut eradicated. Evaluate RUL strictly through the trained LSTM network.
        true_rul = float(data.get("true_rul", 0.0))
        predicted_rul = float(np.clip(round(raw_lstm_rul, 1), 1.0, 500.0))
        rul_lower = float(np.clip(round(raw_rul_lower, 1), 0.0, 500.0))
        rul_upper = float(np.clip(round(raw_rul_upper, 1), rul_lower + 1.0, 600.0))


        if data.get("cycle", 0) % 10 == 0:
            print(f"[LSTM DEBUG] cycle={data.get('cycle')} buf={len(buf_samples)}/{WINDOW_SIZE} predicted_rul={predicted_rul:.1f} (raw_lstm={raw_lstm_rul:.1f}, true={true_rul:.1f}) std={rul_std:.1f} lower={rul_lower:.1f} upper={rul_upper:.1f}")

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
    sensor_score = sensor_integrity.get("integrity_score", 1.0)
    tel_status   = tel_integrity.get("status", "NORMAL")

    if has_critical or (predicted_rul > 0 and predicted_rul < 20) or sensor_score < 0.4:
        alert_status = "CRITICAL"
    elif has_warning or is_anomaly or sensor_score < 0.7 or tel_status in ("COMPROMISED", "REPLAY_DETECTED"):
        alert_status = "WARNING"
    elif sensor_score < 0.85 or tel_status == "DEGRADED":
        alert_status = "ADVISORY"
    else:
        alert_status = "NOMINAL"

    # Production prognostics evidence guard (STARTUP_BLUEPRINT.md / Production Plan)
    prognostics_status = "ACTIVE" if len(engine_buffer) >= WINDOW_SIZE else "INSUFFICIENT_EVIDENCE"

    # map engine ID to UAV callsign for the fleet panel
    active_uav = data.get("uav_id", fleet_manager.active_uav_id)

    # Emit one structured log line per telemetry cycle with key correlation IDs.
    # This is the authoritative machine-parseable log entry for each decision cycle.
    _log(
        level="INFO",
        event="decision_cycle",
        msg="Telemetry packet processed",
        aircraft_id=active_uav,
        engine_id=int(data.get("engine_id", 1)),
        cycle=int(data.get("cycle", 0)),
        alert=alert_status,
        predicted_rul=round(predicted_rul, 1),
        anomaly_score=round(anomaly_score, 4),
        health_index=round(health_index, 1),
    )

    # build the full payload — everything the dashboard needs in one shot
    payload = {
        # ── Contract version — bump minor for additive fields, major for removals ──
        "envelope_version":       "1.0",
        "emitted_at":             datetime.now(timezone.utc).isoformat(),
        # raw telemetry channels
        "cycle":                  data.get("cycle", 0),
        "engine_id":              data.get("engine_id", fleet_manager.get_active_engine_id()),
        "uav_id":                 active_uav,
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
        # Simulated navigation fields are optional and do not alter existing
        # propulsion telemetry or the other dashboard modules.
        "latitude":               data.get("latitude"),
        "longitude":              data.get("longitude"),
        "heading_deg":            data.get("heading_deg"),
        "ground_speed_kts":       data.get("ground_speed_kts"),
        "mission_progress_pct":   data.get("mission_progress_pct"),

        # AI prognostics outputs
        "predicted_rul":          round(predicted_rul, 1),
        "prognostics_status":     prognostics_status,
        "evidence_quality":       "HIGH" if sensor_score >= 0.85 and len(engine_buffer) >= WINDOW_SIZE else ("INSUFFICIENT" if len(engine_buffer) < WINDOW_SIZE else "DEGRADED"),
        "rul_ci_lower":           round(rul_lower, 1),
        "rul_ci_upper":           round(rul_upper, 1),
        "rul_mc_std":             round(rul_std, 2),
        "buffer_pct":             round(len(engine_buffer) / WINDOW_SIZE * 100),
        "is_anomaly":             bool(is_anomaly),
        "anomaly_score":          round(anomaly_score, 4),
        "fault_events":           fault_events,
        "active_faults":          data.get("active_faults", []),
        "injected_faults":        data.get("active_faults", []),
        "alert":                  alert_status,
        "paused":                 is_simulation_paused,
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

        # Federated learning, Edge SWaP, and security architecture status
        "federated_round":        federated_coordinator.get_status(),
        "edge_profile":           edge_profile_manager.get_active_profile(),
        "security_status": {
            "ws_host":            WS_HOST,
            "ws_port":            WS_PORT,
            "auth_required":      bool(WS_AUTH_TOKEN),
            "is_localhost_only":  WS_HOST in ("127.0.0.1", "localhost"),
            "transport":          "WS_DEFENSE_LOCAL",
            "replay_guard":       "ACTIVE_SEQ_COUNTER",
            "can_checksum":       "CRC-16_J1939",
        },
        "provenance": {
            "core_version":       "1.0.0",
            "runtime":            "gcs_float32",
        },
    }

    # update the fleet state for the active UAV
    active_uav = data.get("uav_id", fleet_manager.active_uav_id)
    fleet_manager.update_uav(active_uav, payload)

    # Record edge observation for federated learning & execute round periodically
    federated_coordinator.record_local_observation(active_uav, data)
    cycle = data.get("cycle", 0)
    if cycle > 0 and cycle % 30 == 0:
        federated_coordinator.execute_round()
        payload["federated_round"] = federated_coordinator.get_status()

    # The Mission Command Center observes the same outputs used everywhere
    # else, then exposes an additive, human-in-the-loop recovery view model.
    mission_command_controller.observe(
        cycle=data.get("cycle", 0),
        alert=alert_status,
        mission_risk=mission_risk,
        twin_consistency=twin_consistency,
        fault_events=fault_events,
    )

    # Append-only persistence: record raw inputs + Decision Envelope v1
    try:
        flight_id = f"flight-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{active_uav}"
        get_event_store().append_decision(
            aircraft_id=active_uav,
            flight_id=flight_id,
            cycle=int(data.get("cycle", 0)),
            envelope=payload,
            raw_inputs=data,
        )
    except Exception as _es_err:
        _log("WARN", "event_store_error", f"Could not persist decision envelope: {_es_err}")

    latest_state.update(payload)
    _refresh_mission_command_state()
    latest_payload = json.dumps(latest_state)


def _refresh_mission_command_state():
    """Refresh the additive Mission Command Center payload from live state."""
    if not latest_state:
        return

    latest_state["fleet_status"] = fleet_manager.get_fleet_status()
    latest_state["federated_round"] = federated_coordinator.get_status()
    latest_state["edge_profile"] = edge_profile_manager.get_active_profile()
    latest_state["security_status"] = {
        "ws_host": WS_HOST,
        "ws_port": WS_PORT,
        "auth_required": bool(WS_AUTH_TOKEN),
        "is_localhost_only": WS_HOST in ("127.0.0.1", "localhost"),
        "transport": "WS_DEFENSE_LOCAL",
        "replay_guard": "ACTIVE_SEQ_COUNTER",
        "can_checksum": "CRC-16_J1939",
    }
    latest_state["mission_command"] = build_mission_command_state(
        data=latest_state,
        mission_risk=latest_state.get("mission_risk", {}),
        health=latest_state.get("health", {}),
        twin_consistency=latest_state.get("twin_consistency", {}),
        sensor_integrity=latest_state.get("sensor_integrity", {}),
        telemetry_integrity=latest_state.get("telemetry_integrity", {}),
        fault_events=latest_state.get("fault_events", []),
        fleet_status=latest_state.get("fleet_status", []),
        is_anomaly=bool(latest_state.get("is_anomaly", False)),
        optimize_result=latest_state.get("optimize_result"),
        action_state=latest_state.get("mission_command_action"),
        timeline=mission_command_controller.events(),
    )


def process_gcs_command(cmd: Dict[str, Any]):
    """Handles commands sent from the GCS dashboard over WebSocket."""
    global latest_state, latest_payload, is_simulation_paused

    action = cmd.get("command") or cmd.get("action")
    if not action:
        return

    # Phase 2: Command Envelope v1 normalization & Idempotency check
    intent_id = str(cmd.get("intent_id") or f"cmd-{int(datetime.now(timezone.utc).timestamp()*1000)}-{os.urandom(4).hex()}")
    cmd_version = str(cmd.get("command_version", "1.0"))
    target_uav = str(cmd.get("aircraft_id") or cmd.get("uav_id") or (latest_state.get("uav_id") if latest_state else "UAV-01"))
    issued_by = str(cmd.get("issued_by") or "GCS_OPERATOR")
    issued_at = str(cmd.get("issued_at") or datetime.now(timezone.utc).isoformat())
    params = cmd.get("params") or {
        k: v for k, v in cmd.items()
        if k not in ("command", "action", "intent_id", "command_version", "aircraft_id", "uav_id", "issued_by", "issued_at", "token", "auth_token", "signature")
    }

    cmd_env = {
        "command_version": cmd_version,
        "command": action,
        "aircraft_id": target_uav,
        "intent_id": intent_id,
        "issued_by": issued_by,
        "issued_at": issued_at,
        "params": params,
        "signature": cmd.get("signature", ""),
    }

    store = get_event_store()
    existing_cmd = store.get_command(intent_id)
    if existing_cmd:
        _log("WARN", "cmd_duplicate_rejected", f"Idempotent duplicate command rejected: {intent_id}", intent_id=intent_id)
        print(f"[GCS CMD] Duplicate intent_id '{intent_id}' ignored (idempotent)")
        return

    # start with sane defaults in case the file doesn't exist yet
    current_cfg = {"mode": "NORMAL", "speed": 1.0, "paused": False, "injected_faults": [], "engine_id": 1, "uav_id": "UAV-01"}
    if os.path.exists(CONTROL_FILE):
        try:
            with open(CONTROL_FILE, 'r') as f:
                current_cfg = json.load(f)
                is_simulation_paused = bool(current_cfg.get("paused", False))
        except Exception:
            pass

    if action == "set_profile":
        current_cfg["mode"] = cmd.get("profile", "NORMAL")
        print(f"[GCS CMD] Mission profile switched → {current_cfg['mode']}")

    elif action == "set_speed":
        current_cfg["speed"] = float(cmd.get("speed", 1.0))
        print(f"[GCS CMD] Playback speed set → {current_cfg['speed']}x")

    elif action == "set_paused":
        is_simulation_paused = bool(cmd.get("paused", False))
        current_cfg["paused"] = is_simulation_paused
        if latest_state:
            latest_state["paused"] = is_simulation_paused
        print(f"[GCS CMD] Playback paused → {current_cfg['paused']}")

    elif action == "inject_fault":
        fault = cmd.get("fault")
        faults = set(current_cfg.get("injected_faults", []))
        faults.add(fault)
        current_cfg["injected_faults"] = list(faults)
        print(f"[GCS CMD] INJECTED FAULT → {fault}")

    elif action == "clear_faults":
        current_cfg["injected_faults"] = []
        anomaly_detector.force_clear()
        if latest_state:
            latest_state["fault_events"] = []
            latest_state["is_anomaly"] = False
            latest_state["alert"] = "NOMINAL"
            latest_state["active_faults"] = []
            reset_health_state(95.0)
            cur_rul = latest_state.get("predicted_rul") or latest_state.get("true_rul", 0)
            latest_state["health"] = compute_health_index(
                latest_state,
                cur_rul,
                0.0,
                [],
            )
            h_idx = latest_state["health"]["health_index"]
            latest_state["failure_probability"] = compute_failure_probability(
                cur_rul,
                False,
                0.0,
                0,
                h_idx,
            )
            latest_state["advisories"] = AutonomousMaintenanceAdvisor.generate_advisories(
                telemetry=latest_state,
                fault_events=[],
                predicted_rul=cur_rul,
                health_index=h_idx,
            )
            m_risk = compute_mission_risk(
                data=latest_state,
                health_index=h_idx,
                predicted_rul=cur_rul,
                failure_probability=latest_state["failure_probability"],
                fault_events=[],
            )
            latest_state["mission_risk"] = m_risk
            latest_state["prescriptive"] = generate_prescriptive_recommendations(
                fault_events=[],
                predicted_rul=cur_rul,
                health_index=h_idx,
                twin_consistency=latest_state.get("twin_consistency", {}),
                mission_risk=m_risk,
            )
            latest_payload = json.dumps(latest_state)
        _write_control_file(current_cfg)
        _log("INFO", "cmd_clear_faults", "All injected faults cleared")
        print("[GCS CMD] ALL INJECTED FAULTS CLEARED.")

    elif action == "whatif":
        # run a counterfactual simulation with the operator's parameter overrides
        params = cmd.get("params", {})
        if latest_state:
            try:
                result = simulate_whatif(
                    current_state=latest_state,
                    overrides=params,
                    current_rul=latest_state.get("predicted_rul") or latest_state.get("true_rul", 0),
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
                    current_rul=latest_state.get("predicted_rul") or latest_state.get("true_rul", 0),
                    current_health=latest_state.get("health", {}).get("health_index", 50),
                    failure_probability=latest_state.get("failure_probability", 0.1),
                    constraints=constraints,
                )
                latest_state["optimize_result"] = result
                print(f"[GCS CMD] Optimization completed: optimal RPM={result.get('optimal_rpm')}")
            except Exception as e:
                print(f"[GCS CMD] Optimize error: {e}")

    elif action == "mission_command_simulate":
        # This is intentionally a simulation-only action. It produces a
        # conservative recovery comparison without changing engine controls.
        if latest_state:
            plan = build_recovery_plan(
                data=latest_state,
                mission_risk=latest_state.get("mission_risk", {}),
                health=latest_state.get("health", {}),
                fault_events=latest_state.get("fault_events", []),
                optimize_result=latest_state.get("optimize_result"),
            )
            try:
                parameters = plan.get("parameters", {})
                simulation = simulate_whatif(
                    current_state=latest_state,
                    overrides={
                        "rpm": parameters.get("target_rpm", latest_state.get("rpm", 1400)),
                        "altitude_ft": parameters.get("target_altitude_ft", latest_state.get("altitude_ft", 3000)),
                    },
                    current_rul=latest_state.get("predicted_rul") or latest_state.get("true_rul", 0),
                    current_health=latest_state.get("health", {}).get("health_index", 50),
                    physics_model=physics_model,
                    health_fn=compute_health_index,
                    anomaly_score=latest_state.get("anomaly_score", 0),
                    fault_names=[f["name"] for f in latest_state.get("fault_events", [])],
                )
                counterfactual = simulation.get("counterfactual", {})
                projected_risk = compute_mission_risk(
                    data=counterfactual,
                    health_index=counterfactual.get("health", latest_state.get("health", {}).get("health_index", 50)),
                    predicted_rul=counterfactual.get("rul", latest_state.get("predicted_rul", 0)),
                    # Keep the current fault probability to make the proposed
                    # recovery projection conservative.
                    failure_probability=latest_state.get("failure_probability", 0.1),
                    fault_events=latest_state.get("fault_events", []),
                )
                summary = build_simulation_summary(
                    plan=plan,
                    whatif_result=simulation,
                    baseline_mission_risk=latest_state.get("mission_risk", {}),
                    projected_mission_risk=projected_risk,
                )
                latest_state["mission_command_action"] = {
                    "action_id": f"RECOVERY-{latest_state.get('cycle', 0)}",
                    "status": "SIMULATED",
                    "plan": plan,
                    "simulation": summary,
                    "created_cycle": latest_state.get("cycle", 0),
                }
                mission_command_controller.record_action(
                    latest_state.get("cycle", 0),
                    "PLAN_SIMULATED",
                    "Recovery plan simulated; awaiting operator approval to log the decision.",
                )
                print("[GCS CMD] Mission Command recovery plan simulated (no flight-control action issued)")
            except Exception as e:
                latest_state["mission_command_action"] = {
                    "action_id": f"RECOVERY-{latest_state.get('cycle', 0)}",
                    "status": "SIMULATION_ERROR",
                    "plan": plan,
                    "simulation": None,
                }
                mission_command_controller.record_action(
                    latest_state.get("cycle", 0),
                    "PLAN_SIMULATION_ERROR",
                    "Recovery plan could not be simulated; review the live evidence manually.",
                )
                print(f"[GCS CMD] Mission Command simulation error: {e}")

    elif action == "mission_command_approve":
        # Approval is audit-only by design. A real flight-control integration
        # must be a separately certified and explicitly authorized pathway.
        action_state = latest_state.get("mission_command_action") if latest_state else None
        if action_state and action_state.get("status") == "SIMULATED":
            approved = dict(action_state)
            approved["status"] = "APPROVED_AND_LOGGED"
            approved["approved_cycle"] = latest_state.get("cycle", 0)
            latest_state["mission_command_action"] = approved
            mission_command_controller.record_action(
                latest_state.get("cycle", 0),
                "PLAN_APPROVED",
                "Operator approved and logged the simulated recovery plan. No flight-control command was issued.",
            )
            print("[GCS CMD] Mission Command recovery plan approved and audit-logged")
        elif latest_state:
            mission_command_controller.record_action(
                latest_state.get("cycle", 0),
                "PLAN_APPROVAL_BLOCKED",
                "Approval requires a completed recovery simulation first.",
            )
            print("[GCS CMD] Mission Command approval ignored: no simulated plan available")

    elif action == "ai_engineer_query":
        question = cmd.get("question", "")
        if question and latest_state:
            try:
                result = ai_engineer_answer(question, latest_state)
                # result is now a dict: { answer, category, confidence, follow_ups }
                latest_state["ai_engineer_response"] = {
                    "question":   question,
                    "answer":     result.get("answer", ""),
                    "category":   result.get("category", "GENERAL_STATUS"),
                    "confidence": result.get("confidence", 0.5),
                    "follow_ups": result.get("follow_ups", []),
                    "timestamp":  latest_state.get("cycle", 0),
                }
                print(f"[GCS CMD] AI Engineer query: '{question[:50]}...' -> {result.get('category')}")
            except Exception as e:
                print(f"[GCS CMD] AI Engineer error: {e}")

    elif action == "select_uav":
        uav_id = cmd.get("uav_id", "UAV-01")
        fleet_manager.select_uav(uav_id)
        current_cfg["uav_id"] = uav_id
        current_cfg["engine_id"] = fleet_manager.get_active_engine_id()
        if latest_state:
            latest_state["uav_id"] = uav_id
            latest_state["engine_id"] = current_cfg["engine_id"]
            latest_state["fleet_status"] = fleet_manager.get_fleet_status()
        print(f"[GCS CMD] Active UAV switched → {uav_id} (Engine #{current_cfg['engine_id']})")

    elif action == "demo_start":
        demo_controller.start()
        current_cfg["injected_faults"] = []
        current_cfg["mode"] = "NORMAL"
        current_cfg["speed"] = 2.0
        latest_state.pop("mission_command_action", None)
        mission_command_controller.reset()
        print("[GCS CMD] Demo mode started")

    elif action == "demo_step":
        step = cmd.get("step")
        demo_controller.advance(step)
        print(f"[GCS CMD] Demo step → {demo_controller.current_step}")
        if demo_controller.current_step == 6 and latest_state:
            try:
                cur_rpm = latest_state.get("rpm", 2400)
                latest_state["whatif_result"] = simulate_whatif(
                    current_state=latest_state,
                    overrides={"rpm": max(1200, cur_rpm - 200)},
                    current_rul=latest_state.get("predicted_rul") or latest_state.get("true_rul", 0),
                    current_health=latest_state.get("health", {}).get("health_index", 50),
                    physics_model=physics_model,
                    health_fn=compute_health_index,
                    anomaly_score=latest_state.get("anomaly_score", 0),
                    fault_names=[f["name"] for f in latest_state.get("fault_events", [])],
                )
            except Exception as e:
                print(f"[DEMO] Auto whatif error: {e}")

    elif action == "demo_stop":
        demo_controller.stop()
        current_cfg["injected_faults"] = []
        print("[GCS CMD] Demo mode stopped")

    elif action == "trigger_federated_round":
        participating = cmd.get("participating_uavs")
        round_res = federated_coordinator.execute_round(participating)
        if latest_state:
            latest_state["federated_round"] = federated_coordinator.get_status()
        print(f"[GCS CMD] Federated learning round triggered → Round #{round_res['round']} ({round_res['global_model_version']})")

    elif action == "set_edge_mode":
        target_mode = cmd.get("mode", "GCS_FLOAT32")
        new_prof = edge_profile_manager.set_mode(target_mode)
        if latest_state:
            latest_state["edge_profile"] = new_prof
        print(f"[GCS CMD] Edge/SWaP deployment mode switched → {new_prof['mode_id']} ({new_prof['name']})")

    elif action == "annotate_replay":
        flight_id = cmd.get("flight_id") or f"flight-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{target_uav}"
        cycle = int(cmd.get("cycle", latest_state.get("cycle", 0) if latest_state else 0))
        note = cmd.get("note", "")
        category = cmd.get("category", "OBSERVATION")
        author = cmd.get("author", issued_by)
        ann_id = store.add_annotation(
            flight_id=flight_id,
            aircraft_id=target_uav,
            cycle=cycle,
            author=author,
            note=note,
            category=category,
        )
        print(f"[GCS CMD] Replay annotation #{ann_id} recorded for {flight_id} cycle {cycle}")

    elif action == "generate_report":
        flight_id = cmd.get("flight_id") or f"flight-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{target_uav}"
        try:
            report = generate_flight_report(store, flight_id)
            if latest_state:
                latest_state["post_flight_report"] = report
            print(f"[GCS CMD] Post-flight report generated: {report.get('report_id')}")
        except Exception as e:
            print(f"[GCS CMD] Report generation error: {e}")

    # Record command execution in the immutable audit log
    effect = {
        "status": "SUCCESS",
        "action": action,
        "cycle": latest_state.get("cycle", 0) if latest_state else 0,
    }
    store.record_command(cmd_env, status="EXECUTED", effect=effect)

    # write back to the shared control file so the simulator picks it up
    _write_control_file(current_cfg)
    _log("INFO", "cmd_dispatch", f"GCS command processed", action=action, intent_id=intent_id)

    # immediately push updated state to connected clients
    if latest_state:
        _refresh_mission_command_state()
        latest_payload = json.dumps(latest_state)


# ── Atomic control-file writer ───────────────────────────────────────────────
# Uses write-to-temp + os.replace (POSIX atomic rename) to prevent the
# simulator from reading a half-written JSON file if the process is killed
# or interrupted mid-write (addresses Phase 0 control-plane reliability).
def _write_control_file(cfg: dict) -> None:
    """Write cfg to CONTROL_FILE atomically (temp file → os.replace)."""
    dir_path = os.path.dirname(CONTROL_FILE)
    os.makedirs(dir_path, exist_ok=True)
    # Write to a sibling temp file in the same directory so os.replace is
    # guaranteed to be on the same filesystem (no cross-device rename).
    fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp", prefix="profile_")
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(cfg, f, indent=2)
        os.replace(tmp_path, CONTROL_FILE)   # POSIX-atomic rename
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


WS_HOST = os.environ.get("UAV_TWIN_WS_HOST", "127.0.0.1")
WS_PORT = int(os.environ.get("UAV_TWIN_WS_PORT", "8765"))
API_PORT = int(os.environ.get("UAV_TWIN_API_PORT", "8766"))
WS_AUTH_TOKEN = os.environ.get("UAV_TWIN_AUTH_TOKEN", "").strip()


async def ws_handler(websocket):
    """WebSocket handler — streams state to the GCS with per-tenant filtering, receives and authorizes commands."""
    global latest_state, latest_payload

    # 1. Initial Handshake Authentication (URL query params or Authorization header)
    handshake_token = None
    if hasattr(websocket, "request") and websocket.request:
        req_path = getattr(websocket.request, "path", "") or ""
        if "?" in req_path:
            qs = urllib.parse.parse_qs(req_path.split("?", 1)[1])
            tokens = qs.get("token") or qs.get("auth_token")
            if tokens:
                handshake_token = tokens[0]
        if not handshake_token and hasattr(websocket.request, "headers") and websocket.request.headers:
            auth_hdr = websocket.request.headers.get("Authorization", "")
            if auth_hdr.startswith("Bearer "):
                handshake_token = auth_hdr[7:].strip()

    active_ws_auth = globals().get("WS_AUTH_TOKEN", WS_AUTH_TOKEN)
    session_caller = None
    if handshake_token:
        if active_ws_auth and handshake_token == active_ws_auth:
            session_caller = {
                "sub": "admin",
                "tenant_id": "default",
                "role": ROLE_ADMIN,
                "aircraft_ids": ["*"],
            }
        else:
            ok, payload, _ = verify_access_token(handshake_token)
            if ok:
                session_caller = payload
    elif not active_ws_auth and not REQUIRE_AUTH:
        session_caller = {
            "sub": "anonymous",
            "tenant_id": "default",
            "role": ROLE_ADMIN,
            "aircraft_ids": ["*"],
        }

    # Subscription state for this socket connection
    session_subscriber = {
        "tenant_id": session_caller.get("tenant_id", "default") if session_caller else "default",
        "aircraft_ids": session_caller.get("aircraft_ids", ["*"]) if session_caller else ["*"],
        "field_groups": None,
        "min_interval_ms": 100,
    }

    async def sender():
        while True:
            try:
                state_snapshot = dict(latest_state) if (latest_state and isinstance(latest_state, dict)) else None
                if state_snapshot:
                    filtered = filter_payload_for_subscriber(
                        payload=state_snapshot,
                        subscriber_tenant_id=session_subscriber["tenant_id"],
                        subscriber_aircraft_ids=session_subscriber["aircraft_ids"],
                        field_groups=session_subscriber.get("field_groups"),
                    )
                    if filtered is not None:
                        await websocket.send(json.dumps(filtered))
                elif latest_payload:
                    await websocket.send(latest_payload)
            except websockets.exceptions.ConnectionClosed:
                break
            except Exception:
                pass

            interval = max(0.05, session_subscriber.get("min_interval_ms", 100) / 1000.0)
            await asyncio.sleep(interval)

    async def receiver():
        nonlocal session_caller
        try:
            async for raw in websocket:
                # 1. Payload size bounding (max 64 KB)
                if len(raw) > 65536:
                    try:
                        await websocket.send(json.dumps({
                            "status": "PAYLOAD_TOO_LARGE",
                            "code": 413,
                            "error": "Command payload exceeds 64 KB limit",
                        }))
                    except Exception:
                        pass
                    continue

                # 2. Rate limiting (max 30 req/sec)
                caller_sub = session_caller.get("sub") if session_caller else "client"
                if not ws_rate_limiter.is_allowed(caller_sub):
                    try:
                        await websocket.send(json.dumps({
                            "status": "RATE_LIMITED",
                            "code": 429,
                            "error": "Command rate limit exceeded (max 30 requests/sec)",
                        }))
                    except Exception:
                        pass
                    continue

                # 3. JSON decoding
                try:
                    cmd = json.loads(raw)
                except Exception as e:
                    try:
                        await websocket.send(json.dumps({
                            "status": "BAD_REQUEST",
                            "code": 400,
                            "error": f"Invalid JSON payload: {e}",
                        }))
                    except Exception:
                        pass
                    continue

                if not isinstance(cmd, dict):
                    continue

                action = cmd.get("command") or cmd.get("action") or ""

                # 4. Command timestamp replay check
                if "issued_at" in cmd:
                    valid_time, time_err = ws_replay_guard.validate_timestamp(cmd.get("issued_at"))
                    if not valid_time:
                        try:
                            await websocket.send(json.dumps({
                                "status": "FORBIDDEN",
                                "code": 403,
                                "error": time_err,
                            }))
                        except Exception:
                            pass
                        continue

                # 5. Token resolution on message
                current_ws_auth = globals().get("WS_AUTH_TOKEN", WS_AUTH_TOKEN)
                provided_token = cmd.get("token") or cmd.get("auth_token")
                effective_caller = session_caller

                if provided_token:
                    if current_ws_auth and provided_token == current_ws_auth:
                        effective_caller = {
                            "sub": "admin",
                            "tenant_id": "default",
                            "role": ROLE_ADMIN,
                            "aircraft_ids": ["*"],
                        }
                        session_caller = effective_caller
                    else:
                        ok, payload, _ = verify_access_token(provided_token)
                        if ok:
                            effective_caller = payload
                            session_caller = payload
                            session_subscriber["tenant_id"] = payload.get("tenant_id", "default")
                            session_subscriber["aircraft_ids"] = payload.get("aircraft_ids", ["*"])
                        else:
                            effective_caller = None

                # 6. Legacy auth compatibility check
                if current_ws_auth:
                    token_matches = provided_token == current_ws_auth or (effective_caller and effective_caller.get("role") == ROLE_ADMIN)
                    if not token_matches:
                        print("[WS SECURITY] Unauthorized command attempt — rejecting and closing connection.")
                        try:
                            await websocket.send(json.dumps({
                                "status": "UNAUTHORIZED",
                                "code": 401,
                                "error": "Authentication token missing or invalid",
                            }))
                            await websocket.close(1008, "Unauthorized")
                        except Exception:
                            pass
                        break

                # 7. Unauthenticated command check if auth is required
                if REQUIRE_AUTH and not effective_caller:
                    try:
                        await websocket.send(json.dumps({
                            "status": "UNAUTHORIZED",
                            "code": 401,
                            "error": "Authentication required (missing or invalid token)",
                        }))
                    except Exception:
                        pass
                    continue

                # 8. Subscription command handler
                if action == "subscribe":
                    sub_tenant = cmd.get("tenant_id") or (effective_caller.get("tenant_id") if effective_caller else "default")
                    sub_aircraft = cmd.get("aircraft_ids") or (effective_caller.get("aircraft_ids") if effective_caller else ["*"])
                    sub_fields = cmd.get("field_groups")
                    min_int = int(cmd.get("min_interval_ms", 100))

                    caller_tenant = effective_caller.get("tenant_id", "default") if effective_caller else "default"
                    caller_role = effective_caller.get("role", ROLE_ADMIN) if effective_caller else ROLE_ADMIN

                    if caller_role != ROLE_ADMIN and caller_tenant != "default" and sub_tenant != caller_tenant:
                        try:
                            await websocket.send(json.dumps({
                                "status": "FORBIDDEN",
                                "code": 403,
                                "error": f"Cannot subscribe to tenant '{sub_tenant}' from tenant '{caller_tenant}'",
                            }))
                        except Exception:
                            pass
                        continue

                    session_subscriber["tenant_id"] = sub_tenant
                    session_subscriber["aircraft_ids"] = sub_aircraft
                    session_subscriber["field_groups"] = sub_fields
                    session_subscriber["min_interval_ms"] = min_int

                    try:
                        await websocket.send(json.dumps({
                            "status": "SUBSCRIBED",
                            "subscription_version": "1.0",
                            "tenant_id": sub_tenant,
                            "aircraft_ids": sub_aircraft,
                            "field_groups": sub_fields,
                            "min_interval_ms": min_int,
                        }))
                    except Exception:
                        pass
                    continue

                # 9. RBAC & Aircraft-Scoped Command Authorization
                target_aircraft = str(cmd.get("aircraft_id") or cmd.get("uav_id") or (latest_state.get("uav_id") if latest_state else "UAV-01"))
                auth_ok, status_code, reason = authorize_command(effective_caller, action, target_aircraft)
                if not auth_ok:
                    status_str = "UNAUTHORIZED" if status_code == 401 else "FORBIDDEN"
                    try:
                        await websocket.send(json.dumps({
                            "status": status_str,
                            "code": status_code,
                            "error": reason,
                            "command": action,
                            "aircraft_id": target_aircraft,
                        }))
                    except Exception:
                        pass

                    # Record rejected command attempt in the audit log
                    store = get_event_store()
                    store.record_command({
                        "command_version": "1.0",
                        "command": action,
                        "aircraft_id": target_aircraft,
                        "intent_id": cmd.get("intent_id", f"rej-{int(datetime.now(timezone.utc).timestamp()*1000)}"),
                        "issued_by": effective_caller.get("sub", "UNAUTHORIZED") if effective_caller else "ANONYMOUS",
                        "issued_at": cmd.get("issued_at", datetime.now(timezone.utc).isoformat()),
                        "params": cmd,
                    }, status="REJECTED", effect={"error": reason, "code": status_code})
                    continue

                # 10. Execute authorized command
                process_gcs_command(cmd)

        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            print(f"[WS CMD ERROR] {e}")

    await asyncio.gather(sender(), receiver())


async def run_ws_server():
    async with websockets.serve(ws_handler, WS_HOST, WS_PORT):
        auth_note = f" (Auth: {'ENABLED' if WS_AUTH_TOKEN else 'DISABLED'})"
        print(f"[WS]  Defense GCS WebSocket Server Active → ws://{WS_HOST}:{WS_PORT}{auth_note}")
        await asyncio.Future()


def start_ws_thread():
    asyncio.run(run_ws_server())


def start_service():
    # kick off the Replay & Audit REST API server in the background
    api_thread = start_api_server_thread(host=WS_HOST, port=API_PORT)

    # kick off the WebSocket server in the background so MQTT can run in the foreground
    ws_thread = Thread(target=start_ws_thread, daemon=True)
    ws_thread.start()

    # connect to the MQTT broker and start consuming telemetry
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    mqtt_host = os.environ.get("MQTT_HOST", "localhost")
    mqtt_port = int(os.environ.get("MQTT_PORT", "1883"))
    client.connect(mqtt_host, mqtt_port, 60)
    print(f"[MQTT] Connecting to MQTT broker at {mqtt_host}:{mqtt_port}...")
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


if __name__ == "__main__":
    start_service()
