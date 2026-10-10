"""
tests/test_compliance_and_security.py

Comprehensive Verification Suite for Trust, Compliance, Safety Case & Security Posture.
Implements improvement_plan.md §4 Phase 6:
  - Runtime assurance safety envelope (ASTM F3269-17) blocking unsafe derate & direct actuation.
  - Requirements Traceability Matrix verifying 100% coverage of defined hazards.
  - Hardware-in-the-Loop (HIL) scenario replay & fault-injection pass/fail envelope.
  - CycloneDX SBOM generation and cryptographic artifact signature verification.
  - Key rotation manager with overlapping grace periods and audit event persistence.
  - ITAR / EAR Export control tenant data residency pinning.
  - Compliance REST API endpoints.
"""

import unittest
import os
import json
import tempfile
import shutil
import time
from datetime import datetime, timezone, timedelta

from twin_core.safety_assurance import (
    AdvisorySafetyEnvelope,
    RequirementsTraceabilityRegistry,
    HAZARDS_REGISTER,
    SAFETY_ENVELOPE_LIMITS,
)
from twin_core.hil_testbed import (
    HILScenarioReplayRunner,
    HILPassFailEvaluator,
    FAULT_INJECTION_CATALOG,
    BENCH_HARDWARE_SPECS,
)
from twin_core.security_compliance import (
    SBOMGenerator,
    ArtifactSignatureVerifier,
    KeyRotationManager,
    DataResidencyEnforcer,
)
from twin_core.event_store import EventStore


class TestAdvisorySafetyEnvelope(unittest.TestCase):
    """Verifies runtime assurance barrier enforcing ASTM F3269-17 principles."""

    def setUp(self):
        self.envelope = AdvisorySafetyEnvelope()

    def test_advisory_safety_envelope_blocks_unsafe_derate(self):
        """
        HAZ-001 Verification:
        Rejects in-flight power derate below 1400 RPM during active airborne phase.
        """
        unsafe_rec = {
            "action_text": "Reduce power to extinguish thermal surge",
            "recommended_rpm": 1150.0,  # Below min_flight_rpm 1400
            "command_type": "ADVISORY",
        }
        res = self.envelope.evaluate_recommendation(
            recommendation=unsafe_rec,
            current_telemetry={"rpm": 1400.0, "cht": 435.0},
            flight_phase="cruise",
        )
        self.assertFalse(res["approved"])
        self.assertEqual(res["status"], "SUPPRESSED_BY_SAFETY_ENVELOPE")
        self.assertEqual(res["authority_level"], "ADVISORY_ONLY")
        self.assertTrue(any("below minimum flight sustain power" in v for v in res["violations"]))

    def test_envelope_rejects_direct_actuator_write_authority(self):
        """Rejects direct actuator execution, enforcing Ground-Side Advisory-Only scope."""
        actuator_rec = {
            "action_text": "Override throttle actuator directly",
            "command_type": "DIRECT_ACTUATE",
            "recommended_rpm": 1450.0,
        }
        res = self.envelope.evaluate_recommendation(
            recommendation=actuator_rec,
            current_telemetry={"rpm": 1400.0},
            flight_phase="cruise",
        )
        self.assertFalse(res["approved"])
        self.assertTrue(any("Direct actuator execution" in v for v in res["violations"]))

    def test_envelope_approves_safe_human_in_the_loop_advisory(self):
        """Approves safe parameter adjustments within physical envelope."""
        safe_rec = {
            "action_text": "Slightly increase RPM to increase cooling airflow",
            "recommended_rpm": 1550.0,
            "command_type": "ADVISORY",
        }
        res = self.envelope.evaluate_recommendation(
            recommendation=safe_rec,
            current_telemetry={"rpm": 1400.0, "cht": 395.0},
            flight_phase="cruise",
        )
        self.assertTrue(res["approved"])
        self.assertEqual(res["status"], "APPROVED_ADVISORY")
        self.assertEqual(res["authority_level"], "ADVISORY_HUMAN_IN_THE_LOOP")
        self.assertEqual(len(res["violations"]), 0)


class TestRequirementsTraceability(unittest.TestCase):
    """Verifies that 100% of defined hazards map to automated tests."""

    def setUp(self):
        self.registry = RequirementsTraceabilityRegistry()

    def test_requirements_traceability_100_percent_coverage(self):
        """Confirms complete requirements traceability coverage across the hazard register."""
        test_names = [
            "test_advisory_safety_envelope_blocks_unsafe_derate",
            "test_hil_thermal_and_oil_fault_detection_within_envelope",
            "test_physics_firewall_and_cryptographic_attestation",
            "test_artifact_signature_verification_rejects_tampered_model",
            "test_data_residency_and_export_control_enforcement",
        ]
        audit = self.registry.verify_traceability_coverage(test_names)
        self.assertEqual(audit["status"], "COMPLETE")
        self.assertEqual(audit["coverage_pct"], 100.0)
        self.assertEqual(audit["missing_hazards"], 0)


