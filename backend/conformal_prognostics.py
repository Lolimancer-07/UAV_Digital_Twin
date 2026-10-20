"""
backend/conformal_prognostics.py
Re-exports Conformal Prognostics Engine from twin-core.
"""

from twin_core.conformal_prognostics import (
    ConformalPrognosticsEngine,
    conformal_prognostics,
)

__all__ = [
    "ConformalPrognosticsEngine",
    "conformal_prognostics",
]
