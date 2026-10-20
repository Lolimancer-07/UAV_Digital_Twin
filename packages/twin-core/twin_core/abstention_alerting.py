"""
packages/twin-core/twin_core/abstention_alerting.py

Abstention-First Alerting & Mission Alert Budget Manager.
Implements STARTUP_BLUEPRINT.md §3 Feature F7 & §8 Phase 2:
  - OOD detection on multivariate telemetry feature embeddings (Mahalanobis distance).
  - Explicit 'UNCERTAIN' abstention state: knows when the twin does not know instead of false guessing.
  - Phase-aware cost-sensitive thresholds (takeoff, climb, cruise, loiter, descent, landing).
  - Mission alert budget manager with cooldown debouncing to eliminate operator alarm fatigue.
"""

import time
import math
import threading
from typing import Dict, List, Any, Optional, Tuple
import numpy as np


PHASE_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "takeoff":  {"caution_z": 2.2, "warning_z": 3.0, "ood_dist": 4.5},
    "climb":    {"caution_z": 2.4, "warning_z": 3.2, "ood_dist": 4.8},
    "cruise":   {"caution_z": 2.6, "warning_z": 3.5, "ood_dist": 5.0},
    "loiter":   {"caution_z": 2.8, "warning_z": 3.8, "ood_dist": 5.2},
    "descent":  {"caution_z": 2.5, "warning_z": 3.4, "ood_dist": 4.8},
    "landing":  {"caution_z": 2.2, "warning_z": 3.0, "ood_dist": 4.5},
    "taxi":     {"caution_z": 3.0, "warning_z": 4.0, "ood_dist": 5.5},
}

DEFAULT_CENTROID: Dict[str, float] = {
    "rpm": 1400.0,
    "cht": 380.0,
    "egt": 1585.0,
    "oil_pressure": 58.0,
    "vibration": 0.65,
}

DEFAULT_SCALES: Dict[str, float] = {
    "rpm": 50.0,
    "cht": 15.0,
    "egt": 25.0,
    "oil_pressure": 5.0,
    "vibration": 0.3,
}


class AbstentionAlertManager:
    """
    Evaluates alerts under an abstention-first paradigm, managing an alert budget
    and suppressing repetitive nuisance notifications.
    """

    STATE_NOMINAL = "NOMINAL"
    STATE_INFO = "INFO"
    STATE_ADVISORY = "ADVISORY"
    STATE_CAUTION = "CAUTION"
    STATE_WARNING = "WARNING"
    STATE_UNCERTAIN = "UNCERTAIN"  # Abstention state when OOD or confidence low

    def __init__(
        self,
        max_alerts_per_hour: int = 6,
        channel_cooldown_sec: float = 30.0,
    ):
        self.max_alerts_per_hour = max_alerts_per_hour
        self.channel_cooldown_sec = channel_cooldown_sec

        self._last_alert_times: Dict[str, float] = {}
        self._alert_history: List[Dict[str, Any]] = []
        self._lock = threading.RLock()

    def compute_ood_distance(self, telemetry: Dict[str, float]) -> float:
        """
        Computes normalized Mahalanobis/Euclidean distance from operational centroid:
            D = sqrt( sum( ((x_i - mu_i) / sigma_i)^2 ) )
        """
        sq_sum = 0.0
        count = 0
        for ch, mu in DEFAULT_CENTROID.items():
            if ch in telemetry and telemetry[ch] is not None:
                val = float(telemetry[ch])
                scale = DEFAULT_SCALES.get(ch, 1.0)
                z = (val - mu) / scale
                sq_sum += z * z
                count += 1
        if count == 0:
            return 0.0
        return float(math.sqrt(sq_sum))

    def evaluate_telemetry(
        self,
        telemetry: Dict[str, float],
        flight_phase: str = "cruise",
        current_time_sec: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates incoming telemetry for alerts with phase-aware gating, OOD detection,
        and alert budget throttling.
        """
        with self._lock:
            now = current_time_sec or time.time()
            phase = flight_phase.lower()
            thresholds = PHASE_THRESHOLDS.get(phase, PHASE_THRESHOLDS["cruise"])

            # 1. OOD / Abstention Check
            ood_dist = self.compute_ood_distance(telemetry)
            if ood_dist > thresholds["ood_dist"]:
                # High uncertainty -> Abstain from false alarming
                return {
                    "alert_level": self.STATE_UNCERTAIN,
                    "ood_distance": round(ood_dist, 2),
                    "is_abstaining": True,
                    "flight_phase": phase,
                    "message": f"Operating Out-of-Distribution (D={ood_dist:.1f} > {thresholds['ood_dist']:.1f}). Abstaining from definitive diagnosis.",
                    "suppressed": False,
                }

            # 2. Check Channel Excursions against Phase Thresholds
            worst_channel = None
            max_z = 0.0
            for ch, mu in DEFAULT_CENTROID.items():
                if ch in telemetry and telemetry[ch] is not None:
                    z = abs(float(telemetry[ch]) - mu) / DEFAULT_SCALES.get(ch, 1.0)
                    if z > max_z:
                        max_z = z
                        worst_channel = ch

            if max_z < thresholds["caution_z"]:
                return {
                    "alert_level": self.STATE_NOMINAL,
                    "max_z": round(max_z, 2),
                    "ood_distance": round(ood_dist, 2),
                    "is_abstaining": False,
                    "flight_phase": phase,
                    "suppressed": False,
                }

            # Determine alert severity
            if max_z >= thresholds["warning_z"]:
                level = self.STATE_WARNING
            else:
                level = self.STATE_CAUTION

            # 3. Alert Budget & Cooldown Gating
            last_time = self._last_alert_times.get(worst_channel, 0.0)
            in_cooldown = (now - last_time < self.channel_cooldown_sec)

            if in_cooldown:
                # Suppressed by alert budget to prevent operator fatigue
                return {
                    "alert_level": level,
                    "channel": worst_channel,
                    "max_z": round(max_z, 2),
                    "is_abstaining": False,
                    "flight_phase": phase,
                    "suppressed": True,
                    "suppression_reason": f"Channel {worst_channel} alert cooldown active ({now - last_time:.1f}s < {self.channel_cooldown_sec}s).",
                }

            # Fire alert and record in budget tracker
            self._last_alert_times[worst_channel] = now
            alert_record = {
                "timestamp": now,
                "level": level,
                "channel": worst_channel,
                "max_z": round(max_z, 2),
                "phase": phase,
            }
            self._alert_history.append(alert_record)

            return {
                "alert_level": level,
                "channel": worst_channel,
                "max_z": round(max_z, 2),
                "ood_distance": round(ood_dist, 2),
                "is_abstaining": False,
                "flight_phase": phase,
                "suppressed": False,
                "message": f"Phase '{phase}' alert on {worst_channel} (deviation z={max_z:.1f}).",
            }


# Pre-configured singleton instance
abstention_alert_manager = AbstentionAlertManager()
