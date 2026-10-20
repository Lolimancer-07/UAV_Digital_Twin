"""
backend/channel_config.py
-------------------------
Re-exports twin_core.channel_config for backend consumers.
"""

import sys
import os

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TWIN_CORE = os.path.join(_ROOT, "packages", "twin-core")
if _TWIN_CORE not in sys.path:
    sys.path.insert(0, _TWIN_CORE)

from twin_core.channel_config import (
    ChannelConfig,
    ChannelScalerBundle,
    get_channel_config,
    CHANNELS_CONFIG_PATH,
)

__all__ = [
    "ChannelConfig",
    "ChannelScalerBundle",
    "get_channel_config",
    "CHANNELS_CONFIG_PATH",
]
