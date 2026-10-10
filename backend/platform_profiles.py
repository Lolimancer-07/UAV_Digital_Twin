"""
backend/platform_profiles.py
Re-exports platform profiles from twin-core.
"""

from twin_core.platform_profiles import (
    PLATFORM_PROFILES_DATA,
    PlatformProfileRegistry,
    platform_registry,
)

__all__ = [
    "PLATFORM_PROFILES_DATA",
    "PlatformProfileRegistry",
    "platform_registry",
]
