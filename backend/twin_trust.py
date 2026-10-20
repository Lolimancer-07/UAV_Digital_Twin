"""
backend/twin_trust.py
Re-exports Twin Trust Score Auditor from twin-core.
"""

from twin_core.twin_trust import (
    TwinTrustScoreAuditor,
    twin_trust_auditor,
)

__all__ = [
    "TwinTrustScoreAuditor",
    "twin_trust_auditor",
]
