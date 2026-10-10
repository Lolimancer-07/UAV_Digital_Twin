"""
packages/twin-core/twin_core/hil_testbed.py

Hardware-in-the-Loop (HIL) & Bench Replay Testbed Execution Engine.
Implements improvement_plan.md §4 Phase 6:
  - Deterministic scenario replay for bench / HIL test rigs (CANoe / CANalyzer / Vector VN1610 / CAN HAT).
  - Controlled Fault-Injection Matrix (Thermal runaway, stuck sensor, lubrication starvation, bus flood).
  - Documented pass/fail acceptance envelope:
      * 100% detection of critical faults within <= 1.5 seconds / 15 cycles.
      * Zero false alarms during nominal cruise flight.
      * Latency and jitter benchmarking for bench certification.
"""

from typing import Dict, List, Any, Optional, Callable
from datetime import datetime, timezone
import time
import json
import threading
import numpy as np

# Bench Hardware Profile Specifications
BENCH_HARDWARE_SPECS = {
    "recommended_interfaces": [
        {"vendor": "Vector Informatik", "model": "VN1610 / VN1630A", "bus": "CAN FD / J1939", "bitrate_kbps": 250},
        {"vendor": "Kvaser", "model": "Leaf Light v2", "bus": "High-Speed CAN", "bitrate_kbps": 250},
        {"vendor": "Embedded Jetson / RPi", "model": "Waveshare MCP2515 CAN HAT", "bus": "SPI-CAN J1939", "bitrate_kbps": 250},
    ],
    "timing_spec": {
        "nominal_cycle_period_ms": 100.0,  # 10 Hz telemetry loop
        "max_jitter_ms": 15.0,
        "max_fault_detection_latency_s": 1.5,
    },
}

# Canonical Fault-Injection Matrix
FAULT_INJECTION_CATALOG: Dict[str, Dict[str, Any]] = {
    "INJ-TH-01": {
        "name": "Thermal Runaway Injection",
        "channel": "cht",
        "fault_type": "BIAS_RAMP",
        "magnitude": 85.0,  # +85°F above baseline
        "expected_fault_category": "OVERHEATING",
        "max_detection_cycles": 15,
        "max_latency_s": 1.5,
    },
    "INJ-OIL-01": {
        "name": "Sudden Lubrication Pressure Drop",
        "channel": "oil_pressure",
        "fault_type": "STEP_DROP",
        "target_value": 18.0,  # 18 PSI (critical)
        "expected_fault_category": "LOW_OIL_PRESSURE",
        "max_detection_cycles": 10,
        "max_latency_s": 1.0,
    },
    "INJ-VIB-01": {
        "name": "Mechanical Imbalance & Bearing Wear",
        "channel": "vibration",
        "fault_type": "STEP_SURGE",
        "target_value": 3.8,  # 3.8g RMS
        "expected_fault_category": "HIGH_VIBRATION",
        "max_detection_cycles": 12,
        "max_latency_s": 1.2,
    },
    "INJ-CAN-01": {
        "name": "Frozen / Stuck Sensor Replay",
        "channel": "egt",
        "fault_type": "STUCK_VALUE",
        "frozen_value": 1585.0,
        "expected_fault_category": "SENSOR_DRIFT",
        "max_detection_cycles": 25,
        "max_latency_s": 2.5,
    },
}


