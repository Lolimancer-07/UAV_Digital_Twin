"""
packages/twin-core/twin_core/auth.py

Multi-Tenant Authentication, Authorization, and Stream Filtering for UAV Digital Twin.
Implements improvement_plan.md §4 Phase 3:
  - Role-based access control (RBAC): viewer, dispatcher, maintainer, admin
  - Server-side aircraft-scoped authorization per tenant
  - Short-lived HMAC-signed session tokens with expiration & refresh
  - Per-tenant stream filtering and field group pruning
  - Rate limiting and command replay protection
"""

import os
import json
import time
import hmac
import hashlib
import base64
from typing import Dict, Any, List, Optional, Tuple, Set

# Standard Secret for Token Signing (overridden via env in production)
JWT_SECRET = os.environ.get("UAV_TWIN_JWT_SECRET", "uav-defense-twin-secret-key-phase3-dev").encode("utf-8")

# Roles
ROLE_VIEWER = "viewer"
ROLE_DISPATCHER = "dispatcher"
ROLE_MAINTAINER = "maintainer"
ROLE_ADMIN = "admin"

ALL_ROLES = {ROLE_VIEWER, ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN}

# Command permissions mapping
COMMAND_PERMISSIONS: Dict[str, Set[str]] = {
    # Read/status queries
    "ai_engineer_query": {ROLE_VIEWER, ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "select_uav": {ROLE_VIEWER, ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "generate_report": {ROLE_VIEWER, ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},

    # Operational/Mission Dispatcher actions
    "set_profile": {ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "set_speed": {ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "set_paused": {ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "whatif": {ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "optimize": {ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "mission_command_simulate": {ROLE_DISPATCHER, ROLE_MAINTAINER, ROLE_ADMIN},
    "mission_command_approve": {ROLE_DISPATCHER, ROLE_ADMIN},

    # Maintenance & Diagnostic actions
    "inject_fault": {ROLE_MAINTAINER, ROLE_ADMIN},
    "clear_faults": {ROLE_MAINTAINER, ROLE_ADMIN},
    "annotate_replay": {ROLE_MAINTAINER, ROLE_DISPATCHER, ROLE_ADMIN},
    "set_edge_mode": {ROLE_MAINTAINER, ROLE_ADMIN},
    "trigger_federated_round": {ROLE_MAINTAINER, ROLE_ADMIN},

    # Demo mode controls
    "demo_start": {ROLE_MAINTAINER, ROLE_ADMIN},
    "demo_step": {ROLE_MAINTAINER, ROLE_ADMIN},
    "demo_stop": {ROLE_MAINTAINER, ROLE_ADMIN},
}

# Multi-tenant aircraft ownership registry
TENANT_FLEET_MAPPING: Dict[str, List[str]] = {
    "tenant_alpha": ["UAV-01", "UAV-02", "UAV-03"],
    "tenant_bravo": ["UAV-04", "UAV-05"],
    "default": ["UAV-01", "UAV-02", "UAV-03", "UAV-04", "UAV-05"],
}


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s.encode("utf-8"))


def create_access_token(
    user_id: str,
    tenant_id: str = "tenant_alpha",
    role: str = ROLE_VIEWER,
    aircraft_ids: Optional[List[str]] = None,
    expires_in_seconds: int = 900,
    secret: Optional[bytes] = None,
) -> str:
    """Generate a standard HS256-signed short-lived token."""
    key = secret or JWT_SECRET
    now = int(time.time())

    # Resolve allowed aircraft for tenant if not explicitly provided
    if aircraft_ids is None:
        aircraft_ids = TENANT_FLEET_MAPPING.get(tenant_id, ["*"])

    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "aircraft_ids": aircraft_ids,
        "iat": now,
        "exp": now + expires_in_seconds,
        "jti": os.urandom(8).hex(),
    }

    hdr_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    pay_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    to_sign = f"{hdr_b64}.{pay_b64}".encode("utf-8")
    sig = hmac.new(key, to_sign, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)

    return f"{hdr_b64}.{pay_b64}.{sig_b64}"


def verify_access_token(
    token_str: str,
    secret: Optional[bytes] = None,
) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Verify signature, structure, and expiration of a JWT token.
    Returns (is_valid, payload, error_message).
    """
    if not token_str or not isinstance(token_str, str):
        return False, None, "Token missing or malformed"

    parts = token_str.strip().split(".")
    if len(parts) != 3:
        return False, None, "Invalid token segments"

    hdr_b64, pay_b64, sig_b64 = parts
    key = secret or JWT_SECRET

    # Verify signature
    to_sign = f"{hdr_b64}.{pay_b64}".encode("utf-8")
    expected_sig = hmac.new(key, to_sign, hashlib.sha256).digest()
    actual_sig = _b64url_decode(sig_b64)

    if not hmac.compare_digest(expected_sig, actual_sig):
        return False, None, "Invalid token signature"

    # Decode and check expiration
    try:
        payload = json.loads(_b64url_decode(pay_b64).decode("utf-8"))
    except Exception as e:
        return False, None, f"Payload decode error: {e}"

    exp = payload.get("exp", 0)
    now = int(time.time())
    if now > exp:
        return False, None, "Token has expired"

    return True, payload, "OK"


def authorize_aircraft_access(
    token_payload: Dict[str, Any],
    target_aircraft_id: str,
) -> bool:
    """
    Verify whether the authenticated tenant/user is authorized for target_aircraft_id.
    """
    if not target_aircraft_id or target_aircraft_id == "*":
        return True

    # Admin wildcard
    if token_payload.get("role") == ROLE_ADMIN:
        allowed = token_payload.get("aircraft_ids", ["*"])
        if "*" in allowed or target_aircraft_id in allowed:
            return True

    tenant_id = token_payload.get("tenant_id", "default")
    tenant_aircraft = TENANT_FLEET_MAPPING.get(tenant_id, [])

    # Check tenant ownership
    if tenant_id != "default" and target_aircraft_id not in tenant_aircraft and "*" not in tenant_aircraft:
        return False

    # Check user-scoped aircraft
    user_aircraft = token_payload.get("aircraft_ids", ["*"])
    if "*" in user_aircraft or target_aircraft_id in user_aircraft:
        return True

    return False


def authorize_command(
    token_payload: Optional[Dict[str, Any]],
    command_name: str,
    target_aircraft_id: str,
) -> Tuple[bool, int, str]:
    """
    Authorize a command execution against caller's role, tenant, and aircraft scope.
    Returns (authorized, http_status_code, reason).
    """
    if not token_payload:
        return False, 401, "Authentication required (missing or invalid token)"

    # 1. Aircraft Scope Authorization
    if not authorize_aircraft_access(token_payload, target_aircraft_id):
        return False, 403, f"Access denied: Aircraft '{target_aircraft_id}' is outside your tenant fleet"

    # 2. Role-Based Permission Check
    allowed_roles = COMMAND_PERMISSIONS.get(command_name)
    user_role = token_payload.get("role", ROLE_VIEWER)

    if allowed_roles is not None and user_role not in allowed_roles:
        return False, 403, f"Forbidden: Role '{user_role}' cannot execute command '{command_name}'"

    return True, 200, "Authorized"


# ── Per-Tenant Stream Filtering ────────────────────────────────────────────────

FIELD_GROUP_MAPPING = {
    "telemetry": [
        "cycle", "engine_id", "uav_id", "rpm", "cht", "cht_cyl", "egt", "egt_cyl",
        "oil_pressure", "oil_temp", "fuel_flow", "fuel_rail_pressure_bar", "vibration",
        "vibration_kurtosis", "battery_v", "bus_current_a", "inj_timing", "map_kpa",
        "altitude_ft", "oat_c", "mission_mode", "paused", "alert", "envelope_version",
        "emitted_at", "can_frames"
    ],
    "physics": ["physics"],
    "prognostics": [
        "predicted_rul", "rul_ci_lower", "rul_ci_upper", "rul_mc_std", "true_rul",
        "buffer_pct", "prognostics_status", "evidence_quality"
    ],
    "anomaly": [
        "is_anomaly", "anomaly_score", "fault_events", "active_faults", "injected_faults",
        "cooling_degradation_active", "misfire_active"
    ],
    "health": ["health", "sensor_integrity", "twin_consistency", "failure_probability"],
    "xai": ["xai"],
    "risk": ["mission_risk"],
    "prescriptive": ["prescriptive", "advisories"],
    "fleet": ["fleet_status"],
    "mission_command": ["mission_command", "mission_command_action", "route"],
    "interactive": [
        "whatif_result", "optimize_result", "ai_engineer_response", "demo_state",
        "federated_round", "edge_profile", "security_status", "provenance"
    ],
}


def filter_payload_for_subscriber(
    payload: Dict[str, Any],
    subscriber_tenant_id: str,
    subscriber_aircraft_ids: List[str],
    field_groups: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Filter a telemetry decision envelope for a specific tenant and subscription.
    Returns None if the payload does not belong to the subscriber's tenant or fleet.
    """
    uav_id = payload.get("uav_id", "")
    tenant_aircraft = TENANT_FLEET_MAPPING.get(subscriber_tenant_id, [])

    # Check tenant isolation
    if subscriber_tenant_id != "default":
        if uav_id not in tenant_aircraft and "*" not in tenant_aircraft:
            return None

    # Check subscriber aircraft filter
    if "*" not in subscriber_aircraft_ids and uav_id not in subscriber_aircraft_ids:
        return None

    # If no field group filtering is requested, return payload directly
    if not field_groups:
        return payload

    # Build filtered payload
    allowed_fields = set()
    for grp in field_groups:
        allowed_fields.update(FIELD_GROUP_MAPPING.get(grp, []))

    # Always preserve core envelope identification and interactive response channels
    allowed_fields.update([
        "envelope_version", "emitted_at", "cycle", "uav_id", "engine_id", "alert",
        "buffer_pct", "predicted_rul", "true_rul", "ai_engineer_response",
        "whatif_result", "optimize_result", "demo_state", "federated_round", "edge_profile"
    ])

    filtered = {k: v for k, v in payload.items() if k in allowed_fields}
    return filtered


# ── Rate Limiter & Replay Guard ───────────────────────────────────────────────

class RateLimiter:
    """Sliding-window in-memory rate limiter per client IP or token subject."""

    def __init__(self, max_requests_per_sec: int = 30):
        self.max_requests = max_requests_per_sec
        self._history: Dict[str, List[float]] = {}

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        window = now - 1.0

        if client_id not in self._history:
            self._history[client_id] = [now]
            return True

        # Prune older than 1 sec
        self._history[client_id] = [t for t in self._history[client_id] if t > window]

        if len(self._history[client_id]) >= self.max_requests:
            return False

        self._history[client_id].append(now)
        return True


class ReplayGuard:
    """
    Checks that command timestamps are within an acceptable time window (e.g. 60s)
    to prevent replay attacks from recorded network packets.
    """

    def __init__(self, max_drift_seconds: float = 60.0):
        self.max_drift = max_drift_seconds

    def validate_timestamp(self, issued_at_iso: str) -> Tuple[bool, str]:
        if not issued_at_iso:
            return False, "Command missing required 'issued_at' timestamp"
        try:
            from datetime import datetime, timezone
            dt = datetime.fromisoformat(issued_at_iso.replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            delta = abs((now_dt - dt).total_seconds())
            if delta > self.max_drift:
                return False, f"Command timestamp rejected: time drift of {delta:.1f}s exceeds {self.max_drift}s window"
            return True, "OK"
        except Exception as e:
            return False, f"Invalid timestamp format: {e}"
