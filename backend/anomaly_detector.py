"""
backend/anomaly_detector.py

Two-layer anomaly detection for MALE UAV aero piston engines:

Layer 1 — Isolation Forest trained on healthy telemetry.
  Gives a continuous score: more negative = more anomalous.

Layer 2 — 8 hand-crafted fault rules based on domain knowledge.
  Catches specific failure modes the statistical model might miss
  when only one or two channels deviate.

Both layers run every packet. A fault flag from either one sets
is_anomaly = True for the full pipeline.
"""

import pickle
import numpy as np
from typing import Tuple, List, Dict, Any

# these rules encode what an experienced engine tech would look for
FAULT_RULES: Dict[str, callable] = {
    # if both CHT and EGT are climbing together, it's a real thermal runaway
    "OVERHEATING": lambda d: (
        d.get('cht', 0) > 420.0 or
        d.get('egt', 0) > 1650.0 or
        (d.get('cht', 0) > 400.0 and d.get('egt', 0) > 1620.0)
    ),

    # below 38 PSI is an immediate emergency — bearing damage starts fast
    "LOW_OIL_PRESSURE": lambda d: (
        d.get('oil_pressure', 60.0) < 38.0
    ),
    # softer warning — starts when pressure is marginal at high RPM
    "LUBRICATION_ISSUE": lambda d: (
        d.get('oil_pressure', 60.0) < 42.0 or
        d.get('oil_temp', 180.0) > 230.0 or
        (d.get('oil_pressure', 60.0) < 45.0 and d.get('rpm', 0) > 1350.0)
    ),

    # kurtosis > 4.2 is a strong indicator of impulsive bearing faults
    "HIGH_VIBRATION": lambda d: (
        d.get('vibration', 0.0) > 2.2 or
        d.get('vibration_kurtosis', 3.0) > 4.2
    ),

    # low RPM + high EGT = unburned fuel in exhaust = misfire
    "MISFIRE_SUSPECT": lambda d: (
        (d.get('rpm', 9999) < 1250 and d.get('egt', 0) > 1620) or
        d.get('misfire_active', False) is True or
        (d.get('vibration', 0) > 1.8 and d.get('rpm', 0) < 1280)
    ),

    # fuel rail pressure or flow-to-RPM mismatch — injector blockage or leak
    "INJECTOR_ANOMALY": lambda d: (
        (d.get('fuel_flow', 8.5) < 4.2 and d.get('rpm', 0) > 1200) or
        (d.get('fuel_flow', 8.5) > 12.5 and d.get('rpm', 0) < 1300) or
        d.get('fuel_rail_pressure_bar', 3.0) < 2.2
    ),

    # cross-sensor contradiction — EGT can't be cold when CHT is hot
    "SENSOR_DRIFT": lambda d: (
        (d.get('egt', 1580) < 1200 and d.get('cht', 0) > 380) or
        (d.get('cht', 0) < 100 and d.get('rpm', 0) > 1000) or
        (d.get('battery_v', 13.8) < 10.0 or d.get('battery_v', 13.8) > 16.5)
    ),

    # CHT and oil temp both rising — cooling system losing ground
    "COOLING_DEGRADATION": lambda d: (
        (d.get('cht', 0) > 410.0 and d.get('oil_temp', 180.0) > 215.0) or
        d.get('cooling_degradation_active', False) is True
    ),

    # timing retard + vibration + rich EGT = flame front instability
    "COMBUSTION_INSTABILITY": lambda d: (
        (d.get('vibration', 0) > 1.6 and abs(d.get('inj_timing', 28) - 28.0) > 7.0) or
        (d.get('egt', 1580) > 1635 and d.get('fuel_flow', 8.5) > 10.8)
    ),

    # alternator output dropping — worth flagging even if not engine-critical
    "ALTERNATOR_LOW": lambda d: (
        d.get('battery_v', 13.8) < 12.6
    )
}

FAULT_SEVERITY = {
    "OVERHEATING":            "CRITICAL",
    "LOW_OIL_PRESSURE":       "CRITICAL",
    "LUBRICATION_ISSUE":      "WARNING",
    "HIGH_VIBRATION":         "WARNING",
    "MISFIRE_SUSPECT":        "CRITICAL",
    "INJECTOR_ANOMALY":       "WARNING",
    "SENSOR_DRIFT":           "WARNING",
    "COOLING_DEGRADATION":    "WARNING",
    "COMBUSTION_INSTABILITY": "WARNING",
    "ALTERNATOR_LOW":         "WARNING",
}


class AnomalyDetector:
    """
    Combines Isolation Forest (learned normal envelope) with
    rule-based domain fault classification.
    """

    def __init__(self, model_path: str = 'backend/anomaly_model.pkl'):
        try:
            with open(model_path, 'rb') as f:
                bundle = pickle.load(f)
            self.model = bundle['model']
            self.features = bundle['features']
            self.meta = bundle.get('meta', {})
            print(f"[AnomalyDetector] Loaded Isolation Forest | "
                  f"features={self.features} | "
                  f"trained on {self.meta.get('train_samples', '?')} samples")
        except Exception as e:
            print(f"[AnomalyDetector] Warning: Could not load {model_path}: {e}")
            self.model = None
            self.features = ['rpm', 'cht', 'egt', 'oil_pressure', 'fuel_flow', 'vibration', 'battery_v', 'inj_timing']

    def predict(self, data: dict) -> Tuple[bool, float, List[dict]]:
        """
        Runs both detection layers on the current telemetry packet.

        Returns:
          is_anomaly   — True if either layer triggered
          score        — Isolation Forest score (more negative = worse)
          fault_events — list of active fault dicts with name and severity
        """
        score = 0.0
        ml_anomaly = False

        if self.model is not None:
            try:
                X = np.array([[data.get(f, 0.0) for f in self.features]])
                score = float(self.model.decision_function(X)[0])
                ml_anomaly = bool(self.model.predict(X)[0] == -1)
            except Exception:
                score = 0.0
                ml_anomaly = False

        # check every rule — silently skip if the rule itself throws
        fault_events = []
        for name, rule in FAULT_RULES.items():
            try:
                if rule(data):
                    fault_events.append({
                        "name": name,
                        "severity": FAULT_SEVERITY.get(name, "WARNING")
                    })
            except Exception:
                continue

        # any critical rule or any fault at all counts as an anomaly
        has_critical_fault = any(f["severity"] == "CRITICAL" for f in fault_events)
        is_anomaly = bool(ml_anomaly or has_critical_fault or len(fault_events) > 0)

        return is_anomaly, score, fault_events
