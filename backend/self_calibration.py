"""
backend/self_calibration.py
Re-exports Per-Airframe Self-Calibrating Twin from twin-core.
"""

from twin_core.self_calibration import (
    PerAirframeSelfCalibrator,
    per_airframe_calibrator,
    TailBaselineProfile,
)

__all__ = [
    "PerAirframeSelfCalibrator",
    "per_airframe_calibrator",
    "TailBaselineProfile",
]
