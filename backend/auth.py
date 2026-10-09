"""
backend/auth.py

Convenience re-export for the authentication and multi-tenancy subsystem.
"""

from twin_core.auth import (
    create_access_token,
    verify_access_token,
    authorize_command,
    authorize_aircraft_access,
    filter_payload_for_subscriber,
    RateLimiter,
    ReplayGuard,
    ROLE_VIEWER,
    ROLE_DISPATCHER,
    ROLE_MAINTAINER,
    ROLE_ADMIN,
    TENANT_FLEET_MAPPING,
    COMMAND_PERMISSIONS,
)

__all__ = [
    "create_access_token",
    "verify_access_token",
    "authorize_command",
    "authorize_aircraft_access",
    "filter_payload_for_subscriber",
    "RateLimiter",
    "ReplayGuard",
    "ROLE_VIEWER",
    "ROLE_DISPATCHER",
    "ROLE_MAINTAINER",
    "ROLE_ADMIN",
    "TENANT_FLEET_MAPPING",
    "COMMAND_PERMISSIONS",
]
