"""
backend/whatif_engine.py

"What if I reduce RPM by 200?" — this module answers that question.

The operator picks a parameter to change, we propagate it through the
physics model to get consistent downstream values (e.g. RPM → CHT/EGT),
then estimate counterfactual RUL using thermal load ratio scaling.

Physics basis for the RUL estimate:
  RUL_cf = RUL_current × (thermal_load_current / thermal_load_cf)^α
  where α = 1.5 (empirical thermal cycling degradation exponent)
  and thermal_load = (CHT / CHT_nominal) × (EGT / EGT_nominal)

The result is a side-by-side comparison of current vs counterfactual state
so the operator can see exactly what they'd gain (or lose) from the change.
"""

import copy
from typing import Dict, Any

# thermal degradation exponent — higher = engine life more sensitive to temperature
THERMAL_ALPHA = 1.5
CHT_NOMINAL = 380.0
EGT_NOMINAL = 1580.0
OIL_P_NOMINAL = 58.0
MAX_RUL = 260.0


def _estimate_counterfactual_state(baseline: dict, overrides: dict) -> dict:
    """
    Applies operator overrides and propagates them through physics relationships
    to produce a physically consistent counterfactual telemetry state.
    """
    cf = copy.deepcopy(baseline)

    # apply the operator's direct overrides first
    for k, v in overrides.items():
        cf[k] = float(v)

    rpm = cf.get("rpm", 1400.0)
    baseline_rpm = baseline.get("rpm", 1400.0)

    # RPM change drives thermal and fuel changes — these are real physical relationships
    if "rpm" in overrides:
        rpm_ratio = rpm / max(200.0, baseline_rpm)
        # CHT scales with brake power which goes roughly as RPM^1.3
        cht_scale = rpm_ratio ** 1.3
        egt_scale = rpm_ratio ** 1.1
        cf["cht"] = baseline.get("cht", CHT_NOMINAL) * cht_scale
        cf["egt"] = baseline.get("egt", EGT_NOMINAL) * egt_scale
        cf["fuel_flow"] = baseline.get("fuel_flow", 8.5) * rpm_ratio ** 1.1
        cf["vibration"] = baseline.get("vibration", 0.65) * rpm_ratio ** 0.8
        # scale per-cylinder temps consistently
        cht_cyls = baseline.get("cht_cyl", [cf["cht"]] * 4)
        cf["cht_cyl"] = [c * cht_scale for c in cht_cyls]
        egt_cyls = baseline.get("egt_cyl", [cf["egt"]] * 4)
        cf["egt_cyl"] = [c * egt_scale for c in egt_cyls]

    # altitude change affects MAP and EGT (leaner at altitude = hotter EGT)
    if "altitude_ft" in overrides:
        alt = cf["altitude_ft"]
        # ISA: MAP drops roughly 1% per 300 ft
        map_ratio = max(0.3, 1.0 - (alt - 3000.0) / 300000.0)
        cf["map_kpa"] = 96.0 * map_ratio
        # EGT rises at altitude because the mixture leans out
        alt_egt_factor = 1.0 + max(0.0, (alt - 10000.0)) / 50000.0
        cf["egt"] = cf.get("egt", EGT_NOMINAL) * alt_egt_factor
        cf["oat_c"] = max(-30.0, 15.0 - (alt - 3000.0) * 0.00198)

    # oil pressure percentage change (positive = more pressure)
    if "oil_pressure_pct" in overrides:
        pct = float(overrides["oil_pressure_pct"]) / 100.0
        cf["oil_pressure"] = baseline.get("oil_pressure", 58.0) * (1.0 + pct)

    # cooling efficiency reduction causes CHT to rise
    if "cooling_efficiency_pct" in overrides:
        pct = float(overrides["cooling_efficiency_pct"]) / 100.0  # negative = degraded
        thermal_penalty = 1.0 - pct * 0.5
        cf["cht"] = cf.get("cht", CHT_NOMINAL) * thermal_penalty
        cf["oil_temp"] = cf.get("oil_temp", 185.0) * thermal_penalty

    # injector efficiency affects fuel flow and EGT (richer/leaner mixture)
    if "injector_efficiency_pct" in overrides:
        pct = float(overrides["injector_efficiency_pct"]) / 100.0
        cf["fuel_flow"] = cf.get("fuel_flow", 8.5) * (1.0 + pct)
        cf["egt"] = cf.get("egt", EGT_NOMINAL) * (1.0 - pct * 0.3)

    # ambient temperature change — hot day = higher CHT and oil temp
    if "ambient_temp_c" in overrides:
        delta_t = cf["ambient_temp_c"] - baseline.get("oat_c", 15.0)
        cf["cht"] = cf.get("cht", CHT_NOMINAL) + delta_t * 0.8
        cf["oil_temp"] = cf.get("oil_temp", 185.0) + delta_t * 0.5

    # clamp everything to physical limits before returning
    cf["rpm"] = max(0.0, min(3200.0, cf.get("rpm", rpm)))
    cf["cht"] = max(50.0, min(600.0, cf.get("cht", CHT_NOMINAL)))
    cf["egt"] = max(200.0, min(2000.0, cf.get("egt", EGT_NOMINAL)))
    cf["oil_pressure"] = max(0.0, min(120.0, cf.get("oil_pressure", OIL_P_NOMINAL)))
    cf["fuel_flow"] = max(0.0, min(25.0, cf.get("fuel_flow", 8.5)))
    cf["vibration"] = max(0.0, min(15.0, cf.get("vibration", 0.65)))

    return cf


