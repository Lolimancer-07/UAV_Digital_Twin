"""
backend/health_index.py

Computes the overall engine health score (0–100) and breaks it down
into subsystem scores so the operator can see *where* the problem is.

Subsystems tracked:
  - Thermal    (CHT + EGT dynamics)
  - Lubrication (oil pressure + temp)
  - Mechanical  (vibration RMS + kurtosis)
  - Combustion  (EGT band + fuel flow vs RPM)
  - Electrical  (alternator voltage stability)

The score uses EWMA smoothing because real engines have thermal inertia —
you don't want the health index jumping around every cycle.
"""

from typing import Dict, List, Any


MAX_RUL = 260.0

CONDITION_BANDS = [
    (80.0, "EXCELLENT"),
    (60.0, "NOMINAL"),
    (40.0, "DEGRADED"),
    (20.0, "POOR"),
    ( 0.0, "CRITICAL"),
]


# EMA state — persists between calls so smoothing works correctly
# reset_health_state() is called whenever the engine_id changes
_last_health_state = {
    "composite": 92.0,
    "thermal": 90.0,
    "lubrication": 90.0,
    "mechanical": 95.0,
    "electrical": 98.0,
}

def reset_health_state(initial_health: float = 95.0):
    global _last_health_state
    _last_health_state = {
        "composite": initial_health,
        "thermal": initial_health,
        "lubrication": initial_health,
        "mechanical": initial_health,
        "electrical": initial_health,
    }


