"""
tests/test_multi_tenant.py

Comprehensive test suite verifying Phase 3 Exit Criteria (improvement_plan.md §4 Phase 3):
  1. Two accounts cannot see each other's data (automated multi-tenant isolation test).
  2. No secret in any client bundle (verifies retirement of NEXT_PUBLIC_* tokens).
  3. Dev/staging/prod environments and schema migrations.
  4. Command path returns 401/403 correctly.
  5. Rate limiting and command replay protection.
"""

import os
import sys
import json
import time
import asyncio
import unittest
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "packages", "twin-core"))
sys.path.insert(0, os.path.join(_REPO_ROOT, "backend"))

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
)
from twin_core.event_store import EventStore
from twin_core.feature_flags import (
    is_feature_enabled,
    set_feature_override,
    clear_feature_override,
    list_feature_flags,
)


class TestTokenGenerationAndVerification(unittest.TestCase):
    """Verifies HS256 JWT access token generation, expiration, and tampering detection."""

    def test_valid_token_generation_and_payload_decode(self):
        token = create_access_token(
            user_id="capt_miller",
            tenant_id="tenant_alpha",
            role=ROLE_DISPATCHER,
            aircraft_ids=["UAV-01", "UAV-02"],
            expires_in_seconds=600,
        )
        self.assertIsInstance(token, str)
        self.assertEqual(token.count("."), 2)

        is_valid, payload, err = verify_access_token(token)
        self.assertTrue(is_valid, f"Verification failed: {err}")
        self.assertIsNotNone(payload)
        self.assertEqual(payload["sub"], "capt_miller")
        self.assertEqual(payload["tenant_id"], "tenant_alpha")
        self.assertEqual(payload["role"], ROLE_DISPATCHER)
        self.assertEqual(payload["aircraft_ids"], ["UAV-01", "UAV-02"])

    def test_expired_token_rejected(self):
        # Generate token expired 10 seconds ago
        token = create_access_token(
            user_id="expired_user",
            expires_in_seconds=-10,
        )
        is_valid, payload, err = verify_access_token(token)
        self.assertFalse(is_valid)
        self.assertIn("expired", err.lower())

    def test_tampered_token_signature_rejected(self):
        token = create_access_token(user_id="victim", role=ROLE_VIEWER)
        parts = token.split(".")
        # Tamper with the payload segment
        tampered_token = f"{parts[0]}.eyJyZXBsYWNlZCI6InRydWUifQ.{parts[2]}"
        is_valid, payload, err = verify_access_token(tampered_token)
        self.assertFalse(is_valid)
        self.assertIn("signature", err.lower())

    def test_malformed_token_rejected(self):
        is_valid, _, err = verify_access_token("not-a-real-token")
        self.assertFalse(is_valid)
        self.assertIn("segments", err.lower())


class TestMultiTenantFleetAuthorization(unittest.TestCase):
    """Verifies aircraft-scoped tenant boundary enforcement."""

    def test_tenant_alpha_aircraft_boundaries(self):
        alpha_caller = {
            "sub": "user_alpha",
            "tenant_id": "tenant_alpha",
            "role": ROLE_DISPATCHER,
            "aircraft_ids": ["UAV-01", "UAV-02", "UAV-03"],
        }
        # Permitted Alpha aircraft
        self.assertTrue(authorize_aircraft_access(alpha_caller, "UAV-01"))
        self.assertTrue(authorize_aircraft_access(alpha_caller, "UAV-02"))
        self.assertTrue(authorize_aircraft_access(alpha_caller, "UAV-03"))

        # Forbidden Bravo aircraft
        self.assertFalse(authorize_aircraft_access(alpha_caller, "UAV-04"))
        self.assertFalse(authorize_aircraft_access(alpha_caller, "UAV-05"))

    def test_tenant_bravo_aircraft_boundaries(self):
        bravo_caller = {
            "sub": "user_bravo",
            "tenant_id": "tenant_bravo",
            "role": ROLE_DISPATCHER,
            "aircraft_ids": ["UAV-04", "UAV-05"],
        }
        # Permitted Bravo aircraft
        self.assertTrue(authorize_aircraft_access(bravo_caller, "UAV-04"))
        self.assertTrue(authorize_aircraft_access(bravo_caller, "UAV-05"))

        # Forbidden Alpha aircraft
        self.assertFalse(authorize_aircraft_access(bravo_caller, "UAV-01"))
        self.assertFalse(authorize_aircraft_access(bravo_caller, "UAV-02"))


