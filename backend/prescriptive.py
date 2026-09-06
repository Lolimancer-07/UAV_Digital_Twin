"""
backend/prescriptive.py

Turns AI model outputs, fault codes, and RUL predictions into actionable
operational directives and maintenance recommendations for ground crews and pilots.

Four sources feed this:
  1. Active fault codes — prioritized by flight safety criticality
  2. RUL lifecycle stage — approaching overhaul triggers depot advisories
  3. Twin consistency — Case C/D disagreements warrant sensor recalibration
  4. Mission risk — high/critical risk triggers route/throttle reduction

Severity levels (in escalating order):
  INFO      — routine, no urgency
  WARNING   — needs attention soon
  CRITICAL  — restrict operations, act before next flight
  EMERGENCY — ground the aircraft now
"""

from typing import Dict, List, Any

try:
    from backend.maintenance_advisor import FAULT_PRIORITY_HIERARCHY
except ImportError:
    try:
        from maintenance_advisor import FAULT_PRIORITY_HIERARCHY
    except ImportError:
        FAULT_PRIORITY_HIERARCHY = {
            "LOW_OIL_PRESSURE": {"rank": 1, "rationale": "Imminent bearing seizure"},
            "OVERHEATING": {"rank": 2, "rationale": "Cylinder head thermal warping"},
            "MISFIRE_SUSPECT": {"rank": 3, "rationale": "Torsional resonance and fire risk"},
        }

SEVERITY_RANK = {"INFO": 0, "WARNING": 1, "CRITICAL": 2, "EMERGENCY": 3}

# Operational and depot recommendations per fault type
FAULT_RECOMMENDATIONS = {
    "OVERHEATING": {
        "severity": "CRITICAL",
        "action": "Reduce power immediately. Descend to cooler altitude. Inspect CHT probes.",
        "operational": "Reduce RPM to below 2100. Enrich mixture. Increase cooling airflow.",
        "maintenance": "Inspect cylinder cooling baffles, thermostat valve, and coolant level (ATA-75).",
        "expected_benefit": "Reduced thermal stress recovers 8-15 RUL cycles.",
    },
    "LOW_OIL_PRESSURE": {
        "severity": "EMERGENCY",
        "action": "LAND IMMEDIATELY. Oil pressure below safe minimum for engine RPM.",
        "operational": "Reduce RPM to minimum flight power. Prepare for precautionary landing.",
        "maintenance": "Inspect oil pump, relief valve, and oil lines for leaks before next flight (ATA-79).",
        "expected_benefit": "Prevention of catastrophic crankshaft bearing seizure.",
    },
    "LUBRICATION_ISSUE": {
        "severity": "WARNING",
        "action": "Monitor oil pressure trend. Reduce RPM by 200-300.",
        "operational": "Reduce engine power. Avoid high-RPM sustained operation.",
        "maintenance": "Check oil level, oil cooler bypass valve, and filter for contamination (ATA-79).",
        "expected_benefit": "Reduced bearing wear rate.",
    },
    "HIGH_VIBRATION": {
        "severity": "WARNING",
        "action": "Check for propeller imbalance. Reduce RPM to minimize resonance.",
        "operational": "Avoid resonant RPM band (1800-2000 RPM).",
        "maintenance": "Dynamic propeller balancing. Inspect engine mount isolators (ATA-72).",
        "expected_benefit": "Reduced mechanical fatigue accumulation.",
    },
    "MISFIRE_SUSPECT": {
        "severity": "CRITICAL",
        "action": "Cycle ignition switches. Verify fuel mixture. Land as soon as practicable.",
        "operational": "Reduce to cruise power. Avoid high-altitude operation.",
        "maintenance": "Inspect spark plugs, ignition leads, and coil primaries (ATA-80).",
        "expected_benefit": "Restore smooth combustion and EGT balance.",
    },
    "INJECTOR_ANOMALY": {
        "severity": "WARNING",
        "action": "Check fuel rail pressure. Monitor fuel flow vs RPM consistency.",
        "operational": "Avoid operation above 2300 RPM until inspected.",
        "maintenance": "Ultrasonic clean injectors. Replace high-pressure fuel filter (ATA-73).",
        "expected_benefit": "Restored fuel distribution balance.",
    },
    "SENSOR_DRIFT": {
        "severity": "WARNING",
        "action": "Cross-check suspect sensor against other channels. Do not use suspect reading for flight decisions.",
        "operational": "Use physics-predicted baseline as reference for affected channel.",
        "maintenance": "Calibrate thermocouples against dry-block reference (ATA-77).",
        "expected_benefit": "Restored sensor accuracy for diagnostics.",
    },
    "COOLING_DEGRADATION": {
        "severity": "WARNING",
        "action": "Reduce power to lower thermal load. Monitor CHT trend closely.",
        "operational": "Reduce RPM to approximately 2100. Increase altitude if possible for cooling.",
        "maintenance": "Inspect radiator fins for fouling. Check coolant pump and thermostat (ATA-75).",
        "expected_benefit": "Reducing RPM by ~300 RPM typically recovers 15-25 RUL cycles.",
    },
    "COMBUSTION_INSTABILITY": {
        "severity": "WARNING",
        "action": "Adjust mixture. Check ignition timing. Reduce power to 75%.",
        "operational": "Lean mixture slightly. Avoid abrupt power changes.",
        "maintenance": "Differential compression test. Borescope combustion chambers (ATA-72).",
        "expected_benefit": "Restored combustion efficiency.",
    },
    "ALTERNATOR_LOW": {
        "severity": "INFO",
        "action": "Monitor bus voltage. Reduce non-essential electrical loads.",
        "operational": "Shed non-critical loads. Monitor for further voltage drop.",
        "maintenance": "Check alternator belt tension and rectifier output (ATA-24).",
        "expected_benefit": "Maintained electrical reliability.",
    },
}


