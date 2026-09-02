"""
backend/prescriptive.py
------------------------
Prescriptive Maintenance & Operational Recommendation Engine.

Converts AI model outputs, fault events, physics residuals, and RUL predictions
into structured, actionable recommendations with severity levels.

Severity levels:
  INFO      : Routine advisory, no immediate action
  WARNING   : Monitor closely, plan maintenance
  CRITICAL  : Immediate operational restriction required
  EMERGENCY : Ground aircraft, no further flight
"""

from typing import Dict, List, Any

SEVERITY_RANK = {"INFO": 0, "WARNING": 1, "CRITICAL": 2, "EMERGENCY": 3}


# ── Fault-Specific Operating Recommendations ──────────────────────────────────
FAULT_RECOMMENDATIONS = {
    "OVERHEATING": {
        "severity": "CRITICAL",
        "action": "Reduce power immediately. Descend to cooler altitude. Inspect CHT probes.",
        "operational": "Reduce RPM to below 2100. Enrich mixture. Increase cooling airflow.",
        "maintenance": "Inspect cylinder cooling baffles, thermostat valve, and coolant level.",
        "expected_benefit": "Reduced thermal stress may recover 8-15 RUL cycles.",
    },
    "LOW_OIL_PRESSURE": {
        "severity": "EMERGENCY",
        "action": "LAND IMMEDIATELY. Oil pressure below safe minimum for RPM.",
        "operational": "Reduce RPM to minimum flight power. Prepare for precautionary landing.",
        "maintenance": "Inspect oil pump, relief valve, and oil lines for leaks before next flight.",
        "expected_benefit": "Prevention of catastrophic bearing failure.",
    },
    "LUBRICATION_ISSUE": {
        "severity": "WARNING",
        "action": "Monitor oil pressure trend. Reduce RPM by 200-300.",
        "operational": "Reduce engine power. Avoid high-RPM sustained operation.",
        "maintenance": "Check oil level, oil cooler bypass valve, and filter for contamination.",
        "expected_benefit": "Reduced bearing wear rate.",
    },
    "HIGH_VIBRATION": {
        "severity": "WARNING",
        "action": "Check for propeller imbalance. Reduce RPM to minimize resonance.",
        "operational": "Avoid resonant RPM band (1800-2000 RPM).",
        "maintenance": "Dynamic propeller balancing. Inspect engine mount isolators.",
        "expected_benefit": "Reduced mechanical fatigue accumulation.",
    },
    "MISFIRE_SUSPECT": {
        "severity": "CRITICAL",
        "action": "Cycle magneto switches. Carburettor heat if applicable. Land as soon as practicable.",
        "operational": "Reduce to cruise power. Avoid high-altitude operation.",
        "maintenance": "Inspect spark plugs, ignition leads, and coil primaries.",
        "expected_benefit": "Restore smooth combustion and EGT balance.",
    },
    "INJECTOR_ANOMALY": {
        "severity": "WARNING",
        "action": "Check fuel rail pressure. Monitor fuel flow vs RPM consistency.",
        "operational": "Avoid operation above 2300 RPM until inspected.",
        "maintenance": "Ultrasonic clean injectors. Replace high-pressure fuel filter.",
        "expected_benefit": "Restored fuel distribution balance.",
    },
    "SENSOR_DRIFT": {
        "severity": "WARNING",
        "action": "Cross-check suspect sensor against other channels. Do not use suspect reading for flight decisions.",
        "operational": "Use physics-predicted baseline as reference for affected channel.",
        "maintenance": "Calibrate thermocouples against dry-block reference. Check wiring continuity.",
        "expected_benefit": "Restored sensor accuracy for diagnostics.",
    },
    "COOLING_DEGRADATION": {
        "severity": "WARNING",
        "action": "Reduce power to lower thermal load. Monitor CHT trend closely.",
        "operational": "Reduce RPM to approximately 2100. Increase altitude if possible for cooling.",
        "maintenance": "Inspect radiator fins for fouling. Check coolant pump and thermostat.",
        "expected_benefit": "Reducing RPM by ~300 RPM typically recovers 15-25 RUL cycles at moderate degradation.",
    },
    "COMBUSTION_INSTABILITY": {
        "severity": "WARNING",
        "action": "Adjust mixture. Check ignition timing. Reduce power to 75%.",
        "operational": "Lean mixture slightly. Avoid abrupt power changes.",
        "maintenance": "Differential compression test. Borescope combustion chambers.",
        "expected_benefit": "Restored combustion efficiency.",
    },
    "ALTERNATOR_LOW": {
        "severity": "INFO",
        "action": "Monitor bus voltage. Reduce non-essential electrical loads.",
        "operational": "Shed non-critical loads. Monitor for further voltage drop.",
        "maintenance": "Check alternator belt tension and rectifier output.",
        "expected_benefit": "Maintained electrical reliability.",
    },
}

