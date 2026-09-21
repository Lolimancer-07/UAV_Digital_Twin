"""
backend/anomaly_detector.py

Multi-Layer Propulsion Anomaly Detection with Temporal Debouncing (Hysteresis).

Layer 1 — Unsupervised Isolation Forest trained on healthy multivariate telemetry.
  Produces a continuous anomaly score: negative indicates anomalous outlier region.

Layer 2 — Deterministic Aviation Domain Rule Classifiers.
  Catches canonical physical failure modes (OVERHEATING, LOW_OIL_PRESSURE, HIGH_VIBRATION, etc.)
  parameterized centrally via backend.engine_config.

Hysteresis Filter:
  Debounces discrete sensor spikes (requires N=3 consecutive detections to activate,
  N=5 consecutive clean cycles to deactivate) to prevent alert flicker on the cockpit HUD.
"""

import pickle
import numpy as np
from typing import Tuple, List, Dict, Any

try:
    from backend.engine_config import get_engine_config
except ImportError:
    try:
        from engine_config import get_engine_config
    except ImportError:
        get_engine_config = lambda: {"fault_thresholds": {
            "cht_critical_degf": 430.0, "cht_warning_degf": 410.0,
            "egt_critical_degf": 1650.0, "egt_warning_degf": 1620.0,
            "oil_p_critical_psi": 30.0, "oil_p_warning_psi": 38.0,
            "oil_t_critical_degf": 235.0, "vibration_critical_g": 2.5,
            "kurtosis_critical": 5.5,
        }}


