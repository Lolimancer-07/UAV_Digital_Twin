"""
tests/test_envelope.py

Decision Envelope v1 Contract Test Suite — Phase 0 / Day 4

Verifies that:
1.  The inference pipeline emits an `envelope_version` field on every payload.
2.  The emitted payload contains all required top-level fields defined in the
    Decision Envelope v1 contract (packages/contracts/decision_envelope_v1.json).
3.  The `alert` field only contains allowed values.
4.  Physics, health, and twin_consistency sub-objects have the expected shapes.

These tests run against the reasoning modules directly (no MQTT, no WebSocket,
no TensorFlow) by feeding a synthetic telemetry packet through the same steps
used in inference._process_telemetry_packet().

Running: pytest tests/test_envelope.py -v
"""

import sys
import os
import json
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, "backend")
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from physics_engine      import physics_model
from anomaly_detector    import AnomalyDetector
from health_index        import compute_health_index
from xai_engine          import XAIDiagnosticEngine
from sensor_integrity    import sensor_integrity_monitor
from twin_consistency    import compute_twin_consistency
from mission_risk        import compute_mission_risk, compute_failure_probability
from prescriptive        import generate_prescriptive_recommendations
from telemetry_integrity import telemetry_integrity_monitor

ANOMALY_PATH = os.path.join(BACKEND_DIR, "anomaly_model.pkl")
SCHEMA_PATH  = os.path.join(ROOT, "packages", "contracts", "decision_envelope_v1.json")

# Required top-level fields per Decision Envelope v1
REQUIRED_FIELDS = [
    "envelope_version",
    "cycle",
    "engine_id",
    "uav_id",
    "alert",
    "predicted_rul",
    "is_anomaly",
    "anomaly_score",
    "failure_probability",
    "physics",
    "health",
    "twin_consistency",
    "sensor_integrity",
    "telemetry_integrity",
    "prescriptive",
    "mission_risk",
]

NOMINAL_TELEMETRY = {
    "cycle":            42,
    "engine_id":        1,
    "uav_id":           "UAV-01",
    "rpm":              2400.0,
    "cht":              385.0,
    "cht_cyl":          [383.0, 386.0, 385.0, 385.0],
    "egt":              1450.0,
    "egt_cyl":          [1448.0, 1452.0, 1450.0, 1451.0],
    "oil_pressure":     55.0,
    "oil_temp":         180.0,
    "fuel_flow":        10.5,
    "fuel_rail_pressure_bar": 3.2,
    "vibration":        1.2,
    "vibration_kurtosis": 3.0,
    "battery_v":        14.0,
    "bus_current_a":    12.0,
    "inj_timing":       28.0,
    "map_kpa":          98.0,
    "true_rul":         180.0,
    "altitude_ft":      3000,
    "oat_c":            15.0,
    "mission_mode":     "NORMAL",
    "latitude":         None,
    "longitude":        None,
    "heading_deg":      None,
    "ground_speed_kts": None,
    "mission_progress_pct": None,
    "can_frames":       [],
    "active_faults":    [],
}


