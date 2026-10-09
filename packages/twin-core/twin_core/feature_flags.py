"""
packages/twin-core/twin_core/feature_flags.py

Runtime Feature Flags Configuration for UAV Digital Twin.
Implements improvement_plan.md §4 Phase 3:
  - Feature flags for risky reasoning changes
  - Zero-downtime evolution and canary rollout controls
  - Dynamic overrides via environment variables or runtime registry
"""

import os
from typing import Dict, Any, Optional

DEFAULT_FLAGS: Dict[str, bool] = {
    "strict_tenant_isolation": True,
    "mcdropout_fast_mode": True,
    "physics_hybrid_kalman": False,
    "zero_downtime_dual_emit": False,
    "enforce_command_signature": False,
    "detailed_telemetry_audit": True,
}

_runtime_overrides: Dict[str, bool] = {}


def is_feature_enabled(flag_name: str, default: Optional[bool] = None) -> bool:
    """
    Check if a feature flag is enabled.
    Priority order:
      1. Runtime in-memory override (e.g. during a canary or automated test)
      2. Environment variable: UAV_TWIN_FLAG_<FLAG_NAME_UPPER>
      3. Default static flag configuration
    """
    if flag_name in _runtime_overrides:
        return _runtime_overrides[flag_name]

    env_key = f"UAV_TWIN_FLAG_{flag_name.upper()}"
    if env_key in os.environ:
        val = os.environ[env_key].strip().lower()
        return val in ("1", "true", "yes", "on", "enabled")

    if default is not None:
        return default

    return DEFAULT_FLAGS.get(flag_name, False)


def set_feature_override(flag_name: str, enabled: bool) -> None:
    """Set an in-memory runtime override for a feature flag."""
    _runtime_overrides[flag_name] = enabled


def clear_feature_override(flag_name: str) -> None:
    """Clear an in-memory runtime override."""
    _runtime_overrides.pop(flag_name, None)


def list_feature_flags() -> Dict[str, Any]:
    """Return all active feature flags with their current resolved states and origins."""
    resolved = {}
    for flag, default_val in DEFAULT_FLAGS.items():
        is_override = flag in _runtime_overrides
        env_key = f"UAV_TWIN_FLAG_{flag.upper()}"
        is_env = env_key in os.environ
        resolved[flag] = {
            "enabled": is_feature_enabled(flag),
            "origin": "override" if is_override else ("env" if is_env else "default"),
            "default": default_val,
        }
    return resolved
