"""
backend/causal_root_cause.py
Re-exports Causal Root-Cause engine from twin-core.
"""

from twin_core.causal_root_cause import (
    PROPULSION_CAUSAL_GRAPH,
    CausalRootCauseEngine,
    causal_engine,
)

__all__ = [
    "PROPULSION_CAUSAL_GRAPH",
    "CausalRootCauseEngine",
    "causal_engine",
]