def _build_payload(telemetry: dict) -> dict:
    """
    Reproduce the envelope fields built in inference._process_telemetry_packet()
    without touching MQTT, WebSocket, or TensorFlow — so tests run in CI cheaply.
    """
    anomaly_detector = AnomalyDetector(ANOMALY_PATH)

    tel_integrity    = telemetry_integrity_monitor.evaluate(telemetry)
    physics_results  = physics_model.evaluate_performance(telemetry)
    sensor_integrity = sensor_integrity_monitor.evaluate(
        telemetry, physics_residuals=physics_results.get("residuals", {})
    )
    is_anomaly, anomaly_score, fault_events = anomaly_detector.predict(telemetry)

    # Use a fixed predicted_rul so the test is deterministic (no LSTM needed)
    predicted_rul    = float(telemetry.get("true_rul", 0.0)) or 100.0
    rul_lower        = max(0.0, predicted_rul - 8.0)
    rul_upper        = predicted_rul + 8.0

    health_results   = compute_health_index(telemetry, predicted_rul, anomaly_score, [])
    health_index     = health_results["health_index"]
    failure_prob     = compute_failure_probability(predicted_rul, is_anomaly, anomaly_score, 0, health_index)

    twin_consistency = compute_twin_consistency(
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
        physics_residuals=physics_results.get("residuals", {}),
        sensor_integrity_score=sensor_integrity["integrity_score"],
    )
    xai_results      = XAIDiagnosticEngine.explain_anomaly(
        telemetry=telemetry,
        is_anomaly=is_anomaly,
        anomaly_score=anomaly_score,
        active_faults=fault_events,
    )
    mission_risk     = compute_mission_risk(
        data=telemetry,
        health_index=health_index,
        predicted_rul=predicted_rul,
        failure_probability=failure_prob,
        fault_events=fault_events,
    )
    prescriptive     = generate_prescriptive_recommendations(
        fault_events=fault_events,
        predicted_rul=predicted_rul,
        health_index=health_index,
        twin_consistency=twin_consistency,
        mission_risk=mission_risk,
    )

    has_critical = any(f["severity"] == "CRITICAL" for f in fault_events)
    has_warning  = any(f["severity"] == "WARNING"  for f in fault_events)
    if has_critical or (predicted_rul > 0 and predicted_rul < 20):
        alert = "CRITICAL"
    elif has_warning or is_anomaly:
        alert = "WARNING"
    else:
        alert = "NOMINAL"

    return {
        "envelope_version":       "1.0",
        "emitted_at":             "2026-10-09T00:00:00Z",
        "cycle":                  telemetry.get("cycle", 0),
        "engine_id":              telemetry.get("engine_id", 1),
        "uav_id":                 telemetry.get("uav_id", "UAV-01"),
        "rpm":                    telemetry.get("rpm"),
        "cht":                    telemetry.get("cht"),
        "egt":                    telemetry.get("egt"),
        "oil_pressure":           telemetry.get("oil_pressure"),
        "oil_temp":               telemetry.get("oil_temp"),
        "fuel_flow":              telemetry.get("fuel_flow"),
        "vibration":              telemetry.get("vibration"),
        "battery_v":              telemetry.get("battery_v"),
        "true_rul":               telemetry.get("true_rul", 0),
        "altitude_ft":            telemetry.get("altitude_ft", 3000),
        "predicted_rul":          round(predicted_rul, 1),
        "rul_ci_lower":           round(rul_lower, 1),
        "rul_ci_upper":           round(rul_upper, 1),
        "rul_mc_std":             0.0,
        "is_anomaly":             bool(is_anomaly),
        "anomaly_score":          round(anomaly_score, 4),
        "fault_events":           fault_events,
        "alert":                  alert,
        "paused":                 False,
        "failure_probability":    round(failure_prob, 3),
        "physics":                physics_results,
        "health":                 health_results,
        "xai":                    xai_results,
        "sensor_integrity":       sensor_integrity,
        "twin_consistency":       twin_consistency,
        "mission_risk":           mission_risk,
        "prescriptive":           prescriptive,
        "telemetry_integrity":    tel_integrity,
        "provenance": {
            "core_version":       "1.0.0",
            "runtime":            "gcs_float32",
        },
    }


class TestEnvelopeVersion(unittest.TestCase):
    """Verify envelope_version is present and correct on every payload."""

    @classmethod
    def setUpClass(cls):
        cls.payload = _build_payload(NOMINAL_TELEMETRY)

    def test_envelope_version_present(self):
        self.assertIn("envelope_version", self.payload,
                      "envelope_version field is MISSING from the payload — every WS message must carry it")

    def test_envelope_version_value(self):
        self.assertEqual(self.payload["envelope_version"], "1.0",
                         "envelope_version must be '1.0' (string, not numeric)")


