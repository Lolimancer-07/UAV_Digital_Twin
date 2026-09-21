"""
backend/ai_engineer.py

Answers operator questions in plain English using actual Digital Twin state.
No external LLM, no API calls — everything is grounded in real telemetry values.

Intent classification is performed by a trained TF-IDF + Logistic Regression
model (backend/ml_chatbot/intent_clf.joblib) that generalises to paraphrased,
abbreviated, and novel questions across 12 intent classes.

Supports:
  WHY_UNHEALTHY | WHY_ANOMALY | RUL_STATUS | MISSION_RISK | RPM_ADVICE
  MAINTENANCE   | RECOMMENDATION | SENSOR_STATUS | THERMAL | OIL
  VIBRATION     | GENERAL_STATUS
"""

import os
import sys
import logging
from typing import Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

# ── ML Intent Classifier ─────────────────────────────────────────────────────
# Add ml_chatbot to path so it can be imported from the backend directory.
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

try:
    from ml_chatbot.intent_classifier import classify as _ml_classify, is_model_available
    _USE_ML = True
    if is_model_available():
        logger.info("[AI Engineer] ML intent classifier loaded (TF-IDF + Logistic Regression)")
    else:
        logger.warning("[AI Engineer] ML model not found — run train_intent_clf.py. Using fallback classifier.")
except ImportError as e:
    logger.warning("[AI Engineer] ml_chatbot import failed (%s) — using fallback classifier.", e)
    _USE_ML = False


def _classify_question(question: str) -> Tuple[str, float]:
    """Classify question intent using the trained ML model (with keyword fallback)."""
    if _USE_ML:
        return _ml_classify(question)
    # Hard fallback — should only trigger if joblib/sklearn not available
    q = question.lower()
    pairs = [
        ("WHY_UNHEALTHY",  ["unhealthy", "degraded", "wrong", "failing", "health"]),
        ("WHY_ANOMALY",    ["anomaly", "fault", "detect", "root cause"]),
        ("RUL_STATUS",     ["rul", "remaining", "life", "cycles", "prognostic"]),
        ("MISSION_RISK",   ["mission", "safe to fly", "sortie", "abort"]),
        ("RPM_ADVICE",     ["rpm", "throttle", "derate", "reduce"]),
        ("MAINTENANCE",    ["inspect", "maintenance", "service", "repair"]),
        ("RECOMMENDATION", ["recommend", "suggest", "advise", "should"]),
        ("SENSOR_STATUS",  ["sensor", "integrity", "channel", "reading"]),
        ("THERMAL",        ["cht", "egt", "temperature", "thermal", "hot"]),
        ("OIL",            ["oil", "lubrication", "psi"]),
        ("VIBRATION",      ["vibration", "shake", "bearing", "mechanical"]),
        ("GENERAL_STATUS", ["status", "overview", "summary"]),
    ]
    for intent, kws in pairs:
        if any(kw in q for kw in kws):
            return intent, 0.6
    return "GENERAL_STATUS", 0.4


def _fmt_pct(v: float) -> str:  return f"{v:.0f}%"
def _fmt_temp(v: float) -> str: return f"{v:.1f}°F"
def _fmt_rul(v: float) -> str:  return f"{v:.0f} cycles"


# ---------------------------------------------------------------------------
# Answer builders — each returns (answer_str, follow_ups_list)
# ---------------------------------------------------------------------------