class FaultHysteresisFilter:
    """
    Stateful temporal debouncer for fault rules.
    Prevents single-sample sensor noise spikes from toggling critical cockpit alerts.
    """
    def __init__(self, trigger_threshold: int = 3, clear_threshold: int = 5):
        self.trigger_threshold = trigger_threshold
        self.clear_threshold = clear_threshold
        self.active_counts: Dict[str, int] = {}
        self.clear_counts: Dict[str, int] = {}
        self.latched_faults: Dict[str, Dict[str, Any]] = {}

    def filter_faults(self, raw_faults: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raw_map = {f["name"]: f for f in raw_faults}
        all_fault_names = set(self.active_counts.keys()) | set(raw_map.keys()) | set(self.latched_faults.keys())

        result = []
        for name in all_fault_names:
            if name in raw_map:
                fault_info = raw_map[name]
                self.active_counts[name] = self.active_counts.get(name, 0) + 1
                self.clear_counts[name] = 0

                # Immediate trip for high-severity emergency redlines
                is_immediate = fault_info.get("severity") == "CRITICAL" and self.active_counts[name] >= 2
                if self.active_counts[name] >= self.trigger_threshold or is_immediate:
                    fault_entry = dict(fault_info)
                    fault_entry["consecutive_samples"] = self.active_counts[name]
                    fault_entry["debounced"] = True
                    self.latched_faults[name] = fault_entry
            else:
                self.clear_counts[name] = self.clear_counts.get(name, 0) + 1
                self.active_counts[name] = 0
                if self.clear_counts[name] >= self.clear_threshold:
                    self.latched_faults.pop(name, None)

        return list(self.latched_faults.values())

    def force_clear_all(self):
        """Immediately evict all latched faults — called when the GCS operator
        issues an explicit CLEAR command. Bypasses the normal clear_threshold
        hysteresis so the dashboard responds instantly."""
        self.active_counts.clear()
        self.clear_counts.clear()
        self.latched_faults.clear()


class AnomalyDetector:
    """
    Combines learned Isolation Forest multivariate envelope with
    centralized domain fault rules and temporal hysteresis.
    """

    def __init__(self, model_path: str = 'backend/anomaly_model.pkl', enable_hysteresis: bool = True):
        self.enable_hysteresis = enable_hysteresis
        self.hysteresis_filter = FaultHysteresisFilter(trigger_threshold=3, clear_threshold=5)

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

    def force_clear(self):
        """Immediately evict all latched/debounced faults from the hysteresis filter."""
        self.hysteresis_filter.force_clear_all()

    def get_fault_rules(self, th: Dict[str, float]) -> Dict[str, Tuple[callable, str]]:
        """
        Returns rule lambdas and severities matching AI_MODELS_SPEC.md §4.2 and PROJECT_CONTEXT.md §5.
        """
        return {
            "OVERHEATING": (
                lambda d: (
                    d.get('cht', 0) > th.get('cht_critical_degf', 430.0) or
                    d.get('egt', 0) > th.get('egt_critical_degf', 1650.0) or
                    (d.get('cht', 0) > th.get('cht_warning_degf', 410.0) and d.get('egt', 0) > th.get('egt_warning_degf', 1620.0))
                ),
                "CRITICAL"
            ),
            "LOW_OIL_PRESSURE": (
                lambda d: (
                    d.get('oil_pressure', 60.0) < th.get('oil_p_critical_psi', 30.0) and
                    d.get('rpm', 1400.0) > 800.0
                ),
                "CRITICAL"
            ),
            "LUBRICATION_ISSUE": (
                lambda d: (
                    d.get('oil_pressure', 60.0) < th.get('oil_p_warning_psi', 38.0) or
                    d.get('oil_temp', 180.0) > th.get('oil_t_critical_degf', 235.0) or
                    (d.get('oil_pressure', 60.0) < 42.0 and d.get('rpm', 0) > 1350.0)
                ),
                "WARNING"
            ),
            "HIGH_VIBRATION": (
                lambda d: (
                    d.get('vibration', 0.0) > th.get('vibration_critical_g', 2.5) or
                    d.get('vibration_kurtosis', 3.0) > th.get('kurtosis_critical', 5.5)
                ),
                "WARNING"
            ),
            "MISFIRE_SUSPECT": (
                lambda d: (
                    (d.get('rpm', 9999) < 1250 and d.get('egt', 0) > 1620) or
                    d.get('misfire_active', False) is True or
                    (d.get('vibration', 0) > 1.8 and d.get('rpm', 0) < 1280)
                ),
                "CRITICAL"
            ),
            "INJECTOR_ANOMALY": (
                lambda d: (
                    (d.get('fuel_flow', 8.5) < th.get('fuel_flow_min_lh', 4.0) and d.get('rpm', 0) > 1200) or
                    (d.get('fuel_flow', 8.5) > th.get('fuel_flow_max_lh', 13.0) and d.get('rpm', 0) < 1300) or
                    d.get('fuel_rail_pressure_bar', 3.0) < 2.2
                ),
                "WARNING"
            ),
            "SENSOR_DRIFT": (
                lambda d: (
                    (d.get('egt', 1580) < 1200 and d.get('cht', 0) > 380) or
                    (d.get('cht', 0) < 100 and d.get('rpm', 0) > 1000) or
                    (d.get('battery_v', 13.8) < 10.0 or d.get('battery_v', 13.8) > 16.5)
                ),
                "WARNING"
            ),
            "COOLING_DEGRADATION": (
                lambda d: (
                    (d.get('cht', 0) > th.get('cht_warning_degf', 410.0) and d.get('oil_temp', 180.0) > 215.0) or
                    d.get('cooling_degradation_active', False) is True
                ),
                "WARNING"
            ),
            "COMBUSTION_INSTABILITY": (
                lambda d: (
                    (d.get('vibration', 0) > 1.6 and abs(d.get('inj_timing', 28) - 28.0) > 7.0) or
                    (d.get('egt', 1580) > 1635 and d.get('fuel_flow', 8.5) > 10.8)
                ),
                "WARNING"
            ),
            "ALTERNATOR_LOW": (
                lambda d: (
                    d.get('battery_v', 13.8) < th.get('battery_v_low_warn', 12.6)
                ),
                "WARNING"
            )
        }

    def predict(self, data: dict, use_hysteresis: bool = None) -> Tuple[bool, float, List[dict]]:
        """
        Runs Isolation Forest and domain rules on current telemetry packet.
        Returns (is_anomaly, anomaly_score, fault_events).
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

        # Load active thresholds from centralized config
        th = get_engine_config().get("fault_thresholds", {})
        rules = self.get_fault_rules(th)

        raw_fault_events = []
        for name, (rule_fn, severity) in rules.items():
            try:
                if rule_fn(data):
                    raw_fault_events.append({
                        "name": name,
                        "severity": severity
                    })
            except Exception:
                continue

        apply_hyst = self.enable_hysteresis if use_hysteresis is None else use_hysteresis
        if apply_hyst:
            fault_events = self.hysteresis_filter.filter_faults(raw_fault_events)
        else:
            fault_events = raw_fault_events

        has_critical = any(f["severity"] == "CRITICAL" for f in fault_events)
        is_anomaly = bool(ml_anomaly or has_critical or len(fault_events) > 0)

        return is_anomaly, score, fault_events
