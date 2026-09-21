"""
backend/ml_chatbot/train_intent_clf.py

Trains a TF-IDF + Logistic Regression intent classifier on the UAV chatbot dataset.
Uses both word n-grams (1-3) and character n-grams (3-5) for robustness to
- Typos:         "vibation"  → still VIBRATION
- Abbreviations: "CHT ok?"   → still THERMAL
- Jargon:        "TBO due?"  → still RUL_STATUS
- Paraphrases:   "engine hot?" → still THERMAL

Saves the trained pipeline to backend/ml_chatbot/intent_clf.joblib

Run:
    python backend/ml_chatbot/train_intent_clf.py
"""

import os
import sys
import json
import joblib
import numpy as np

from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml_chatbot.intent_dataset import get_X_y, INTENT_LABELS

MODEL_PATH = os.path.join(os.path.dirname(__file__), "intent_clf.joblib")
REPORT_PATH = os.path.join(os.path.dirname(__file__), "training_report.json")


def build_pipeline() -> Pipeline:
    """
    Pipeline:
      FeatureUnion([
        TfidfVectorizer(word 1-3 grams) — captures phrases like "remaining useful life"
        TfidfVectorizer(char 3-5 grams)  — captures sub-word patterns, robust to typos
      ])
      →
      LogisticRegression(C=5, multi_class='multinomial', max_iter=500)
        — gives calibrated probability estimates natively (unlike SVM)
    """
    word_tfidf = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 3),
        min_df=1,
        max_df=0.95,
        sublinear_tf=True,
        strip_accents="unicode",
        lowercase=True,
    )
    char_tfidf = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=1,
        max_df=0.95,
        sublinear_tf=True,
        strip_accents="unicode",
        lowercase=True,
    )
    features = FeatureUnion([
        ("word_tfidf", word_tfidf),
        ("char_tfidf", char_tfidf),
    ])
    clf = LogisticRegression(
        C=5.0,
        solver="lbfgs",
        max_iter=500,
        class_weight="balanced",
    )
    return Pipeline([("features", features), ("clf", clf)])


def train():
    X, y = get_X_y()
    print(f"[ML Chatbot] Training on {len(X)} examples, {len(INTENT_LABELS)} intent classes")

    pipeline = build_pipeline()

    # ── Cross-validation ─────────────────────────────────────────────────
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="accuracy")
    print(f"[ML Chatbot] 5-fold CV accuracy: {cv_scores.mean()*100:.1f}% ± {cv_scores.std()*100:.1f}%")

    # ── Full training ─────────────────────────────────────────────────────
    pipeline.fit(X, y)
    train_acc = (np.array(pipeline.predict(X)) == np.array(y)).mean()
    print(f"[ML Chatbot] Training accuracy: {train_acc*100:.1f}%")

    # ── Per-class report ──────────────────────────────────────────────────
    y_pred = pipeline.predict(X)
    report_str = classification_report(y, y_pred, target_names=sorted(set(y)))
    print("\n" + report_str)

    # ── Save model ────────────────────────────────────────────────────────
    joblib.dump(pipeline, MODEL_PATH)
    print(f"[ML Chatbot] Model saved → {MODEL_PATH}")

    # ── Save report ───────────────────────────────────────────────────────
    report_dict = {
        "cv_accuracy_mean": round(float(cv_scores.mean()), 4),
        "cv_accuracy_std":  round(float(cv_scores.std()), 4),
        "train_accuracy":   round(float(train_acc), 4),
        "n_examples":       len(X),
        "n_classes":        len(INTENT_LABELS),
        "intent_labels":    INTENT_LABELS,
    }
    with open(REPORT_PATH, "w") as f:
        json.dump(report_dict, f, indent=2)
    print(f"[ML Chatbot] Report saved → {REPORT_PATH}")

    return pipeline, cv_scores.mean()


if __name__ == "__main__":
    train()