def _rul_recommendation(rul: float) -> dict:
    """Returns a lifecycle advisory based on how much RUL is remaining."""
    if rul <= 0:
        return {}
    if rul < 15:
        return {
            "severity": "EMERGENCY",
            "priority_rank": 0,
            "action": f"Engine approaching end-of-life (RUL: {rul:.0f} cycles). Ground aircraft for depot overhaul.",
            "operational": "No further flight dispatches. Engine must be removed for TBO.",
            "maintenance": "Full engine teardown and overhaul per manufacturer specifications (ATA-72).",
            "expected_benefit": "Prevention of in-flight failure.",
            "source": "RUL_PROGNOSTICS"
        }
    elif rul < 40:
        return {
            "severity": "CRITICAL",
            "priority_rank": 1,
            "action": f"Engine life critically low (RUL: {rul:.0f} cycles). Schedule overhaul within 5 flights.",
            "operational": "Restrict to short-duration missions only. No extended ISR sorties.",
            "maintenance": "Schedule depot inspection within next 5 flight cycles (ATA-72).",
            "expected_benefit": "Safe retirement of engine before failure threshold.",
            "source": "RUL_PROGNOSTICS"
        }
    elif rul < 80:
        return {
            "severity": "WARNING",
            "priority_rank": 15,
            "action": f"Engine entering final service phase (RUL: {rul:.0f} cycles). Plan maintenance.",
            "operational": "Reduce to medium-endurance missions. Avoid extreme altitude.",
            "maintenance": "Schedule 50-hour preventive inspection within 2 weeks (ATA-05).",
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
    Generates prioritized recommendations from all model outputs.
    Returns them sorted deterministically by flight safety priority rank.
    """
    recommendations = []
    seen_faults = set()

    for fault in fault_events:
        fname_raw = fault.get("name", "")
        fname = fname_raw.upper()
        if fname in FAULT_RECOMMENDATIONS and fname not in seen_faults:
            seen_faults.add(fname)
            rec = FAULT_RECOMMENDATIONS[fname].copy()
            meta = FAULT_PRIORITY_HIERARCHY.get(fname, {"rank": 50, "rationale": "Routine advisory"})
            rec["priority_rank"] = meta["rank"]
            rec["priority_rationale"] = meta["rationale"]
            rec["source"] = f"FAULT_DETECTION:{fname_raw}"
            rec["fault_name"] = fname_raw.replace("_", " ").title()
            recommendations.append(rec)

    # RUL lifecycle advisory
    rul_rec = _rul_recommendation(predicted_rul)
    if rul_rec:
        recommendations.append(rul_rec)

    # Twin consistency advisory
    if twin_consistency and twin_consistency.get("case") in ("C", "D"):
        recommendations.append({
            "severity": "INFO",
            "priority_rank": 25,
            "priority_rationale": "Sensor/model calibration discrepancy requires verification",
            "action": f"AI/Physics disagreement detected (Case {twin_consistency['case']}). {twin_consistency.get('narrative', '')}",
            "operational": "Verify sensor readings with backup instruments before acting on AI alerts.",
            "maintenance": "Calibrate affected sensors per ATA-77.",
            "expected_benefit": "Improved diagnostic confidence.",
            "source": "TWIN_CONSISTENCY",
        })

    # Mission risk advisory
    if mission_risk and mission_risk.get("risk_level") in ("HIGH", "CRITICAL"):
        prob = mission_risk.get("mission_completion_probability", 0)
        safe_h = mission_risk.get("safe_operating_time_h", 0)
        is_crit = mission_risk["risk_level"] == "CRITICAL"
        recommendations.append({
            "severity": "CRITICAL" if is_crit else "WARNING",
            "priority_rank": 2 if is_crit else 8,
            "priority_rationale": "High probability of mission failure during loiter or dash phase",
            "action": f"Mission completion probability is {prob:.0f}%. Estimated safe operating time: {safe_h:.1f}h.",
            "operational": "Consider mission abort or reduction to shorter planned route.",
            "maintenance": "Address active fault conditions before next dispatch.",
            "expected_benefit": "Prevention of mission failure and potential asset loss.",
            "source": "MISSION_RISK",
        })

    # Nominal status
    if not recommendations:
        recommendations.append({
            "severity": "INFO",
            "priority_rank": 99,
            "priority_rationale": "All monitored subsystems within nominal operating tolerances",
            "action": "All propulsion systems nominal. Engine cleared for standard mission dispatch.",
            "operational": "Proceed with standard pre-flight checklist and runup.",
            "maintenance": "No active advisories. Next scheduled maintenance per TBO calendar.",
            "expected_benefit": "Sustained airworthiness.",
            "source": "NOMINAL",
        })

    # Sort by priority rank (1 = highest urgency), then severity
    recommendations.sort(key=lambda r: (
        r.get("priority_rank", 50),
        -SEVERITY_RANK.get(r.get("severity", "INFO"), 0)
    ))
    return recommendations
