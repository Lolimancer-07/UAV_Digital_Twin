"""
backend/ai_engineer.py
------------------------
AI Mission Engineer — Template-Based Grounded Explanation Engine.

Generates natural-language explanations from actual Digital Twin state.
NO external LLM or API calls. All statements are grounded in real data.

The engine answers common operator questions:
  1. "Why is the engine unhealthy?"
  2. "What caused the anomaly?"
  3. "How much RUL is remaining?"
  4. "Can we complete the mission?"
  5. "What happens if I reduce RPM?"
  6. "What should I inspect?"
  7. "Why did the system recommend X?"
"""

from typing import Dict, Any

QUESTION_PATTERNS = [
    ("why", "unhealthy"),
    ("why", "anomal"),
    ("rul", "remaining"),
    ("rul", "left"),
    ("complete", "mission"),
    ("safe", "mission"),
    ("reduce", "rpm"),
    ("inspect", ""),
    ("recommend", ""),
    ("cause", ""),
    ("explain", ""),
    ("status", ""),
    ("health", ""),
]


def _classify_question(question: str) -> str:
    q = question.lower()
    if any(w in q for w in ["unhealthy", "bad", "degraded", "wrong", "fail"]):
        return "WHY_UNHEALTHY"
    if any(w in q for w in ["anomaly", "anomal", "fault", "detect"]):
        return "WHY_ANOMALY"
    if any(w in q for w in ["rul", "remaining", "life", "how long"]):
        return "RUL_STATUS"
    if any(w in q for w in ["mission", "complete", "fly", "safe", "risk"]):
        return "MISSION_RISK"
    if any(w in q for w in ["rpm", "reduce", "slow", "throttle"]):
        return "RPM_ADVICE"
    if any(w in q for w in ["inspect", "maintenance", "fix", "repair", "service"]):
        return "MAINTENANCE"
    if any(w in q for w in ["recommend", "advice", "suggest", "should"]):
        return "RECOMMENDATION"
    if any(w in q for w in ["sensor", "reading", "value", "measurement"]):
        return "SENSOR_STATUS"
    return "GENERAL_STATUS"


def _fmt_pct(v): return f"{v:.0f}%"
def _fmt_temp(v): return f"{v:.1f}°F"
def _fmt_rul(v): return f"{v:.0f} cycles"


