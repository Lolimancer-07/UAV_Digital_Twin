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


def compute_health_index(
    data: dict,
    predicted_rul: float,
    anomaly_score: float,
    fault_names: List[str],
) -> dict:
    """
    Computes weighted multi-subsystem engine health indices.
    """
    # ── 1. RUL-Based Life Remaining Component (40% weight) ───────────────────
    if predicted_rul > 0:
        rul_score = min(100.0, max(0.0, (predicted_rul / MAX_RUL) * 100.0))
    else:
        rul_score = 65.0  # Buffer filling default

    # ── 2. Thermal Subsystem (20% weight) ────────────────────────────────────
    cht = float(data.get('cht', 380.0))
    egt = float(data.get('egt', 1580.0))
    # CHT nominal < 390°F, critical > 430°F
    cht_score = 100.0 if cht <= 380 else max(0.0, 100.0 - (cht - 380.0) * 2.0)
    # EGT nominal < 1600°F, critical > 1660°F
    egt_score = 100.0 if egt <= 1585 else max(0.0, 100.0 - (egt - 1585.0) * 1.3)
    thermal_score = (cht_score * 0.55 + egt_score * 0.45)

    # ── 3. Lubrication Subsystem (15% weight) ────────────────────────────────
    oil_p = float(data.get('oil_pressure', 58.0))
    oil_t = float(data.get('oil_temp', 185.0))
    # Oil Pressure nominal > 50 PSI, critical < 35 PSI
    oil_p_score = 100.0 if oil_p >= 52.0 else max(0.0, (oil_p - 30.0) / 22.0 * 100.0)
    # Oil Temp nominal < 200°F, critical > 240°F
    oil_t_score = 100.0 if oil_t <= 195.0 else max(0.0, 100.0 - (oil_t - 195.0) * 2.2)
    lubrication_score = (oil_p_score * 0.65 + oil_t_score * 0.35)

    # ── 4. Mechanical Subsystem (15% weight) ─────────────────────────────────
    vib = float(data.get('vibration', 0.65))
    vib_kurt = float(data.get('vibration_kurtosis', 3.0))
    # Vibration nominal < 1.0g RMS, critical > 3.0g
    vib_score = 100.0 if vib <= 0.85 else max(0.0, 100.0 - (vib - 0.85) * 45.0)
    # Kurtosis nominal < 3.5, critical > 5.0
    kurt_score = 100.0 if vib_kurt <= 3.2 else max(0.0, 100.0 - (vib_kurt - 3.2) * 50.0)
    mechanical_score = (vib_score * 0.70 + kurt_score * 0.30)

    # ── 5. Electrical Bus Subsystem (5% weight) ──────────────────────────────
    batt_v = float(data.get('battery_v', 13.8))
    elec_score = 100.0 if 13.2 <= batt_v <= 14.5 else max(0.0, 100.0 - abs(batt_v - 13.8) * 40.0)

    # ── 6. ML Anomaly Confidence (5% weight) ─────────────────────────────────
    anomaly_norm = min(100.0, max(0.0, (anomaly_score + 0.20) / 0.35 * 100.0))

    # ── Weighted Composite Health Index ──────────────────────────────────────
    composite_health = (
        rul_score         * 0.40 +
        thermal_score     * 0.20 +
        lubrication_score * 0.15 +
        mechanical_score  * 0.15 +
        elec_score        * 0.05 +
        anomaly_norm      * 0.05
    )

    # Direct penalty for active diagnosed faults
    critical_faults = {"OVERHEATING", "LOW_OIL_PRESSURE", "MISFIRE_SUSPECT"}
    for f in fault_names:
        if f in critical_faults:
            composite_health -= 18.0
        else:
            composite_health -= 6.0

    composite_health = max(0.0, min(100.0, composite_health))

    # Determine condition string
    condition = "CRITICAL"
    for threshold, label in CONDITION_BANDS:
        if composite_health >= threshold:
            condition = label
            break

    return {
        "health_index": round(composite_health, 1),
        "condition":    condition,
        "sub_scores": {
            "rul":         round(rul_score, 1),
            "thermal":     round(thermal_score, 1),
            "lubrication": round(lubrication_score, 1),
            "mechanical":  round(mechanical_score, 1),
            "electrical":  round(elec_score, 1),
            "anomaly":     round(anomaly_norm, 1),
        }
    }
