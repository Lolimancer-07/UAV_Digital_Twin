"""
packages/twin-core/twin_core/twin_trust.py

Twin Trust Score (Continuous Self-Auditing Architecture).
Implements STARTUP_BLUEPRINT.md §3 Feature F14 & §8 Phase 2:
  - Multi-vector self-audit evaluating prediction fidelity, calibration stability, sensor integrity, and OOD rate.
  - Scores range from 0% to 100%, dropping transparently when faults or sensor drifts occur.
  - Informs operators exactly when to stop relying on automated prognostics.
"""

import threading
from typing import Dict, List, Any, Optional, Tuple


class TwinTrustScoreAuditor:
    """
    Computes an empirical, continuous self-audit trust index for the digital twin,
    surfacing transparent indicators when ML models or sensors degrade.
    """

    TRUST_LEVEL_HIGH = "HIGH_TRUST"          # >= 85%
    TRUST_LEVEL_MODERATE = "MODERATE_TRUST"  # 70 - 84%
    TRUST_LEVEL_DEGRADED = "DEGRADED_TRUST"  # 50 - 69%
    TRUST_LEVEL_UNTRUSTED = "UNTRUSTED"      # < 50%

    def __init__(
        self,
        weight_sensor_integrity: float = 0.35,
        weight_prediction_accuracy: float = 0.30,
        weight_calibration_stability: float = 0.20,
        weight_in_distribution: float = 0.15,
    ):
        self.w_sensor = weight_sensor_integrity
        self.w_pred = weight_prediction_accuracy
        self.w_cal = weight_calibration_stability
        self.w_dist = weight_in_distribution
        self._lock = threading.RLock()

    def evaluate_trust(
        self,
        sensor_trust: float = 1.0,           # 0.0 to 1.0 (from physics firewall / sensor monitor)
        prediction_error_norm: float = 0.05, # 0.0 to 1.0 (normalized residual between AI & measurements)
        drift_score: float = 0.0,            # 0.0 to 1.0 (from drift detector PSI / z-shifts)
        ood_rate: float = 0.0,               # 0.0 to 1.0 (from abstention OOD detector)
    ) -> Dict[str, Any]:
        """
        Evaluates the composite trust score and provides actionable degradation drivers.
        """
        with self._lock:
            # Bound inputs
            s_sensor = max(0.0, min(1.0, float(sensor_trust)))
            s_pred = max(0.0, min(1.0, 1.0 - float(prediction_error_norm)))
            s_drift = max(0.0, min(1.0, 1.0 - float(drift_score)))
            s_ood = max(0.0, min(1.0, 1.0 - float(ood_rate)))

            # Composite weighted calculation
            trust_fraction = (
                self.w_sensor * s_sensor
                + self.w_pred * s_pred
                + self.w_cal * s_drift
                + self.w_dist * s_ood
            )
            score_pct = round(max(0.0, min(100.0, trust_fraction * 100.0)), 1)

            # Categorize status
            if score_pct >= 85.0:
                level = self.TRUST_LEVEL_HIGH
                recommendation = "Full trust: all prognostics and prescriptive advisories verified."
            elif score_pct >= 70.0:
                level = self.TRUST_LEVEL_MODERATE
                recommendation = "Moderate trust: cross-reference engine CHT/oil channels."
            elif score_pct >= 50.0:
                level = self.TRUST_LEVEL_DEGRADED
                recommendation = "Degraded trust: reliance on ML prognostics discouraged; rely on primary physics gauges."
            else:
                level = self.TRUST_LEVEL_UNTRUSTED
                recommendation = "Twin untrusted: sensor or physical breakdown detected. Ground-side manual override required."

            degradation_drivers = []
            if s_sensor < 0.7:
                degradation_drivers.append("Sensor integrity / physics firewall failure")
            if s_pred < 0.7:
                degradation_drivers.append("Large prediction residual discrepancy")
            if s_drift < 0.7:
                degradation_drivers.append("Distribution drift exceedance")
            if s_ood < 0.7:
                degradation_drivers.append("Out-of-distribution operational regime")

            return {
                "trust_score": score_pct,
                "trust_level": level,
                "recommendation": recommendation,
                "degradation_drivers": degradation_drivers,
                "components": {
                    "sensor_integrity": round(s_sensor * 100.0, 1),
                    "prediction_accuracy": round(s_pred * 100.0, 1),
                    "calibration_stability": round(s_drift * 100.0, 1),
                    "in_distribution_fidelity": round(s_ood * 100.0, 1),
                },
            }


# Pre-configured singleton instance
twin_trust_auditor = TwinTrustScoreAuditor()