def answer(question: str, state: Dict[str, Any]) -> str:
    """
    Generates a grounded natural-language answer to an operator question.

    Parameters
    ----------
    question : operator's natural language question
    state    : full Digital Twin state dict (from WebSocket payload)

    Returns
    -------
    str : explanation grounded in real state values
    """
    q_type = _classify_question(question)

    # Extract key values
    health = state.get("health", {})
    hi = health.get("health_index", 0)
    condition = health.get("condition", "UNKNOWN")
    sub = health.get("sub_scores", {})

    rul = state.get("predicted_rul", 0)
    rul_lo = state.get("rul_ci_lower", 0)
    rul_hi = state.get("rul_ci_upper", 0)

    fault_events = state.get("fault_events", [])
    fault_names = [f.get("name", "").replace("_", " ") for f in fault_events]
    fault_count = len(fault_events)

    xai = state.get("xai", {})
    top_driver = xai.get("top_driver", "UNKNOWN")
    attributions = xai.get("attributions", [])

    twin = state.get("twin_consistency", {})
    mission = state.get("mission_risk", {})
    prescriptive = state.get("prescriptive", [])
    sensors = state.get("sensor_integrity", {})
    integrity = sensors.get("integrity_score", 100.0)

    rpm  = state.get("rpm", 0)
    cht  = state.get("cht", 0)
    egt  = state.get("egt", 0)
    oil  = state.get("oil_pressure", 0)
    vib  = state.get("vibration", 0)

    # ── Answer by question type ──────────────────────────────────────────────

    if q_type == "WHY_UNHEALTHY":
        if hi >= 80:
            return (f"The engine is currently in {condition} condition with a Health Index of {hi:.0f}/100. "
                    f"All subsystems are operating within acceptable bounds. "
                    f"Predicted RUL is {_fmt_rul(rul)} (95% CI: {_fmt_rul(rul_lo)}–{_fmt_rul(rul_hi)}).")
        reasons = []
        if sub.get("thermal", 100) < 70:
            reasons.append(f"thermal subsystem degradation (CHT={_fmt_temp(cht)}, EGT={_fmt_temp(egt)})")
        if sub.get("lubrication", 100) < 70:
            reasons.append(f"lubrication system concern (Oil Pressure={oil:.1f} PSI)")
        if sub.get("mechanical", 100) < 70:
            reasons.append(f"elevated mechanical vibration ({vib:.3f}g RMS)")
        if fault_count > 0:
            reasons.append(f"{fault_count} active fault code(s): {', '.join(fault_names[:3])}")
        if not reasons:
            reasons.append(f"RUL reduction to {_fmt_rul(rul)} cycles (was higher at engine start)")
        return (f"The engine Health Index is {hi:.0f}/100 ({condition}), degraded by: "
                + "; ".join(reasons) + f". "
                f"The primary contributing subsystem is {top_driver.replace('_',' ').title()}.")

    elif q_type == "WHY_ANOMALY":
        if not fault_events and not xai.get("is_anomaly"):
            return ("No anomalies are currently detected. The engine is operating within the "
                    "3-sigma multivariate learned normal operational envelope.")
        response = "The anomaly detection system has identified the following:\n"
        if fault_events:
            for f in fault_events[:3]:
                response += f"  • {f['name'].replace('_',' ').title()} [{f['severity']}]\n"
        if attributions:
            response += "\nRoot cause attribution (ranked by contribution):\n"
            for a in attributions[:4]:
                response += (f"  {a['label'].title()}: {a['attribution']:.1f}% — "
                             f"value={a['value']}{a['unit']}, nominal={a['nominal']}{a['unit']}\n")
        if twin:
            response += f"\nTwin Consistency: Case {twin.get('case','?')} — {twin.get('case_label','')}"
        return response.strip()

    elif q_type == "RUL_STATUS":
        if rul <= 0:
            return "RUL prediction is warming up. The LSTM model requires 50 telemetry cycles to produce a stable prediction. Current sequence buffer: " + f"{state.get('buffer_pct', 0):.0f}% full."
        urgency = ""
        if rul < 20:
            urgency = " ⚠️ CRITICAL — immediate overhaul required."
        elif rul < 50:
            urgency = " ⚠️ WARNING — plan maintenance within the next few flights."
        elif rul < 100:
            urgency = " Plan a 50-hour inspection."
        return (f"The Deep LSTM prognostics model predicts {_fmt_rul(rul)} of remaining service life.{urgency}\n"
                f"95% confidence interval: {_fmt_rul(rul_lo)} to {_fmt_rul(rul_hi)}.\n"
                f"True reference RUL (from dataset): {_fmt_rul(state.get('true_rul', 0))}.")

    elif q_type == "MISSION_RISK":
        if not mission:
            return "Mission risk assessment is not yet available. Ensure telemetry is flowing and RUL has been predicted."
        prob = mission.get("mission_completion_probability", 0)
        risk = mission.get("risk_level", "UNKNOWN")
        safe_h = mission.get("safe_operating_time_h", 0)
        req_h = mission.get("required_mission_duration_h", 4.5)
        at_risk = mission.get("mission_at_risk", False)
        if at_risk:
            return (f"Mission completion probability is {_fmt_pct(prob)} — risk level: {risk}.\n"
                    f"Predicted safe operating time: {safe_h:.1f}h vs required {req_h:.1f}h.\n"
                    f"The mission is AT RISK. {mission.get('risk_narrative', '')}")
        return (f"Mission completion probability is {_fmt_pct(prob)} — risk level: {risk}.\n"
                f"Estimated safe operating time: {safe_h:.1f}h. Mission is within acceptable risk bounds.")

    elif q_type == "RPM_ADVICE":
        if not mission:
            return ("Reducing RPM reduces thermal load on cylinders and bearings. "
                    f"Current RPM is {rpm:.0f}. At nominal cruise (1400 RPM), thermal load is minimized. "
                    "Use the What-If tab to simulate a specific RPM reduction.")
        cur_prob = mission.get("mission_completion_probability", 0)
        return (f"At current RPM of {rpm:.0f}, CHT={_fmt_temp(cht)} and EGT={_fmt_temp(egt)}.\n"
                f"Reducing RPM lowers thermal load (CHT scales with RPM^1.3) which extends predicted RUL.\n"
                f"Current mission completion probability: {_fmt_pct(cur_prob)}.\n"
                f"Use the What-If Simulation tab to model a specific RPM reduction and see the predicted effect on RUL and health.")

    elif q_type == "MAINTENANCE":
        if prescriptive:
            top = prescriptive[0]
            return (f"Top maintenance advisory [{top['severity']}]:\n"
                    f"{top['action']}\n\n"
                    f"Operational restriction: {top.get('operational','')}\n"
                    f"Required maintenance: {top.get('maintenance','')}\n"
                    f"Expected benefit: {top.get('expected_benefit','')}")
        return "No active maintenance advisories. Engine is within airworthiness limits."

    elif q_type == "RECOMMENDATION":
        if prescriptive:
            top = prescriptive[0]
            source = top.get("source", "")
            if "FAULT" in source:
                reason = f"Based on detected fault: {source.split(':')[-1].replace('_',' ').title()}"
            elif "RUL" in source:
                reason = f"Based on RUL prognostic: {_fmt_rul(rul)} remaining"
            elif "MISSION" in source:
                reason = f"Based on mission risk level: {mission.get('risk_level','?')}"
            else:
                reason = "Based on overall system health assessment"
            return (f"The recommendation is grounded in: {reason}.\n\n"
                    f"Recommendation: {top['action']}\n"
                    f"Expected outcome: {top.get('expected_benefit','')}")
        return "No active recommendations. System is nominal."

    elif q_type == "SENSOR_STATUS":
        if not sensors:
            return "Sensor integrity data is not yet available."
        score = sensors.get("integrity_score", 100)
        suspects = sensors.get("suspect_channels", [])
        if not suspects:
            return f"All sensor channels are healthy. Overall sensor integrity score: {score:.1f}%."
        resp = f"Sensor integrity score: {score:.1f}%.\n\nSuspect channels:\n"
        for s in suspects[:4]:
            resp += f"  • {s['channel'].upper()}: {s['confidence']:.0f}% confidence — {', '.join(s['issues'][:2])}\n"
        return resp.strip()

    else:  # GENERAL_STATUS
        faults_str = ", ".join(fault_names) if fault_names else "none"
        twin_str = twin.get("case_label", "NORMAL") if twin else "awaiting data"
        return (f"UAV Digital Twin Status Summary:\n"
                f"  Engine Health: {hi:.0f}/100 ({condition})\n"
                f"  Predicted RUL: {_fmt_rul(rul)} (CI: {_fmt_rul(rul_lo)}–{_fmt_rul(rul_hi)})\n"
                f"  Active Faults: {faults_str}\n"
                f"  Twin Consistency: {twin_str}\n"
                f"  Mission Risk: {mission.get('risk_level','UNKNOWN') if mission else 'awaiting data'} "
                f"({mission.get('mission_completion_probability',0):.0f}% completion probability)\n"
                f"  Sensor Integrity: {integrity:.1f}%\n"
                f"  RPM: {rpm:.0f} | CHT: {_fmt_temp(cht)} | EGT: {_fmt_temp(egt)} | Oil: {oil:.1f} PSI")
