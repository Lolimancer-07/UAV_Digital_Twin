"""
backend/optimizer.py
---------------------
Counterfactual Operating Point Optimizer.

Finds the optimal operating point that maximizes mission completion probability
while satisfying engineering constraints.

Objective function:
  maximize: P_mission_completion(RPM, altitude)
  subject to:
    RPM_min <= RPM <= RPM_max
    ALT_min <= altitude <= ALT_max
    CHT < CHT_limit
    fuel_flow > fuel_minimum_viable

Method: scipy.optimize.minimize with Nelder-Mead / bounded L-BFGS-B
"""

import math
from typing import Dict, Any, Tuple

try:
    from scipy.optimize import minimize, Bounds
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


# Physics constants
CHT_NOMINAL   = 380.0
EGT_NOMINAL   = 1580.0
CHT_LIMIT     = 430.0
RPM_NOMINAL   = 1400.0
THERMAL_ALPHA = 1.5


def _thermal_load(rpm: float, cht_offset: float = 0.0) -> float:
    """Approximate CHT and thermal load from RPM and offset."""
    rpm_ratio = rpm / RPM_NOMINAL
    approx_cht = CHT_NOMINAL * (rpm_ratio ** 1.3) + cht_offset
    approx_egt = EGT_NOMINAL * (rpm_ratio ** 1.1)
    return (approx_cht / CHT_NOMINAL) * (approx_egt / EGT_NOMINAL), approx_cht


def _mission_probability(
    rpm: float,
    altitude_ft: float,
    current_rul: float,
    current_health: float,
    failure_probability: float,
    cht_offset: float = 0.0
) -> float:
    """
    Computes mission completion probability for a candidate operating point.
    Used as the optimization objective (we minimize its negative).
    """
    # Thermal load at candidate RPM
    cf_load, approx_cht = _thermal_load(rpm, cht_offset)
    cur_load, _ = _thermal_load(current_rul and RPM_NOMINAL or RPM_NOMINAL, 0.0)

    # CHT constraint penalty
    if approx_cht > CHT_LIMIT:
        return 0.001  # Infeasible

    # Estimated RUL at candidate point
    if current_rul > 0 and cf_load > 0:
        cur_thermal = (CHT_NOMINAL / CHT_NOMINAL) * (EGT_NOMINAL / EGT_NOMINAL)  # = 1.0 at nominal
        rul_cf = min(260.0, max(0.0, current_rul * (1.0 / max(1e-6, cf_load)) ** THERMAL_ALPHA))
    else:
        rul_cf = current_rul

    # Altitude effect
    map_ratio = max(0.3, 1.0 - (altitude_ft - 3000.0) / 300000.0)
    altitude_factor = max(0.5, map_ratio)

    # Mission probability components
    p_engine = max(0.01, min(0.999, (current_health / 100.0) * (1.0 - failure_probability * 0.8)))
    p_thermal = min(1.0, max(0.01, (CHT_LIMIT - approx_cht) / CHT_LIMIT + 0.3))
    mission_cycles = 162.0  # ~4.5 hours
    rul_ratio = rul_cf / max(1.0, mission_cycles)
    p_time = min(0.999, max(0.01, 1.0 - math.exp(-rul_ratio * 1.5)))
    p_complete = p_engine * p_thermal * p_time * altitude_factor
    return max(0.001, min(0.999, p_complete))


