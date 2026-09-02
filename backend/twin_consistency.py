"""
backend/twin_consistency.py
-----------------------------
AI + Physics Cross-Validation & Twin Consistency Scoring.

Implements the 4-case cross-validation matrix:
  Case A: AI normal, Physics normal  → NORMAL
  Case B: AI abnormal, Physics abnormal → HIGH_CONFIDENCE_FAULT
  Case C: AI normal, Physics abnormal → SENSOR_MODEL_DISAGREEMENT
  Case D: AI abnormal, Physics normal → POSSIBLE_FALSE_POSITIVE

Twin Consistency Score = weighted combination of:
  - AI agreement score (how confident the AI anomaly model is that state is normal)
  - Physics agreement score (how well measured values match physics predictions)
  - Sensor integrity score (from sensor_integrity module)
"""

from typing import Dict, Any

# Physics residual thresholds (beyond which physics disagrees)
PHYSICS_THRESHOLDS = {
    "delta_egt":   60.0,   # °F
    "delta_cht":   30.0,   # °F
    "delta_oil_p": 12.0,   # PSI
    "delta_fuel":  1.5,    # L/h
}

# Weights for twin consistency score
CONSISTENCY_WEIGHTS = {
    "ai_agreement":      0.40,
    "physics_agreement": 0.40,
    "sensor_integrity":  0.20,
}


def compute_twin_consistency(
    is_anomaly: bool,
    anomaly_score: float,
    physics_residuals: dict,
    sensor_integrity_score: float,
) -> dict:
    """
    Computes the AI+Physics cross-validation matrix and Twin Consistency Score.

    Parameters
    ----------
    is_anomaly         : AI anomaly flag
    anomaly_score      : Isolation Forest decision score (negative = more anomalous)
    physics_residuals  : dict with delta_egt, delta_cht, delta_oil_p, delta_fuel
    sensor_integrity_score : overall sensor integrity score (0-100)

    Returns
    -------
    dict with consistency_score, ai_agreement, physics_agreement, case, narrative
    """

    # ── AI Agreement Score (0–100) ───────────────────────────────────────────
    # anomaly_score range: typically -0.5 (very anomalous) to +0.3 (very normal)
    # Map to 0-100: score=0.3 → 100%, score=-0.5 → 0%
    ai_agreement = max(0.0, min(100.0, (anomaly_score + 0.5) / 0.8 * 100.0))
    # Penalty if hard anomaly flag
    if is_anomaly:
        ai_agreement = min(ai_agreement, 45.0)

    # ── Physics Agreement Score (0–100) ─────────────────────────────────────
    # Sum of normalized residual violations
    physics_violations = 0.0
    max_possible_violations = len(PHYSICS_THRESHOLDS)
    for key, threshold in PHYSICS_THRESHOLDS.items():
        delta = abs(physics_residuals.get(key, 0.0))
        if delta > threshold:
            violation_severity = min(1.0, (delta - threshold) / threshold)
            physics_violations += violation_severity

    physics_agreement = max(0.0, 100.0 - (physics_violations / max_possible_violations) * 100.0)

    # ── Twin Consistency Score ───────────────────────────────────────────────
    consistency_score = (
        ai_agreement      * CONSISTENCY_WEIGHTS["ai_agreement"] +
        physics_agreement * CONSISTENCY_WEIGHTS["physics_agreement"] +
        sensor_integrity_score * CONSISTENCY_WEIGHTS["sensor_integrity"]
    )
    consistency_score = round(max(0.0, min(100.0, consistency_score)), 1)

    # ── Case Classification ──────────────────────────────────────────────────
    ai_normal = not is_anomaly and ai_agreement > 55.0
    physics_normal = physics_agreement > 65.0

    if ai_normal and physics_normal:
        case = "A"
        case_label = "NORMAL"
        narrative = ("All systems nominal. AI model and physics baseline are in agreement. "
                     "No intervention required.")
        severity = "OK"
    elif (not ai_normal) and (not physics_normal):
        case = "B"
        case_label = "HIGH_CONFIDENCE_FAULT"
        narrative = ("Both the AI anomaly model and the thermodynamic physics model "
                     "independently indicate an abnormal engine state. "
                     "High confidence engine fault — immediate investigation recommended.")
        severity = "CRITICAL"
    elif ai_normal and (not physics_normal):
        case = "C"
        case_label = "SENSOR_MODEL_DISAGREEMENT"
        narrative = ("Physics model predicts an anomalous thermodynamic state, "
                     "but the AI model reports nominal readings. "
                     "Possible sensor drift, measurement noise, or model calibration issue. "
                     "Sensor integrity check recommended before declaring an engine fault.")
        severity = "WARNING"
    else:
        case = "D"
        case_label = "POSSIBLE_FALSE_POSITIVE"
        narrative = ("AI anomaly detector has flagged an anomaly, but the thermodynamic "
                     "physics model shows engine parameters within expected bounds. "
                     "Possible AI false positive or sensor transient. Monitor closely.")
        severity = "WARNING"

    return {
        "consistency_score":  consistency_score,
        "ai_agreement":       round(ai_agreement, 1),
        "physics_agreement":  round(physics_agreement, 1),
        "sensor_integrity":   round(sensor_integrity_score, 1),
        "case":               case,
        "case_label":         case_label,
        "narrative":          narrative,
        "severity":           severity,
    }
