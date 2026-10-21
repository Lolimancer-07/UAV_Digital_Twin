"""
backend/fleet_manager.py

Tracks state for all 5 UAVs in the fleet simultaneously.

Each UAV runs a different engine (engine_id 1–5) with a different
lifecycle offset, so you get a realistic spread of health states across
the fleet panel — one brand new, one mid-life, one approaching overhaul.

The GCS operator can switch the active UAV and the rest of the pipeline
follows. Only one UAV's live telemetry feeds in at a time (from the simulator),
so the other 3 show their last known state.
"""

from collections import deque
from typing import Dict, Any
import copy

# the 5 UAVs in the fleet — each has a different mission and lifecycle offset
FLEET_CONFIG = [
    {"uav_id": "UAV-01", "engine_id": 1, "call_sign": "ALPHA-01", "mission": "ISR-LOITER"},
    {"uav_id": "UAV-02", "engine_id": 2, "call_sign": "ALPHA-02", "mission": "ROUTE-SURVEY"},
    {"uav_id": "UAV-03", "engine_id": 3, "call_sign": "BRAVO-01", "mission": "HOT-STANDBY"},
    {"uav_id": "UAV-04", "engine_id": 4, "call_sign": "BRAVO-02", "mission": "MAINTENANCE"},
    {"uav_id": "UAV-05", "engine_id": 5, "call_sign": "CHARLIE-01", "mission": "DEEP-STRIKE"},
]

# RUL offsets create fleet diversity — UAV-04 is almost due for overhaul
UAV_RUL_OFFSETS = {
    "UAV-01":  0,     # newest, full remaining life
    "UAV-02": -30,    # slightly used
    "UAV-03": -90,    # mid-life
    "UAV-04": -160,   # near end-of-life, probably in maintenance for a reason
    "UAV-05":  20,    # reinforcement unit — fresh overhaul, peak condition
}


class FleetManager:
    def __init__(self):
        self.fleet_state: Dict[str, dict] = {
            cfg["uav_id"]: {
                "uav_id": cfg["uav_id"],
                "engine_id": cfg["engine_id"],
                "call_sign": cfg["call_sign"],
                "mission": cfg["mission"],
                "health": min(100.0, 92.0 + UAV_RUL_OFFSETS[cfg["uav_id"]] * 0.15),
                "rul": max(5.0, 142.0 + UAV_RUL_OFFSETS[cfg["uav_id"]]),
                "condition": "EXCELLENT",
                "fault_count": 0,
                "alert": "NOMINAL",
                "rpm": 1400.0,
                "cht": 375.0,
                "mission_probability": min(100.0, 92.0 + UAV_RUL_OFFSETS[cfg["uav_id"]] * 0.08),
                "last_update": None,
            }
            for cfg in FLEET_CONFIG
        }
        self.active_uav_id = "UAV-01"
        self.swarm_formation = "V_WEDGE"
        self.swarm_relief_active = False
        self.swarm_relief_history = []

    def update_uav(self, uav_id: str, payload: dict):
        """Refreshes fleet state for one UAV from its latest Digital Twin payload."""
        if uav_id not in self.fleet_state:
            return
        s = self.fleet_state[uav_id]
        health = payload.get("health", {})
        mission_risk = payload.get("mission_risk", {})
        s["health"] = health.get("health_index", s["health"])
        s["condition"] = health.get("condition", s["condition"])
        s["rul"] = payload.get("predicted_rul", s["rul"])
        s["fault_count"] = len(payload.get("fault_events", []))
        s["alert"] = payload.get("alert", "NOMINAL")
        s["rpm"] = payload.get("rpm", s["rpm"])
        s["cht"] = payload.get("cht", s["cht"])
        s["mission_probability"] = mission_risk.get("mission_completion_probability", s["mission_probability"])
        s["last_update"] = payload.get("cycle", 0)

    def get_fleet_status(self) -> list:
        """Returns the full fleet list for the overview panel, with status colors."""
        result = []
        for uav_id, s in self.fleet_state.items():
            hi = s["health"]
            if hi >= 80:
                status_color = "ok"
                status_dot = "🟢"
            elif hi >= 50:
                status_color = "warn"
                status_dot = "🟡"
            else:
                status_color = "crit"
                status_dot = "🔴"
            result.append({
                "uav_id":         s["uav_id"],
                "call_sign":      s["call_sign"],
                "mission":        s["mission"],
                "health":         round(s["health"], 1),
                "rul":            round(s["rul"], 0),
                "condition":      s["condition"],
                "fault_count":    s["fault_count"],
                "alert":          s["alert"],
                "status_color":   status_color,
                "status_dot":     status_dot,
                "is_active":      uav_id == self.active_uav_id,
                "mission_probability": round(s["mission_probability"], 1),
                "rpm":            round(s.get("rpm", 0.0), 1),
                "cht":            round(s.get("cht", 0.0), 1),
            })
        return result

    def select_uav(self, uav_id: str) -> bool:
        if uav_id in self.fleet_state:
            self.active_uav_id = uav_id
            return True
        return False

    def get_active_engine_id(self) -> int:
        s = self.fleet_state.get(self.active_uav_id, {})
        return s.get("engine_id", 1)

    def set_swarm_formation(self, formation: str) -> bool:
        valid = ["V_WEDGE", "ECHELON_RIGHT", "DIAMOND", "TRAIL", "DISPERSED"]
        norm = formation.upper().strip()
        if norm in valid:
            self.swarm_formation = norm
            return True
        return False

    def get_swarm_info(self) -> dict:
        airborne = [u for u in self.get_fleet_status() if u.get("rpm", 0) > 100]
        cohesion = 94.6 if len(airborne) >= 3 else 88.0
        return {
            "formation": self.swarm_formation,
            "airborne_nodes": len(airborne),
            "mesh_cohesion_pct": cohesion,
            "min_separation_m": 1280,
            "tcas_status": "CLEAR",
            "link_margin_db": 28.4,
            "encryption": "AES-256-GCM",
            "packet_delivery_pct": 99.4,
            "relief_active": self.swarm_relief_active,
            "last_relief": self.swarm_relief_history[-1] if self.swarm_relief_history else None,
        }

    def execute_swarm_relief(self, relieved_uav_id: str, standby_uav_id: str) -> dict:
        self.swarm_relief_active = True
        record = {
            "relieved_uav_id": relieved_uav_id,
            "standby_uav_id": standby_uav_id,
            "status": "HANDOVER_CONFIRMED",
            "rendezvous_wp": "WP-03 (26.78°N, 78.14°E)",
            "handover_overlap_min": 28,
        }
        self.swarm_relief_history.append(record)
        return record


fleet_manager = FleetManager()

