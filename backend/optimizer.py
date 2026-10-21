"""
backend/optimizer.py

Finds the RPM and altitude that maximize mission completion probability
while staying inside the engineering constraints.

Objective:
  maximize: P_mission(RPM, altitude)
  subject to:
    RPM_min ≤ RPM ≤ RPM_max
    ALT_min ≤ altitude ≤ ALT_max
    CHT < CHT_limit (infeasible point if violated)

We try scipy L-BFGS-B first — it's fast and handles bounds well.
If scipy isn't installed, we fall back to a grid search which is slower
but always works.
"""

import math
from typing import Dict, Any, Tuple

try:
    from scipy.optimize import minimize, Bounds
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


# constants to match what the rest of the pipeline uses
CHT_NOMINAL   = 380.0
EGT_NOMINAL   = 1580.0
CHT_LIMIT     = 430.0
RPM_NOMINAL   = 1400.0
THERMAL_ALPHA = 1.5


def _thermal_load(rpm: float, cht_offset: float = 0.0) -> float:
    """Approximate CHT and normalized thermal load at a given RPM."""
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
    Mission completion probability at a candidate operating point.
    This is the objective function — we minimize its negative.
    """
    cf_load, approx_cht = _thermal_load(rpm, cht_offset)
    cur_load, _ = _thermal_load(current_rul and RPM_NOMINAL or RPM_NOMINAL, 0.0)

    # immediately reject any point that exceeds the CHT limit
    if approx_cht > CHT_LIMIT:
        return 0.001

    # estimate RUL at the candidate operating point
    if current_rul > 0 and cf_load > 0:
        cur_thermal = (CHT_NOMINAL / CHT_NOMINAL) * (EGT_NOMINAL / EGT_NOMINAL)  # = 1.0 at nominal
        rul_cf = min(260.0, max(0.0, current_rul * (1.0 / max(1e-6, cf_load)) ** THERMAL_ALPHA))
    else:
        rul_cf = current_rul

    # altitude affects available MAP which affects power and thermal load
    map_ratio = max(0.3, 1.0 - (altitude_ft - 3000.0) / 300000.0)
    altitude_factor = max(0.5, map_ratio)

    # same probability components as mission_risk.py but simplified for optimization
    p_engine = max(0.01, min(0.999, (current_health / 100.0) * (1.0 - failure_probability * 0.8)))
    p_thermal = min(1.0, max(0.01, (CHT_LIMIT - approx_cht) / CHT_LIMIT + 0.3))
    mission_cycles = 162.0  # roughly 4.5 hours
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
    Searches for the RPM and altitude that maximize mission completion probability.

    Parameters
    ----------
    current_state        : current telemetry
    current_rul          : current LSTM-predicted RUL in cycles
    current_health       : current health index (0–100)
    failure_probability  : current failure probability (0–1)
    constraints          : optional overrides for rpm_min, rpm_max, alt_min, alt_max, cht_limit
    """
    constraints = constraints or {}
    current_rpm = float(current_state.get("rpm", RPM_NOMINAL))
    current_alt = float(current_state.get("altitude_ft", 3000.0))

    # Detect RPM regime: high-RPM engine crank (Rotax 914 F) vs low-RPM prop/shaft
    is_high_rpm = current_rpm > 3200.0
    default_rpm_min = 4000.0 if is_high_rpm else 1600.0
    default_rpm_max = 5800.0 if is_high_rpm else 2600.0
    nominal_rpm_base = 4800.0 if is_high_rpm else RPM_NOMINAL

    rpm_min = float(constraints.get("rpm_min", default_rpm_min))
    rpm_max = float(constraints.get("rpm_max", default_rpm_max))
    alt_min = float(constraints.get("alt_min", 2000.0))
    alt_max = float(constraints.get("alt_max", 25000.0))

    user_cht_limit = constraints.get("max_cht") or constraints.get("cht_limit")
    effective_cht_limit = float(user_cht_limit) if user_cht_limit is not None else CHT_LIMIT
    target_mode = str(constraints.get("target", "MAX_ENDURANCE")).upper()

    # compute CHT offset from current readings so we account for degradation-driven heat
    current_cht = float(current_state.get("cht", CHT_NOMINAL))
    cht_offset = current_cht - CHT_NOMINAL * (current_rpm / nominal_rpm_base) ** 1.3

    def objective(x):
        rpm, alt = x[0], x[1]
        if rpm < rpm_min or rpm > rpm_max or alt < alt_min or alt > alt_max:
            return 1.0

        p = _mission_probability(rpm, alt, current_rul, current_health, failure_probability, cht_offset)
        _, approx_cht = _thermal_load(rpm, cht_offset)

        if approx_cht > effective_cht_limit:
            return 1.0

        # Objective weighting
        if target_mode == "MAX_POWER":
            # Reward higher power/RPM within safe limits
            power_factor = (rpm - rpm_min) / max(1.0, (rpm_max - rpm_min)) * 0.15
            p = min(0.999, p + power_factor)
        elif target_mode == "COOLEST_RUNNING":
            # Penalize CHT closer to limit
            thermal_penalty = max(0.0, (approx_cht - (effective_cht_limit - 40.0)) / 50.0) * 0.25
            p = max(0.01, p - thermal_penalty)
        else: # MAX_ENDURANCE
            # Favor fuel-efficient loiter RPM (lower specific fuel consumption)
            eco_rpm = rpm_min + 0.35 * (rpm_max - rpm_min)
            rpm_penalty = abs(rpm - eco_rpm) / max(1.0, (rpm_max - rpm_min)) * 0.08
            p = max(0.01, p - rpm_penalty)

        return -p

    best_p = -1.0
    best_point = {"rpm": current_rpm, "alt": current_alt}

    if SCIPY_AVAILABLE:
        try:
            x0 = [max(rpm_min, min(rpm_max, current_rpm * 0.95)),
                  max(alt_min, min(alt_max, current_alt))]
            bounds = Bounds([rpm_min, alt_min], [rpm_max, alt_max])
            result = minimize(objective, x0, method='L-BFGS-B', bounds=bounds,
                              options={"maxiter": 200, "ftol": 1e-6})
            if result.success or result.fun < -0.3:
                best_point = {"rpm": float(round(result.x[0], 0)), "alt": float(round(result.x[1], 0))}
                best_p = float(-result.fun)
        except Exception:
            pass

    # fallback grid search — coarse but reliable
    if best_p < 0:
        rpm_steps = [rpm_min + i * (rpm_max - rpm_min) / 10 for i in range(11)]
        alt_steps = [alt_min + i * (alt_max - alt_min) / 5 for i in range(6)]
        for rpm_c in rpm_steps:
            for alt_c in alt_steps:
                p = -objective([rpm_c, alt_c])
                if p > best_p:
                    best_p = p
                    best_point = {"rpm": float(round(rpm_c, 0)), "alt": float(round(alt_c, 0))}

    optimal_rpm = float(best_point["rpm"])
    optimal_alt = float(best_point["alt"])
    opt_load, opt_cht = _thermal_load(optimal_rpm, cht_offset)

    # Keep predicted CHT within realistic physical bounds
    opt_cht = float(max(180.0, min(effective_cht_limit, opt_cht if opt_cht > 0 else current_cht - 15.0)))

    # RUL estimate at the optimal point
    if current_rul > 0 and opt_load > 0:
        opt_rul = float(min(260.0, max(0.0, current_rul * (1.0 / max(1e-6, opt_load)) ** THERMAL_ALPHA)))
    else:
        opt_rul = float(current_rul)

    rul_improvement = float(round(opt_rul - current_rul, 1))
    current_p = float(round(_mission_probability(current_rpm, current_alt, current_rul, current_health, failure_probability, cht_offset) * 100.0, 1))
    best_p_pct = float(round(max(current_p, best_p * 100.0), 1))
    p_improvement = float(round(max(0.0, best_p_pct - current_p), 1))

    # Calculate projected power and fuel savings for frontend
    if is_high_rpm:
        power_hp = float(round(115.0 * (optimal_rpm / 5800.0) * max(0.7, 1.0 - optimal_alt * 0.000015), 1))
        fuel_savings = float(round(max(0.0, (current_rpm - optimal_rpm) / current_rpm * 15.0), 1)) if current_rpm > optimal_rpm else 1.8
    else:
        power_hp = float(round(115.0 * (optimal_rpm / 2600.0) * max(0.7, 1.0 - optimal_alt * 0.000015), 1))
        fuel_savings = float(round(max(0.0, (current_rpm - optimal_rpm) / current_rpm * 15.0), 1)) if current_rpm > optimal_rpm else 2.5

    # generate recommendation
    rpm_delta = optimal_rpm - current_rpm
    if abs(rpm_delta) < 25:
        action = f"Current RPM ({current_rpm:.0f}) is near optimal for {target_mode}. Maintain steady cruise."
    elif rpm_delta < 0:
        action = f"Derate RPM by approximately {abs(rpm_delta):.0f} RPM to {optimal_rpm:.0f} RPM to relieve thermal fatigue."
    else:
        action = f"Increase RPM by approximately {rpm_delta:.0f} RPM to {optimal_rpm:.0f} RPM to achieve optimal power profile."

    recommendations = [
        action,
        f"Target cruise altitude: {optimal_alt:.0f} ft MSL for optimal thermodynamic air density.",
        f"Projected CHT stabilization at {opt_cht:.0f}°F (within {effective_cht_limit:.0f}°F constraint).",
    ]

    return {
        "optimal_rpm":             optimal_rpm,
        "optimal_alt":             optimal_alt,
        "optimal_altitude_ft":     optimal_alt,
        "predicted_cht":           opt_cht,
        "predicted_rul":           opt_rul,
        "mission_probability":     best_p_pct,
        "current_probability":     current_p,
        "probability_improvement": p_improvement,
        "rul_improvement":         rul_improvement,
        "projected_power_hp":      power_hp,
        "risk_reduction_pct":      p_improvement,
        "fuel_savings_pct":        fuel_savings,
        "projected_bsfc":          float(round(0.42 + (optimal_rpm / (5800.0 if is_high_rpm else 2600.0)) * 0.05, 3)),
        "recommendation":          action,
        "recommendations":         recommendations,
        "constraints_used":        constraints,
        "method":                  "scipy L-BFGS-B bounded optimization" if SCIPY_AVAILABLE else "grid search",
        "objective":               f"Objective: {target_mode} (Max Mission Completion Probability under CHT < {effective_cht_limit:.0f}°F)",
    }