class TestRBACCommandAuthorization(unittest.TestCase):
    """Verifies RBAC rules (viewer, dispatcher, maintainer, admin) and 401/403 status returns."""

    def test_unauthenticated_command_returns_401(self):
        authorized, code, reason = authorize_command(None, "set_speed", "UAV-01")
        self.assertFalse(authorized)
        self.assertEqual(code, 401)
        self.assertIn("Authentication required", reason)

    def test_cross_tenant_command_returns_403(self):
        alpha_dispatcher = {
            "sub": "alpha_disp",
            "tenant_id": "tenant_alpha",
            "role": ROLE_DISPATCHER,
            "aircraft_ids": ["UAV-01", "UAV-02", "UAV-03"],
        }
        # Attempt to command UAV-04 (Bravo aircraft)
        authorized, code, reason = authorize_command(alpha_dispatcher, "set_speed", "UAV-04")
        self.assertFalse(authorized)
        self.assertEqual(code, 403)
        self.assertIn("outside your tenant fleet", reason)

    def test_viewer_role_cannot_modify_state_returns_403(self):
        viewer_caller = {
            "sub": "read_only_analyst",
            "tenant_id": "tenant_alpha",
            "role": ROLE_VIEWER,
            "aircraft_ids": ["UAV-01"],
        }
        # Viewer attempting fault injection
        authorized, code, reason = authorize_command(viewer_caller, "inject_fault", "UAV-01")
        self.assertFalse(authorized)
        self.assertEqual(code, 403)
        self.assertIn("Forbidden", reason)

        # Viewer attempting mission approval
        authorized, code, reason = authorize_command(viewer_caller, "mission_command_approve", "UAV-01")
        self.assertFalse(authorized)
        self.assertEqual(code, 403)

        # Viewer allowed to query AI Engineer and inspect UAV
        auth_qa, code_qa, _ = authorize_command(viewer_caller, "ai_engineer_query", "UAV-01")
        self.assertTrue(auth_qa)
        self.assertEqual(code_qa, 200)

    def test_dispatcher_permissions(self):
        disp_caller = {
            "sub": "flight_controller",
            "tenant_id": "tenant_alpha",
            "role": ROLE_DISPATCHER,
            "aircraft_ids": ["UAV-01"],
        }
        # Dispatcher can set speed, whatif, approve mission plans
        for cmd in ("set_speed", "set_profile", "whatif", "optimize", "mission_command_approve"):
            auth, code, _ = authorize_command(disp_caller, cmd, "UAV-01")
            self.assertTrue(auth, f"Dispatcher should be allowed to run {cmd}")
            self.assertEqual(code, 200)

        # Dispatcher cannot inject hardware faults
        auth_fault, code_fault, _ = authorize_command(disp_caller, "inject_fault", "UAV-01")
        self.assertFalse(auth_fault)
        self.assertEqual(code_fault, 403)

    def test_maintainer_permissions(self):
        maint_caller = {
            "sub": "engine_tech",
            "tenant_id": "tenant_alpha",
            "role": ROLE_MAINTAINER,
            "aircraft_ids": ["UAV-01"],
        }
        # Maintainer can inject and clear faults
        auth_inj, code_inj, _ = authorize_command(maint_caller, "inject_fault", "UAV-01")
        self.assertTrue(auth_inj)
        self.assertEqual(code_inj, 200)

        auth_clr, code_clr, _ = authorize_command(maint_caller, "clear_faults", "UAV-01")
        self.assertTrue(auth_clr)
        self.assertEqual(code_clr, 200)

    def test_admin_wildcard_permissions(self):
        admin_caller = {
            "sub": "sysadmin",
            "tenant_id": "tenant_alpha",
            "role": ROLE_ADMIN,
            "aircraft_ids": ["*"],
        }
        # Admin can run everything on any aircraft
        for cmd in ("set_speed", "inject_fault", "mission_command_approve", "set_edge_mode"):
            auth, code, _ = authorize_command(admin_caller, cmd, "UAV-05")
            self.assertTrue(auth)
            self.assertEqual(code, 200)


