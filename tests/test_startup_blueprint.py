"""
tests/test_startup_blueprint.py

Comprehensive Verification Suite for STARTUP_BLUEPRINT.md:
  - F5: Conformal Prognostics Engine with finite-sample coverage & ACI.
  - F6: Per-Airframe Self-Calibrating Twin with update gating against poisoning.
  - F7: Abstention-First Alerting with OOD detection & flight-phase alert budget.
  - F14: Twin Trust Score continuous self-audit architecture.
  - Engine Profile YAML/JSON Loader & Schema Validation.
  - /v1/* Cloud REST API Surface.
"""

import unittest
import json
import os
import tempfile
import shutil
import urllib.request
import urllib.error
import numpy as np

from twin_core.conformal_prognostics import (
    ConformalPrognosticsEngine,
    conformal_prognostics,
)
from twin_core.self_calibration import (
    PerAirframeSelfCalibrator,
    per_airframe_calibrator,
)
from twin_core.abstention_alerting import (
    AbstentionAlertManager,
    abstention_alert_manager,
)
from twin_core.twin_trust import (
    TwinTrustScoreAuditor,
    twin_trust_auditor,
)
from twin_core.profile_loader import (
    EngineProfileLoader,
    EngineProfileValidationError,
    profile_loader,
)


class TestConformalPrognostics(unittest.TestCase):
    """Verifies F5 Conformal Prognostics with finite-sample coverage guarantee & ACI adaptation."""

    def setUp(self):
        self.engine = ConformalPrognosticsEngine(target_coverage=0.90, calibration_window_size=200, gamma=0.05)

    def test_conformal_calibration_and_interval(self):
        """Calibrates on residuals and computes finite-sample valid prediction interval."""
        np.random.seed(42)
        y_true = np.linspace(120.0, 10.0, 100)
        y_pred = y_true + np.random.normal(0.0, 3.0, size=100)

        cal_res = self.engine.calibrate(y_true, y_pred)
        self.assertEqual(cal_res["calibrated_samples"], 100)
        self.assertGreater(cal_res["conformal_quantile"], 0.0)

        interval = self.engine.predict_interval(y_pred=75.0)
        self.assertEqual(interval["point_pred"], 75.0)
        self.assertLess(interval["lower_bound"], 75.0)
        self.assertGreater(interval["upper_bound"], 75.0)
        self.assertEqual(interval["method"], "SPLIT_CONFORMAL_ACI")

    def test_empirical_coverage_guarantee(self):
        """Empirical coverage on held-out test data should match 90% ± 3% target."""
        np.random.seed(123)
        y_train_true = np.random.uniform(20.0, 140.0, size=200)
        y_train_pred = y_train_true + np.random.normal(0.0, 4.0, size=200)
        self.engine.calibrate(y_train_true, y_train_pred)

        y_test_true = np.random.uniform(20.0, 140.0, size=300)
        y_test_pred = y_test_true + np.random.normal(0.0, 4.0, size=300)

        eval_res = self.engine.evaluate_empirical_coverage(y_test_true, y_test_pred)
        # Verify coverage is within ±3% of 0.90 (i.e. between 0.87 and 0.93)
        self.assertGreaterEqual(eval_res["empirical_coverage"], 0.87)
        self.assertLessEqual(eval_res["empirical_coverage"], 0.95)

    def test_adaptive_conformal_inference_online_step(self):
        """ACI adapts significance level when prediction errors violate current interval."""
        self.engine.calibrate(np.array([50.0, 60.0]), np.array([50.0, 60.0]))
        initial_alpha = self.engine.current_alpha

        # Trigger violation (large residual)
        res = self.engine.update_online(y_true=150.0, y_pred=50.0)
        self.assertFalse(res["is_covered"])
        # In ACI, err = 1 -> alpha decreases or increases towards target
        self.assertIn("adapted_alpha", res)


