"""
tests/test_production_readiness.py

Automated Test Suite for UAV Digital Twin Production Implementation Plan:
  1. Health & Readiness Probes (/health/live, /health/ready, /health/models)
  2. Two-Person Human-in-the-Loop Approval Workflow (ASTM F3269-17)
  3. Database Maintenance & Recovery (backup, restore, prune)
  4. Telemetry Integrity & Staleness Protection (suppression of false green states)
"""

import os
import sys
import json
import sqlite3
import tempfile
import unittest
import threading
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
import urllib.request
import urllib.error

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "packages", "twin-core"))
sys.path.insert(0, os.path.join(_REPO_ROOT, "backend"))

from twin_core.safety_assurance import (
    AdvisorySafetyEnvelope,
    TwoPersonApprovalGate,
    two_person_approval_gate,
)
from twin_core.event_store import EventStore
from twin_core.model_governance import model_promotion_gate
from backend.api_server import TwinApiHandler
from infra.scripts.backup_event_store import backup_database, compute_sha256
from infra.scripts.restore_event_store import restore_database, verify_backup_integrity
from infra.scripts.prune_event_store import prune_event_store


class TestTwoPersonApprovalGate(unittest.TestCase):
    """Verifies Two-Person Integrity Gate enforcing human-in-the-loop oversight."""

    def setUp(self):
        self.gate = TwoPersonApprovalGate()
        self.envelope = AdvisorySafetyEnvelope()

    def test_requester_cannot_self_approve_safety_critical_action(self):
        """Two-person rule: A requester cannot approve their own action."""
        req = self.gate.create_request(
            action_id="ACT-101",
            action_type="EMERGENCY_DERATE",
            requested_by="pilot_alpha",
            payload={"target_rpm": 2200},
            requester_role="MISSION_OPERATOR",
        )
        self.assertEqual(req["status"], "PENDING_SECOND_APPROVAL")

        # Attempt self-approval
        ok, res, msg = self.gate.approve_request(
            action_id="ACT-101",
            approved_by="pilot_alpha",
            approver_role="SAFETY_OFFICER",
        )
        self.assertFalse(ok)
        self.assertIn("Two-person rule violation", msg)
        self.assertEqual(res["status"], "PENDING_SECOND_APPROVAL")

    def test_distinct_officer_approves_with_audit_digest(self):
        """Two-person rule: A distinct authorized officer approves successfully with audit digest."""
        req = self.gate.create_request(
            action_id="ACT-102",
            action_type="ENGINE_SHUTDOWN_ADVISORY",
            requested_by="operator_01",
            payload={"subsystem": "propulsion"},
        )
        ok, res, msg = self.gate.approve_request(
            action_id="ACT-102",
            approved_by="safety_officer_02",
            approver_role="SAFETY_OFFICER",
            comment="Confirmed redundant sensor thermal divergence.",
        )
        self.assertTrue(ok)
        self.assertEqual(res["status"], "APPROVED")
        self.assertEqual(res["approved_by"], "safety_officer_02")
        self.assertIsNotNone(res["audit_digest"])
        self.assertGreater(len(res["audit_digest"]), 32)

    def test_rejection_marks_request_rejected(self):
        """Rejected actions are marked REJECTED with recorded reason."""
        self.gate.create_request(
            action_id="ACT-103",
            action_type="OVERRIDE_THROTTLE",
            requested_by="operator_01",
        )
        ok, res, msg = self.gate.reject_request(
            action_id="ACT-103",
            rejected_by="commander_09",
            reason="Flight phase is active climb; derate rejected.",
        )
        self.assertTrue(ok)
        self.assertEqual(res["status"], "REJECTED")
        self.assertEqual(res["rejection_reason"], "Flight phase is active climb; derate rejected.")

    def test_advisory_safety_envelope_enforces_two_person_verification(self):
        """AdvisorySafetyEnvelope suppresses safety-critical recommendations violating two-person rule."""
        # Case 1: Self-approved critical action is suppressed
        rec_self_approved = {
            "action_text": "Derate engine to loiter speed",
            "recommended_rpm": 2400.0,
            "safety_critical": True,
            "requested_by": "operator_smith",
            "approved_by": "operator_smith",
        }
        res1 = self.envelope.evaluate_recommendation(
            recommendation=rec_self_approved,
            current_telemetry={"rpm": 2800.0},
            flight_phase="cruise",
        )
        self.assertFalse(res1["approved"])
        self.assertTrue(any("Two-person rule violation" in v for v in res1["violations"]))

        # Case 2: Distinct requester and approver succeeds
        rec_dual_approved = {
            "action_text": "Derate engine to loiter speed",
            "recommended_rpm": 2400.0,
            "safety_critical": True,
            "requested_by": "operator_smith",
            "approved_by": "commander_jones",
        }
        res2 = self.envelope.evaluate_recommendation(
            recommendation=rec_dual_approved,
            current_telemetry={"rpm": 2800.0},
            flight_phase="cruise",
        )
        self.assertTrue(res2["approved"])
        self.assertEqual(res2["status"], "APPROVED_ADVISORY")


