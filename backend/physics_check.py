"""
backend/physics_check.py

Quick thermodynamic sanity check for the engine — validates sensor readings
against first-principles constraints.

Based on:
  - Otto cycle efficiency: η = 1 − 1/r^(γ−1)
  - EGT/CHT thermal ratio for healthy combustion: 2.2–2.85
    (outside this → rich mixture or pre-ignition)
  - Fuel flow consistency with RPM
    (too lean or too rich for the current power setting)
  - Lubrication sufficiency at current RPM
  - Vibration structural limits
"""
import math
from typing import Dict, List, Optional

# engine constants — typical MALE UAV piston engine
COMPRESSION_RATIO   = 8.5
GAMMA               = 1.35       # specific heat ratio for combustion gases
THERMAL_RATIO_RANGE = (2.20, 2.85)   # healthy EGT/CHT range

# expected fuel flow at the reference RPM, ±22% tolerance
FUEL_FLOW_SLOPE = 8.5
FUEL_FLOW_TOL   = 0.22


def otto_efficiency(r: float = COMPRESSION_RATIO,
                    gamma: float = GAMMA) -> float:
    """Theoretical Otto cycle thermal efficiency."""
    return 1.0 - (1.0 / (r ** (gamma - 1.0)))


def check_thermodynamics(data: dict) -> dict:
    """
    Validates live sensor readings against thermodynamic constraints.

    Parameters
    ----------
    data : live telemetry dict

    Returns
    -------
    dict with:
        violations       — list of violation dicts (empty if all good)
        otto_efficiency  — theoretical efficiency (%)
        thermal_ratio    — EGT / CHT (None if CHT ≈ 0)
        thermal_status   — 'NORMAL' | 'LEAN' | 'RICH' | 'UNKNOWN'
    """
    rpm        = data.get('rpm',        0.0)
    cht        = data.get('cht',        0.0)
    egt        = data.get('egt',        0.0)
    fuel_flow  = data.get('fuel_flow',  0.0)
    oil        = data.get('oil_pressure', 65.0)
    vib        = data.get('vibration',  0.0)

    violations: List[dict] = []
    thermal_ratio: Optional[float] = None
    thermal_status = "UNKNOWN"

    # check 1: EGT/CHT ratio — combustion quality indicator
    if cht > 150:
        thermal_ratio  = egt / cht
        lo, hi         = THERMAL_RATIO_RANGE

        if thermal_ratio < lo:
            thermal_status = "RICH"
            violations.append({
                "check":    "THERMAL_RATIO",
                "severity": "WARNING",
                "detail":   (f"EGT/CHT = {thermal_ratio:.2f} (expected ≥ {lo}) "
                             f"— rich mixture or misfire suspected"),
                "value":    round(thermal_ratio, 3),
            })
        elif thermal_ratio > hi:
            thermal_status = "LEAN"
            violations.append({
                "check":    "THERMAL_RATIO",
                "severity": "WARNING",
                "detail":   (f"EGT/CHT = {thermal_ratio:.2f} (expected ≤ {hi}) "
                             f"— lean mixture or pre-ignition suspected"),
                "value":    round(thermal_ratio, 3),
            })
        else:
            thermal_status = "NORMAL"

    # check 2: fuel flow should scale with RPM — big deviation = injector or fuel issue
    if rpm > 500 and fuel_flow > 0:
        expected_ff = (rpm / 1400.0) * FUEL_FLOW_SLOPE
        deviation   = abs(fuel_flow - expected_ff) / expected_ff
        if deviation > FUEL_FLOW_TOL:
            violations.append({
                "check":    "FUEL_FLOW",
                "severity": "WARNING",
                "detail":   (f"Fuel flow {fuel_flow:.2f} L/hr deviates {deviation*100:.0f}% "
                             f"from expected {expected_ff:.2f} L/hr at {rpm:.0f} RPM"),
                "value":    round(deviation * 100, 1),
            })

    # check 3: CHT hard limit — structural failure risk above 450°F
    if cht > 450:
        violations.append({
            "check":    "CHT_LIMIT",
            "severity": "CRITICAL",
            "detail":   f"CHT {cht:.1f}°F exceeds max structural limit (450°F)",
            "value":    round(cht, 1),
        })

    # check 4: oil pressure must be adequate for the current RPM
    if rpm > 1000:
        min_oil = 35.0 + (rpm / 1400.0) * 10.0   # higher RPM needs more pressure
        if oil < min_oil:
            violations.append({
                "check":    "OIL_RPM",
                "severity": "WARNING",
                "detail":   (f"Oil pressure {oil:.1f} PSI insufficient for "
                             f"{rpm:.0f} RPM (min required {min_oil:.1f} PSI)"),
                "value":    round(oil, 1),
            })

    # check 5: vibration above 3g risks structural resonance in the airframe
    if vib > 3.0:
        violations.append({
            "check":    "VIBRATION_RESONANCE",
            "severity": "CRITICAL",
            "detail":   f"Vibration {vib:.2f}g exceeds structural resonance threshold (3.0g)",
            "value":    round(vib, 3),
        })

    return {
        "violations":      violations,
        "otto_efficiency": round(otto_efficiency() * 100, 2),
        "thermal_ratio":   round(thermal_ratio, 3) if thermal_ratio else None,
        "thermal_status":  thermal_status,
    }
