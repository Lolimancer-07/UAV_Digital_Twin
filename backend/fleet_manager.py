"""
backend/fleet_manager.py
--------------------------
Multi-UAV Fleet State Manager.

Simulates a 4-UAV fleet by maintaining independent Digital Twin state
for each UAV, using different engine lifecycle data (engine_id 1-4).

Each UAV has its own:
  - Telemetry buffer
  - Health EMA state
  - Anomaly history
  - RUL trajectory

The active UAV can be switched by the GCS operator.
"""

from collections import deque
from typing import Dict, Any
import copy

# Fleet configuration
FLEET_CONFIG = [
    {"uav_id": "UAV-01", "engine_id": 1, "call_sign": "ALPHA-01", "mission": "ISR-LOITER"},
    {"uav_id": "UAV-02", "engine_id": 2, "call_sign": "ALPHA-02", "mission": "ROUTE-SURVEY"},
    {"uav_id": "UAV-03", "engine_id": 3, "call_sign": "BRAVO-01", "mission": "HOT-STANDBY"},
    {"uav_id": "UAV-04", "engine_id": 4, "call_sign": "BRAVO-02", "mission": "MAINTENANCE"},
]

# RUL degradation offsets per UAV to create fleet diversity
UAV_RUL_OFFSETS = {
    "UAV-01":  0,     # Newest, full life
    "UAV-02": -30,    # Slightly used
    "UAV-03": -90,    # Mid-life
    "UAV-04": -160,   # Approaching overhaul
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
        """Updates fleet state for a specific UAV from its Digital Twin payload."""
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
        """Returns list of all UAV status dicts for the fleet overview panel."""
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
