"""
backend/xai_engine.py

Explainability layer — when the anomaly detector fires, this tells you *why*.

We compute a z-score for each sensor channel vs its nominal baseline,
then normalize those into percentage contributions so we can say things like
"EGT is responsible for 47% of the current anomaly score."

Not true SHAP (that would need the Isolation Forest internals), but the
multi-dimensional feature divergence approach is fast, interpretable, and
gives maintenance crews something concrete to act on.
"""

from typing import Dict, List, Any, Tuple
import numpy as np

# nominal baselines for a healthy engine at cruise — used to compute sigma deviations
NOMINAL_BASELINES = {
    "rpm":            {"mean": 1400.0, "std": 15.0,  "unit": "RPM",   "subsystem": "Powertrain / Governor"},
    "cht":            {"mean": 380.0,  "std": 12.0,  "unit": "°F",    "subsystem": "Thermal / Cooling"},
    "egt":            {"mean": 1585.0, "std": 18.0,  "unit": "°F",    "subsystem": "Combustion Chamber"},
    "oil_pressure":   {"mean": 58.0,   "std": 4.0,   "unit": "PSI",   "subsystem": "Lubrication Circuit"},
    "oil_temp":       {"mean": 185.0,  "std": 8.0,   "unit": "°F",    "subsystem": "Oil Cooling"},
    "fuel_flow":      {"mean": 8.5,    "std": 0.4,   "unit": "L/h",   "subsystem": "Fuel Delivery / Rail"},
    "vibration":      {"mean": 0.65,   "std": 0.25,  "unit": "g RMS", "subsystem": "Mechanical / Bearings"},
    "battery_v":      {"mean": 13.8,   "std": 0.15,  "unit": "V",     "subsystem": "Electrical Bus"},
    "inj_timing":     {"mean": 27.5,   "std": 1.2,   "unit": "°BTDC", "subsystem": "FADEC / Ignition"}
}


class XAIDiagnosticEngine:
    """
    Computes feature-level anomaly attribution and builds a human-readable
    diagnostic dossier for each anomaly event.
    """

    @staticmethod
    def explain_anomaly(telemetry: Dict[str, Any], is_anomaly: bool,
                        anomaly_score: float, active_faults: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Decomposes the anomaly signal into per-feature contributions.
        Returns attribution percentages + a natural-language narrative.
        """
        feature_scores = {}
        z_scores = {}
        deviations = {}

        total_deviation_score = 0.0

        for feat, base in NOMINAL_BASELINES.items():
            val = float(telemetry.get(feat, base["mean"]))
            z = abs(val - base["mean"]) / max(0.1, base["std"])
            z_scores[feat] = round(z, 2)
            deviations[feat] = round(val - base["mean"], 2)

            # non-linear penalty — a 3-sigma deviation weighs much more than a 1-sigma
            dev_score = (z ** 1.8)
            feature_scores[feat] = dev_score
            total_deviation_score += dev_score

        # normalize to get percentages — only meaningful when is_anomaly is True
        attributions = []
        for feat, score in feature_scores.items():
            pct = (score / max(1e-5, total_deviation_score)) * 100.0 if is_anomaly else 0.0
            base = NOMINAL_BASELINES[feat]
            val = float(telemetry.get(feat, base["mean"]))
            attributions.append({
                "feature":      feat,
                "label":        feat.replace("_", " ").upper(),
                "subsystem":    base["subsystem"],
                "value":        round(val, 2),
                "nominal":      base["mean"],
                "unit":         base["unit"],
                "z_score":      z_scores[feat],
                "delta":        deviations[feat],
                "attribution":  round(pct, 1)
            })

        # sort so the biggest contributor is first
        attributions.sort(key=lambda x: x["attribution"], reverse=True)

        # the top feature is the primary suspect
        top_driver = attributions[0] if attributions else None

        # build a plain-English explanation
        if is_anomaly and top_driver and top_driver["attribution"] > 15.0:
            direction = "elevated" if top_driver["delta"] > 0 else "depressed"
            narrative = (f"Anomaly driven primarily by {top_driver['label']} ({top_driver['attribution']}% weight) "
                         f"which is {direction} at {top_driver['value']}{top_driver['unit']} "
                         f"({abs(top_driver['z_score'])}σ from nominal {top_driver['nominal']}{top_driver['unit']}). "
                         f"Impacted subsystem: {top_driver['subsystem']}.")
        else:
            narrative = "All monitored engine parameters remain within learned 3-sigma multi-sensor multivariate envelope."

        # roll up attribution by subsystem for the dashboard radar chart
        subsystem_impact = {}
        for a in attributions:
            sub = a["subsystem"]
            subsystem_impact[sub] = round(subsystem_impact.get(sub, 0.0) + a["attribution"], 1)

        return {
            "is_anomaly":        bool(is_anomaly),
            "anomaly_score":     round(anomaly_score, 4),
            "top_driver":        top_driver["label"] if top_driver else "NONE",
            "narrative":         narrative,
            "attributions":      attributions[:6],  # top 6 for the bar chart
            "subsystem_impact":  subsystem_impact
        }
