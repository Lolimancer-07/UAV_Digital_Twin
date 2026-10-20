"""
backend/abstention_alerting.py
Re-exports Abstention-First Alerting Manager from twin-core.
"""

from twin_core.abstention_alerting import (
    AbstentionAlertManager,
    abstention_alert_manager,
    PHASE_THRESHOLDS,
)

__all__ = [
    "AbstentionAlertManager",
    "abstention_alert_manager",
    "PHASE_THRESHOLDS",
]
