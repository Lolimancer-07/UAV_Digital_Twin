"""
backend/twin_consistency.py

Cross-validates the AI anomaly detector against the physics model.
The idea is simple: if both independently flag a problem, we're very confident.
If only one does, we need to figure out why they disagree.

Four cases (A–D matrix):
  A: AI normal + physics normal       → everything is fine
  B: AI abnormal + physics abnormal   → high confidence real fault
  C: AI normal + physics abnormal     → sensor drift or model calibration issue
  D: AI abnormal + physics normal     → possible false positive, keep watching

The consistency score is a weighted blend of AI agreement, physics agreement,
and overall sensor integrity. Low score = something is wrong somewhere.
"""

from typing import Dict, Any

# thresholds for when we say the physics model is "disagreeing"
PHYSICS_THRESHOLDS = {
    "delta_egt":   60.0,   # °F residual before we call it a physics violation
    "delta_cht":   30.0,   # °F
    "delta_oil_p": 12.0,   # PSI
    "delta_fuel":  1.5,    # L/h
}

# how much each component contributes to the final consistency score
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
    Computes the AI+Physics cross-validation matrix and twin consistency score.

    Parameters
    ----------
    is_anomaly             : whether the AI anomaly detector flagged this packet
    anomaly_score          : Isolation Forest score (negative = more anomalous)
    physics_residuals      : delta_egt, delta_cht, delta_oil_p, delta_fuel
    sensor_integrity_score : overall sensor trust score (0–100)
    """

    # AI agreement score (0–100)
    # anomaly_score typically ranges from -0.5 (very anomalous) to +0.3 (very normal)
    # we map this to 0–100: score=0.3 → 100%, score=-0.5 → 0%
    ai_agreement = max(0.0, min(100.0, (anomaly_score + 0.5) / 0.8 * 100.0))
    # if the hard anomaly flag is set, cap agreement at 45% regardless of score
    if is_anomaly:
        ai_agreement = min(ai_agreement, 45.0)

    # physics agreement score (0–100)
    # count up how badly each residual exceeds its threshold
    physics_violations = 0.0
    max_possible_violations = len(PHYSICS_THRESHOLDS)
    for key, threshold in PHYSICS_THRESHOLDS.items():
        delta = abs(physics_residuals.get(key, 0.0))
        if delta > threshold:
            violation_severity = min(1.0, (delta - threshold) / threshold)
            physics_violations += violation_severity

    physics_agreement = max(0.0, 100.0 - (physics_violations / max_possible_violations) * 100.0)

    # weighted blend
    consistency_score = (
        ai_agreement      * CONSISTENCY_WEIGHTS["ai_agreement"] +
        physics_agreement * CONSISTENCY_WEIGHTS["physics_agreement"] +
        sensor_integrity_score * CONSISTENCY_WEIGHTS["sensor_integrity"]
    )
    consistency_score = round(max(0.0, min(100.0, consistency_score)), 1)

    # classify into Case A/B/C/D
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