class TestRequiredFields(unittest.TestCase):
    """All fields in the v1 contract must be present in every emitted payload."""

    @classmethod
    def setUpClass(cls):
        cls.payload = _build_payload(NOMINAL_TELEMETRY)

    def test_all_required_fields_present(self):
        missing = [f for f in REQUIRED_FIELDS if f not in self.payload]
        self.assertEqual(
            missing, [],
            f"Required envelope fields are missing: {missing}"
        )

    def test_alert_values_are_valid(self):
        self.assertIn(
            self.payload["alert"], {"NOMINAL", "WARNING", "CRITICAL"},
            f"alert value '{self.payload['alert']}' is not in the allowed set"
        )

    def test_predicted_rul_non_negative(self):
        self.assertGreaterEqual(self.payload["predicted_rul"], 0)

    def test_failure_probability_in_range(self):
        fp = self.payload["failure_probability"]
        self.assertGreaterEqual(fp, 0.0)
        self.assertLessEqual(fp, 1.0)


class TestPhysicsSubObject(unittest.TestCase):
    """Physics sub-object must have expected keys."""

    @classmethod
    def setUpClass(cls):
        cls.physics = _build_payload(NOMINAL_TELEMETRY)["physics"]

    def test_brake_power_present(self):
        self.assertIn("brake_power_hp", self.physics)

    def test_residuals_present(self):
        self.assertIn("residuals", self.physics)
        self.assertIsInstance(self.physics["residuals"], dict)


class TestHealthSubObject(unittest.TestCase):
    """Health sub-object must carry health_index in [0, 100]."""

    @classmethod
    def setUpClass(cls):
        cls.health = _build_payload(NOMINAL_TELEMETRY)["health"]

    def test_health_index_present(self):
        self.assertIn("health_index", self.health)

    def test_health_index_range(self):
        hi = self.health["health_index"]
        self.assertGreaterEqual(hi, 0.0)
        self.assertLessEqual(hi, 100.0)


class TestTwinConsistencySubObject(unittest.TestCase):
    """twin_consistency must include a case label."""

    @classmethod
    def setUpClass(cls):
        cls.tc = _build_payload(NOMINAL_TELEMETRY)["twin_consistency"]

    def test_case_present(self):
        self.assertIn("case", self.tc)

    def test_case_value(self):
        self.assertIn(self.tc["case"], {"A", "B", "C", "D"},
                      f"twin_consistency.case '{self.tc['case']}' is not a valid case label")


class TestSchemaFileExists(unittest.TestCase):
    """The Decision Envelope v1 JSON Schema file must be committed to the repo."""

    def test_schema_file_exists(self):
        self.assertTrue(
            os.path.isfile(SCHEMA_PATH),
            f"Contract schema missing at {SCHEMA_PATH} — run: cat packages/contracts/decision_envelope_v1.json"
        )

    def test_schema_file_is_valid_json(self):
        if not os.path.isfile(SCHEMA_PATH):
            self.skipTest("Schema file missing; see test_schema_file_exists")
        with open(SCHEMA_PATH, "r") as f:
            schema = json.load(f)
        self.assertEqual(schema.get("$id", ""), "urn:uav-digital-twin:decision-envelope:1.0")


class TestBidirectionalContract(unittest.TestCase):
    """
    Bidirectional contract enforcement (improvement_plan.md §4 Phase 1):
    Fail when backend emits a field the contract lacks, or contract requires a field
    the backend fails to emit. Prevents silent contract drift.
    """

    @classmethod
    def setUpClass(cls):
        cls.payload = _build_payload(NOMINAL_TELEMETRY)
        with open(SCHEMA_PATH, "r") as f:
            cls.schema = json.load(f)
        cls.schema_props = set(cls.schema.get("properties", {}).keys())
        cls.required = set(cls.schema.get("required", []))

    def test_all_schema_required_fields_emitted(self):
        payload_keys = set(self.payload.keys())
        missing_required = self.required - payload_keys
        self.assertEqual(
            missing_required, set(),
            f"Backend payload fails to emit required contract fields: {missing_required}"
        )

    def test_all_emitted_fields_defined_in_contract_schema(self):
        payload_keys = set(self.payload.keys())
        undocumented = payload_keys - self.schema_props
        self.assertEqual(
            undocumented, set(),
            f"Backend emitted fields not declared in decision_envelope_v1.json: {undocumented}. "
            "Update packages/contracts/decision_envelope_v1.json before emitting new fields."
        )