class TestStreamFiltering(unittest.TestCase):
    """Verifies per-tenant stream filtering and field group pruning."""

    def setUp(self):
        self.sample_envelope = {
            "envelope_version": "1.0",
            "emitted_at": "2026-10-09T18:00:00Z",
            "cycle": 142,
            "uav_id": "UAV-01",
            "engine_id": 1,
            "rpm": 2400.0,
            "cht": 412.0,
            "egt": 1580.0,
            "physics": {"bhp": 94.2, "bsfc": 0.44},
            "predicted_rul": 44.2,
            "is_anomaly": False,
            "health": {"health_index": 82.0},
            "alert": "NOMINAL",
        }

    def test_payload_blocked_for_cross_tenant_subscriber(self):
        # Envelope is for UAV-01 (Tenant Alpha). Tenant Bravo subscriber should get None.
        filtered = filter_payload_for_subscriber(
            payload=self.sample_envelope,
            subscriber_tenant_id="tenant_bravo",
            subscriber_aircraft_ids=["UAV-04", "UAV-05"],
        )
        self.assertIsNone(filtered, "Tenant Bravo must NOT receive Tenant Alpha telemetry")

    def test_payload_delivered_for_authorized_tenant_subscriber(self):
        filtered = filter_payload_for_subscriber(
            payload=self.sample_envelope,
            subscriber_tenant_id="tenant_alpha",
            subscriber_aircraft_ids=["UAV-01", "UAV-02"],
        )
        self.assertIsNotNone(filtered)
        self.assertEqual(filtered["uav_id"], "UAV-01")

    def test_field_group_pruning(self):
        # Request only telemetry and anomaly groups — physics and health should be pruned
        filtered = filter_payload_for_subscriber(
            payload=self.sample_envelope,
            subscriber_tenant_id="tenant_alpha",
            subscriber_aircraft_ids=["UAV-01"],
            field_groups=["telemetry", "anomaly"],
        )
        self.assertIsNotNone(filtered)
        self.assertIn("rpm", filtered)
        self.assertIn("is_anomaly", filtered)
        self.assertNotIn("physics", filtered)
        self.assertNotIn("health", filtered)
        # Always retain core identification
        self.assertIn("cycle", filtered)
        self.assertIn("uav_id", filtered)


class TestCommandRateLimitingAndReplay(unittest.TestCase):
    """Verifies sliding window rate limiter and replay attack timestamp validation."""

    def test_rate_limiter_allows_and_throttles(self):
        limiter = RateLimiter(max_requests_per_sec=5)
        client = "192.168.1.100"

        # First 5 should succeed
        for _ in range(5):
            self.assertTrue(limiter.is_allowed(client))

        # 6th within the same second should be throttled
        self.assertFalse(limiter.is_allowed(client))

    def test_replay_guard_accepts_current_timestamp(self):
        guard = ReplayGuard(max_drift_seconds=60.0)
        now_iso = datetime.now(timezone.utc).isoformat()
        ok, err = guard.validate_timestamp(now_iso)
        self.assertTrue(ok)
        self.assertEqual(err, "OK")

    def test_replay_guard_rejects_stale_timestamp(self):
        guard = ReplayGuard(max_drift_seconds=60.0)
        stale_iso = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        ok, err = guard.validate_timestamp(stale_iso)
        self.assertFalse(ok)
        self.assertIn("time drift", err)

    def test_replay_guard_rejects_missing_timestamp(self):
        guard = ReplayGuard(max_drift_seconds=60.0)
        ok, err = guard.validate_timestamp("")
        self.assertFalse(ok)
        self.assertIn("missing", err)


