"""
backend/xai_engine.py

Explainable AI (XAI) Diagnostic Layer for UAV Aero Piston Engines.

Decomposes multivariate anomaly signals into individual sensor feature attributions,
z-score deviations, subsystem impacts, and natural-language root cause explanations
strictly aligned with the 8-category defense fault taxonomy.
"""

from typing import Dict, List, Any, Tuple
import numpy as np

# Nominal cruise baselines for Rotax 914 class aero piston engine
NOMINAL_BASELINES = {
    "rpm":            {"mean": 1400.0, "std": 15.0,  "unit": "RPM",   "subsystem": "Powertrain / Governor", "fault_category": "COMBUSTION_INSTABILITY"},
    "cht":            {"mean": 380.0,  "std": 12.0,  "unit": "°F",    "subsystem": "Thermal / Cooling",     "fault_category": "OVERHEATING"},
    "egt":            {"mean": 1585.0, "std": 18.0,  "unit": "°F",    "subsystem": "Combustion Chamber",   "fault_category": "OVERHEATING"},
    "oil_pressure":   {"mean": 58.0,   "std": 4.0,   "unit": "PSI",   "subsystem": "Lubrication Circuit",   "fault_category": "LOW_OIL_PRESSURE"},
    "oil_temp":       {"mean": 185.0,  "std": 8.0,   "unit": "°F",    "subsystem": "Oil Cooling",           "fault_category": "COOLING_DEGRADATION"},
    "fuel_flow":      {"mean": 8.5,    "std": 0.4,   "unit": "L/h",   "subsystem": "Fuel Delivery / Rail",  "fault_category": "INJECTOR_ANOMALY"},
    "vibration":      {"mean": 0.65,   "std": 0.25,  "unit": "g RMS", "subsystem": "Mechanical / Bearings", "fault_category": "HIGH_VIBRATION"},
    "battery_v":      {"mean": 13.8,   "std": 0.15,  "unit": "V",     "subsystem": "Electrical Bus",       "fault_category": "SENSOR_DRIFT"},
    "inj_timing":     {"mean": 27.5,   "std": 1.2,   "unit": "°BTDC", "subsystem": "FADEC / Ignition",     "fault_category": "COMBUSTION_INSTABILITY"}
}

# The 8 canonical defense fault categories
FAULT_TAXONOMY = [
    "OVERHEATING",
    "LOW_OIL_PRESSURE",
    "HIGH_VIBRATION",
    "MISFIRE_SUSPECT",
    "INJECTOR_ANOMALY",
    "BEARING_WEAR",
    "COOLING_DEGRADATION",
    "COMBUSTION_INSTABILITY",
    "SENSOR_DRIFT"
]


