"""
backend/drift_detector.py

Convenience re-export for the closed-loop AI model & telemetry drift detector.
Re-exports from twin_core.drift_detector.
"""

from twin_core.drift_detector import (
    TelemetryDriftDetector,
    DriftReviewTicket,
    NOMINAL_BASELINES,
    drift_detector,
)

__all__ = [
    "TelemetryDriftDetector",
    "DriftReviewTicket",
    "NOMINAL_BASELINES",
    "drift_detector",
]