def _ans_why_unhealthy(state):
    health = state.get("health", {})
    hi = health.get("health_index", 0)
    condition = health.get("condition", "UNKNOWN")
    sub = health.get("sub_scores", {})
    rul = state.get("predicted_rul", 0)
    rul_lo = state.get("rul_ci_lower", 0)
    rul_hi = state.get("rul_ci_upper", 0)
    cht = state.get("cht", 0)
    egt = state.get("egt", 0)
    oil = state.get("oil_pressure", 0)
    vib = state.get("vibration", 0)
    fault_events = state.get("fault_events", [])
    fault_names = [f.get("name", "").replace("_", " ") for f in fault_events]
    fault_count = len(fault_events)
    xai = state.get("xai", {})
    top_driver = xai.get("top_driver", "UNKNOWN")
    follow_ups = [
        "What is the top driver for the current anomaly?",
        "What maintenance action is recommended right now?",
        "Can this engine complete the planned mission safely?",
    ]
    if hi >= 80:
        return (
            f"The engine is currently in {condition} condition with a Health Index of {hi:.0f}/100. "
            f"All subsystems are operating within acceptable bounds. "
            f"Predicted RUL is {_fmt_rul(rul)} (95% CI: {_fmt_rul(rul_lo)}\u2013{_fmt_rul(rul_hi)}).",
            ["What is the predicted RUL?", "Can this engine complete the planned mission safely?"]
        )
    reasons = []
    if sub.get("thermal", 100) < 70:
        reasons.append(f"thermal subsystem degradation (CHT={_fmt_temp(cht)}, EGT={_fmt_temp(egt)})")
    if sub.get("lubrication", 100) < 70:
        reasons.append(f"lubrication system concern (Oil={oil:.1f} PSI)")
    if sub.get("mechanical", 100) < 70:
        reasons.append(f"elevated mechanical vibration ({vib:.3f}g RMS)")
    if fault_count > 0:
        reasons.append(f"{fault_count} active fault code(s): {', '.join(fault_names[:3])}")
    if not reasons:
        reasons.append(f"RUL reduction to {_fmt_rul(rul)} cycles")
    text = (
        f"The engine Health Index is {hi:.0f}/100 ({condition}), degraded by: "
        + "; ".join(reasons)
        + f". The primary contributing subsystem is {top_driver.replace('_',' ').title()}."
    )
    return text, follow_ups


def _ans_why_anomaly(state):
    fault_events = state.get("fault_events", [])
    xai = state.get("xai", {})
    twin = state.get("twin_consistency", {})
    attributions = xai.get("attributions", [])
    follow_ups = [
        "What maintenance action is recommended right now?",
        "What is the engine health index?",
        "What are the sensor integrity scores?",
    ]
    if not fault_events and not xai.get("is_anomaly"):
        return (
            "No anomalies are currently detected. The engine is operating within the "
            "3-sigma multivariate learned normal operational envelope.",
            ["What is the predicted RUL?", "What is the current engine health status?"]
        )
    response = "The anomaly detection system has identified the following:\n"
    if fault_events:
        for f in fault_events[:3]:
            response += f"  \u2022 {f['name'].replace('_',' ').title()} [{f['severity']}]\n"
    if attributions:
        response += "\nRoot cause attribution (ranked by contribution):\n"
        for a in attributions[:4]:
            response += (
                f"  {a['label'].title()}: {a['attribution']:.1f}% \u2014 "
                f"value={a['value']}{a['unit']}, nominal={a['nominal']}{a['unit']}\n"
            )
    if twin:
        response += f"\nTwin Consistency: Case {twin.get('case','?')} \u2014 {twin.get('case_label','')}"
    return response.strip(), follow_ups


def _ans_rul_status(state):
    rul = state.get("predicted_rul", 0)
    rul_lo = state.get("rul_ci_lower", 0)
    rul_hi = state.get("rul_ci_upper", 0)
    true_rul = state.get("true_rul", 0)
    buf_pct = state.get("buffer_pct", 0)
    follow_ups = [
        "Can this engine complete the planned mission safely?",
        "What maintenance action is recommended right now?",
        "Why is the engine health degraded?",
    ]
    if rul <= 0:
        return (
            f"RUL prediction is warming up. The LSTM model requires 50 telemetry cycles to produce "
            f"a stable prediction. Current sequence buffer: {buf_pct:.0f}% full.",
            ["What is the current engine health status?"]
        )
    urgency = ""
    if rul < 20:
        urgency = " \u26a0\ufe0f CRITICAL \u2014 immediate overhaul required."
    elif rul < 50:
        urgency = " \u26a0\ufe0f WARNING \u2014 plan maintenance within the next few flights."
    elif rul < 100:
        urgency = " Plan a 50-hour inspection."
    text = (
        f"The Deep LSTM prognostics model predicts {_fmt_rul(rul)} of remaining service life.{urgency}\n"
        f"95% confidence interval: {_fmt_rul(rul_lo)} to {_fmt_rul(rul_hi)}.\n"
        f"True reference RUL (from dataset): {_fmt_rul(true_rul)}."
    )
    return text, follow_ups