# ── RUL-Based Lifecycle Recommendations ──────────────────────────────────────
def _rul_recommendation(rul: float) -> dict:
    if rul <= 0:
        return {}
    if rul < 15:
        return {
            "severity": "EMERGENCY",
            "action": f"Engine approaching end-of-life (RUL: {rul:.0f} cycles). Ground aircraft for depot overhaul.",
            "operational": "No further flight dispatches. Engine must be removed for TBO.",
            "maintenance": "Full engine teardown and overhaul per manufacturer specifications.",
            "expected_benefit": "Prevention of in-flight failure.",
            "source": "RUL_PROGNOSTICS"
        }
    elif rul < 40:
        return {
            "severity": "CRITICAL",
            "action": f"Engine life critically low (RUL: {rul:.0f} cycles). Schedule overhaul within 5 flights.",
            "operational": "Restrict to short-duration missions only. No extended ISR sorties.",
            "maintenance": "Schedule depot inspection within next 5 flight cycles.",
            "expected_benefit": "Safe retirement of engine before failure threshold.",
            "source": "RUL_PROGNOSTICS"
        }
    elif rul < 80:
        return {
            "severity": "WARNING",
            "action": f"Engine entering final service phase (RUL: {rul:.0f} cycles). Plan maintenance.",
            "operational": "Reduce to medium-endurance missions. Avoid extreme altitude.",
            "maintenance": "Schedule 50-hour preventive inspection within 2 weeks.",
            "expected_benefit": "Extended service life through early intervention.",
            "source": "RUL_PROGNOSTICS"
        }
    return {}


def generate_prescriptive_recommendations(
    fault_events: List[dict],
    predicted_rul: float,
    health_index: float,
    twin_consistency: dict = None,
    mission_risk: dict = None,
) -> List[dict]:
    """
    Generates prioritized prescriptive recommendations from model outputs.

    Returns list of recommendation dicts sorted by severity (highest first).
    """
    recommendations = []
    seen_faults = set()

    # 1. Fault-based recommendations
    for fault in fault_events:
        fname = fault.get("name", "")
        if fname in FAULT_RECOMMENDATIONS and fname not in seen_faults:
            seen_faults.add(fname)
            rec = FAULT_RECOMMENDATIONS[fname].copy()
            rec["source"] = f"FAULT_DETECTION:{fname}"
            rec["fault_name"] = fname.replace("_", " ").title()
            recommendations.append(rec)

    # 2. RUL lifecycle recommendation
    rul_rec = _rul_recommendation(predicted_rul)
    if rul_rec:
        recommendations.append(rul_rec)

    # 3. Twin consistency advisory
    if twin_consistency and twin_consistency.get("case") in ("C", "D"):
        recommendations.append({
            "severity": "INFO",
            "action": f"AI/Physics disagreement detected (Case {twin_consistency['case']}). {twin_consistency.get('narrative', '')}",
            "operational": "Verify sensor readings with backup instruments before acting on AI alerts.",
            "maintenance": "Calibrate affected sensors per ATA-77.",
            "expected_benefit": "Improved diagnostic confidence.",
            "source": "TWIN_CONSISTENCY",
        })

    # 4. Mission risk advisory
    if mission_risk and mission_risk.get("risk_level") in ("HIGH", "CRITICAL"):
        prob = mission_risk.get("mission_completion_probability", 0)
        safe_h = mission_risk.get("safe_operating_time_h", 0)
        recommendations.append({
            "severity": "CRITICAL" if mission_risk["risk_level"] == "CRITICAL" else "WARNING",
            "action": f"Mission completion probability is {prob:.0f}%. Estimated safe operating time: {safe_h:.1f}h.",
            "operational": "Consider mission abort or reduction to shorter planned route.",
            "maintenance": "Address active fault conditions before next dispatch.",
            "expected_benefit": "Prevention of mission failure and potential asset loss.",
            "source": "MISSION_RISK",
        })

    # 5. Default nominal advisory
    if not recommendations:
        recommendations.append({
            "severity": "INFO",
            "action": "All propulsion systems nominal. Engine cleared for standard mission dispatch.",
            "operational": "Proceed with standard pre-flight checklist and runup.",
            "maintenance": "No active advisories. Next scheduled maintenance per TBO calendar.",
            "expected_benefit": "Sustained airworthiness.",
            "source": "NOMINAL",
        })

    # Sort by severity (most severe first)
    recommendations.sort(key=lambda r: SEVERITY_RANK.get(r.get("severity", "INFO"), 0), reverse=True)
    return recommendations
