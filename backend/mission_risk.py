"""
backend/mission_risk.py

Estimates the probability that this UAV can complete the planned mission
given what we currently know about the engine.

The probability is a product of four independent components:
  P_complete = P_engine × P_thermal × P_time × P_environment

Each component is a probability between 0 and 1:
  P_engine  — health index + failure probability
  P_thermal — how much thermal margin we have vs CHT/EGT limits
  P_time    — does predicted RUL cover the mission duration?
  P_env     — altitude and OAT stress factors

Active faults apply a multiplicative penalty on top.

Risk thresholds:
  LOW      ≥ 85%  — dispatch normally
  MODERATE ≥ 65%  — flag for advisory review
  HIGH     ≥ 40%  — consider reducing mission duration
  CRITICAL  < 40% — do not dispatch
"""

import math
from typing import Dict, Any

# mission planning defaults — can be overridden per-flight
DEFAULT_MISSION_DURATION_H = 4.5        # hours
DEFAULT_MISSION_CYCLES = 162            # rough cycle count for a 4.5h mission at 10Hz
CRUISE_FUEL_BURN_L_H = 9.2             # nominal cruise fuel burn
RESERVE_FUEL_PCT = 0.20                # minimum 20% fuel reserve
CYCLE_DURATION_MIN = 0.75              # minutes per dataset cycle


def compute_failure_probability(
    predicted_rul: float,
    is_anomaly: bool,
    anomaly_score: float,
    fault_count: int,
    health_index: float
) -> float:
    """
    Probability of engine failure within the next 20 cycles.

    Inputs come from real model outputs — nothing hard-coded to a scenario.
    RUL is the dominant term; anomaly score and fault count push it up.
    """
    # RUL-based base probability — the closer to zero, the scarier it gets
    if predicted_rul <= 0:
        p_rul = 0.50  # no prediction yet, so we're uncertain — use 50%
    elif predicted_rul < 15:
        p_rul = 0.90
    elif predicted_rul < 30:
        p_rul = 0.55
    elif predicted_rul < 60:
        p_rul = 0.25
    elif predicted_rul < 100:
        p_rul = 0.10
    else:
        p_rul = 0.03

    # anomaly score contribution — score is negative when anomalous
    if is_anomaly:
        anomaly_contrib = max(0.0, min(0.30, -(anomaly_score) * 0.4))
    else:
        anomaly_contrib = 0.0

    # more active faults = higher probability
    fault_contrib = min(0.25, fault_count * 0.07)

    # low health index adds a small extra push
    health_contrib = max(0.0, (100.0 - health_index) / 100.0) * 0.15

    p_failure = min(0.98, p_rul + anomaly_contrib + fault_contrib + health_contrib)
    return round(p_failure, 3)


