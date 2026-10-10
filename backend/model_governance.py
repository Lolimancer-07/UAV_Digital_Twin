"""
backend/model_governance.py

Convenience re-export for model governance, eval cards, shadow mode, and promotion gates.
"""

from twin_core.model_governance import (
    ModelEvalCard,
    ShadowModeRunner,
    ModelPromotionGate,
    model_promotion_gate,
)

__all__ = [
    "ModelEvalCard",
    "ShadowModeRunner",
    "ModelPromotionGate",
    "model_promotion_gate",
]