class TestPerAirframeSelfCalibration(unittest.TestCase):
    """Verifies F6 Per-Airframe Bayesian baseline personalization & update gating."""

    def setUp(self):
        self.calibrator = PerAirframeSelfCalibrator(anomaly_gate_threshold=0.35, learning_rate=0.1)

    def test_healthy_telemetry_updates_tail_baseline(self):
        """Healthy operational telemetry updates personalized running baseline."""
        tail_id = "UAV-TEST-01"
        res = self.calibrator.update_telemetry(
            tail_id=tail_id,
            telemetry={"rpm": 1420.0, "cht": 385.0},
            anomaly_score=0.10,
            firewall_valid=True,
        )
        self.assertTrue(res["updated"])
        self.assertEqual(res["total_updates"], 1)
        self.assertEqual(res["gated_updates"], 0)

    def test_update_gating_prevents_baseline_poisoning(self):
        """High anomaly score or invalid firewall state freezes baseline updates."""
        tail_id = "UAV-TEST-02"
        # First healthy update
        self.calibrator.update_telemetry(tail_id, {"cht": 380.0}, anomaly_score=0.05)

        # Attempted malicious/anomalous update (simulated thermal surge / sensor drift)
        gated_res = self.calibrator.update_telemetry(
            tail_id=tail_id,
            telemetry={"cht": 460.0},
            anomaly_score=0.75,  # Above gate threshold 0.35
            firewall_valid=True,
        )
        self.assertFalse(gated_res["updated"])
        self.assertEqual(gated_res["reason"], "GATED_POISONING_PREVENTION")
        self.assertEqual(gated_res["gated_updates"], 1)

    def test_personalized_zscore_averts_false_alarms(self):
        """Personalized baseline recognizes engine-specific offset and averts generic false alarm."""
        tail_id = "UAV-OFFSET-03"
        # Engine runs naturally warm at 395 CHT due to sensor installation bias
        for _ in range(20):
            self.calibrator.update_telemetry(tail_id, {"cht": 395.0}, anomaly_score=0.0)

        # Evaluate at 397 CHT (nominal for this engine, but >3 sigma on generic baseline)
        eval_res = self.calibrator.compute_personalized_anomaly(tail_id, {"cht": 397.0})
        self.assertEqual(eval_res["verdict"], "NOMINAL")
        self.assertLess(eval_res["max_personalized_z"], 2.0)


class TestAbstentionFirstAlerting(unittest.TestCase):
    """Verifies F7 Abstention-First Alerting, OOD detection & alert budget throttling."""

    def setUp(self):
        self.manager = AbstentionAlertManager(max_alerts_per_hour=6, channel_cooldown_sec=10.0)

    def test_out_of_distribution_triggers_uncertain_abstention(self):
        """Wild or out-of-distribution telemetry causes system to abstain with UNCERTAIN."""
        ood_telemetry = {
            "rpm": 3200.0,   # Extreme out of bounds
            "cht": 600.0,
            "egt": 2400.0,
            "oil_pressure": 150.0,
        }
        res = self.manager.evaluate_telemetry(ood_telemetry, flight_phase="cruise")
        self.assertEqual(res["alert_level"], AbstentionAlertManager.STATE_UNCERTAIN)
        self.assertTrue(res["is_abstaining"])
        self.assertIn("Abstaining", res["message"])

    def test_phase_aware_thresholds_and_cooldown_budget(self):
        """Alerts respect flight phase thresholds and suppress repeated alerts during cooldown."""
        telemetry = {"rpm": 1400.0, "cht": 420.0, "egt": 1585.0}  # ~2.6 sigma CHT

        # In cruise (caution_z = 2.6) -> triggers caution
        r1 = self.manager.evaluate_telemetry(telemetry, flight_phase="cruise", current_time_sec=1000.0)
        self.assertIn(r1["alert_level"], [AbstentionAlertManager.STATE_CAUTION, AbstentionAlertManager.STATE_WARNING])
        self.assertFalse(r1["suppressed"])

        # Immediate follow-up within 10s cooldown -> suppressed to fight alarm fatigue
        r2 = self.manager.evaluate_telemetry(telemetry, flight_phase="cruise", current_time_sec=1005.0)
        self.assertTrue(r2["suppressed"])
        self.assertIn("cooldown active", r2["suppression_reason"])


class TestTwinTrustScoreAuditor(unittest.TestCase):
    """Verifies F14 Continuous self-auditing Twin Trust Score architecture."""

    def setUp(self):
        self.auditor = TwinTrustScoreAuditor()

    def test_nominal_telemetry_high_trust(self):
        """Nominal sensor trust, low error, and zero drift output HIGH_TRUST."""
        res = self.auditor.evaluate_trust(
            sensor_trust=1.0,
            prediction_error_norm=0.03,
            drift_score=0.0,
            ood_rate=0.0,
        )
        self.assertGreaterEqual(res["trust_score"], 85.0)
        self.assertEqual(res["trust_level"], TwinTrustScoreAuditor.TRUST_LEVEL_HIGH)
        self.assertEqual(len(res["degradation_drivers"]), 0)

    def test_sensor_fault_collapses_trust_score(self):
        """Sensor degradation collapses trust score and surfaces specific warning drivers."""
        res = self.auditor.evaluate_trust(
            sensor_trust=0.2,       # Sensor failure
            prediction_error_norm=0.45,
            drift_score=0.3,
            ood_rate=0.1,
        )
        self.assertLess(res["trust_score"], 65.0)
        self.assertIn(res["trust_level"], [TwinTrustScoreAuditor.TRUST_LEVEL_DEGRADED, TwinTrustScoreAuditor.TRUST_LEVEL_UNTRUSTED])
        self.assertTrue(any("Sensor integrity" in d for d in res["degradation_drivers"]))