def _ans_mission_risk(state):
    mission = state.get("mission_risk", {})
    follow_ups = [
        "What maintenance action is recommended right now?",
        "What is the predicted RUL?",
        "What happens to CHT if I derate RPM by 200?",
    ]
    if not mission:
        return (
            "Mission risk assessment is not yet available. Ensure telemetry is flowing and RUL has been predicted.",
            ["What is the current engine health status?"]
        )
    prob = mission.get("mission_completion_probability", 0)
    risk = mission.get("risk_level", "UNKNOWN")
    safe_h = mission.get("safe_operating_time_h", 0)
    req_h = mission.get("required_mission_duration_h", 4.5)
    at_risk = mission.get("mission_at_risk", False)
    if at_risk:
        text = (
            f"Mission completion probability is {_fmt_pct(prob)} \u2014 risk level: {risk}.\n"
            f"Predicted safe operating time: {safe_h:.1f}h vs required {req_h:.1f}h.\n"
            f"The mission is AT RISK. {mission.get('risk_narrative', '')}"
        )
    else:
        text = (
            f"Mission completion probability is {_fmt_pct(prob)} \u2014 risk level: {risk}.\n"
            f"Estimated safe operating time: {safe_h:.1f}h. Mission is within acceptable risk bounds."
        )
    return text, follow_ups


def _ans_rpm_advice(state):
    rpm = state.get("rpm", 0)
    cht = state.get("cht", 0)
    egt = state.get("egt", 0)
    mission = state.get("mission_risk", {})
    follow_ups = [
        "What happens to CHT if I derate RPM by 200?",
        "Can this engine complete the planned mission safely?",
        "What is the predicted RUL?",
    ]
    if not mission:
        return (
            f"Reducing RPM reduces thermal load on cylinders and bearings. "
            f"Current RPM is {rpm:.0f}. At nominal cruise (1400 RPM), thermal load is minimised. "
            "Use the What-If tab to simulate a specific RPM reduction.",
            follow_ups
        )
    cur_prob = mission.get("mission_completion_probability", 0)
    text = (
        f"At current RPM of {rpm:.0f}, CHT={_fmt_temp(cht)} and EGT={_fmt_temp(egt)}.\n"
        f"Reducing RPM lowers thermal load (CHT scales with RPM^1.3), which extends predicted RUL.\n"
        f"Current mission completion probability: {_fmt_pct(cur_prob)}.\n"
        "Use the What-If Simulation tab to model a specific RPM reduction and see the predicted effect on RUL and health."
    )
    return text, follow_ups


def _ans_maintenance(state):
    prescriptive = state.get("prescriptive", [])
    follow_ups = [
        "Why is the engine health degraded?",
        "Can this engine complete the planned mission safely?",
        "What is the predicted RUL?",
    ]
    if prescriptive:
        top = prescriptive[0]
        text = (
            f"Top maintenance advisory [{top['severity']}]:\n"
            f"{top['action']}\n\n"
            f"Operational restriction: {top.get('operational','')}\n"
            f"Required maintenance: {top.get('maintenance','')}\n"
            f"Expected benefit: {top.get('expected_benefit','')}"
        )
    else:
        text = "No active maintenance advisories. Engine is within airworthiness limits."
    return text, follow_ups


def _ans_recommendation(state):
    prescriptive = state.get("prescriptive", [])
    rul = state.get("predicted_rul", 0)
    mission = state.get("mission_risk", {})
    follow_ups = [
        "Why is the engine health degraded?",
        "What is the predicted RUL?",
        "Can this engine complete the planned mission safely?",
    ]
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
        text = (
            f"The recommendation is grounded in: {reason}.\n\n"
            f"Recommendation: {top['action']}\n"
            f"Expected outcome: {top.get('expected_benefit','')}"
        )
    else:
        text = "No active recommendations. System is nominal."
    return text, follow_ups


def _ans_sensor_status(state):
    sensors = state.get("sensor_integrity", {})
    follow_ups = [
        "Why is the engine health degraded?",
        "What is the current engine health status?",
        "What is the top driver for the current anomaly?",
    ]
    if not sensors:
        return "Sensor integrity data is not yet available.", follow_ups
    score = sensors.get("integrity_score", 100)
    suspects = sensors.get("suspect_channels", [])
    if not suspects:
        return f"All sensor channels are healthy. Overall sensor integrity score: {score:.1f}%.", follow_ups
    resp = f"Sensor integrity score: {score:.1f}%.\n\nSuspect channels:\n"
    for s in suspects[:4]:
        resp += f"  \u2022 {s['channel'].upper()}: {s['confidence']:.0f}% confidence \u2014 {', '.join(s['issues'][:2])}\n"
    return resp.strip(), follow_ups