class TestSchemaBumpPolicy(unittest.TestCase):
    """
    Schema-version bump policy (improvement_plan.md §4 Phase 1):
    - envelope_version must follow major.minor format (e.g. '1.0').
    - Contract schema must explicitly document the version bump policy.
    """

    @classmethod
    def setUpClass(cls):
        with open(SCHEMA_PATH, "r") as f:
            cls.schema = json.load(f)

    def test_version_format(self):
        version = self.schema.get("properties", {}).get("envelope_version", {}).get("const", "")
        parts = version.split(".")
        self.assertEqual(len(parts), 2, f"envelope_version '{version}' must follow 'major.minor' format")
        self.assertTrue(parts[0].isdigit() and parts[1].isdigit(),
                        f"envelope_version parts must be numeric, got '{version}'")

    def test_version_bump_policy_documented(self):
        notes = self.schema.get("_notes", {})
        self.assertIn("policy", notes,
                      "decision_envelope_v1.json must document schema versioning policy in _notes.policy")
        policy_text = notes["policy"].lower()
        self.assertIn("minor", policy_text, "Policy must describe minor version bumps")
        self.assertIn("major", policy_text, "Policy must describe major version bumps")


class TestModelManifestVerification(unittest.TestCase):
    """
    Model Manifest Hash Verification (improvement_plan.md §4 Phase 1):
    - Every model registered in model_manifest.json must match its declared SHA-256 hash.
    - ModelRegistry must refuse mismatched artifacts with ModelHashMismatch.
    """

    def test_all_manifest_models_pass_hash_verification(self):
        from twin_core.model_registry import ModelRegistry
        reg = ModelRegistry()
        results = reg.verify_all()
        self.assertGreater(len(results), 0, "No models found in manifest to verify")
        for model_id, is_valid in results.items():
            self.assertTrue(is_valid, f"Model '{model_id}' failed SHA-256 verification against manifest!")

    def test_tampered_model_hash_is_refused(self):
        from twin_core.model_registry import ModelRegistry, ModelHashMismatch
        reg = ModelRegistry()
        fake_entry = {
            "model_id": "fake_tampered_model",
            "file": "backend/anomaly_model.pkl",
            "hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
        }
        target_path = reg._resolve_path(fake_entry["file"])
        with self.assertRaises(ModelHashMismatch):
            reg._verify_hash(fake_entry, target_path)


class TestCommandEnvelopeContract(unittest.TestCase):
    """
    Command Envelope v1 Contract Verification (improvement_plan.md §4 Phase 2 & §6):
    - packages/contracts/command_envelope_v1.json defines the immutable schema for all operator commands.
    - Enforces required fields: command_version, command, aircraft_id, intent_id, issued_by, issued_at.
    """

    def setUp(self):
        self.cmd_schema_path = os.path.join(ROOT, "packages", "contracts", "command_envelope_v1.json")
        with open(self.cmd_schema_path, "r") as f:
            self.schema = json.load(f)

    def test_schema_file_exists_and_parses(self):
        self.assertTrue(os.path.exists(self.cmd_schema_path))
        self.assertEqual(self.schema["title"], "UAV Digital Twin — Command Envelope v1.0")

    def test_required_fields_present(self):
        req = set(self.schema.get("required", []))
        expected = {"command_version", "command", "aircraft_id", "intent_id", "issued_by", "issued_at"}
        self.assertTrue(expected.issubset(req), f"Missing required fields: {expected - req}")

    def test_command_version_format(self):
        ver_const = self.schema["properties"]["command_version"].get("const")
        self.assertEqual(ver_const, "1.0")

    def test_supported_commands_enumeration(self):
        enum_cmds = set(self.schema["properties"]["command"].get("enum", []))
        essential_cmds = {"set_profile", "set_speed", "inject_fault", "clear_faults", "whatif", "annotate_replay", "generate_report"}
        self.assertTrue(essential_cmds.issubset(enum_cmds), f"Missing essential commands: {essential_cmds - enum_cmds}")


if __name__ == "__main__":
    unittest.main()