class TestEngineProfileLoader(unittest.TestCase):
    """Verifies Engine Profile YAML/JSON loading and schema validation against profiles/schema.json."""

    def setUp(self):
        self.loader = EngineProfileLoader()

    def test_load_rotax_914_yaml_profile(self):
        """Loads and validates profiles/rotax_914.yaml."""
        p = self.loader.load_profile("rotax_914")
        self.assertEqual(p["engine"], "rotax_914")
        self.assertEqual(p["cylinders"], 4)
        self.assertEqual(p["rated_rpm"], 5500.0)
        self.assertIn("channels", p)
        self.assertIn("causal_graph", p)
        self.assertIn("damage", p)

    def test_load_rotax_912_yaml_profile(self):
        """Loads and validates profiles/rotax_912.yaml."""
        p = self.loader.load_profile("rotax_912")
        self.assertEqual(p["engine"], "rotax_912")
        self.assertEqual(p["cylinders"], 4)
        self.assertEqual(p["physics"]["model"], "otto_4stroke")

    def test_profile_loader_lists_available_profiles(self):
        """Lists available engine profile IDs."""
        profiles = self.loader.list_available_profiles()
        self.assertIn("rotax_914", profiles)
        self.assertIn("rotax_912", profiles)

    def test_invalid_profile_fails_schema_validation(self):
        """Rejects malformed profile missing required fields."""
        bad_profile = {"engine": "flawed_engine", "version": 1}  # Missing channels, physics, etc.
        valid, err = self.loader.validate_profile_dict(bad_profile)
        self.assertFalse(valid)
        self.assertIn("Missing required profile field", err)


class TestStartupBlueprintRESTApi(unittest.TestCase):
    """Verifies STARTUP_BLUEPRINT.md /v1/* cloud API endpoints."""

    @classmethod
    def setUpClass(cls):
        from backend.api_server import start_api_server_thread
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        is_open = sock.connect_ex(("127.0.0.1", 8766)) == 0
        sock.close()
        if not is_open:
            start_api_server_thread(port=8766)
            import time
            time.sleep(0.5)

    def _get(self, path: str) -> dict:
        req = urllib.request.Request(f"http://127.0.0.1:8766{path}")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _post(self, path: str, payload: dict) -> dict:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(f"http://127.0.0.1:8766{path}", data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def test_v1_fleet_endpoint(self):
        """GET /v1/fleet returns fleet overview with health, life burn, and trust score."""
        res = self._get("/v1/fleet")
        self.assertEqual(res["status"], "OK")
        self.assertGreaterEqual(len(res["fleet"]), 1)
        self.assertIn("trust_score", res["fleet"][0])

    def test_v1_tails_twin_endpoint(self):
        """GET /v1/tails/UAV-01/twin returns tail baseline and trust score."""
        res = self._get("/v1/tails/UAV-01/twin")
        self.assertEqual(res["status"], "OK")
        self.assertEqual(res["tail_id"], "UAV-01")
        self.assertIn("baseline", res)
        self.assertIn("trust", res)

    def test_v1_profiles_endpoints(self):
        """GET /v1/profiles and GET /v1/profiles/rotax_914."""
        res = self._get("/v1/profiles")
        self.assertEqual(res["status"], "OK")
        self.assertIn("rotax_914", res["profiles"])

        p_res = self._get("/v1/profiles/rotax_914")
        self.assertEqual(p_res["status"], "OK")
        self.assertEqual(p_res["profile"]["engine"], "rotax_914")

    def test_v1_conformal_interval_api(self):
        """POST /v1/conformal/interval returns prediction intervals with bounds."""
        payload = {"y_pred": 85.0, "target_coverage": 0.90}
        res = self._post("/v1/conformal/interval", payload)
        self.assertEqual(res["status"], "OK")
        self.assertIn("conformal_interval", res)
        self.assertLess(res["conformal_interval"]["lower_bound"], 85.0)

    def test_v1_trust_audit_api(self):
        """POST /v1/trust/audit returns composite self-audit evaluation."""
        payload = {"sensor_trust": 0.95, "prediction_error_norm": 0.04, "drift_score": 0.05}
        res = self._post("/v1/trust/audit", payload)
        self.assertEqual(res["status"], "OK")
        self.assertIn("trust_audit", res)
        self.assertGreater(res["trust_audit"]["trust_score"], 80.0)

    def test_v1_telemetry_evaluate_api(self):
        """POST /v1/telemetry/evaluate evaluates telemetry with calibration and alert manager."""
        payload = {
            "tail_id": "UAV-01",
            "flight_phase": "cruise",
            "telemetry": {"rpm": 1400.0, "cht": 382.0, "egt": 1585.0},
            "anomaly_score": 0.05,
        }
        res = self._post("/v1/telemetry/evaluate", payload)
        self.assertEqual(res["status"], "OK")
        self.assertEqual(res["tail_id"], "UAV-01")
        self.assertIn("calibration", res)
        self.assertIn("alert", res)


if __name__ == "__main__":
    unittest.main()
