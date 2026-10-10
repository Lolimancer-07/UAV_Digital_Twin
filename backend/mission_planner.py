"""
backend/mission_planner.py
Re-exports Life-Aware Mission Planner from twin-core.
"""

from twin_core.mission_planner import (
    MissionSegment,
    LifeAwareMissionPlanner,
    mission_planner,
)

__all__ = [
    "MissionSegment",
    "LifeAwareMissionPlanner",
    "mission_planner",
]
