"""
backend/life_burn.py
Re-exports Life Burn Rate engine from twin-core.
"""

from twin_core.life_burn import (
    LifeBurnCalculator,
    RainflowCycleCounter,
    life_burn_calc,
    rainflow_counter,
)

__all__ = [
    "LifeBurnCalculator",
    "RainflowCycleCounter",
    "life_burn_calc",
    "rainflow_counter",
]