def _ans_thermal(state):
    cht = state.get("cht", 0)
    egt = state.get("egt", 0)
    health = state.get("health", {})
    sub = health.get("sub_scores", {})
    thermal_score = sub.get("thermal", 100)
    follow_ups = [
        "What happens to CHT if I derate RPM by 200?",
        "Why is the engine health degraded?",
        "What maintenance action is recommended right now?",
    ]
    if cht > 420:
        status = "CRITICAL \u2014 CHT exceeds TBO limit"
    elif cht > 400:
        status = "WARNING \u2014 CHT approaching limit"
    elif cht > 380:
        status = "ELEVATED \u2014 monitor closely"
    else:
        status = "NORMAL"
    text = (
        f"Thermal Status: {status}\n"
        f"  Cylinder Head Temperature (CHT): {_fmt_temp(cht)}\n"
        f"  Exhaust Gas Temperature (EGT):   {_fmt_temp(egt)}\n"
        f"  Thermal subsystem health score:  {thermal_score:.0f}/100\n\n"
        f"CHT above 400\u00b0F accelerates valve seat wear and increases thermal fatigue crack risk. "
        f"EGT provides a window into combustion efficiency \u2014 deviation beyond \u00b150\u00b0F from nominal suggests mixture or ignition issues."
    )
    return text, follow_ups


def _ans_oil(state):
    oil = state.get("oil_pressure", 0)
    health = state.get("health", {})
    sub = health.get("sub_scores", {})
    lub_score = sub.get("lubrication", 100)
    follow_ups = [
        "What maintenance action is recommended right now?",
        "Why is the engine health degraded?",
        "What is the predicted RUL?",
    ]
    if oil < 45:
        oil_status = "\u26a0\ufe0f CRITICAL LOW \u2014 risk of bearing failure"
    elif oil < 52:
        oil_status = "\u26a0\ufe0f LOW \u2014 monitor closely"
    elif oil < 60:
        oil_status = "NORMAL"
    else:
        oil_status = "HIGH \u2014 check for blockage"
    text = (
        f"Oil Pressure: {oil:.1f} PSI \u2014 {oil_status}\n"
        f"Lubrication subsystem health score: {lub_score:.0f}/100\n\n"
        f"Nominal oil pressure range is 52\u201360 PSI at cruise power. "
        f"Sustained pressure below 45 PSI risks crankshaft bearing damage. "
        f"Inspect oil filter and pump on next maintenance cycle."
    )
    return text, follow_ups


def _ans_vibration(state):
    vib = state.get("vibration", 0)
    health = state.get("health", {})
    sub = health.get("sub_scores", {})
    mech_score = sub.get("mechanical", 100)
    follow_ups = [
        "What maintenance action is recommended right now?",
        "What is the top driver for the current anomaly?",
        "Why is the engine health degraded?",
    ]
    if vib > 3.0:
        vib_status = "\u26a0\ufe0f CRITICAL \u2014 structural integrity risk"
    elif vib > 2.5:
        vib_status = "\u26a0\ufe0f HIGH \u2014 inspect immediately"
    elif vib > 1.5:
        vib_status = "ELEVATED \u2014 monitor trend"
    else:
        vib_status = "NORMAL"
    text = (
        f"Vibration (RMS): {vib:.3f}g \u2014 {vib_status}\n"
        f"Mechanical subsystem health score: {mech_score:.0f}/100\n\n"
        f"Elevated vibration above 1.5g suggests propeller imbalance, bearing wear, or loose mounts. "
        f"Above 2.5g, risk of structural fatigue in engine mounts and airframe attachments increases significantly. "
        f"Inspect spinner and propeller balance at next opportunity."
    )
    return text, follow_ups


