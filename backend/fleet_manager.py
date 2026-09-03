"""
backend/fleet_manager.py

Tracks state for all 4 UAVs in the fleet simultaneously.

Each UAV runs a different engine (engine_id 1–4) with a different
lifecycle offset, so you get a realistic spread of health states across
the fleet panel — one brand new, one mid-life, one approaching overhaul.

The GCS operator can switch the active UAV and the rest of the pipeline
follows. Only one UAV's live telemetry feeds in at a time (from the simulator),
so the other 3 show their last known state.
"""

from collections import deque
from typing import Dict, Any
import copy

# the 4 UAVs in the fleet — each has a different mission and lifecycle offset
FLEET_CONFIG = [
    {"uav_id": "UAV-01", "engine_id": 1, "call_sign": "ALPHA-01", "mission": "ISR-LOITER"},
    {"uav_id": "UAV-02", "engine_id": 2, "call_sign": "ALPHA-02", "mission": "ROUTE-SURVEY"},
    {"uav_id": "UAV-03", "engine_id": 3, "call_sign": "BRAVO-01", "mission": "HOT-STANDBY"},
    {"uav_id": "UAV-04", "engine_id": 4, "call_sign": "BRAVO-02", "mission": "MAINTENANCE"},
]

# RUL offsets create fleet diversity — UAV-04 is almost due for overhaul
UAV_RUL_OFFSETS = {
    "UAV-01":  0,     # newest, full remaining life
    "UAV-02": -30,    # slightly used
    "UAV-03": -90,    # mid-life
    "UAV-04": -160,   # near end-of-life, probably in maintenance for a reason
}


class FleetManager:
    def __init__(self):
        self.fleet_state: Dict[str, dict] = {
            cfg["uav_id"]: {
                "uav_id": cfg["uav_id"],
                "engine_id": cfg["engine_id"],
                "call_sign": cfg["call_sign"],
                "mission": cfg["mission"],
                "health": 92.0 + UAV_RUL_OFFSETS[cfg["uav_id"]] * 0.15,
                "rul": max(5.0, 142.0 + UAV_RUL_OFFSETS[cfg["uav_id"]]),
                "condition": "EXCELLENT",
                "fault_count": 0,
                "alert": "NOMINAL",
                "rpm": 1400.0,
                "cht": 375.0,
                "mission_probability": 92.0,
                "last_update": None,
            }
            for cfg in FLEET_CONFIG
        }
        self.active_uav_id = "UAV-01"

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


fleet_manager = FleetManager()