class TestReplayEventStoreTenantIsolation(unittest.TestCase):
    """Verifies that the EventStore partitions flights and events cleanly per tenant."""

    def setUp(self):
        self.store = EventStore(db_path=":memory:")

    def tearDown(self):
        self.store.close()

    def test_event_store_tenant_isolation(self):
        # Record events for Tenant Alpha (UAV-01)
        self.store.append_event(
            event_type="TELEMETRY",
            aircraft_id="UAV-01",
            flight_id="flight-alpha-101",
            cycle=1,
            payload={"rpm": 2400},
            tenant_id="tenant_alpha",
        )

        # Record events for Tenant Bravo (UAV-04)
        self.store.append_event(
            event_type="TELEMETRY",
            aircraft_id="UAV-04",
            flight_id="flight-bravo-202",
            cycle=1,
            payload={"rpm": 2200},
            tenant_id="tenant_bravo",
        )

        # Query flights as Tenant Alpha
        alpha_flights = self.store.list_flights(tenant_id="tenant_alpha")
        alpha_flight_ids = [f["flight_id"] for f in alpha_flights]
        self.assertIn("flight-alpha-101", alpha_flight_ids)
        self.assertNotIn("flight-bravo-202", alpha_flight_ids)

        # Query flights as Tenant Bravo
        bravo_flights = self.store.list_flights(tenant_id="tenant_bravo")
        bravo_flight_ids = [f["flight_id"] for f in bravo_flights]
        self.assertIn("flight-bravo-202", bravo_flight_ids)
        self.assertNotIn("flight-alpha-101", bravo_flight_ids)


class TestNoSecretInClientBundle(unittest.TestCase):
    """Exit criterion: assert no long-lived secret tokens remain in any client source file."""

    def test_no_secret_token_in_frontend(self):
        frontend_dir = os.path.join(_REPO_ROOT, "frontend")
        forbidden_patterns = [
            "NEXT_PUBLIC_UAV_TWIN_AUTH_TOKEN",
            "NEXT_PUBLIC_AUTH_TOKEN",
            "NEXT_PUBLIC_SECRET",
            "uav-defense-twin-secret-key",
        ]

        found_violations = []
        for root, _, files in os.walk(frontend_dir):
            if "node_modules" in root or ".next" in root:
                continue
            for file in files:
                if file.endswith((".ts", ".tsx", ".js", ".jsx", ".json", ".env")):
                    path = os.path.join(root, file)
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                        for pat in forbidden_patterns:
                            if pat in content:
                                rel_path = os.path.relpath(path, _REPO_ROOT)
                                found_violations.append(f"{rel_path}: contains forbidden pattern '{pat}'")

        self.assertEqual(len(found_violations), 0, f"Secret leakage in frontend bundle:\n" + "\n".join(found_violations))


class TestDeployEnvironmentsAndMigrations(unittest.TestCase):
    """Verifies presence of dev, staging, prod environment files and schema migrations."""

    def test_environment_files_exist(self):
        infra_env = os.path.join(_REPO_ROOT, "infra", "environments")
        for env_file in (".env.dev", ".env.staging", ".env.prod"):
            full_path = os.path.join(infra_env, env_file)
            self.assertTrue(os.path.isfile(full_path), f"Missing environment file: {env_file}")

    def test_schema_migrations_recorded(self):
        store = EventStore(db_path=":memory:")
        migrations = store.get_applied_migrations()
        store.close()

        applied_versions = {m["version"] for m in migrations}
        expected = {"001_initial_tables", "002_tenant_partition_keys", "003_audit_signatures"}
        self.assertTrue(expected.issubset(applied_versions), f"Missing migrations: {expected - applied_versions}")

    def test_feature_flags_registry(self):
        flags = list_feature_flags()
        self.assertIn("strict_tenant_isolation", flags)
        self.assertTrue(is_feature_enabled("strict_tenant_isolation"))

        set_feature_override("strict_tenant_isolation", False)
        self.assertFalse(is_feature_enabled("strict_tenant_isolation"))
        clear_feature_override("strict_tenant_isolation")
        self.assertTrue(is_feature_enabled("strict_tenant_isolation"))


