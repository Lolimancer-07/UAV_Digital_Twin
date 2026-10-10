"""
backend/contingency_footprint.py
Re-exports Contingency Footprint Engine from twin-core.
"""

from twin_core.contingency_footprint import (
    DEFAULT_RECOVERY_SITES,
    haversine_distance_nmi,
    calculate_bearing_deg,
    ContingencyFootprintCalculator,
    contingency_engine,
)

__all__ = [
    "DEFAULT_RECOVERY_SITES",
    "haversine_distance_nmi",
    "calculate_bearing_deg",
    "ContingencyFootprintCalculator",
    "contingency_engine",
]
