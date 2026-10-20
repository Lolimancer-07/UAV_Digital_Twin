"""
backend/safety_assurance.py
Re-exports safety assurance modules from twin-core.
"""

from twin_core.safety_assurance import (
    AdvisorySafetyEnvelope,
    SAFETY_ENVELOPE_LIMITS,
    RequirementsTraceabilityRegistry,
    HAZARDS_REGISTER,
    TwoPersonApprovalGate,
    two_person_approval_gate,
)

__all__ = [
    "AdvisorySafetyEnvelope",
    "SAFETY_ENVELOPE_LIMITS",
    "RequirementsTraceabilityRegistry",
    "HAZARDS_REGISTER",
    "TwoPersonApprovalGate",
    "two_person_approval_gate",
]