class HILScenarioReplayRunner:
    """
    Executes deterministic scenario replay against digital twin ingestion hooks,
    simulating hardware avionics bus feeds with millisecond precision.
    """

    def __init__(self, baseline_telemetry: Optional[Dict[str, float]] = None):
        self.baseline = baseline_telemetry or {
            "rpm": 1400.0,
            "cht": 380.0,
            "egt": 1585.0,
            "oil_pressure": 58.0,
            "oil_temp": 185.0,
            "fuel_flow": 8.5,
            "vibration": 0.65,
            "battery_v": 13.8,
        }

    def generate_scenario_frames(
        self,
        duration_cycles: int = 50,
        fault_injection_id: Optional[str] = None,
        fault_start_cycle: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Generates deterministic time-series frames with optional fault injection.
        """
        frames: List[Dict[str, Any]] = []
        fault_def = FAULT_INJECTION_CATALOG.get(fault_injection_id) if fault_injection_id else None

        for c in range(1, duration_cycles + 1):
            frame = dict(self.baseline)
            # Add subtle deterministic physical noise (0.1% amplitude)
            frame["rpm"] += (c % 5) * 1.5
            frame["cht"] += (c % 3) * 0.8
            frame["egt"] += (c % 4) * 1.2
            frame["cycle"] = c
            frame["timestamp"] = round(1760000000.0 + c * 0.1, 3)

            # Apply fault injection
            if fault_def and c >= fault_start_cycle:
                chan = fault_def["channel"]
                ftype = fault_def["fault_type"]

                if ftype == "BIAS_RAMP":
                    ramp = min(fault_def["magnitude"], (c - fault_start_cycle + 1) * 6.0)
                    frame[chan] += ramp
                elif ftype == "STEP_DROP":
                    frame[chan] = fault_def["target_value"]
                elif ftype == "STEP_SURGE":
                    frame[chan] = fault_def["target_value"]
                elif ftype == "STUCK_VALUE":
                    frame[chan] = fault_def["frozen_value"]

            frames.append(frame)

        return frames


class HILPassFailEvaluator:
    """
    Evaluates scenario execution results against acceptance criteria:
      1. Detection rate (100% of injected faults identified).
      2. Detection latency (fault detected within allowed max_latency_s / cycles).
      3. False positive rate (0 false alarms prior to fault injection).
    """

    def evaluate_run(
        self,
        frames: List[Dict[str, Any]],
        inference_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
        fault_injection_id: Optional[str] = None,
        fault_start_cycle: int = 20,
    ) -> Dict[str, Any]:
        """
        Runs scenario through the inference function and evaluates pass/fail envelope.
        """
        fault_def = FAULT_INJECTION_CATALOG.get(fault_injection_id) if fault_injection_id else None
        false_alarms = 0
        fault_detected_cycle: Optional[int] = None
        fault_category_detected: Optional[str] = None
        latencies_ms: List[float] = []

        for frame in frames:
            c = frame["cycle"]
            t0 = time.perf_counter()
            result = inference_fn(frame)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            latencies_ms.append(elapsed_ms)

            is_alarm = bool(
                result.get("anomaly_detected")
                or result.get("status") in ["WARNING", "CRITICAL", "EMERGENCY"]
                or result.get("fault_category")
            )

            # Check false positives
            if c < fault_start_cycle and is_alarm:
                false_alarms += 1

            # Check true positives
            if c >= fault_start_cycle and is_alarm and fault_detected_cycle is None:
                fault_detected_cycle = c
                fault_category_detected = (
                    result.get("fault_category")
                    or result.get("primary_fault")
                    or "DETECTED_ANOMALY"
                )

        mean_latency_ms = float(np.mean(latencies_ms)) if latencies_ms else 0.0
        p99_latency_ms = float(np.percentile(latencies_ms, 99)) if latencies_ms else 0.0

        # Evaluate Acceptance Envelope
        passed = True
        failures: List[str] = []

        if false_alarms > 0:
            passed = False
            failures.append(f"False positive violation: {false_alarms} false alarms during nominal phase.")

        if fault_def:
            if fault_detected_cycle is None:
                passed = False
                failures.append(f"Missed detection: Injected fault {fault_injection_id} was not identified.")
            else:
                cycles_to_detect = fault_detected_cycle - fault_start_cycle
                max_allowed_cycles = fault_def["max_detection_cycles"]
                if cycles_to_detect > max_allowed_cycles:
                    passed = False
                    failures.append(
                        f"Latency violation: Fault detected in {cycles_to_detect} cycles, exceeding {max_allowed_cycles} limit."
                    )
        else:
            # Nominal run verification
            if false_alarms > 0:
                passed = False

        return {
            "passed": passed,
            "fault_injection_id": fault_injection_id,
            "false_alarms": false_alarms,
            "fault_detected_cycle": fault_detected_cycle,
            "cycles_to_detect": (fault_detected_cycle - fault_start_cycle) if fault_detected_cycle else None,
            "detected_category": fault_category_detected,
            "failures": failures,
            "mean_inference_latency_ms": round(mean_latency_ms, 2),
            "p99_inference_latency_ms": round(p99_latency_ms, 2),
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
        }
