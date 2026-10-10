"""
backend/hil_testbed.py
Re-exports HIL testbed modules from twin-core.
"""

from twin_core.hil_testbed import (
    HILScenarioReplayRunner,
    HILPassFailEvaluator,
    FAULT_INJECTION_CATALOG,
    BENCH_HARDWARE_SPECS,
)

__all__ = [
    "HILScenarioReplayRunner",
    "HILPassFailEvaluator",
    "FAULT_INJECTION_CATALOG",
    "BENCH_HARDWARE_SPECS",
]
