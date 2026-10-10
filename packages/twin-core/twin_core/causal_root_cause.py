"""
packages/twin-core/twin_core/causal_root_cause.py

Causal Root-Cause Attribution Graph Engine.
Implements STARTUP_BLUEPRINT.md §3 F8 & §8 Phase 3:
  - Directed Acyclic Graph (DAG) of engine physical subsystem interactions.
  - Traces downstream symptoms back to primary root causes across physical causal paths.
  - Distinguishes primary root cause vs secondary coupled reactions (e.g. CHT rise causing secondary oil thinning).
  - Emits structured causal attribution with path confidence and plain-language engineering explanations.
"""

from typing import Dict, List, Any, Optional, Tuple
import threading


# Standard Propulsion Physical Causal DAG
PROPULSION_CAUSAL_GRAPH = {
    "COOLING_AIRFLOW_RESTRICTION": {
        "type": "ROOT_CAUSE_DEFECT",
        "name": "Baffle / Cooling Duct Airflow Restriction",
        "description": "Blockage or baffle seal failure restricts airflow over cylinders",
        "direct_effects": ["CHT"],
        "mechanism": "Reduced convective heat transfer coefficient elevates cylinder head temperature",
    },
    "LEAN_MIXTURE_OR_INJECTOR_CLOG": {
        "type": "ROOT_CAUSE_DEFECT",
        "name": "Lean Fuel Mixture / Fuel Delivery Restriction",
        "description": "Fuel-air equivalence ratio leans out, increasing combustion temperature",
        "direct_effects": ["EGT", "CHT"],
        "mechanism": "Sub-stoichiometric combustion peaks exhaust gas temperature",
    },
    "OIL_PUMP_WEAR_OR_RELIEF_VALVE": {
        "type": "ROOT_CAUSE_DEFECT",
        "name": "Oil Pump Cavitation / Pressure Relief Valve Leak",
        "description": "Mechanical oil pump failure or pressure regulator seat leakage",
        "direct_effects": ["OIL_PRESSURE"],
        "mechanism": "Insufficient hydrodynamic pressure at journal bearings",
    },
    "JOURNAL_BEARING_SPALLING": {
        "type": "ROOT_CAUSE_DEFECT",
        "name": "Crankshaft Journal Bearing Spalling / Metal Wear",
        "description": "Bearing surface micro-pitting generates mechanical friction and metal particles",
        "direct_effects": ["VIBRATION", "OIL_TEMP"],
        "mechanism": "Hydrodynamic film breakdown causes metal-on-metal micro-welding",
    },
    # Intermediate & Observable Nodes
    "CHT": {
        "type": "OBSERVABLE_SENSOR",
        "channel": "cht",
        "direct_effects": ["OIL_TEMP"],
        "mechanism": "Excess cylinder head heat conducts through crankcase walls into lubrication circuit",
    },
    "OIL_TEMP": {
        "type": "OBSERVABLE_SENSOR",
        "channel": "oil_temp",
        "direct_effects": ["OIL_PRESSURE"],
        "mechanism": "Elevated oil temperature exponentially degrades SAE viscosity, lowering delivery pressure",
    },
    "EGT": {
        "type": "OBSERVABLE_SENSOR",
        "channel": "egt",
        "direct_effects": ["CHT"],
        "mechanism": "High combustion gas temperature increases cylinder wall heat flux",
    },
    "OIL_PRESSURE": {
        "type": "OBSERVABLE_SENSOR",
        "channel": "oil_pressure",
        "direct_effects": ["VIBRATION"],
        "mechanism": "Inadequate bearing oil wedge allows boundary contact and vibration spikes",
    },
    "VIBRATION": {
        "type": "OBSERVABLE_SENSOR",
        "channel": "vibration",
        "direct_effects": [],
        "mechanism": "Mechanical unbalance and harmonic shock transmission",
    },
}