class TestWebSocketMultiTenantLiveIsolation(unittest.TestCase):
    """Verifies live WebSocket per-tenant stream filtering and 401/403 rejection."""

    def test_websocket_cross_tenant_command_rejected_with_403(self):
        import websockets
        from unittest.mock import patch
        import backend.inference as inf

        async def wait_for_response(ws, expected_statuses):
            for _ in range(10):
                msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                data = json.loads(msg)
                if data.get("status") in expected_statuses:
                    return data
            return data

        async def run_ws_test():
            test_port = 8799
            # Set up server
            server = await websockets.serve(inf.ws_handler, "127.0.0.1", test_port)
            try:
                # 1. Connect Client Alpha (owns UAV-01..03)
                token_alpha = create_access_token(
                    user_id="pilot_alpha",
                    tenant_id="tenant_alpha",
                    role=ROLE_DISPATCHER,
                    aircraft_ids=["UAV-01", "UAV-02", "UAV-03"],
                )
                async with websockets.connect(f"ws://127.0.0.1:{test_port}/?token={token_alpha}") as ws_alpha:
                    # Client Alpha attempts to set speed on UAV-04 (Bravo aircraft)
                    await ws_alpha.send(json.dumps({
                        "command": "set_speed",
                        "speed": 1.5,
                        "aircraft_id": "UAV-04",
                    }))
                    data = await wait_for_response(ws_alpha, ("FORBIDDEN", "UNAUTHORIZED"))
                    self.assertEqual(data.get("status"), "FORBIDDEN")
                    self.assertEqual(data.get("code"), 403)
                    self.assertIn("outside your tenant fleet", data.get("error", ""))

                # 2. Connect Viewer Role and attempt fault injection -> 403
                token_viewer = create_access_token(
                    user_id="observer",
                    tenant_id="tenant_alpha",
                    role=ROLE_VIEWER,
                    aircraft_ids=["UAV-01"],
                )
                async with websockets.connect(f"ws://127.0.0.1:{test_port}/?token={token_viewer}") as ws_viewer:
                    await ws_viewer.send(json.dumps({
                        "command": "inject_fault",
                        "fault": "misfire",
                        "aircraft_id": "UAV-01",
                    }))
                    data = await wait_for_response(ws_viewer, ("FORBIDDEN", "UNAUTHORIZED"))
                    self.assertEqual(data.get("status"), "FORBIDDEN")
                    self.assertEqual(data.get("code"), 403)
                    self.assertIn("Forbidden", data.get("error", ""))

                # 3. Connect unauthenticated when auth is required -> 401
                with patch.object(inf, "REQUIRE_AUTH", True):
                    async with websockets.connect(f"ws://127.0.0.1:{test_port}") as ws_unauth:
                        await ws_unauth.send(json.dumps({
                            "command": "set_speed",
                            "speed": 1.2,
                            "aircraft_id": "UAV-01",
                        }))
                        data = await wait_for_response(ws_unauth, ("FORBIDDEN", "UNAUTHORIZED"))
                        self.assertEqual(data.get("status"), "UNAUTHORIZED")
                        self.assertEqual(data.get("code"), 401)

            finally:
                server.close()
                await server.wait_closed()

        asyncio.run(run_ws_test())


if __name__ == "__main__":
    unittest.main(verbosity=2)
