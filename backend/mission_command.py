"""
Mission Command Center planning layer.

This module is deliberately additive: it consumes the existing digital-twin
outputs and turns them into an operator-facing recovery plan.  It does not
issue flight-control commands.  All recovery actions are simulation-only until
an operator explicitly records an approval in the GCS audit trail.
"""

from __future__ import annotations

from collections import deque
from math import asin, cos, isfinite, radians, sin, sqrt
from typing import Any, Dict, Iterable, List, Optional


SIMULATED_ROUTE = [
    {"id": "HOME", "name": "Home Base", "latitude": 26.706, "longitude": 78.026},
    {"id": "ALPHA", "name": "Alpha Ridge", "latitude": 26.755, "longitude": 78.118},
    {"id": "BRAVO", "name": "Bravo Survey", "latitude": 26.812, "longitude": 78.208},
    {"id": "CHARLIE", "name": "Charlie Loiter", "latitude": 26.858, "longitude": 78.120},
    {"id": "HOME_RTL", "name": "Home Base (RTL)", "latitude": 26.706, "longitude": 78.026},
]

SIMULATED_RECOVERY_SITES = [
    {"id": "HOME", "name": "Home Base", "latitude": 26.706, "longitude": 78.026, "terrain": "paved strip"},
    {"id": "ECHO", "name": "Forward Site Echo", "latitude": 26.776, "longitude": 78.154, "terrain": "prepared strip"},
    {"id": "FOXTROT", "name": "Recovery Field Foxtrot", "latitude": 26.838, "longitude": 78.167, "terrain": "emergency strip"},
]


def _number(value: Any, default: float) -> float:
    """Return a finite float without letting malformed telemetry break GCS output."""
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if isfinite(result) else default


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _risk_color(risk_level: str) -> str:
    return {
        "LOW": "ok",
        "MODERATE": "warn",
        "HIGH": "warn",
        "CRITICAL": "crit",
    }.get(risk_level, "warn")