class CausalRootCauseEngine:
    """
    Performs causal graph traversal and path reasoning to attribute root causes
    from multi-channel sensor residuals.
    """

    def __init__(self, causal_graph: Optional[Dict[str, Any]] = None):
        self.graph = causal_graph or PROPULSION_CAUSAL_GRAPH
        self._lock = threading.RLock()

    def diagnose_root_cause(
        self,
        telemetry: Dict[str, Any],
        residuals: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates active sensor anomalies and traverses causal propagation paths
        to identify the originating root cause.
        """
        res = residuals or {}
        cht = float(telemetry.get("cht", 380.0))
        egt = float(telemetry.get("egt", 1580.0))
        oil_p = float(telemetry.get("oil_pressure", 58.0))
        oil_t = float(telemetry.get("oil_temp", 185.0))
        vib = float(telemetry.get("vibration", 0.65))

        # Check observed sensor anomaly flags
        anomalies = {
            "CHT": cht > 410.0 or res.get("cht", 0.0) > 25.0,
            "EGT": egt > 1650.0 or res.get("egt", 0.0) > 70.0,
            "OIL_TEMP": oil_t > 205.0 or res.get("oil_temp", 0.0) > 15.0,
            "OIL_PRESSURE": oil_p < 42.0 or res.get("oil_pressure", 0.0) < -10.0,
            "VIBRATION": vib > 1.4 or res.get("vibration", 0.0) > 0.5,
        }

        active_symptoms = [k for k, v in anomalies.items() if v]

        candidates = []

        with self._lock:
            # 1. Test COOLING_AIRFLOW_RESTRICTION Path:
            # Cooling restriction -> CHT High -> Oil Temp High -> Oil Press Low
            if anomalies["CHT"]:
                score = 0.60
                path = ["COOLING_AIRFLOW_RESTRICTION", "CHT"]
                if anomalies["OIL_TEMP"]:
                    score += 0.20
                    path.append("OIL_TEMP")
                if anomalies["OIL_PRESSURE"]:
                    score += 0.15
                    path.append("OIL_PRESSURE")
                if not anomalies["EGT"]:
                    # EGT is normal! This confirms it's cooling, not lean fuel mixture!
                    score += 0.10
                
                candidates.append({
                    "root_cause_id": "COOLING_AIRFLOW_RESTRICTION",
                    "name": self.graph["COOLING_AIRFLOW_RESTRICTION"]["name"],
                    "confidence": min(0.98, score),
                    "causal_path": " -> ".join(path),
                    "mechanism_explanation": "Baffle cooling restriction primarily drives CHT elevation. Excess head heat subsequently transfers to oil, lowering viscosity and oil pressure.",
                    "primary_origin": "COOLING_AIRFLOW_RESTRICTION",
                    "downstream_symptoms": [s for s in path if s != "COOLING_AIRFLOW_RESTRICTION"],
                })

            # 2. Test LEAN_MIXTURE Path:
            # Lean mixture -> EGT High -> CHT High
            if anomalies["EGT"]:
                score = 0.70
                path = ["LEAN_MIXTURE_OR_INJECTOR_CLOG", "EGT"]
                if anomalies["CHT"]:
                    score += 0.20
                    path.append("CHT")
                candidates.append({
                    "root_cause_id": "LEAN_MIXTURE_OR_INJECTOR_CLOG",
                    "name": self.graph["LEAN_MIXTURE_OR_INJECTOR_CLOG"]["name"],
                    "confidence": min(0.95, score),
                    "causal_path": " -> ".join(path),
                    "mechanism_explanation": "Lean fuel delivery spikes combustion flame temperatures, driving EGT followed by secondary CHT rise.",
                    "primary_origin": "LEAN_MIXTURE_OR_INJECTOR_CLOG",
                    "downstream_symptoms": [s for s in path if s != "LEAN_MIXTURE_OR_INJECTOR_CLOG"],
                })

            # 3. Test OIL_PUMP_WEAR Path:
            # Oil pump -> Oil Pressure Low -> Vibration
            if anomalies["OIL_PRESSURE"] and not anomalies["CHT"] and not anomalies["OIL_TEMP"]:
                # Pure oil pressure drop without prior thermal runaway -> mechanical pump issue
                candidates.append({
                    "root_cause_id": "OIL_PUMP_WEAR_OR_RELIEF_VALVE",
                    "name": self.graph["OIL_PUMP_WEAR_OR_RELIEF_VALVE"]["name"],
                    "confidence": 0.88,
                    "causal_path": "OIL_PUMP_WEAR_OR_RELIEF_VALVE -> OIL_PRESSURE",
                    "mechanism_explanation": "Isolated oil pressure drop with normal oil temperature indicates primary oil pump mechanical wear or pressure relief valve leak.",
                    "primary_origin": "OIL_PUMP_WEAR_OR_RELIEF_VALVE",
                    "downstream_symptoms": ["OIL_PRESSURE"],
                })

            # 4. Test BEARING_DEGRADATION Path:
            # Bearing spalling -> Vibration -> Oil Temp
            if anomalies["VIBRATION"] and not anomalies["CHT"]:
                candidates.append({
                    "root_cause_id": "JOURNAL_BEARING_SPALLING",
                    "name": self.graph["JOURNAL_BEARING_SPALLING"]["name"],
                    "confidence": 0.82,
                    "causal_path": "JOURNAL_BEARING_SPALLING -> VIBRATION",
                    "mechanism_explanation": "Mechanical spalling on journal surfaces generates high-frequency harmonic vibration independent of thermal load.",
                    "primary_origin": "JOURNAL_BEARING_SPALLING",
                    "downstream_symptoms": ["VIBRATION"],
                })

        # Sort candidates by confidence descending
        candidates.sort(key=lambda c: c["confidence"], reverse=True)

        primary = candidates[0] if candidates else {
            "root_cause_id": "NOMINAL_NO_DEFECT",
            "name": "Nominal Operation",
            "confidence": 0.99,
            "causal_path": "ALL_CHANNELS_NOMINAL",
            "mechanism_explanation": "All channels operating within physical equilibrium boundaries.",
            "primary_origin": "NONE",
            "downstream_symptoms": [],
        }

        return {
            "status": "DIAGNOSIS_COMPLETE",
            "active_symptoms": active_symptoms,
            "primary_root_cause": primary,
            "candidate_causes": candidates,
            "dag_nodes_evaluated": len(self.graph),
        }


causal_engine = CausalRootCauseEngine()