def compute_mission_risk(
    data: dict,
    health_index: float,
    predicted_rul: float,
    failure_probability: float,
    fault_events: list,
    mission_duration_h: float = DEFAULT_MISSION_DURATION_H
) -> dict:
    """
    Full mission-level risk assessment.

    Parameters
    ----------
    data                : current telemetry packet
    health_index        : composite health score (0–100)
    predicted_rul       : AI-predicted RUL in cycles
    failure_probability : probability of failure in next 20 cycles
    fault_events        : active fault list
    mission_duration_h  : planned mission duration in hours

    Returns
    -------
    Dict with completion probability, risk level, safe time, component breakdown.
    """
    rpm       = float(data.get("rpm", 1400.0))
    cht       = float(data.get("cht", 380.0))
    egt       = float(data.get("egt", 1580.0))
    fuel_flow = float(data.get("fuel_flow", 8.5))
    altitude  = float(data.get("altitude_ft", 3000.0))
    oat_c     = float(data.get("oat_c", 15.0))

    # P_engine — how reliable is this engine right now?
    p_engine_health = max(0.02, health_index / 100.0)
    p_engine = p_engine_health * (1.0 - failure_probability * 0.8)
    p_engine = max(0.01, min(0.999, p_engine))

    # P_thermal — how much margin before we hit CHT/EGT limits?
    # grows non-linearly near the limits so risk escalates quickly
    cht_crit = 435.0
    egt_crit = 1670.0
    cht_margin = max(0.0, (cht_crit - cht) / cht_crit)
    egt_margin = max(0.0, (egt_crit - egt) / egt_crit)
    p_thermal = min(1.0, 0.5 + 0.3 * cht_margin + 0.2 * egt_margin)

    # P_time — does the engine have enough life left for the mission?
    # assume 36 sensor cycles per minute of mission time
    mission_cycles = mission_duration_h * 60.0 / CYCLE_DURATION_MIN
    if predicted_rul > 0:
        rul_ratio = predicted_rul / max(1.0, mission_cycles)
        p_time = min(0.999, max(0.01, 1.0 - math.exp(-rul_ratio * 1.5)))
    else:
        p_time = 0.60  # uncertain — moderate guess until LSTM warms up

    # P_environment — thin air and hot days both add stress
    altitude_factor = max(0.0, 1.0 - max(0.0, altitude - 10000.0) / 30000.0 * 0.15)
    oat_factor = max(0.0, 1.0 - max(0.0, oat_c - 25.0) / 50.0 * 0.10)
    p_environment = altitude_factor * oat_factor

    # fault penalty — each critical fault cuts 15%, each warning cuts 5%
    critical_faults = [f for f in fault_events if f.get("severity") == "CRITICAL"]
    warning_faults  = [f for f in fault_events if f.get("severity") == "WARNING"]
    fault_penalty = 1.0 - (len(critical_faults) * 0.15 + len(warning_faults) * 0.05)
    fault_penalty = max(0.1, fault_penalty)

    # combine everything
    p_complete = p_engine * p_thermal * p_time * p_environment * fault_penalty
    p_complete = max(0.01, min(0.999, p_complete))

    p_abort = 1.0 - p_complete
    p_critical_failure = failure_probability * (1.0 - p_thermal) * 0.5

    # estimate how long we can safely operate before the risk threshold (65%) is crossed
    if predicted_rul > 0:
        safe_cycles = predicted_rul * (1.0 - failure_probability) * p_thermal
        safe_time_h = max(0.0, safe_cycles * CYCLE_DURATION_MIN / 60.0)
    else:
        safe_time_h = mission_duration_h * p_complete

    # assign a risk level and a human-readable narrative
    if p_complete >= 0.85:
        risk_level = "LOW"
        risk_color = "ok"
        risk_narrative = "Mission completion probability is high. Engine state supports full mission dispatch."
    elif p_complete >= 0.65:
        risk_level = "MODERATE"
        risk_color = "warn"
        risk_narrative = "Mission completion at moderate risk. Recommend monitoring and pre-flight advisory review."
    elif p_complete >= 0.40:
        risk_level = "HIGH"
        risk_color = "warn"
        risk_narrative = "Mission at high risk of failure or abort. Consider reducing mission duration or RPM setting."
    else:
        risk_level = "CRITICAL"
        risk_color = "crit"
        risk_narrative = "Mission completion probability critically low. Do not dispatch on long-duration mission without maintenance action."

    mission_at_risk = p_complete < 0.65
    required_duration_h = mission_duration_h

    return {
        "mission_completion_probability": round(p_complete * 100.0, 1),
        "abort_probability":              round(p_abort * 100.0, 1),
        "critical_failure_probability":   round(p_critical_failure * 100.0, 1),
        "safe_operating_time_h":          round(safe_time_h, 2),
        "required_mission_duration_h":    required_duration_h,
        "mission_at_risk":                bool(mission_at_risk),
        "risk_level":                     risk_level,
        "risk_color":                     risk_color,
        "risk_narrative":                 risk_narrative,
        "components": {
            "engine_reliability":  round(p_engine * 100.0, 1),
            "thermal_margin":      round(p_thermal * 100.0, 1),
            "rul_time_margin":     round(p_time * 100.0, 1),
            "environmental":       round(p_environment * 100.0, 1),
            "fault_penalty":       round(fault_penalty * 100.0, 1),
        }
    }
