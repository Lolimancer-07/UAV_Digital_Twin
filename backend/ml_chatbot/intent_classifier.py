"""
backend/ml_chatbot/intent_classifier.py

Loads the trained TF-IDF + Logistic Regression intent classifier and exposes
a single classify() function used by ai_engineer.py.

The model is loaded once at module import (singleton) so there is no
per-query overhead after the first call.

Falls back to keyword-based scoring if the model file is absent
(graceful degradation during first-run before training).
"""

import os
import sys
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "intent_clf.joblib")

# ── Singleton model instance ─────────────────────────────────────────────────
_pipeline = None
_model_loaded = False


def _load_model():
    global _pipeline, _model_loaded
    if _model_loaded:
        return
    if not os.path.exists(MODEL_PATH):
        logger.warning("[ML Chatbot] Model file not found at %s — using fallback classifier", MODEL_PATH)
        _pipeline = None
        _model_loaded = True
        return
    try:
        import joblib
        _pipeline = joblib.load(MODEL_PATH)
        logger.info("[ML Chatbot] Model loaded from %s", MODEL_PATH)
    except Exception as e:
        logger.error("[ML Chatbot] Failed to load model: %s", e)
        _pipeline = None
    _model_loaded = True


# ── Fallback keyword scorer (used when model is absent) ──────────────────────
_FALLBACK_RULES = [
    ("WHY_UNHEALTHY",  ["unhealthy", "degraded", "bad health", "failing", "health issue", "what's wrong", "wrong with", "health drop"]),
    ("WHY_ANOMALY",    ["anomaly", "anomal", "fault", "detect", "isolation", "outlier", "root cause", "xai", "attribution"]),
    ("RUL_STATUS",     ["rul", "remaining useful", "remaining life", "how long", "cycles left", "prognostic", "time before", "time to failure", "overhaul", "tbo"]),
    ("MISSION_RISK",   ["mission", "complete mission", "fly safely", "safe to fly", "sortie", "go no-go", "rtb", "abort"]),
    ("RPM_ADVICE",     ["rpm", "throttle", "derate", "reduce rpm", "engine speed", "rotational speed", "throttle back"]),
    ("MAINTENANCE",    ["inspect", "maintenance", "fix", "repair", "service", "overhaul", "interval", "check", "50-hour", "100-hour"]),
    ("RECOMMENDATION", ["recommend", "advice", "advise", "suggest", "should i", "what should", "best action", "next step"]),
    ("SENSOR_STATUS",  ["sensor", "channel", "integrity", "data quality", "bad sensor", "reading valid", "drift"]),
    ("THERMAL",        ["cht", "egt", "cylinder head", "exhaust gas", "temperature", "thermal", "heat", "overheat", "hot", "temp"]),
    ("OIL",            ["oil", "lubrication", "lubricant", "oil pressure", "psi", "lube"]),
    ("VIBRATION",      ["vibration", "vib", "vibrate", "shake", "mechanical", "bearing", "balance", "propeller"]),
    ("GENERAL_STATUS", ["status", "overview", "summary", "how is", "overall", "system", "current state", "report"]),
]

def _fallback_classify(question: str) -> Tuple[str, float]:
    q = question.lower()
    scores = {}
    for intent, kws in _FALLBACK_RULES:
        hits = sum(1 for kw in kws if kw in q)
        if hits:
            scores[intent] = hits
    if not scores:
        return "GENERAL_STATUS", 0.4
    best = max(scores, key=lambda k: scores[k])
    return best, min(scores[best] / 3.0, 0.75)


# ── Public API ───────────────────────────────────────────────────────────────

def classify(question: str) -> Tuple[str, float]:
    """
    Classify a natural-language question into one of 12 UAV engineer intents.

    Returns
    -------
    (intent_label, confidence)
        intent_label : str   — e.g. "RUL_STATUS", "THERMAL", "WHY_ANOMALY"
        confidence   : float — probability in [0, 1]

    Uses the trained TF-IDF + Logistic Regression model when available.
    Falls back to keyword scoring when the model file is absent.
    """
    _load_model()

    if _pipeline is None:
        return _fallback_classify(question)

    try:
        intent = _pipeline.predict([question])[0]
        proba = _pipeline.predict_proba([question])[0]
        classes = _pipeline.classes_
        confidence = float(proba[list(classes).index(intent)])
        return intent, round(confidence, 3)
    except Exception as e:
        logger.error("[ML Chatbot] Inference error: %s", e)
        return _fallback_classify(question)


def top_k(question: str, k: int = 3):
    """
    Return top-k intents with probabilities.
    Useful for debugging and future ensemble use.
    """
    _load_model()
    if _pipeline is None:
        intent, conf = _fallback_classify(question)
        return [(intent, conf)]
    try:
        proba = _pipeline.predict_proba([question])[0]
        classes = list(_pipeline.classes_)
        ranked = sorted(zip(classes, proba), key=lambda x: x[1], reverse=True)
        return [(c, round(float(p), 3)) for c, p in ranked[:k]]
    except Exception:
        intent, conf = _fallback_classify(question)
        return [(intent, conf)]


def is_model_available() -> bool:
    """Returns True if the trained model file exists."""
    return os.path.exists(MODEL_PATH)