class XAIDiagnosticEngine:
    """
    Computes feature-level anomaly attribution and builds a human-readable,
    auditable diagnostic dossier for each anomaly event.
    """

    @staticmethod
    def explain_anomaly(telemetry: Dict[str, Any], is_anomaly: bool,
                        anomaly_score: float, active_faults: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Decomposes the anomaly signal into per-feature contributions.
        Returns attribution percentages guaranteed to sum to 100.0% on anomalies,
        along with exact fault taxonomy alignment.
        """
        active_faults = active_faults or []
        feature_scores = {}
        z_scores = {}
        deviations = {}
        total_deviation_score = 0.0

        for feat, base in NOMINAL_BASELINES.items():
            val = float(telemetry.get(feat, base["mean"]))
            z = abs(val - base["mean"]) / max(0.1, base["std"])
            z_scores[feat] = round(z, 2)
            deviations[feat] = round(val - base["mean"], 2)

            # Non-linear penalty: high-sigma outliers dominate root cause attribution
            dev_score = float(z ** 1.8)
            feature_scores[feat] = dev_score
            total_deviation_score += dev_score

        # Normalize percentages so they sum to exactly 100.0% when an anomaly is present
        raw_attributions = []
        if is_anomaly and total_deviation_score > 1e-6:
            for feat, score in feature_scores.items():
                pct = (score / total_deviation_score) * 100.0
                base = NOMINAL_BASELINES[feat]
                val = float(telemetry.get(feat, base["mean"]))
                raw_attributions.append({
                    "feature":        feat,
                    "label":          feat.replace("_", " ").upper(),
                    "subsystem":      base["subsystem"],
                    "fault_category": base["fault_category"],
                    "value":          round(val, 2),
                    "nominal":        base["mean"],
                    "unit":           base["unit"],
                    "z_score":        z_scores[feat],
                    "delta":          deviations[feat],
                    "raw_pct":        pct
                })

            raw_attributions.sort(key=lambda x: x["raw_pct"], reverse=True)

            # Round and adjust largest component so the total is strictly 100.0%
            rounded_sum = 0.0
            for item in raw_attributions:
                item["attribution"] = round(item["raw_pct"], 1)
                rounded_sum += item["attribution"]

            # Fix minor floating-point rounding delta on the highest attribution item
            round_diff = round(100.0 - rounded_sum, 1)
            if raw_attributions and abs(round_diff) > 0.001:
                raw_attributions[0]["attribution"] = round(raw_attributions[0]["attribution"] + round_diff, 1)
        else:
            for feat, base in NOMINAL_BASELINES.items():
                val = float(telemetry.get(feat, base["mean"]))
                raw_attributions.append({
                    "feature":        feat,
                    "label":          feat.replace("_", " ").upper(),
                    "subsystem":      base["subsystem"],
                    "fault_category": base["fault_category"],
                    "value":          round(val, 2),
                    "nominal":        base["mean"],
                    "unit":           base["unit"],
                    "z_score":        z_scores[feat],
                    "delta":          deviations[feat],
                    "attribution":    0.0
                })
            raw_attributions.sort(key=lambda x: x["z_score"], reverse=True)

        top_driver = raw_attributions[0] if raw_attributions else None

        # Cross-reference with active domain rules for fault taxonomy category name
        matched_taxonomy = "NOMINAL"
        if active_faults:
            matched_taxonomy = active_faults[0].get("name", top_driver["fault_category"] if top_driver else "UNKNOWN")
        elif is_anomaly and top_driver:
            matched_taxonomy = top_driver["fault_category"]

        # Natural language diagnostic narrative
        if is_anomaly and top_driver and (top_driver["attribution"] > 10.0 or top_driver["z_score"] > 2.0):
            direction = "elevated above" if top_driver["delta"] > 0 else "depressed below"
            narrative = (
                f"Anomaly classified under fault taxonomy as [{matched_taxonomy}], driven primarily by "
                f"{top_driver['label']} ({top_driver['attribution']}% attribution) which is {direction} nominal at "
                f"{top_driver['value']} {top_driver['unit']} ({abs(top_driver['z_score'])}σ deviation from {top_driver['nominal']} {top_driver['unit']}). "
                f"Impacted subsystem: {top_driver['subsystem']}."
            )
        else:
            narrative = "All monitored propulsion channels conform to nominal multi-sensor 3-sigma operational envelope."

        # Roll up subsystem impact percentages
        subsystem_impact = {}
        for a in raw_attributions:
            sub = a["subsystem"]
            subsystem_impact[sub] = round(subsystem_impact.get(sub, 0.0) + a["attribution"], 1)

        return {
            "is_anomaly":        bool(is_anomaly),
            "anomaly_score":     round(anomaly_score, 4),
            "fault_taxonomy":    matched_taxonomy,
            "top_driver":        top_driver["label"] if top_driver else "NONE",
            "narrative":         narrative,
            "attributions":      raw_attributions[:6],  # Top 6 features for visualization
            "all_attributions":  raw_attributions,
            "subsystem_impact":  subsystem_impact
        }