def compute_health_index(
    data: dict,
    predicted_rul: float,
    anomaly_score: float,
    fault_names: List[str],
) -> dict:
    """
    Weighted multi-subsystem health index with EWMA smoothing.
    Alpha = 0.20 — biased toward history, which reflects real thermal inertia.
    """
    global _last_health_state

    # RUL endurance tracking score (reported in sub_scores)
    if predicted_rul > 0:
        rul_score = min(100.0, max(0.0, (predicted_rul / MAX_RUL) * 100.0))
    else:
        cycle = float(data.get('cycle', 1))
        rul_score = max(50.0, 100.0 - (cycle / MAX_RUL) * 70.0)

    # Thermal subsystem — CHT nominal <= 410°F per Rotax 914 F operational envelope
    cht = float(data.get('cht', 380.0))
    egt = float(data.get('egt', 1580.0))
    cht_score = 100.0 if cht <= 410.0 else max(0.0, 100.0 - (cht - 410.0) * 2.5)
    # EGT nominal <= 1620°F, critical redline > 1660°F
    egt_score = 100.0 if egt <= 1620.0 else max(0.0, 100.0 - (egt - 1620.0) * 2.0)
    raw_thermal = (cht_score * 0.55 + egt_score * 0.45)

    # Lubrication subsystem — oil pressure nominal 50–65 PSI (65% weight)
    oil_p = float(data.get('oil_pressure', 58.0))
    oil_t = float(data.get('oil_temp', 185.0))
    oil_p_score = 100.0 if oil_p >= 50.0 else max(0.0, (oil_p - 28.0) / 22.0 * 100.0)
    oil_t_score = 100.0 if oil_t <= 205.0 else max(0.0, 100.0 - (oil_t - 205.0) * 2.5)
    raw_lubrication = (oil_p_score * 0.65 + oil_t_score * 0.35)

    # Mechanical subsystem — vibration RMS nominal <= 1.0g, kurtosis nominal <= 3.6
    vib = float(data.get('vibration', 0.65))
    vib_kurt = float(data.get('vibration_kurtosis', 3.0))
    vib_score = 100.0 if vib <= 1.0 else max(0.0, 100.0 - (vib - 1.0) * 35.0)
    kurt_score = 100.0 if vib_kurt <= 3.6 else max(0.0, 100.0 - (vib_kurt - 3.6) * 30.0)
    raw_mechanical = (vib_score * 0.70 + kurt_score * 0.30)

    # Electrical subsystem — 10% weight, nominal 13.2–14.5 V
    batt_v = float(data.get('battery_v', 13.8))
    raw_elec = 100.0 if 13.2 <= batt_v <= 14.5 else max(0.0, 100.0 - abs(batt_v - 13.8) * 30.0)

    # Anomaly score contribution — normalized across [-0.15, +0.15]
    anomaly_norm = min(100.0, max(0.0, (anomaly_score + 0.15) / 0.30 * 100.0))

    # Aerospace composite health index — weighted across physical subsystems
    raw_composite = (
        raw_thermal     * 0.30 +
        raw_lubrication * 0.25 +
        raw_mechanical  * 0.25 +
        raw_elec        * 0.10 +
        anomaly_norm    * 0.10
    )

    # Graceful near-end-of-life endurance derating only when remaining life falls below 30 cycles
    if 0 < predicted_rul < 30.0:
        endurance_penalty = (30.0 - predicted_rul) * 0.5
        raw_composite -= endurance_penalty

    # Active critical faults apply hard operational safety deductions
    critical_faults = {"OVERHEATING", "LOW_OIL_PRESSURE", "MISFIRE_SUSPECT"}
    for f in fault_names:
        if f in critical_faults:
            raw_composite -= 20.0
        else:
            raw_composite -= 8.0

    raw_composite = max(0.0, min(100.0, raw_composite))

    # EWMA smoothing — alpha=0.20 means each new reading has 20% influence
    alpha = 0.20
    smooth_composite = (alpha * raw_composite) + ((1.0 - alpha) * _last_health_state["composite"])
    smooth_thermal   = (alpha * raw_thermal)   + ((1.0 - alpha) * _last_health_state["thermal"])
    smooth_lub       = (alpha * raw_lubrication) + ((1.0 - alpha) * _last_health_state["lubrication"])
    smooth_mech      = (alpha * raw_mechanical)  + ((1.0 - alpha) * _last_health_state["mechanical"])
    smooth_elec      = (alpha * raw_elec)        + ((1.0 - alpha) * _last_health_state["electrical"])

    _last_health_state = {
        "composite": smooth_composite,
        "thermal": smooth_thermal,
        "lubrication": smooth_lub,
        "mechanical": smooth_mech,
        "electrical": smooth_elec,
    }

    # walk the band thresholds from high to low
    condition = "CRITICAL"
    for threshold, label in CONDITION_BANDS:
        if smooth_composite >= threshold:
            condition = label
            break

    # simple failure probability from health — note this is a rough estimate;
    # mission_risk.py does a more rigorous calculation downstream
    p_fail_raw = max(0.0, (100.0 - smooth_composite) / 100.0) ** 1.4
    p_fail_raw = min(0.98, p_fail_raw)

    # combustion quality sub-score — EGT balance proxy using fuel flow vs RPM
    egt = float(data.get('egt', 1580.0))
    fuel_flow = float(data.get('fuel_flow', 8.5))
    rpm = float(data.get('rpm', 1400.0))
    egt_comb_score = 100.0 if 1450 <= egt <= 1620 else max(0.0, 100.0 - abs(egt - 1535.0) * 0.5)
    ff_expected = (rpm / 1400.0) * 8.5
    ff_dev = abs(fuel_flow - ff_expected) / max(0.1, ff_expected)
    ff_score = max(0.0, 100.0 - ff_dev * 150.0)
    raw_combustion = egt_comb_score * 0.6 + ff_score * 0.4

    return {
        "health_index": round(smooth_composite, 1),
        "condition":    condition,
        "failure_probability": round(p_fail_raw, 3),
        "sub_scores": {
            "rul":         round(rul_score, 1),
            "thermal":     round(smooth_thermal, 1),
            "lubrication": round(smooth_lub, 1),
            "mechanical":  round(smooth_mech, 1),
            "electrical":  round(smooth_elec, 1),
            "combustion":  round(raw_combustion, 1),
            "anomaly":     round(anomaly_norm, 1),
        }
    }
