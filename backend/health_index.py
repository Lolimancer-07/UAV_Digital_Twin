"""
backend/health_index.py
------------------------
Engine Health Index (EHI) & Subsystem Health Breakdown.

Calculates:
  1. Overall Engine Health Index (0 - 100)
  2. Subsystem Indices:
     - Thermal Health (CHT/EGT dynamics, radiator cooling)
     - Lubrication Health (Oil pressure, temp, viscosity margin)
     - Mechanical Health (Vibration signatures, bearing wear)
     - Combustion Quality (Flame stability, timing, fuel air ratio)
     - Electrical Bus Health (Alternator voltage, current stability)
  3. Degradation velocity (rate of health decline per cycle)
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


# Stateful Exponential Moving Average (EMA) Filter
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
    Computes weighted multi-subsystem engine health indices with EWMA smoothing
    to reflect true physical and thermal inertia of aero propulsion systems.
    """
    global _last_health_state

    # ── 1. RUL-Based Life Remaining Component (40% weight) ───────────────────
    if predicted_rul > 0:
        rul_score = min(100.0, max(0.0, (predicted_rul / MAX_RUL) * 100.0))
    else:
        # Smooth initial estimate using current cycle
        cycle = float(data.get('cycle', 1))
        rul_score = max(50.0, 100.0 - (cycle / MAX_RUL) * 70.0)

    # ── 2. Thermal Subsystem (20% weight) ────────────────────────────────────
    cht = float(data.get('cht', 380.0))
    egt = float(data.get('egt', 1580.0))
    # CHT nominal < 395°F, critical > 430°F
    cht_score = 100.0 if cht <= 390 else max(0.0, 100.0 - (cht - 390.0) * 2.2)
    # EGT nominal < 1600°F, critical > 1660°F
    egt_score = 100.0 if egt <= 1585 else max(0.0, 100.0 - (egt - 1585.0) * 1.3)
    raw_thermal = (cht_score * 0.55 + egt_score * 0.45)

    # ── 3. Lubrication Subsystem (15% weight) ────────────────────────────────
    oil_p = float(data.get('oil_pressure', 58.0))
    oil_t = float(data.get('oil_temp', 185.0))
    oil_p_score = 100.0 if oil_p >= 50.0 else max(0.0, (oil_p - 30.0) / 20.0 * 100.0)
    oil_t_score = 100.0 if oil_t <= 195.0 else max(0.0, 100.0 - (oil_t - 195.0) * 2.2)
    raw_lubrication = (oil_p_score * 0.65 + oil_t_score * 0.35)

    # ── 4. Mechanical Subsystem (15% weight) ─────────────────────────────────
    vib = float(data.get('vibration', 0.65))
    vib_kurt = float(data.get('vibration_kurtosis', 3.0))
    vib_score = 100.0 if vib <= 0.90 else max(0.0, 100.0 - (vib - 0.90) * 45.0)
    kurt_score = 100.0 if vib_kurt <= 3.4 else max(0.0, 100.0 - (vib_kurt - 3.4) * 45.0)
    raw_mechanical = (vib_score * 0.70 + kurt_score * 0.30)

    # ── 5. Electrical Bus Subsystem (5% weight) ──────────────────────────────
    batt_v = float(data.get('battery_v', 13.8))
    raw_elec = 100.0 if 13.2 <= batt_v <= 14.5 else max(0.0, 100.0 - abs(batt_v - 13.8) * 35.0)

    # ── 6. ML Anomaly Confidence (5% weight) ─────────────────────────────────
    anomaly_norm = min(100.0, max(0.0, (anomaly_score + 0.20) / 0.35 * 100.0))

    # ── Weighted Composite Calculation ───────────────────────────────────────
    raw_composite = (
        rul_score       * 0.40 +
        raw_thermal     * 0.20 +
        raw_lubrication * 0.15 +
        raw_mechanical  * 0.15 +
        raw_elec        * 0.05 +
        anomaly_norm    * 0.05
    )

    # Direct penalty for active diagnosed faults
    critical_faults = {"OVERHEATING", "LOW_OIL_PRESSURE", "MISFIRE_SUSPECT"}
    for f in fault_names:
        if f in critical_faults:
            raw_composite -= 18.0
        else:
            raw_composite -= 6.0

    raw_composite = max(0.0, min(100.0, raw_composite))

    # ── Apply Exponential Moving Average (EMA, alpha = 0.20) ─────────────────
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

    # Determine condition string
    condition = "CRITICAL"
    for threshold, label in CONDITION_BANDS:
        if smooth_composite >= threshold:
            condition = label
            break

    # ── Failure Probability Estimate ────────────────────────────────────────
    # Derived from health index + anomaly score — not from LSTM directly
    # This feeds into mission_risk.py which has its own more detailed computation
    p_fail_raw = max(0.0, (100.0 - smooth_composite) / 100.0) ** 1.4
    p_fail_raw = min(0.98, p_fail_raw)

    # Combustion sub-score (EGT balance proxy)
    egt = float(data.get('egt', 1580.0))
    fuel_flow = float(data.get('fuel_flow', 8.5))
    rpm = float(data.get('rpm', 1400.0))
    # Combustion quality: EGT in normal band + fuel flow consistent with RPM
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