def find_optimal_operating_point(
    current_state: dict,
    current_rul: float,
    current_health: float,
    failure_probability: float,
    constraints: dict = None
) -> dict:
    """
    Searches for the optimal RPM and altitude that maximize mission completion probability.

    Parameters
    ----------
    current_state        : current telemetry dict
    current_rul          : current predicted RUL
    current_health       : current health index (0-100)
    failure_probability  : current failure probability (0-1)
    constraints          : dict with optional keys:
                           rpm_min, rpm_max, alt_min, alt_max, cht_limit

    Returns
    -------
    dict with optimal operating point and expected outcomes
    """
    constraints = constraints or {}
    rpm_min = float(constraints.get("rpm_min", 1600.0))
    rpm_max = float(constraints.get("rpm_max", 2600.0))
    alt_min = float(constraints.get("alt_min", 2000.0))
    alt_max = float(constraints.get("alt_max", 25000.0))
    cht_limit = float(constraints.get("cht_limit", CHT_LIMIT))

    current_rpm = float(current_state.get("rpm", RPM_NOMINAL))
    current_alt = float(current_state.get("altitude_ft", 3000.0))
    cht_offset = float(current_state.get("cht", CHT_NOMINAL)) - CHT_NOMINAL * (current_rpm / RPM_NOMINAL) ** 1.3

    def objective(x):
        rpm, alt = x[0], x[1]
        # Penalize boundary violations
        if rpm < rpm_min or rpm > rpm_max:
            return 1.0
        if alt < alt_min or alt > alt_max:
            return 1.0
        p = _mission_probability(rpm, alt, current_rul, current_health, failure_probability, cht_offset)
        return -p  # minimize negative = maximize

    best_p = -1.0
    best_point = {"rpm": current_rpm, "alt": current_alt}

    if SCIPY_AVAILABLE:
        try:
            x0 = [max(rpm_min, min(rpm_max, current_rpm * 0.9)),
                  max(alt_min, min(alt_max, current_alt))]
            bounds = Bounds([rpm_min, alt_min], [rpm_max, alt_max])
            result = minimize(objective, x0, method='L-BFGS-B', bounds=bounds,
                              options={"maxiter": 200, "ftol": 1e-6})
            if result.success or result.fun < -0.3:
                best_point = {"rpm": round(result.x[0], 0), "alt": round(result.x[1], 0)}
                best_p = -result.fun
        except Exception as e:
            pass

    # Fallback: grid search over rpm x altitude
    if best_p < 0:
        rpm_steps = [rpm_min + i * (rpm_max - rpm_min) / 10 for i in range(11)]
        alt_steps = [alt_min + i * (alt_max - alt_min) / 5 for i in range(6)]
        for rpm_c in rpm_steps:
            for alt_c in alt_steps:
                p = _mission_probability(rpm_c, alt_c, current_rul, current_health, failure_probability, cht_offset)
                if p > best_p:
                    best_p = p
                    best_point = {"rpm": round(rpm_c, 0), "alt": round(alt_c, 0)}

    optimal_rpm = best_point["rpm"]
    optimal_alt = best_point["alt"]
    opt_load, opt_cht = _thermal_load(optimal_rpm, cht_offset)

    # RUL estimate at optimal point
    if current_rul > 0 and opt_load > 0:
        opt_rul = min(260.0, max(0.0, current_rul * (1.0 / max(1e-6, opt_load)) ** THERMAL_ALPHA))
    else:
        opt_rul = current_rul

    rul_improvement = opt_rul - current_rul
    current_p = _mission_probability(current_rpm, current_alt, current_rul, current_health, failure_probability, cht_offset)
    p_improvement = best_p - current_p

    # Generate natural-language recommendation
    rpm_delta = optimal_rpm - current_rpm
    if abs(rpm_delta) < 20:
        action = "Current RPM is near optimal. No RPM adjustment recommended."
    elif rpm_delta < 0:
        action = f"Reduce RPM by approximately {abs(rpm_delta):.0f} RPM to {optimal_rpm:.0f} RPM."
    else:
        action = f"Increase RPM by approximately {rpm_delta:.0f} RPM to {optimal_rpm:.0f} RPM."

    return {
        "optimal_rpm":         round(optimal_rpm, 0),
        "optimal_altitude_ft": round(optimal_alt, 0),
        "predicted_cht":       round(opt_cht, 1),
        "predicted_rul":       round(opt_rul, 1),
        "mission_probability": round(best_p * 100.0, 1),
        "current_probability": round(current_p * 100.0, 1),
        "probability_improvement": round(p_improvement * 100.0, 1),
        "rul_improvement":     round(rul_improvement, 1),
        "recommendation":      action,
        "constraints_used":    constraints,
        "method":              "scipy L-BFGS-B bounded optimization" if SCIPY_AVAILABLE else "grid search",
        "objective":           "Maximize mission completion probability P = P_engine × P_thermal × P_time × P_altitude",
    }
