"""
backend/reliability_passport.py
Re-exports Engine Reliability Passport from twin-core.
"""

from twin_core.reliability_passport import (
    PassportBlock,
    EngineReliabilityPassport,
    engine_passport,
)

__all__ = [
    "PassportBlock",
    "EngineReliabilityPassport",
    "engine_passport",
]
