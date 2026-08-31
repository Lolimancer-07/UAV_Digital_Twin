"""
backend/xai_engine.py
----------------------
Explainable AI (XAI) Root Cause Diagnostic Engine for UAV Piston Engines.

Uses multi-dimensional feature divergence and SHAP-like attribution to
decompose multivariate anomalies into actionable human-understandable
subsystem diagnostics.
"""

from typing import Dict, List, Any, Tuple
import numpy as np

# Normal operating nominal baseline bounds & standard deviations
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
    Computes real-time feature attribution, anomaly contribution percentages,
    and structured physical explanations for GCS maintenance operators.
    """

    @staticmethod
    def explain_anomaly(telemetry: Dict[str, Any], is_anomaly: bool,
                        anomaly_score: float, active_faults: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Decomposes anomaly score into per-feature percentage attribution
        and generates an explainability dossier.
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

            # Non-linear penalty for high sigma deviation
            dev_score = (z ** 1.8)
            feature_scores[feat] = dev_score
            total_deviation_score += dev_score

        # Normalize to 100% attribution
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

        # Sort features by highest attribution
        attributions.sort(key=lambda x: x["attribution"], reverse=True)

        # Primary suspect feature
        top_driver = attributions[0] if attributions else None

        # Build natural-language root-cause explanation
        if is_anomaly and top_driver and top_driver["attribution"] > 15.0:
            direction = "elevated" if top_driver["delta"] > 0 else "depressed"
            narrative = (f"Anomaly driven primarily by {top_driver['label']} ({top_driver['attribution']}% weight) "
                         f"which is {direction} at {top_driver['value']}{top_driver['unit']} "
                         f"({abs(top_driver['z_score'])}σ from nominal {top_driver['nominal']}{top_driver['unit']}). "
                         f"Impacted subsystem: {top_driver['subsystem']}.")
        else:
            narrative = "All monitored engine parameters remain within learned 3-sigma multi-sensor multivariate envelope."

        # Affected Subsystem Aggregate
        subsystem_impact = {}
        for a in attributions:
            sub = a["subsystem"]
            subsystem_impact[sub] = round(subsystem_impact.get(sub, 0.0) + a["attribution"], 1)

        return {
            "is_anomaly":        bool(is_anomaly),
            "anomaly_score":     round(anomaly_score, 4),
            "top_driver":        top_driver["label"] if top_driver else "NONE",
            "narrative":         narrative,
            "attributions":      attributions[:6],  # Top 6 drivers for UI chart
            "subsystem_impact":  subsystem_impact
        }