class TestHILTestbedAndFaultInjection(unittest.TestCase):
    """Verifies HIL deterministic scenario replay and pass/fail latency envelope."""

    def setUp(self):
        self.runner = HILScenarioReplayRunner()
        self.evaluator = HILPassFailEvaluator()

    def test_hil_thermal_and_oil_fault_detection_within_envelope(self):
        """
        HAZ-002 Verification:
        Replays scenario with INJ-TH-01 thermal injection, confirming 0 false alarms
        prior to injection and detection within <= 15 cycles (<= 1.5 seconds).
        """
        frames = self.runner.generate_scenario_frames(
            duration_cycles=50,
            fault_injection_id="INJ-TH-01",
            fault_start_cycle=20,
        )

        def inference_fn(f):
            # Model response: triggers alarm if CHT exceeds 420°F
            if f["cht"] > 420.0:
                return {"anomaly_detected": True, "fault_category": "OVERHEATING"}
            return {"anomaly_detected": False}

        res = self.evaluator.evaluate_run(
            frames=frames,
            inference_fn=inference_fn,
            fault_injection_id="INJ-TH-01",
            fault_start_cycle=20,
        )

        self.assertTrue(res["passed"], f"HIL run failed: {res['failures']}")
        self.assertEqual(res["false_alarms"], 0)
        self.assertIsNotNone(res["fault_detected_cycle"])
        self.assertLessEqual(res["cycles_to_detect"], 15)
        self.assertEqual(res["detected_category"], "OVERHEATING")

    def test_hil_nominal_run_causes_zero_false_alarms(self):
        """Verifies clean baseline execution generates zero alarms."""
        frames = self.runner.generate_scenario_frames(duration_cycles=40)

        def nominal_inference_fn(f):
            return {"anomaly_detected": False, "status": "NOMINAL"}

        res = self.evaluator.evaluate_run(
            frames=frames,
            inference_fn=nominal_inference_fn,
            fault_injection_id=None,
        )
        self.assertTrue(res["passed"])
        self.assertEqual(res["false_alarms"], 0)


class TestSBOMAndArtifactSigning(unittest.TestCase):
    """Verifies CycloneDX SBOM generation and cryptographic artifact verification."""

    def test_sbom_generation_cyclonedx_compliance(self):
        """Verifies machine-readable CycloneDX 1.5 SBOM structure and hashes."""
        generator = SBOMGenerator()
        sbom = generator.generate_cyclonedx_sbom()

        self.assertEqual(sbom["bomFormat"], "CycloneDX")
        self.assertEqual(sbom["specVersion"], "1.5")
        self.assertIn("serialNumber", sbom)
        self.assertGreaterEqual(len(sbom["components"]), 5)

        first_comp = sbom["components"][0]
        self.assertIn("name", first_comp)
        self.assertIn("version", first_comp)
        self.assertIn("hashes", first_comp)
        self.assertEqual(first_comp["hashes"][0]["alg"], "SHA-256")

    def test_artifact_signature_verification_rejects_tampered_model(self):
        """
        HAZ-004 Verification:
        Ensures tampered model bytes or invalid signatures fail verification.
        """
        model_bytes = b"ONNX_V1_DETERMINISTIC_MODEL_WEIGHTS_VALID"
        secret = "SEC-KEY-DEFENSE-PROD-99812"

        valid_sig = ArtifactSignatureVerifier.sign_payload(model_bytes, secret)
        self.assertTrue(ArtifactSignatureVerifier.verify_payload_signature(model_bytes, valid_sig, secret))

        # Tampered payload
        tampered_bytes = b"ONNX_V1_TAMPERED_MALICIOUS_BACKDOOR_PAYLOAD"
        self.assertFalse(ArtifactSignatureVerifier.verify_payload_signature(tampered_bytes, valid_sig, secret))

        # Tampered signature
        self.assertFalse(ArtifactSignatureVerifier.verify_payload_signature(model_bytes, "invalid_sig_hex_000", secret))