def _ans_general(state):
    health = state.get("health", {})
    hi = health.get("health_index", 0)
    condition = health.get("condition", "UNKNOWN")
    rul = state.get("predicted_rul", 0)
    rul_lo = state.get("rul_ci_lower", 0)
    rul_hi = state.get("rul_ci_upper", 0)
    fault_events = state.get("fault_events", [])
    fault_names = [f.get("name", "").replace("_", " ") for f in fault_events]
    twin = state.get("twin_consistency", {})
    mission = state.get("mission_risk", {})
    sensors = state.get("sensor_integrity", {})
    integrity = sensors.get("integrity_score", 100.0)
    rpm = state.get("rpm", 0)
    cht = state.get("cht", 0)
    egt = state.get("egt", 0)
    oil = state.get("oil_pressure", 0)
    faults_str = ", ".join(fault_names) if fault_names else "none"
    twin_str = twin.get("case_label", "NORMAL") if twin else "awaiting data"
    text = (
        f"UAV Digital Twin Status Summary:\n"
        f"  Engine Health: {hi:.0f}/100 ({condition})\n"
        f"  Predicted RUL: {_fmt_rul(rul)} (CI: {_fmt_rul(rul_lo)}\u2013{_fmt_rul(rul_hi)})\n"
        f"  Active Faults: {faults_str}\n"
        f"  Twin Consistency: {twin_str}\n"
        f"  Mission Risk: {mission.get('risk_level','UNKNOWN') if mission else 'awaiting data'} "
        f"({mission.get('mission_completion_probability',0):.0f}% completion probability)\n"
        f"  Sensor Integrity: {integrity:.1f}%\n"
        f"  RPM: {rpm:.0f} | CHT: {_fmt_temp(cht)} | EGT: {_fmt_temp(egt)} | Oil: {oil:.1f} PSI"
    )
    follow_ups = [
        "Why is the engine health degraded?",
        "What is the predicted RUL?",
        "Can this engine complete the planned mission safely?",
    ]
    return text, follow_ups



# ---------------------------------------------------------------------------
# Greeting / small-talk handler (added for GREETING intent)
# ---------------------------------------------------------------------------

def _ans_greeting(state: Dict[str, Any]):
    health = state.get("health", {})
    hi_val = health.get("health_index", 0)
    condition = health.get("condition", "UNKNOWN")
    rul = state.get("predicted_rul", 0)
    follow_ups = [
        "What is the current engine health status?",
        "What is the predicted RUL?",
        "Can this engine complete the planned mission safely?",
    ]
    if hi_val > 0:
        text = (
            f"Hello, Commander. Ready to assist. \u2014 Quick snapshot: "
            f"Engine is {condition} (HI {hi_val:.0f}/100), "
            f"RUL {rul:.0f} cycles remaining. "
            f"Ask me anything about health, faults, RUL, thermal, or mission risk."
        )
    else:
        text = (
            "Hello, Commander. I am your Digital Twin AI Mission Engineer. "
            "I have direct access to live propulsion telemetry, LSTM prognostics, "
            "and anomaly detection. Ask me anything."
        )
    return text, follow_ups

# ---------------------------------------------------------------------------
# Dispatch table
# ---------------------------------------------------------------------------

_DISPATCH = {
    "GREETING":       _ans_greeting,
    "WHY_UNHEALTHY":  _ans_why_unhealthy,
    "WHY_ANOMALY":    _ans_why_anomaly,
    "RUL_STATUS":     _ans_rul_status,
    "MISSION_RISK":   _ans_mission_risk,
    "RPM_ADVICE":     _ans_rpm_advice,
    "MAINTENANCE":    _ans_maintenance,
    "RECOMMENDATION": _ans_recommendation,
    "SENSOR_STATUS":  _ans_sensor_status,
    "THERMAL":        _ans_thermal,
    "OIL":            _ans_oil,
    "VIBRATION":      _ans_vibration,
    "GENERAL_STATUS": _ans_general,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def answer(question: str, state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a grounded natural-language answer to an operator question.

    Parameters
    ----------
    question : the operator's question in natural language
    state    : full Digital Twin state dict from the latest WebSocket payload

    Returns a dict with:
      answer     : str   -- plain-text response
      category   : str   -- intent label for badge rendering on the frontend
      confidence : float -- 0-1 confidence in intent classification
      follow_ups : list  -- 2-3 contextual next questions
    """
    intent, confidence = _classify_question(question)
    # Low-confidence guard: if model is unsure and it's not a greeting,
    # fall back to general status rather than risk misclassification.
    if confidence < 0.25 and intent not in ("GREETING", "GENERAL_STATUS"):
        intent = "GENERAL_STATUS"
        confidence = 0.25

    builder = _DISPATCH.get(intent, _ans_general)
    ans_text, follow_ups = builder(state)
    return {
        "answer":     ans_text,
        "category":   intent,
        "confidence": confidence,
        "follow_ups": follow_ups,
    }