def _haversine_nm(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    """Great-circle distance in nautical miles for the simulated training map."""
    earth_radius_nm = 3440.065
    lat_delta = radians(lat_b - lat_a)
    lon_delta = radians(lon_b - lon_a)
    a = (
        sin(lat_delta / 2) ** 2
        + cos(radians(lat_a)) * cos(radians(lat_b)) * sin(lon_delta / 2) ** 2
    )
    return earth_radius_nm * 2 * asin(sqrt(a))


def _fallback_position(cycle: float) -> Dict[str, float]:
    """Keep the command view usable with older telemetry packets that lack GPS fields."""
    progress = (cycle % 320.0) / 320.0
    first = SIMULATED_ROUTE[0]
    last = SIMULATED_ROUTE[-2]
    return {
        "latitude": round(first["latitude"] + (last["latitude"] - first["latitude"]) * progress, 5),
        "longitude": round(first["longitude"] + (last["longitude"] - first["longitude"]) * progress, 5),
        "mission_progress_pct": round(progress * 100.0, 1),
        "heading_deg": 64.0,
        "ground_speed_kts": 58.0,
    }


def _current_position(data: Dict[str, Any]) -> Dict[str, float]:
    fallback = _fallback_position(_number(data.get("cycle"), 0.0))
    return {
        "latitude": round(_number(data.get("latitude"), fallback["latitude"]), 5),
        "longitude": round(_number(data.get("longitude"), fallback["longitude"]), 5),
        "mission_progress_pct": round(
            _clamp(_number(data.get("mission_progress_pct"), fallback["mission_progress_pct"]), 0.0, 100.0),
            1,
        ),
        "heading_deg": round(_number(data.get("heading_deg"), fallback["heading_deg"]), 0),
        "ground_speed_kts": round(max(0.0, _number(data.get("ground_speed_kts"), fallback["ground_speed_kts"])), 1),
    }


def build_recovery_plan(
    data: Dict[str, Any],
    mission_risk: Optional[Dict[str, Any]],
    health: Optional[Dict[str, Any]],
    fault_events: Optional[Iterable[Dict[str, Any]]],
    optimize_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a conservative, simulation-only recovery recommendation.

    The plan is based solely on telemetry and existing model outputs.  It is
    intentionally not an actuator command: the operator may simulate it, then
    record an approval after reviewing the evidence.
    """
    mission_risk = mission_risk or {}
    health = health or {}
    optimize_result = optimize_result or {}
    fault_events = list(fault_events or [])

    current_rpm = _number(data.get("rpm"), 1400.0)
    current_altitude = _number(data.get("altitude_ft"), 3000.0)
    cht = _number(data.get("cht"), 380.0)
    risk_level = str(mission_risk.get("risk_level", "MODERATE")).upper()
    completion_probability = _number(mission_risk.get("mission_completion_probability"), 65.0)
    health_index = _number(health.get("health_index"), 70.0)
    fault_names = [str(fault.get("name", "fault")).replace("_", " ") for fault in fault_events]
    has_thermal_fault = any(
        token in " ".join(fault_names).lower()
        for token in ("cooling", "overheat", "thermal", "injector")
    )

    requires_recovery = risk_level in {"HIGH", "CRITICAL"} or has_thermal_fault or cht >= 420.0

    if requires_recovery:
        rpm_reduction = 300.0 if risk_level == "CRITICAL" or cht >= 430.0 else 200.0
        target_rpm = max(1200.0, current_rpm - rpm_reduction)
        target_altitude = max(2000.0, current_altitude - (1500.0 if current_altitude > 6000.0 else 0.0))
        action = "DIVERT + REDUCE ENGINE LOAD" if risk_level == "CRITICAL" else "REDUCE ENGINE LOAD + RETURN"
        decision = "RECOVERY REVIEW REQUIRED"
        rationale = "Thermal, reliability, or mission-risk evidence requires a simulated safe-return review."
    elif risk_level == "MODERATE" or health_index < 75.0:
        target_rpm = max(1200.0, current_rpm - 100.0)
        target_altitude = current_altitude
        action = "MONITOR + REDUCE ENGINE LOAD"
        decision = "ADVISORY REVIEW"
        rationale = "Mission remains feasible, but the digital twin recommends a lower-load simulation before extending the sortie."
    else:
        target_rpm = current_rpm
        target_altitude = current_altitude
        action = "MAINTAIN PROFILE"
        decision = "CONTINUE WITH MONITORING"
        rationale = "Current AI, physics, and mission-risk evidence support the active simulated profile."

    # Reuse an operator-requested optimizer result when it is available; otherwise
    # retain the conservative mission-command target above.
    optimized_rpm = optimize_result.get("optimal_rpm")
    optimized_altitude = optimize_result.get("optimal_altitude_ft", optimize_result.get("optimal_alt"))
    if requires_recovery and optimized_rpm is not None:
        target_rpm = min(target_rpm, _number(optimized_rpm, target_rpm))
    if requires_recovery and optimized_altitude is not None:
        target_altitude = min(target_altitude, _number(optimized_altitude, target_altitude))

    evidence = []
    if fault_names:
        evidence.append(f"Active fault evidence: {', '.join(fault_names[:2])}.")
    if cht >= 420.0:
        evidence.append(f"CHT is {cht:.0f}°F, at or above the recovery threshold.")
    if completion_probability < 65.0:
        evidence.append(f"Mission completion probability is {completion_probability:.1f}%.")
    if not evidence:
        evidence.append("No current propulsion condition requires a recovery diversion.")

    return {
        "decision": decision,
        "action": action,
        "requires_operator_approval": bool(requires_recovery),
        "execution_mode": "SIMULATION_ONLY",
        "rationale": rationale,
        "evidence": evidence,
        "parameters": {
            "current_rpm": round(current_rpm, 0),
            "target_rpm": round(target_rpm, 0),
            "current_altitude_ft": round(current_altitude, 0),
            "target_altitude_ft": round(target_altitude, 0),
        },
    }


def _environment_state(data: Dict[str, Any], mission_risk: Dict[str, Any]) -> Dict[str, Any]:
    components = mission_risk.get("components", {}) or {}
    environment_score = _clamp(_number(components.get("environmental"), 100.0), 0.0, 100.0)
    oat = _number(data.get("oat_c"), 15.0)
    altitude = _number(data.get("altitude_ft"), 3000.0)
    factors: List[str] = []
    if oat >= 35.0:
        factors.append("hot-day thermal load")
    if altitude >= 10000.0:
        factors.append("high-altitude air-density penalty")
    if not factors:
        factors.append("within simulated environmental envelope")

    if environment_score >= 90.0:
        label = "NOMINAL ENVELOPE"
    elif environment_score >= 75.0:
        label = "ELEVATED ENVIRONMENTAL LOAD"
    else:
        label = "ADVERSE ENVIRONMENTAL LOAD"

    return {
        "label": label,
        "score": round(environment_score, 1),
        "oat_c": round(oat, 1),
        "altitude_ft": round(altitude, 0),
        "factors": factors,
        "source": "Derived from live OAT and altitude telemetry; not an external weather feed.",
    }


def _recovery_sites(position: Dict[str, float], safe_operating_time_h: float, environment_score: float) -> List[Dict[str, Any]]:
    # This is powerplant-safe range, not a fuel calculation.  It lets the demo
    # show why a route decision changes when engine health changes.
    safe_radius_nm = max(8.0, safe_operating_time_h * max(35.0, position["ground_speed_kts"]))
    sites = []
    for site in SIMULATED_RECOVERY_SITES:
        distance_nm = _haversine_nm(position["latitude"], position["longitude"], site["latitude"], site["longitude"])
        range_penalty = min(85.0, (distance_nm / max(1.0, safe_radius_nm)) * 70.0)
        environmental_penalty = max(0.0, 100.0 - environment_score) * 0.15
        score = _clamp(100.0 - range_penalty - environmental_penalty, 0.0, 100.0)
        sites.append({
            **site,
            "distance_nm": round(distance_nm, 1),
            "suitability_score": round(score, 0),
            "within_powerplant_safe_radius": bool(distance_nm <= safe_radius_nm),
        })
    return sorted(sites, key=lambda item: (-item["suitability_score"], item["distance_nm"]))


def _trust_state(
    twin_consistency: Dict[str, Any],
    sensor_integrity: Dict[str, Any],
    telemetry_integrity: Dict[str, Any],
    is_anomaly: bool,
    fault_events: Iterable[Dict[str, Any]],
) -> Dict[str, Any]:
    twin_score = _clamp(_number(twin_consistency.get("consistency_score"), 70.0), 0.0, 100.0)
    sensor_score = _clamp(_number(sensor_integrity.get("integrity_score"), 80.0), 0.0, 100.0)
    telemetry_score = _clamp(_number(telemetry_integrity.get("integrity_score"), 90.0), 0.0, 100.0)
    confidence = 0.50 * twin_score + 0.30 * sensor_score + 0.20 * telemetry_score

    if confidence >= 85.0:
        label = "HIGH CONFIDENCE"
    elif confidence >= 65.0:
        label = "REVIEW EVIDENCE"
    else:
        label = "LIMITED CONFIDENCE"

    case_label = str(twin_consistency.get("case_label", "AWAITING VALIDATION")).replace("_", " ")
    evidence = [
        {"source": "AI anomaly model", "state": "ANOMALY" if is_anomaly else "NOMINAL"},
        {"source": "Physics cross-validation", "state": case_label},
        {"source": "Sensor integrity", "state": f"{sensor_score:.0f}% trusted"},
        {"source": "Telemetry integrity", "state": f"{telemetry_score:.0f}% trusted"},
    ]
    if list(fault_events):
        evidence[0]["state"] = "ACTIVE FAULT EVIDENCE"

    return {
        "confidence": round(confidence, 1),
        "label": label,
        "twin_score": round(twin_score, 1),
        "sensor_score": round(sensor_score, 1),
        "telemetry_score": round(telemetry_score, 1),
        "evidence": evidence,
    }


def _fleet_reassignment(fleet_status: Iterable[Dict[str, Any]], active_uav_id: str, mission_at_risk: bool) -> Dict[str, Any]:
    ranked = []
    for aircraft in fleet_status or []:
        if aircraft.get("uav_id") == active_uav_id:
            continue
        health = _clamp(_number(aircraft.get("health"), 0.0), 0.0, 100.0)
        rul = max(0.0, _number(aircraft.get("rul"), 0.0))
        mission_probability = _clamp(_number(aircraft.get("mission_probability"), 0.0), 0.0, 100.0)
        fault_count = max(0.0, _number(aircraft.get("fault_count"), 0.0))
        alert_penalty = 30.0 if aircraft.get("alert") == "CRITICAL" else 10.0 if aircraft.get("alert") == "WARNING" else 0.0
        readiness = _clamp(
            health * 0.50 + min(100.0, rul / 1.4) * 0.25 + mission_probability * 0.20 - fault_count * 5.0 - alert_penalty,
            0.0,
            100.0,
        )
        ranked.append({**aircraft, "readiness_score": round(readiness, 0)})

    ranked.sort(key=lambda aircraft: aircraft["readiness_score"], reverse=True)
    candidate = ranked[0] if ranked else None
    required = bool(mission_at_risk and candidate and candidate["readiness_score"] >= 60.0)
    if candidate is None:
        recommendation = "No standby airframe is available in the current fleet state."
    elif required:
        recommendation = f"Stage {candidate.get('uav_id', 'standby UAV')} as the mission-relief candidate."
    else:
        recommendation = f"{candidate.get('uav_id', 'Standby UAV')} is the highest-readiness relief candidate if conditions worsen."

    return {
        "required": required,
        "candidate": candidate,
        "alternates": ranked[1:3],
        "recommendation": recommendation,
    }


def build_simulation_summary(
    plan: Dict[str, Any],
    whatif_result: Optional[Dict[str, Any]],
    baseline_mission_risk: Optional[Dict[str, Any]],
    projected_mission_risk: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Format existing what-if output as a mission-decision comparison."""
    if not whatif_result:
        return None

    baseline_mission_risk = baseline_mission_risk or {}
    projected_mission_risk = projected_mission_risk or {}
    current = whatif_result.get("current", {}) or {}
    counterfactual = whatif_result.get("counterfactual", {}) or {}
    delta = whatif_result.get("delta", {}) or {}
    baseline_probability = _number(baseline_mission_risk.get("mission_completion_probability"), 0.0)
    projected_probability = _number(projected_mission_risk.get("mission_completion_probability"), baseline_probability)

    return {
        "plan_action": plan.get("action", "RECOVERY REVIEW"),
        "baseline_completion_probability": round(baseline_probability, 1),
        "projected_completion_probability": round(projected_probability, 1),
        "probability_delta": round(projected_probability - baseline_probability, 1),
        "baseline_rul": round(_number(current.get("rul"), 0.0), 1),
        "projected_rul": round(_number(counterfactual.get("rul"), 0.0), 1),
        "rul_delta": round(_number(delta.get("rul"), 0.0), 1),
        "thermal_relief_f": round(max(0.0, -_number(delta.get("cht"), 0.0)), 1),
        "target_rpm": plan.get("parameters", {}).get("target_rpm"),
        "status": "SIMULATED",
    }


class MissionCommandController:
    """Keeps a small, deduplicated audit timeline for one GCS process."""

    def __init__(self, max_events: int = 24):
        self._events: deque[Dict[str, Any]] = deque(maxlen=max_events)
        self._last_signatures: Dict[str, str] = {}
        self._next_id = 1

    def reset(self) -> None:
        self._events.clear()
        self._last_signatures.clear()
        self._next_id = 1

    def _record(self, event_type: str, severity: str, message: str, cycle: Any, signature: str) -> None:
        if self._last_signatures.get(event_type) == signature:
            return
        self._last_signatures[event_type] = signature
        self._events.appendleft({
            "id": f"MC-{self._next_id:03d}",
            "cycle": int(_number(cycle, 0.0)),
            "type": event_type,
            "severity": severity,
            "message": message,
        })
        self._next_id += 1

    def observe(
        self,
        cycle: Any,
        alert: Any,
        mission_risk: Optional[Dict[str, Any]],
        twin_consistency: Optional[Dict[str, Any]],
        fault_events: Optional[Iterable[Dict[str, Any]]],
    ) -> None:
        mission_risk = mission_risk or {}
        twin_consistency = twin_consistency or {}
        fault_events = list(fault_events or [])
        risk_level = str(mission_risk.get("risk_level", "MODERATE")).upper()
        alert_label = str(alert or "NOMINAL").upper()
        probability = _number(mission_risk.get("mission_completion_probability"), 0.0)
        self._record(
            "MISSION_STATUS",
            "CRITICAL" if risk_level == "CRITICAL" else "WARNING" if risk_level in {"HIGH", "MODERATE"} else "INFO",
            f"Mission risk is {risk_level} ({probability:.1f}% completion probability).",
            cycle,
            f"{risk_level}:{round(probability)}",
        )

        fault_names = ", ".join(sorted(str(fault.get("name", "fault")) for fault in fault_events))
        if fault_names:
            self._record(
                "FAULT_DETECTED",
                "CRITICAL" if alert_label == "CRITICAL" else "WARNING",
                f"Digital twin detected: {fault_names.replace('_', ' ')}.",
                cycle,
                f"{alert_label}:{fault_names}",
            )

        twin_case = str(twin_consistency.get("case", ""))
        if twin_case:
            label = str(twin_consistency.get("case_label", twin_case)).replace("_", " ")
            severity = "WARNING" if twin_case in {"B", "C", "D"} else "INFO"
            self._record(
                "TWIN_VALIDATION",
                severity,
                f"AI + physics validation: {label}.",
                cycle,
                f"{twin_case}:{label}",
            )

    def record_action(self, cycle: Any, event_type: str, message: str) -> None:
        severity = "INFO" if event_type == "PLAN_APPROVED" else "WARNING"
        self._record(event_type, severity, message, cycle, f"{event_type}:{message}:{cycle}")

    def events(self) -> List[Dict[str, Any]]:
        return list(self._events)


def build_mission_command_state(
    data: Dict[str, Any],
    mission_risk: Optional[Dict[str, Any]],
    health: Optional[Dict[str, Any]],
    twin_consistency: Optional[Dict[str, Any]],
    sensor_integrity: Optional[Dict[str, Any]],
    telemetry_integrity: Optional[Dict[str, Any]],
    fault_events: Optional[Iterable[Dict[str, Any]]],
    fleet_status: Optional[Iterable[Dict[str, Any]]],
    is_anomaly: bool = False,
    optimize_result: Optional[Dict[str, Any]] = None,
    action_state: Optional[Dict[str, Any]] = None,
    timeline: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Build the JSON-safe Mission Command Center view model."""
    mission_risk = mission_risk or {}
    health = health or {}
    twin_consistency = twin_consistency or {}
    sensor_integrity = sensor_integrity or {}
    telemetry_integrity = telemetry_integrity or {}
    fault_events = list(fault_events or [])
    position = _current_position(data)
    environment = _environment_state(data, mission_risk)
    plan = build_recovery_plan(data, mission_risk, health, fault_events, optimize_result)
    safe_operating_time_h = max(0.0, _number(mission_risk.get("safe_operating_time_h"), 0.0))
    sites = _recovery_sites(position, safe_operating_time_h, environment["score"])
    mission_at_risk = bool(mission_risk.get("mission_at_risk", False))

    action_state = action_state or {}
    if action_state.get("plan"):
        active_plan = action_state["plan"]
    else:
        active_plan = plan

    action = {
        "action_id": action_state.get("action_id", "RECOVERY-PLAN"),
        "status": action_state.get("status", "READY"),
        "execution_mode": "SIMULATION_ONLY",
        "plan": active_plan,
        "simulation": action_state.get("simulation"),
        "approved_cycle": action_state.get("approved_cycle"),
    }

    return {
        "schema_version": "1.0",
        "mode": "SIMULATED_TRAINING_CORRIDOR",
        "mission": {
            "completion_probability": round(_number(mission_risk.get("mission_completion_probability"), 0.0), 1),
            "risk_level": str(mission_risk.get("risk_level", "UNKNOWN")),
            "risk_color": _risk_color(str(mission_risk.get("risk_level", "UNKNOWN")).upper()),
            "safe_operating_time_h": round(safe_operating_time_h, 2),
            "narrative": mission_risk.get("risk_narrative", "Awaiting mission-risk analysis."),
        },
        "environment": environment,
        "route": {
            "label": "SIMULATED MISSION CORRIDOR",
            "is_simulated": True,
            "position": position,
            "waypoints": SIMULATED_ROUTE,
            "safe_radius_nm": round(max(8.0, safe_operating_time_h * max(35.0, position["ground_speed_kts"])), 1),
            "recovery_sites": sites,
        },
        "trust": _trust_state(twin_consistency, sensor_integrity, telemetry_integrity, is_anomaly, fault_events),
        "fleet_reassignment": _fleet_reassignment(fleet_status or [], str(data.get("uav_id", "UAV-01")), mission_at_risk),
        "action": action,
        "timeline": list(timeline or []),
        "disclaimer": "Decision support only. Recovery controls remain simulated and require operator review.",
    }
