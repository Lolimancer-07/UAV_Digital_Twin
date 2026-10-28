"""
backend/ai_engineer.py

Answers operator questions in plain English using the Agent 37 cloud agent
(Hermes), with the live Digital Twin state injected as context on every turn.

No local LLM — all inference runs on the Agent 37 sandboxed instance:
  https://c1iy0ok07a.agent37.app/v1/responses

Session continuity is maintained per-process so follow-up questions carry
conversation history automatically.

Configuration (env vars override the compiled-in defaults):
  AGENT37_API_KEY      – Agent 37 secret key  (sk_live_... or AQ....)
  AGENT37_INSTANCE_ID  – 10-char instance id  (c1iy0ok07a)
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import requests as _requests

logger = logging.getLogger(__name__)

# ── Agent 37 connection ───────────────────────────────────────────────────────
AGENT37_API_KEY: str = os.environ.get("AGENT37_API_KEY", "")
AGENT37_INSTANCE_ID: str = os.environ.get("AGENT37_INSTANCE_ID", "c1iy0ok07a")
_BASE_URL: str = f"https://{AGENT37_INSTANCE_ID}.agent37.app"
_HEADERS: Dict[str, str] = {
    "X-Agent37-Key": AGENT37_API_KEY,
    "Content-Type": "application/json",
}

# Session ID is preserved across turns within the same backend process so
# the agent carries conversation history automatically.
_session_id: Optional[str] = None

logger.info(
    "[Agent37] Configured — instance=%s  session=new",
    AGENT37_INSTANCE_ID,
)

# ── System / persona prompt ───────────────────────────────────────────────────
_PERSONA = (
    "You are Agent 37, the AI Mission Engineer embedded in a UAV (Unmanned Aerial Vehicle) "
    "Digital Twin system, powered by the Agent 37 Hermes cloud platform. You have direct access to live propulsion telemetry, "
    "LSTM prognostics, anomaly detection, mission risk data, and prescriptive "
    "maintenance advisories.\n\n"
    "Your role as Agent 37: answer operator questions concisely and precisely, grounded in "
    "the telemetry snapshot provided. Do not speculate beyond the data.\n\n"
    "IMPORTANT - respond ONLY with a single valid JSON object, no other text:\n"
    "{\n"
    '  "answer": "<detailed plain-English answer grounded in the telemetry>",\n'
    '  "category": "<one of: WHY_UNHEALTHY | WHY_ANOMALY | RUL_STATUS | '
    "MISSION_RISK | RPM_ADVICE | MAINTENANCE | RECOMMENDATION | "
    'SENSOR_STATUS | THERMAL | OIL | VIBRATION | GENERAL_STATUS | GREETING>",\n'
    '  "follow_ups": ["<follow-up 1>", "<follow-up 2>", "<follow-up 3>"]\n'
    "}\n\n"
    "Rules:\n"
    "- answer: reference the actual numeric values from the telemetry snapshot.\n"
    "- category: pick the intent that best matches the operator's question.\n"
    "- follow_ups: 2-3 questions the operator is most likely to ask next.\n"
    "- No markdown, no prose outside the JSON object."
)

# ── Default follow-ups (fallback when agent returns plain text) ───────────────
_FOLLOWUPS: Dict[str, List[str]] = {
    "WHY_UNHEALTHY": [
        "What maintenance action is recommended right now?",
        "What is the predicted RUL?",
        "Can this engine complete the planned mission safely?",
    ],
    "WHY_ANOMALY": [
        "What maintenance action is recommended right now?",
        "What is the engine health index?",
        "What are the sensor integrity scores?",
    ],
    "RUL_STATUS": [
        "Can this engine complete the planned mission safely?",
        "What maintenance action is recommended right now?",
        "Why is the engine health degraded?",
    ],
    "MISSION_RISK": [
        "What maintenance action is recommended right now?",
        "What is the predicted RUL?",
        "What happens to CHT if I derate RPM by 200?",
    ],
    "RPM_ADVICE": [
        "What happens to CHT if I derate RPM by 200?",
        "Can this engine complete the planned mission safely?",
        "What is the predicted RUL?",
    ],
    "MAINTENANCE": [
        "Why is the engine health degraded?",
        "Can this engine complete the planned mission safely?",
        "What is the predicted RUL?",
    ],
    "RECOMMENDATION": [
        "Why is the engine health degraded?",
        "What is the predicted RUL?",
        "Can this engine complete the planned mission safely?",
    ],
    "SENSOR_STATUS": [
        "Why is the engine health degraded?",
        "What is the current engine health status?",
        "What is the top driver for the current anomaly?",
    ],
    "THERMAL": [
        "What happens to CHT if I derate RPM by 200?",
        "Why is the engine health degraded?",
        "What maintenance action is recommended right now?",
    ],
    "OIL": [
        "What maintenance action is recommended right now?",
        "Why is the engine health degraded?",
        "What is the predicted RUL?",
    ],
    "VIBRATION": [
        "What maintenance action is recommended right now?",
        "What is the top driver for the current anomaly?",
        "Why is the engine health degraded?",
    ],
    "GREETING": [
        "What is the current engine health status?",
        "What is the predicted RUL?",
        "Can this engine complete the planned mission safely?",
    ],
    "GENERAL_STATUS": [
        "Why is the engine health degraded?",
        "What is the predicted RUL?",
        "Can this engine complete the planned mission safely?",
    ],
}


# ── Telemetry state formatter ─────────────────────────────────────────────────

def _format_state(state: Dict[str, Any]) -> str:
    """
    Render the Digital Twin state dict as a compact, human-readable block
    that the Hermes agent can reason over.
    """
    health       = state.get("health", {})
    sub          = health.get("sub_scores", {})
    mission      = state.get("mission_risk", {})
    sensors      = state.get("sensor_integrity", {})
    xai          = state.get("xai", {})
    twin         = state.get("twin_consistency", {})
    prescriptive = state.get("prescriptive", [])
    fault_events = state.get("fault_events", [])

    lines = [
        "=== UAV DIGITAL TWIN - LIVE TELEMETRY SNAPSHOT ===",
        f"Health Index : {health.get('health_index', 0):.0f}/100   "
        f"Condition: {health.get('condition', 'UNKNOWN')}",
    ]

    if sub:
        lines.append(
            f"Sub-scores   - Thermal: {sub.get('thermal', 100):.0f}  "
            f"Lubrication: {sub.get('lubrication', 100):.0f}  "
            f"Mechanical: {sub.get('mechanical', 100):.0f}"
        )

    rul    = state.get("predicted_rul", 0)
    rul_lo = state.get("rul_ci_lower", 0)
    rul_hi = state.get("rul_ci_upper", 0)
    lines += [
        f"Predicted RUL: {rul:.0f} cycles  "
        f"(95% CI: {rul_lo:.0f}-{rul_hi:.0f})  "
        f"True RUL: {state.get('true_rul', 0):.0f} cycles",
        f"RPM: {state.get('rpm', 0):.0f}",
        f"CHT: {state.get('cht', 0):.1f}F   "
        f"EGT: {state.get('egt', 0):.1f}F   "
        f"Oil: {state.get('oil_pressure', 0):.1f} PSI   "
        f"Vibration: {state.get('vibration', 0):.3f}g RMS",
    ]

    if mission:
        lines.append(
            f"Mission Risk : {mission.get('risk_level', 'UNKNOWN')}   "
            f"Completion: {mission.get('mission_completion_probability', 0):.0f}%   "
            f"Safe time: {mission.get('safe_operating_time_h', 0):.1f}h"
        )

    if sensors:
        suspect = [s["channel"] for s in sensors.get("suspect_channels", [])]
        lines.append(
            f"Sensor Integrity: {sensors.get('integrity_score', 100):.1f}%   "
            f"Suspect: {suspect if suspect else 'none'}"
        )

    if xai:
        attrs = xai.get("attributions", [])
        lines.append(
            f"Anomaly: {xai.get('is_anomaly', False)}   "
            f"Top driver: {xai.get('top_driver', 'N/A')}"
        )
        if attrs:
            top3 = ", ".join(
                f"{a['label']}={a['attribution']:.1f}% "
                f"(val={a['value']}{a['unit']}, nom={a['nominal']}{a['unit']})"
                for a in attrs[:3]
            )
            lines.append(f"Attributions: {top3}")

    if twin:
        lines.append(
            f"Twin Consistency: Case {twin.get('case', '?')} - "
            f"{twin.get('case_label', '')}"
        )

    if fault_events:
        faults_str = ", ".join(
            f"{f['name'].replace('_', ' ')} [{f['severity']}]"
            for f in fault_events[:5]
        )
        lines.append(f"Active Faults: {faults_str}")

    if prescriptive:
        top = prescriptive[0]
        lines.append(
            f"Top Advisory [{top['severity']}]: {top['action'][:160]}"
        )

    lines.append("===================================================")
    return "\n".join(lines)


# ── Agent 37 REST call ────────────────────────────────────────────────────────

def _call_agent37(message: str) -> str:
    """
    POST a turn to the Agent 37 Hermes instance.

    Maintains ``_session_id`` across calls so the agent carries conversation
    history (follow-up questions work naturally without resending transcripts).

    Returns the raw ``output_text`` string from the response.
    Raises on network error, non-200 HTTP status, or a failed agent turn.
    """
    global _session_id

    body: Dict[str, Any] = {
        "input":  message,
        "stream": False,
    }
    if _session_id:
        body["session_id"] = _session_id

    resp = _requests.post(
        f"{_BASE_URL}/v1/responses",
        headers=_HEADERS,
        json=body,
        timeout=60,   # Agent 37 long-polls; 60 s is conservative
    )
    resp.raise_for_status()
    data: Dict[str, Any] = resp.json()

    # Persist the session for subsequent turns
    new_sid = data.get("session_id")
    if new_sid and new_sid != _session_id:
        _session_id = new_sid
        logger.info("[Agent37] New session started: %s", _session_id)

    status = data.get("status", "unknown")
    if status == "failed":
        err = data.get("error") or {}
        raise RuntimeError(
            f"Agent37 turn failed - {err.get('code', '?')}: "
            f"{err.get('message', 'unknown error')}"
        )

    output_text: str = (data.get("output_text") or "").strip()
    usage = data.get("usage") or {}
    logger.debug(
        "[Agent37] status=%s  tokens_in=%s  tokens_out=%s  cost=$%.4f",
        status,
        usage.get("input_tokens", "?"),
        usage.get("output_tokens", "?"),
        usage.get("cost_usd") or 0.0,
    )
    return output_text


# ── Response parser ───────────────────────────────────────────────────────────

def _parse_response(raw: str) -> Dict[str, Any]:
    """
    Parse the agent's JSON response into the canonical answer dict.

    Handles:
    - Clean JSON
    - JSON wrapped in ```json ... ``` markdown fences
    - Plain-text fallback (no JSON detected)
    """
    text = raw

    # Strip markdown code fences if present
    if "```" in text:
        parts = text.split("```")
        for part in parts[1::2]:          # every odd segment is inside fences
            candidate = part.strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Last resort: return raw text as the answer
    logger.warning("[Agent37] Could not parse JSON from response - using raw text")
    return {
        "answer":     text or "No response from the Agent 37 AI Engineer.",
        "category":   "GENERAL_STATUS",
        "follow_ups": _FOLLOWUPS["GENERAL_STATUS"],
    }


# ── Public API ────────────────────────────────────────────────────────────────

def answer(question: str, state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a grounded natural-language answer to an operator question using
    the Agent 37 Hermes cloud agent.

    Parameters
    ----------
    question : the operator's question in natural language
    state    : full Digital Twin state dict from the latest WebSocket payload

    Returns
    -------
    dict with:
      answer     : str   - plain-text response grounded in live telemetry
      category   : str   - intent label for badge rendering on the frontend
      confidence : float - 1.0 for Agent 37 responses, 0.0 on error
      follow_ups : list  - 2-3 contextual next questions
    """
    state_block = _format_state(state)
    full_prompt  = f"{_PERSONA}\n\n{state_block}\n\nOperator: {question}"

    try:
        raw      = _call_agent37(full_prompt)
        parsed   = _parse_response(raw)

        ans_text   = str(parsed.get("answer", raw))
        category   = str(parsed.get("category", "GENERAL_STATUS")).upper()
        follow_ups = parsed.get("follow_ups") or _FOLLOWUPS.get(
            category, _FOLLOWUPS["GENERAL_STATUS"]
        )

        # Validate category falls within known set
        if category not in _FOLLOWUPS:
            category = "GENERAL_STATUS"

        logger.info(
            "[Agent37] answered - category=%s  session=%s",
            category, _session_id,
        )

        return {
            "answer":     ans_text,
            "category":   category,
            "confidence": 1.0,
            "follow_ups": list(follow_ups)[:3],
        }

    except _requests.exceptions.Timeout:
        logger.error("[Agent37] Request timed out after 60 s")
        return {
            "answer": (
                "The Agent 37 AI Engineer did not respond in time. "
                "The instance may be waking from sleep - please retry in a moment."
            ),
            "category":   "GENERAL_STATUS",
            "confidence": 0.0,
            "follow_ups": _FOLLOWUPS["GENERAL_STATUS"],
        }

    except _requests.exceptions.RequestException as exc:
        logger.error("[Agent37] Network error: %s", exc)
        return {
            "answer": (
                f"Agent 37 is currently unreachable ({exc}). "
                "Check your network connection and instance status."
            ),
            "category":   "GENERAL_STATUS",
            "confidence": 0.0,
            "follow_ups": _FOLLOWUPS["GENERAL_STATUS"],
        }

    except Exception as exc:                     # noqa: BLE001
        logger.error("[Agent37] Unexpected error: %s", exc, exc_info=True)
        return {
            "answer": (
                f"An unexpected error occurred while consulting the AI Engineer: {exc}"
            ),
            "category":   "GENERAL_STATUS",
            "confidence": 0.0,
            "follow_ups": _FOLLOWUPS["GENERAL_STATUS"],
        }

