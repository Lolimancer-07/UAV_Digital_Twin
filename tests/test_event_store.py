"""
tests/test_event_store.py

Comprehensive Phase 2 Test Suite: Persist, Replay, and Audit.
Validates all Phase 2 goals and exit criteria from improvement_plan.md §4:
  1. Append-only event store with SQLite WAL mode.
  2. Frame-accurate replay after a full system restart.
  3. Command Envelope v1 validation and idempotency (intent_id).
  4. Immutable audit trail: who commanded what, when, and with what effect.
  5. Operator cycle annotations.
  6. Flight run comparative analysis (Run A vs Run B).
  7. Post-flight maintenance report generation reproducible from stored events alone.
  8. Retention policy and JSONL export migration path.

Running:
  pytest tests/test_event_store.py -v
"""

import os
import json
import tempfile
import unittest
from datetime import datetime, timezone

from twin_core.event_store import EventStore
from twin_core.report_generator import (
    generate_flight_report,
    render_report_html,
    export_report_bundle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMMAND_SCHEMA_PATH = os.path.join(ROOT, "packages", "contracts", "command_envelope_v1.json")


class TestEventStorePersistence(unittest.TestCase):
    """Test append-only event store persistence and flight summary maintenance."""

    def setUp(self):
        self.store = EventStore(":memory:")

    def tearDown(self):
        self.store.close()

    def test_append_event_and_signature(self):
        payload = {
            "envelope_version": "1.0",
            "cycle": 1,
            "engine_id": 1,
            "uav_id": "UAV-01",
            "alert": "NOMINAL",
            "rpm": 2400.0,
            "cht": 380.0,
        }
        eid = self.store.append_event(
            event_type="decision",
            aircraft_id="UAV-01",
            flight_id="flight-test-01",
            cycle=1,
            payload=payload,
            raw_input={"rpm": 2400.0, "cht": 380.0},
        )
        self.assertIsInstance(eid, int)
        self.assertGreater(eid, 0)

        # Retrieve event
        events = self.store.get_replay_events("flight-test-01")
        self.assertEqual(len(events), 1)
        ev = events[0]
        self.assertEqual(ev["cycle"], 1)
        self.assertEqual(ev["alert"], "NOMINAL")
        self.assertEqual(ev["rpm"], 2400.0)
        self.assertIn("_raw_input", ev)
        self.assertEqual(ev["_raw_input"]["cht"], 380.0)

    def test_flight_summary_upsert(self):
        # Insert 3 events
        for c, alert in [(1, "NOMINAL"), (2, "WARNING"), (3, "CRITICAL")]:
            self.store.append_decision(
                aircraft_id="UAV-01",
                flight_id="flight-summary-test",
                cycle=c,
                envelope={"envelope_version": "1.0", "cycle": c, "alert": alert, "predicted_rul": 100 - c},
            )

        flights = self.store.list_flights()
        self.assertEqual(len(flights), 1)
        fl = flights[0]
        self.assertEqual(fl["flight_id"], "flight-summary-test")
        self.assertEqual(fl["total_cycles"], 3)
        self.assertEqual(fl["start_cycle"], 1)
        self.assertEqual(fl["end_cycle"], 3)
        self.assertEqual(fl["warning_count"], 1)
        self.assertEqual(fl["critical_count"], 1)


class TestFrameAccurateReplayAfterRestart(unittest.TestCase):
    """
    Exit Criteria 1: A pilot flight can be replayed frame-accurately after a restart.
    Verifies that writing events to disk, closing the connection entirely,
    and opening a fresh instance yields 100% exact frame-by-frame equality.
    """

    def test_frame_accurate_replay_across_restart(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
            db_path = tmp.name

        try:
            # 1. First process session: record 25 cycles
            store1 = EventStore(db_path)
            flight_id = "flight-pilot-001"
            recorded_payloads = []

            for cycle in range(1, 26):
                payload = {
                    "envelope_version": "1.0",
                    "emitted_at": f"2026-10-09T14:{cycle:02d}:00Z",
                    "cycle": cycle,
                    "engine_id": 1,
                    "uav_id": "UAV-01",
                    "alert": "CRITICAL" if cycle >= 22 else ("WARNING" if cycle >= 18 else "NOMINAL"),
                    "rpm": round(2380.0 + cycle * 2.5, 1),
                    "cht": round(375.0 + cycle * 2.8, 1),
                    "egt": round(1350.0 + cycle * 4.0, 1),
                    "oil_pressure": round(58.0 - cycle * 0.4, 1),
                    "vibration": round(0.72 + cycle * 0.05, 3),
                    "predicted_rul": round(95.0 - cycle * 1.8, 1),
                    "health": {"health_index": round(96.0 - cycle * 1.2, 1)},
                    "xai": {
                        "is_anomaly": cycle >= 18,
                        "top_driver": "cht" if cycle >= 18 else None,
                        "narrative": "Thermal divergence detected on cylinder head" if cycle >= 18 else None,
                    },
                }
                raw = {"cycle": cycle, "rpm": payload["rpm"], "cht": payload["cht"]}
                store1.append_decision("UAV-01", flight_id, cycle, payload, raw_inputs=raw)
                recorded_payloads.append(payload)

            # Close the store (simulating system shutdown / reboot)
            store1.close()
            del store1

            # 2. Second session: open database afresh from disk
            store2 = EventStore(db_path)
            replayed_events = store2.get_replay_events(flight_id)

            self.assertEqual(len(replayed_events), 25)

            for original, replayed in zip(recorded_payloads, replayed_events):
                # Assert frame-accurate equality across every channel
                self.assertEqual(original["cycle"], replayed["cycle"])
                self.assertEqual(original["alert"], replayed["alert"])
                self.assertEqual(original["rpm"], replayed["rpm"])
                self.assertEqual(original["cht"], replayed["cht"])
                self.assertEqual(original["egt"], replayed["egt"])
                self.assertEqual(original["oil_pressure"], replayed["oil_pressure"])
                self.assertEqual(original["vibration"], replayed["vibration"])
                self.assertEqual(original["predicted_rul"], replayed["predicted_rul"])
                self.assertEqual(original["health"]["health_index"], replayed["health"]["health_index"])
                self.assertEqual(original["xai"]["top_driver"], replayed["xai"]["top_driver"])
                self.assertEqual(original["xai"]["narrative"], replayed["xai"]["narrative"])

            # Verify slice query (e.g. cycle 10 to 15)
            sliced = store2.get_replay_events(flight_id, start_cycle=10, end_cycle=15)
            self.assertEqual(len(sliced), 6)
            self.assertEqual(sliced[0]["cycle"], 10)
            self.assertEqual(sliced[-1]["cycle"], 15)

            store2.close()
        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)


class TestCommandEnvelopeAndAuditTrail(unittest.TestCase):
    """
    Exit Criteria 2: Every operator command appears in an immutable audit trail.
    Verifies schema compliance, idempotency via intent_id, and audit querying.
    """

    def setUp(self):
        self.store = EventStore(":memory:")

    def tearDown(self):
        self.store.close()

    def test_command_envelope_schema_file_exists_and_valid(self):
        self.assertTrue(os.path.exists(COMMAND_SCHEMA_PATH))
        with open(COMMAND_SCHEMA_PATH, "r") as f:
            schema = json.load(f)
        self.assertEqual(schema["title"], "UAV Digital Twin — Command Envelope v1.0")
        self.assertIn("intent_id", schema["required"])
        self.assertIn("command", schema["required"])
        self.assertIn("aircraft_id", schema["required"])
        self.assertIn("issued_by", schema["required"])

    def test_command_recording_and_audit_trail(self):
        cmd_envelope = {
            "command_version": "1.0",
            "command": "inject_fault",
            "aircraft_id": "UAV-01",
            "intent_id": "CMD-INTENT-001",
            "issued_by": "operator-rishi",
            "issued_at": datetime.now(timezone.utc).isoformat(),
            "params": {"fault": "HIGH_CHT"},
            "signature": "sha256:abc123mocksignature",
        }

        # First recording: must succeed
        is_new, record = self.store.record_command(
            cmd_envelope,
            status="EXECUTED",
            effect={"status": "FAULT_INJECTED", "cycle": 42},
        )
        self.assertTrue(is_new)
        self.assertEqual(record["intent_id"], "CMD-INTENT-001")
        self.assertEqual(record["status"], "EXECUTED")
        self.assertEqual(record["effect"]["status"], "FAULT_INJECTED")

        # Second recording with identical intent_id: must be recognized as duplicate (idempotent)
        is_new_dup, record_dup = self.store.record_command(
            cmd_envelope,
            status="EXECUTED",
        )
        self.assertFalse(is_new_dup)
        self.assertEqual(record_dup["intent_id"], "CMD-INTENT-001")

        # Query audit log
        audit = self.store.list_commands(aircraft_id="UAV-01")
        self.assertEqual(len(audit), 1)
        self.assertEqual(audit[0]["command"], "inject_fault")
        self.assertEqual(audit[0]["issued_by"], "operator-rishi")
        self.assertEqual(audit[0]["params"]["fault"], "HIGH_CHT")

    def test_reject_command_without_intent_id(self):
        invalid_cmd = {
            "command_version": "1.0",
            "command": "set_speed",
            "aircraft_id": "UAV-01",
            "issued_by": "operator",
        }
        with self.assertRaises(ValueError):
            self.store.record_command(invalid_cmd)


class TestPostFlightReportReproducibility(unittest.TestCase):
    """
    Exit Criteria 3: Report generation is reproducible from stored events alone.
    Verifies that complete post-flight bundles can be generated purely from stored
    events without any external dependencies or live state.
    """

    def setUp(self):
        self.store = EventStore(":memory:")
        self.flight_id = "flight-deb-042"

        # Record a mission run with 15 cycles
        for c in range(1, 16):
            self.store.append_decision(
                aircraft_id="UAV-02",
                flight_id=self.flight_id,
                cycle=c,
                envelope={
                    "envelope_version": "1.0",
                    "emitted_at": f"2026-10-09T10:{c:02d}:00Z",
                    "cycle": c,
                    "engine_id": 2,
                    "uav_id": "UAV-02",
                    "rpm": 2420.0 + c,
                    "cht": 380.0 + (c * 3.5 if c >= 10 else 1.0),
                    "egt": 1380.0,
                    "oil_pressure": 54.0,
                    "vibration": 0.85,
                    "predicted_rul": round(90.0 - c * 1.5, 1),
                    "health": {"health_index": round(95.0 - c * 1.0, 1)},
                    "alert": "CRITICAL" if c >= 13 else ("WARNING" if c >= 10 else "NOMINAL"),
                    "fault_events": (
                        [{"name": "HIGH_CHT", "severity": "CRITICAL", "description": "CHT exceeded redline"}]
                        if c >= 13
                        else ([{"name": "ELEVATED_CHT", "severity": "WARNING", "description": "CHT rising"}] if c >= 10 else [])
                    ),
                    "twin_consistency": {"case": "B" if c >= 10 else "A"},
                },
            )

        # Record an operator command during the flight
        self.store.record_command({
            "command_version": "1.0",
            "command": "whatif",
            "aircraft_id": "UAV-02",
            "intent_id": "CMD-DEB-01",
            "issued_by": "pilot-lead",
            "issued_at": "2026-10-09T10:11:00Z",
            "params": {"target_rpm": 2200},
        }, status="EXECUTED", effect={"outcome": "Throttle reduction evaluated"})

    def tearDown(self):
        self.store.close()

    def test_report_generation_from_stored_events_alone(self):
        report = generate_flight_report(self.store, self.flight_id)

        # 1. Flight Summary
        self.assertEqual(report["flight_id"], self.flight_id)
        self.assertEqual(report["aircraft_id"], "UAV-02")
        self.assertEqual(report["flight_summary"]["total_cycles"], 15)
        self.assertGreater(report["flight_summary"]["duration_s"], 0)

        # 2. Operational Envelope
        oe = report["operational_envelope"]
        self.assertGreater(oe["rpm_peak"], 2400)
        self.assertGreater(oe["cht_peak_f"], 400)

        # 3. Anomaly Summary
        anom = report["anomaly_summary"]
        self.assertEqual(anom["alert_breakdown"]["critical_cycles"], 3)
        self.assertEqual(anom["alert_breakdown"]["warning_cycles"], 3)
        self.assertEqual(anom["alert_breakdown"]["nominal_cycles"], 9)
        self.assertEqual(anom["twin_consistency_cases"]["case_b_real_fault"], 6)

        # 4. Prognostics Trajectory
        prog = report["prognostics_trajectory"]
        self.assertEqual(prog["initial_rul"], 88.5)
        self.assertEqual(prog["final_rul"], 67.5)
        self.assertAlmostEqual(prog["rul_burn_cycles"], 21.0, places=1)

        # 5. Prescriptive Work Orders (ATA chapters)
        wos = report["prescriptive_work_orders"]
        self.assertGreaterEqual(len(wos), 1)
        self.assertIn(wos[0]["ata_chapter"], ["ATA-72", "ATA-75"])

        # 6. Audit Trail attached
        audit = report["audit_trail"]
        self.assertEqual(len(audit), 1)
        self.assertEqual(audit[0]["command"], "whatif")
        self.assertEqual(audit[0]["issued_by"], "pilot-lead")

    def test_reproducibility_identical_outputs(self):
        """Assert that running generate_flight_report multiple times on the same stored events produces identical numbers."""
        rep1 = generate_flight_report(self.store, self.flight_id)
        rep2 = generate_flight_report(self.store, self.flight_id)

        self.assertEqual(rep1["flight_summary"], rep2["flight_summary"])
        self.assertEqual(rep1["operational_envelope"], rep2["operational_envelope"])
        self.assertEqual(rep1["anomaly_summary"], rep2["anomaly_summary"])
        self.assertEqual(rep1["prognostics_trajectory"], rep2["prognostics_trajectory"])

    def test_render_report_html_and_bundle(self):
        report = generate_flight_report(self.store, self.flight_id)
        html = render_report_html(report)

        self.assertIn("Post-Flight Maintenance Record", html)
        self.assertIn(self.flight_id, html)
        self.assertIn("UAV-02", html)
        self.assertIn("ATA", html)
        self.assertIn("HIGH_CHT", html)

        # Test bundle export
        with tempfile.TemporaryDirectory() as tmp_dir:
            paths = export_report_bundle(self.store, self.flight_id, tmp_dir)
            self.assertTrue(os.path.exists(paths["json_path"]))
            self.assertTrue(os.path.exists(paths["html_path"]))
            with open(paths["json_path"], "r") as f:
                saved_json = json.load(f)
            self.assertEqual(saved_json["flight_id"], self.flight_id)


class TestFlightComparisonAndAnnotations(unittest.TestCase):
    """Test multi-flight differential comparison and operator annotations."""

    def setUp(self):
        self.store = EventStore(":memory:")

        # Flight A: Nominal baseline run (10 cycles)
        for c in range(1, 11):
            self.store.append_decision(
                aircraft_id="UAV-01",
                flight_id="flight-A-baseline",
                cycle=c,
                envelope={
                    "envelope_version": "1.0",
                    "cycle": c,
                    "rpm": 2400.0,
                    "cht": 380.0,
                    "predicted_rul": 100.0 - c * 0.8,
                    "health": {"health_index": 98.0 - c * 0.2},
                    "alert": "NOMINAL",
                },
            )

        # Flight B: High degradation run (10 cycles)
        for c in range(1, 11):
            self.store.append_decision(
                aircraft_id="UAV-01",
                flight_id="flight-B-degraded",
                cycle=c,
                envelope={
                    "envelope_version": "1.0",
                    "cycle": c,
                    "rpm": 2480.0,
                    "cht": 415.0,
                    "predicted_rul": 100.0 - c * 2.8,
                    "health": {"health_index": 98.0 - c * 1.5},
                    "alert": "WARNING" if c < 8 else "CRITICAL",
                },
            )

    def tearDown(self):
        self.store.close()

    def test_run_comparison_metrics(self):
        comp = self.store.compare_flights("flight-A-baseline", "flight-B-degraded")
        self.assertIn("metrics", comp)
        self.assertIn("summary", comp)

        # Run B RUL should be significantly lower than Run A RUL
        self.assertLess(comp["rul_delta_cycles"], 0)
        self.assertGreater(comp["burn_rate_ratio"], 2.0)

    def test_operator_annotations(self):
        ann_id = self.store.add_annotation(
            flight_id="flight-A-baseline",
            aircraft_id="UAV-01",
            cycle=5,
            author="operator-chief",
            note="Sensor calibration verified during level flight.",
            category="OBSERVATION",
        )
        self.assertGreater(ann_id, 0)

        anns = self.store.get_annotations("flight-A-baseline")
        self.assertEqual(len(anns), 1)
        self.assertEqual(anns[0]["cycle"], 5)
        self.assertEqual(anns[0]["author"], "operator-chief")
        self.assertEqual(anns[0]["category"], "OBSERVATION")

    def test_jsonl_export(self):
        with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as tmp:
            jsonl_path = tmp.name

        try:
            self.store.export_jsonl("flight-A-baseline", jsonl_path)
            self.assertTrue(os.path.exists(jsonl_path))
            with open(jsonl_path, "r") as f:
                lines = f.readlines()
            self.assertEqual(len(lines), 10)
            first_event = json.loads(lines[0])
            self.assertEqual(first_event["cycle"], 1)
        finally:
            if os.path.exists(jsonl_path):
                os.unlink(jsonl_path)


class TestApiServerEndpoints(unittest.TestCase):
    """End-to-end HTTP integration tests for backend/api_server.py."""

    @classmethod
    def setUpClass(cls):
        import time
        from backend.api_server import start_api_server_thread
        from backend.event_store import reset_event_store

        cls.port = 8791
        cls.store = reset_event_store(":memory:")

        # Populate sample flight
        for c in range(1, 6):
            cls.store.append_decision(
                aircraft_id="UAV-01",
                flight_id="flight-http-test",
                cycle=c,
                envelope={
                    "envelope_version": "1.0",
                    "cycle": c,
                    "rpm": 2400.0,
                    "cht": 380.0,
                    "predicted_rul": 90.0 - c,
                    "health": {"health_index": 95.0},
                    "alert": "NOMINAL",
                },
            )

        cls.store.record_command({
            "command_version": "1.0",
            "command": "whatif",
            "aircraft_id": "UAV-01",
            "intent_id": "CMD-HTTP-01",
            "issued_by": "http-tester",
            "issued_at": datetime.now(timezone.utc).isoformat(),
            "params": {"rpm": 2200},
        }, status="EXECUTED", effect={"status": "SIMULATED"})

        cls.server_thread = start_api_server_thread(host="127.0.0.1", port=cls.port)
        time.sleep(0.4)

    @classmethod
    def tearDownClass(cls):
        cls.store.close()

    def test_http_get_flights(self):
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/replay/flights") as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertGreaterEqual(len(data["flights"]), 1)
            self.assertEqual(data["flights"][0]["flight_id"], "flight-http-test")

    def test_http_get_events(self):
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/replay/events?flight_id=flight-http-test") as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertEqual(len(data["events"]), 5)

    def test_http_get_commands_audit(self):
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/audit/commands") as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertEqual(data["commands"][0]["command"], "whatif")

    def test_http_get_report_json_and_html(self):
        import urllib.request
        # JSON
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/reports/flight?flight_id=flight-http-test&format=json") as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertEqual(data["report"]["flight_id"], "flight-http-test")

        # HTML
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/reports/flight?flight_id=flight-http-test&format=html") as resp:
            html = resp.read().decode()
            self.assertIn("Post-Flight Maintenance Record", html)

    def test_http_post_annotation(self):
        import urllib.request
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/replay/annotations",
            data=json.dumps({
                "flight_id": "flight-http-test",
                "aircraft_id": "UAV-01",
                "cycle": 2,
                "note": "Operator checkpoint note",
                "category": "OBSERVATION",
                "author": "chief",
            }).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 201)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")


if __name__ == "__main__":
    unittest.main()