def simulate_whatif(
    current_state: dict,
    overrides: dict,
    current_rul: float,
    current_health: float,
    physics_model,
    health_fn,
    anomaly_score: float = 0.0,
    fault_names: list = None
) -> dict:
    """
    Runs a counterfactual simulation and returns a side-by-side comparison.

    Parameters
    ----------
    current_state  : current telemetry dict (baseline)
    overrides      : what the operator wants to change, e.g. {"rpm": 1200}
    current_rul    : current AI-predicted RUL in cycles
    current_health : current health index (0–100)
    physics_model  : AeroEnginePhysicsModel instance
    health_fn      : compute_health_index function
    anomaly_score  : current anomaly score (kept constant in simulation)
    fault_names    : current active fault names (kept constant in simulation)
    """
    fault_names = fault_names or []

    # build the counterfactual state with consistent physics
    cf_state = _estimate_counterfactual_state(current_state, overrides)

    # run physics on it to get performance metrics
    cf_physics = physics_model.evaluate_performance(cf_state)

    # estimate counterfactual RUL from the thermal load ratio
    # lower thermal load → longer life (and vice versa)
    cf_cht = cf_state.get("cht", CHT_NOMINAL)
    cf_egt = cf_state.get("egt", EGT_NOMINAL)
    cur_cht = current_state.get("cht", CHT_NOMINAL)
    cur_egt = current_state.get("egt", EGT_NOMINAL)

    cur_thermal_load = (cur_cht / CHT_NOMINAL) * (cur_egt / EGT_NOMINAL)
    cf_thermal_load = (cf_cht / CHT_NOMINAL) * (cf_egt / EGT_NOMINAL)

    if current_rul > 0 and cf_thermal_load > 0 and cur_thermal_load > 0:
        thermal_ratio = cur_thermal_load / cf_thermal_load
        cf_rul = min(MAX_RUL, max(0.0, current_rul * (thermal_ratio ** THERMAL_ALPHA)))
    else:
        cf_rul = current_rul

    rul_delta = cf_rul - current_rul

    # compute health index under counterfactual conditions
    cf_health_result = health_fn(cf_state, cf_rul, anomaly_score, fault_names)
    cf_health = cf_health_result["health_index"]
    health_delta = cf_health - current_health

    # fuel change as a percentage
    cf_fuel = cf_state.get("fuel_flow", current_state.get("fuel_flow", 8.5))
    cur_fuel = current_state.get("fuel_flow", 8.5)
    fuel_pct_change = ((cf_fuel - cur_fuel) / max(0.1, cur_fuel)) * 100.0

    # label the overall outcome
    if rul_delta > 0:
        outcome = "IMPROVEMENT"
        outcome_color = "ok"
    elif rul_delta < -5:
        outcome = "DEGRADATION"
        outcome_color = "crit"
    else:
        outcome = "NEUTRAL"
        outcome_color = "warn"

    return {
        "current": {
            "rpm":          round(current_state.get("rpm", 0), 1),
            "cht":          round(current_state.get("cht", 0), 1),
            "egt":          round(current_state.get("egt", 0), 1),
            "oil_pressure": round(current_state.get("oil_pressure", 0), 1),
            "vibration":    round(current_state.get("vibration", 0), 3),
            "fuel_flow":    round(current_state.get("fuel_flow", 0), 2),
            "health":       round(current_health, 1),
            "rul":          round(current_rul, 1),
            "thermal_load": round(cur_thermal_load, 3),
        },
        "counterfactual": {
            "rpm":          round(cf_state.get("rpm", 0), 1),
            "cht":          round(cf_cht, 1),
            "egt":          round(cf_egt, 1),
            "oil_pressure": round(cf_state.get("oil_pressure", 0), 1),
            "vibration":    round(cf_state.get("vibration", 0), 3),
            "fuel_flow":    round(cf_fuel, 2),
            "health":       round(cf_health, 1),
            "rul":          round(cf_rul, 1),
            "thermal_load": round(cf_thermal_load, 3),
            "brake_power_hp": cf_physics.get("brake_power_hp", 0),
            "bsfc_g_kwh":   cf_physics.get("bsfc_g_kwh", 0),
        },
        "delta": {
            "rul":          round(rul_delta, 1),
            "health":       round(health_delta, 1),
            "cht":          round(cf_cht - cur_cht, 1),
            "egt":          round(cf_egt - cur_egt, 1),
            "fuel_pct":     round(fuel_pct_change, 1),
        },
        "overrides":        overrides,
        "outcome":          outcome,
        "outcome_color":    outcome_color,
        "thermal_alpha":    THERMAL_ALPHA,
        "method":           "Physics-informed thermal load ratio scaling (α=1.5)",
    }