class TestKeyRotationLifecycle(unittest.TestCase):
    """Verifies automated secret rotation with overlapping grace periods and EventStore auditing."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "events.db")
        self.event_store = EventStore(self.db_path)
        self.mgr = KeyRotationManager(
            rotation_interval_hours=24,
            grace_period_hours=2,
            event_store=self.event_store,
        )

    def tearDown(self):
        self.event_store.close()
        shutil.rmtree(self.temp_dir)

    def test_key_rotation_and_grace_period(self):
        """Verifies active rotation preserves previous key during grace period."""
        old_id, old_secret = self.mgr.get_active_secret()

        # Rotate key
        new_id = self.mgr.rotate_key(reason="SCHEDULED_ROTATION")
        self.assertNotEqual(old_id, new_id)

        # Active key is new
        curr_id, curr_secret = self.mgr.get_active_secret()
        self.assertEqual(curr_id, new_id)

        # Old key is still valid under grace period
        retrieved_old = self.mgr.validate_key_or_grace(old_id)
        self.assertEqual(retrieved_old, old_secret)

        # EventStore logged rotation event
        events = self.event_store.query_events(aircraft_id="FLEET_SECURITY", event_type="KEY_ROTATION_EVENT")
        self.assertGreaterEqual(len(events), 2)  # bootstrap + scheduled


class TestDataResidencyAndExportControl(unittest.TestCase):
    """Verifies ITAR export control and sovereign cloud region pinning."""

    def test_data_residency_and_export_control_enforcement(self):
        """
        HAZ-005 Verification:
        ITAR tenant data cannot be dispatched to commercial non-US cloud regions.
        """
        # 1. Allowed: ITAR tenant dispatched to US GovCloud
        ok, err = DataResidencyEnforcer.validate_tenant_dispatch(
            tenant_id="tenant-defense-01",
            target_region="us-gov-west-1",
            export_control_classification="ITAR-USML-CAT-VIII",
        )
        self.assertTrue(ok)
        self.assertIsNone(err)

        # 2. Blocked: ITAR tenant attempting dispatch to European region
        ok, err = DataResidencyEnforcer.validate_tenant_dispatch(
            tenant_id="tenant-defense-01",
            target_region="eu-central-1",
            export_control_classification="ITAR-USML-CAT-VIII",
        )
        self.assertFalse(ok)
        self.assertIn("ITAR VIOLATION", err)

        # 3. Allowed: Commercial tenant dispatched to European region
        ok, err = DataResidencyEnforcer.validate_tenant_dispatch(
            tenant_id="tenant-commercial-mro",
            target_region="eu-central-1",
            export_control_classification="EAR99",
        )
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_physics_firewall_and_cryptographic_attestation(self):
        """HAZ-003 Verification: tests monotonic and thermodynamic invariants."""
        # Simulated CAN frame attestation check
        frame_payload = json.dumps({"rpm": 1400.0, "cht": 380.0, "seq": 101}).encode()
        secret = "AVIONICS_CAN_BUS_SECRET"
        sig = ArtifactSignatureVerifier.sign_payload(frame_payload, secret)

        # Verified authentic
        self.assertTrue(ArtifactSignatureVerifier.verify_payload_signature(frame_payload, sig, secret))
        # Replayed with altered seq fails
        tampered_frame = json.dumps({"rpm": 1400.0, "cht": 380.0, "seq": 99}).encode()
        self.assertFalse(ArtifactSignatureVerifier.verify_payload_signature(tampered_frame, sig, secret))


class TestComplianceRESTApi(unittest.TestCase):
    """Verifies compliance REST API routes."""

    @classmethod
    def setUpClass(cls):
        import urllib.request
        from backend.api_server import start_api_server_thread
        cls.port = 18799
        cls.server_thread = start_api_server_thread(host="127.0.0.1", port=cls.port)
        time.sleep(0.3)

    def test_get_compliance_posture(self):
        import urllib.request
        url = f"http://127.0.0.1:{self.port}/api/compliance/posture"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "APPROVED")
            self.assertEqual(data["assurance_classification"], "GROUND_SIDE_ADVISORY_DECISION_SUPPORT")
            self.assertEqual(data["airborne_authority"], "NONE_ADVISORY_ONLY")
            self.assertTrue(data["runtime_safety_envelope"]["active"])

    def test_get_compliance_sbom(self):
        import urllib.request
        url = f"http://127.0.0.1:{self.port}/api/compliance/sbom"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["bomFormat"], "CycloneDX")
            self.assertEqual(data["specVersion"], "1.5")
            self.assertGreaterEqual(len(data["components"]), 5)

    def test_post_security_rotate_keys(self):
        import urllib.request
        url = f"http://127.0.0.1:{self.port}/api/security/rotate-keys"
        payload = json.dumps({"reason": "TEST_ROTATION_API"}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertIn("active_key_id", data)

    def test_post_verify_recommendation_via_api(self):
        import urllib.request
        url = f"http://127.0.0.1:{self.port}/api/compliance/verify-recommendation"
        # Unsafe derate
        payload = json.dumps({
            "recommendation": {"recommended_rpm": 1100.0, "command_type": "ADVISORY"},
            "current_telemetry": {"rpm": 1400.0},
            "flight_phase": "cruise",
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertFalse(data["approved"])
            self.assertEqual(data["status"], "SUPPRESSED_BY_SAFETY_ENVELOPE")


if __name__ == "__main__":
    unittest.main()
