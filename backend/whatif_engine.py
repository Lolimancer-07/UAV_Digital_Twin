"""
backend/whatif_engine.py
--------------------------
Counterfactual What-If Simulation Engine.

Allows the operator to ask: "What happens if I change RPM / altitude / etc.?"

Method:
  1. Takes current telemetry state as baseline
  2. Applies the operator's hypothetical parameter overrides
  3. Propagates overrides through the existing physics model
  4. Estimates counterfactual RUL using thermal load ratio scaling
  5. Computes counterfactual health index and mission risk
  6. Returns side-by-side comparison with actual state

Mathematical basis for RUL counterfactual:
  RUL_cf = RUL_current * (thermal_load_current / thermal_load_cf)^alpha
  where alpha = 1.5 (empirical degradation exponent for thermal cycling)
  and thermal_load = (CHT / CHT_nominal) * (EGT / EGT_nominal)
"""

import copy
from typing import Dict, Any

# Thermal degradation exponent (higher = more sensitive to thermal load)
THERMAL_ALPHA = 1.5
CHT_NOMINAL = 380.0
EGT_NOMINAL = 1580.0
OIL_P_NOMINAL = 58.0
MAX_RUL = 260.0


def _estimate_counterfactual_state(baseline: dict, overrides: dict) -> dict:
    """
    Applies parameter overrides to the baseline telemetry to create
    a physically consistent counterfactual state.
    """
    cf = copy.deepcopy(baseline)

    # Apply direct overrides
    for k, v in overrides.items():
        cf[k] = float(v)

    rpm = cf.get("rpm", 1400.0)
    baseline_rpm = baseline.get("rpm", 1400.0)

    # RPM change → CHT/EGT/fuel proportional physics response
    if "rpm" in overrides:
        rpm_ratio = rpm / max(200.0, baseline_rpm)
        # Thermal response: CHT scales with brake power ∝ RPM^1.3
        cht_scale = rpm_ratio ** 1.3
        egt_scale = rpm_ratio ** 1.1
        cf["cht"] = baseline.get("cht", CHT_NOMINAL) * cht_scale
        cf["egt"] = baseline.get("egt", EGT_NOMINAL) * egt_scale
        cf["fuel_flow"] = baseline.get("fuel_flow", 8.5) * rpm_ratio ** 1.1
        cf["vibration"] = baseline.get("vibration", 0.65) * rpm_ratio ** 0.8
        # CHT cylinders
        cht_cyls = baseline.get("cht_cyl", [cf["cht"]] * 4)
        cf["cht_cyl"] = [c * cht_scale for c in cht_cyls]
        egt_cyls = baseline.get("egt_cyl", [cf["egt"]] * 4)
        cf["egt_cyl"] = [c * egt_scale for c in egt_cyls]

    # Altitude change → MAP and EGT changes
    if "altitude_ft" in overrides:
        alt = cf["altitude_ft"]
        # ISA: MAP decreases ~1% per 300ft
        map_ratio = max(0.3, 1.0 - (alt - 3000.0) / 300000.0)
        cf["map_kpa"] = 96.0 * map_ratio
        # EGT rises at altitude (lean mixture)
        alt_egt_factor = 1.0 + max(0.0, (alt - 10000.0)) / 50000.0
        cf["egt"] = cf.get("egt", EGT_NOMINAL) * alt_egt_factor
        # Oil temp changes with altitude OAT
        cf["oat_c"] = max(-30.0, 15.0 - (alt - 3000.0) * 0.00198)

    # Oil pressure % reduction
    if "oil_pressure_pct" in overrides:
        pct = float(overrides["oil_pressure_pct"]) / 100.0
        cf["oil_pressure"] = baseline.get("oil_pressure", 58.0) * (1.0 + pct)

    # Cooling efficiency reduction → CHT increase
    if "cooling_efficiency_pct" in overrides:
        pct = float(overrides["cooling_efficiency_pct"]) / 100.0  # negative = degraded
        thermal_penalty = 1.0 - pct * 0.5
        cf["cht"] = cf.get("cht", CHT_NOMINAL) * thermal_penalty
        cf["oil_temp"] = cf.get("oil_temp", 185.0) * thermal_penalty

    # Injector efficiency → fuel flow
    if "injector_efficiency_pct" in overrides:
        pct = float(overrides["injector_efficiency_pct"]) / 100.0
        cf["fuel_flow"] = cf.get("fuel_flow", 8.5) * (1.0 + pct)
        cf["egt"] = cf.get("egt", EGT_NOMINAL) * (1.0 - pct * 0.3)

    # Ambient temperature
    if "ambient_temp_c" in overrides:
        delta_t = cf["ambient_temp_c"] - baseline.get("oat_c", 15.0)
        cf["cht"] = cf.get("cht", CHT_NOMINAL) + delta_t * 0.8
        cf["oil_temp"] = cf.get("oil_temp", 185.0) + delta_t * 0.5

    # Clamp all values to physical limits
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
    Runs a counterfactual simulation given parameter overrides.

    Parameters
    ----------
    current_state  : current telemetry dict
    overrides      : parameter overrides dict (e.g. {"rpm": 2200})
    current_rul    : current AI-predicted RUL
    current_health : current health index
    physics_model  : AeroEnginePhysicsModel instance
    health_fn      : compute_health_index function
    anomaly_score  : current anomaly score
    fault_names    : current active fault names

    Returns
    -------
    dict with current and counterfactual state comparison
    """
    fault_names = fault_names or []

    # Build counterfactual state
    cf_state = _estimate_counterfactual_state(current_state, overrides)

    # Run physics on counterfactual
    cf_physics = physics_model.evaluate_performance(cf_state)

    # Estimate counterfactual RUL using thermal load ratio
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

    # Compute counterfactual health
    cf_health_result = health_fn(cf_state, cf_rul, anomaly_score, fault_names)
    cf_health = cf_health_result["health_index"]
    health_delta = cf_health - current_health

    # Compute fuel consumption change
    cf_fuel = cf_state.get("fuel_flow", current_state.get("fuel_flow", 8.5))
    cur_fuel = current_state.get("fuel_flow", 8.5)
    fuel_pct_change = ((cf_fuel - cur_fuel) / max(0.1, cur_fuel)) * 100.0

    # Summary label
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