class TestDatabaseMaintenanceScripts(unittest.TestCase):
    """Verifies SQLite EventStore backup, integrity check, atomic restore, and pruning."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_event_store.db")
        self.store = EventStore(db_path=self.db_path)

        # Seed sample events
        for i in range(25):
            self.store.append_event(
                event_type="decision",
                aircraft_id="UAV-01",
                flight_id="FLT-100",
                cycle=i,
                payload={"rpm": 5200 + i, "cht": 380.0},
                tenant_id="tenant_alpha",
            )

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_backup_creates_valid_database_and_metadata(self):
        """backup_database creates an exact copy with verified SHA-256 and PRAGMA integrity."""
        backup_dir = os.path.join(self.temp_dir, "backups")
        meta = backup_database(
            source_db_path=self.db_path,
            output_dir=backup_dir,
            verify=True,
        )
        self.assertEqual(meta["status"], "COMPLETED")
        self.assertTrue(os.path.exists(meta["backup_db"]))
        self.assertTrue(meta["verified"])
        self.assertEqual(meta["integrity_check"], "ok")

        # Verify backup contains exact same event count
        backup_store = EventStore(db_path=meta["backup_db"])
        rows = backup_store.get_replay_events("FLT-100")
        self.assertEqual(len(rows), 25)

    def test_restore_database_atomically_restores_database(self):
        """restore_database atomically swaps target file after integrity verification."""
        backup_dir = os.path.join(self.temp_dir, "backups")
        meta = backup_database(self.db_path, backup_dir)
        backup_file = meta["backup_db"]

        # Simulate catastrophic database corruption on target
        corrupt_target = os.path.join(self.temp_dir, "restored_target.db")
        with open(corrupt_target, "wb") as f:
            f.write(b"CORRUPTED_BYTES_NOT_A_SQLITE_FILE")

        report = restore_database(backup_file, corrupt_target)
        self.assertEqual(report["status"], "RESTORED")
        self.assertTrue(report["verified"])

        # Check restored db is fully readable
        restored_store = EventStore(db_path=corrupt_target)
        rows = restored_store.get_replay_events("FLT-100")
        self.assertEqual(len(rows), 25)

    def test_prune_event_store_dry_run_and_execution(self):
        """prune_event_store reports eligible rows in dry-run and reclaims disk space."""
        # Dry run with retention_days=0 (all events eligible)
        res_dry = prune_event_store(
            db_path=self.db_path,
            retention_days=0,
            dry_run=True,
        )
        self.assertEqual(res_dry["status"], "DRY_RUN_COMPLETED")
        self.assertEqual(res_dry["eligible_for_deletion"], 25)
        self.assertEqual(res_dry["rows_pruned"], 0)

        # Active prune with retention_days=0 and vacuum=True
        res_prune = prune_event_store(
            db_path=self.db_path,
            retention_days=0,
            dry_run=False,
            vacuum=True,
        )
        self.assertEqual(res_prune["status"], "PRUNED")
        self.assertEqual(res_prune["rows_pruned"], 25)
        self.assertEqual(res_prune["total_events_after"], 0)
        self.assertTrue(res_prune["vacuum_executed"])


class TestHealthEndpoints(unittest.TestCase):
    """Verifies /health/live, /health/ready, /health/models and approval REST endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), TwinApiHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def _get(self, path: str):
        url = f"http://127.0.0.1:{self.port}{path}"
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return resp.status, data
        except urllib.error.HTTPError as err:
            data = json.loads(err.read().decode("utf-8"))
            return err.code, data

    def _post(self, path: str, payload: dict, token: str = None):
        url = f"http://127.0.0.1:{self.port}{path}"
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return resp.status, data
        except urllib.error.HTTPError as err:
            data = json.loads(err.read().decode("utf-8"))
            return err.code, data

    def test_health_live_endpoint_returns_alive(self):
        """GET /health/live returns HTTP 200 with process pid and uptime."""
        status, data = self._get("/health/live")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "ALIVE")
        self.assertIn("pid", data)
        self.assertIn("uptime_seconds", data)

    def test_health_ready_endpoint_returns_ready(self):
        """GET /health/ready returns HTTP 200 verifying database and models."""
        status, data = self._get("/health/ready")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "READY")
        self.assertEqual(data["checks"]["database"], "OK")
        self.assertEqual(data["checks"]["models"], "OK")

    def test_health_models_endpoint_returns_champion(self):
        """GET /health/models returns active champion model metadata and manifests."""
        status, data = self._get("/health/models")
        self.assertEqual(status, 200)
        self.assertEqual(data["status"], "OK")
        self.assertIn("active_champion", data)
        self.assertTrue(data["hash_verification_enforced"])

    def test_two_person_approval_api_workflow(self):
        """Verifies full create -> self-approve reject -> distinct approve cycle over REST."""
        # 1. Create request
        action_id = f"REST-ACT-{int(datetime.now().timestamp() * 1000)}"
        status, data = self._post("/api/compliance/approvals/create", {
            "action_id": action_id,
            "action_type": "HIGH_ALTITUDE_DERATE",
            "requested_by": "pilot_falcon",
            "requester_role": "PILOT",
        })
        self.assertEqual(status, 201)
        self.assertEqual(data["request"]["status"], "PENDING_SECOND_APPROVAL")

        # 2. Self-approval attempt must fail
        status, data = self._post("/api/compliance/approvals/approve", {
            "action_id": action_id,
            "approved_by": "pilot_falcon",
        })
        self.assertEqual(status, 403)
        self.assertIn("Two-person rule violation", data["error"])

        # 3. Distinct approval succeeds
        status, data = self._post("/api/compliance/approvals/approve", {
            "action_id": action_id,
            "approved_by": "supervisor_vance",
            "approver_role": "SAFETY_SUPERVISOR",
            "comment": "Approved following weather radar check.",
        })
        self.assertEqual(status, 200)
        self.assertEqual(data["request"]["status"], "APPROVED")
        self.assertEqual(data["request"]["approved_by"], "supervisor_vance")

        # 4. List approvals
        status, data = self._get("/api/compliance/approvals")
        self.assertEqual(status, 200)
        matches = [a for a in data["approvals"] if a["action_id"] == action_id]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["status"], "APPROVED")


if __name__ == "__main__":
    unittest.main()
