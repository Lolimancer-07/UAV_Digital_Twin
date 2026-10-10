"""
tests/test_flywheel_and_federated.py

Phase 5 Test Suite: Data Flywheel, Closed-Loop Drift, Model Governance, and Differential Privacy Federated Learning.
Validates improvement_plan.md §4 Phase 5:
  1. Statistical drift detection triggers DriftReviewTickets (no silent mutations).
  2. Ticket review lifecycle (OPEN -> ACKNOWLEDGED -> RESOLVED) with EventStore audit logging.
  3. ModelEvalCard generation (MAE, RMSE, R2, latency delta).
  4. ShadowModeRunner concurrent evaluation without operational interference.
  5. ModelPromotionGate: offline gates, shadow parity, and recorded human sign-off.
  6. Instantaneous atomic rollback on regression with audit trail.
  7. DP-FedAvg differential privacy: L2 gradient clipping and calibrated Gaussian noise.
  8. Participant cryptographic attestation and minimum quorum (K >= 3).
  9. Multi-tenant learning rights: per-tenant opt-in boundaries.
  10. Full audit traceability: telemetry evidence -> drift ticket -> eval card -> promotion decision.
"""

import os
import sys
import tempfile
import shutil
import unittest
import numpy as np

# Setup paths
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
BACKEND_DIR = os.path.join(ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
TWIN_CORE_DIR = os.path.join(ROOT, "packages", "twin-core")
if TWIN_CORE_DIR not in sys.path:
    sys.path.insert(0, TWIN_CORE_DIR)

from twin_core.drift_detector import (
    TelemetryDriftDetector,
    DriftReviewTicket,
    NOMINAL_BASELINES,
)
from twin_core.model_governance import (
    ModelEvalCard,
    ShadowModeRunner,
    ModelPromotionGate,
)
from twin_core.federated_aggregator import (
    DifferentialPrivacyFederatedCoordinator,
    dp_federated_average,
    clip_gradients,
    ParticipantAttestationError,
    InsufficientParticipantsError,
)
from twin_core.edge_runtime import EdgePrognosticsRuntime
from backend.event_store import EventStore



class TestClosedLoopDriftDetector(unittest.TestCase):
    """Verifies statistical drift detection, review ticketing, and EventStore integration."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_drift_events.db")
        self.event_store = EventStore(db_path=self.db_path)
        self.detector = TelemetryDriftDetector(window_size=50, psi_threshold=0.25, event_store=self.event_store)

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_nominal_telemetry_causes_no_drift_ticket(self):
        """Nominal operations within baseline sigma do not trigger review tickets."""
        for c in range(1, 30):
            frame = {
                "rpm": 1400.0 + (c % 5) * 2.0,
                "cht": 380.0 + (c % 3) * 1.0,
                "egt": 1585.0 + (c % 4) * 2.0,
                "oil_pressure": 58.0,
                "oil_temp": 185.0,
                "vibration": 0.65,
                "battery_v": 13.8,
                "cycle": c,
            }
            res = self.detector.ingest_sample(frame, aircraft_id="UAV-01", flight_id="FL-NORM-01", cycle=c)

        self.assertFalse(res["drift_detected"])
        self.assertIsNone(res["new_ticket"])
        self.assertEqual(len(self.detector.tickets), 0)

    def test_covariate_drift_triggers_review_ticket_without_silent_mutation(self):
        """Substantial thermal shift creates a DriftReviewTicket and persists it to EventStore."""
        # 1. Warm up baseline window
        for c in range(1, 20):
            self.detector.ingest_sample(
                {"rpm": 1400.0, "cht": 380.0, "egt": 1585.0, "oil_pressure": 58.0, "cycle": c},
                aircraft_id="UAV-01",
                cycle=c,
            )

        # 2. Inject sustained CHT thermal distribution shift (mean 445°F instead of 380°F)
        ticket_found = None
        for c in range(20, 45):
            res = self.detector.ingest_sample(
                {"rpm": 1400.0, "cht": 445.0, "egt": 1585.0, "oil_pressure": 58.0, "cycle": c},
                aircraft_id="UAV-01",
                flight_id="FL-DRIFT-01",
                cycle=c,
                tenant_id="tenant-defense-01",
            )
            if res.get("new_ticket"):
                ticket_found = res["new_ticket"]
                break

        self.assertIsNotNone(ticket_found, "DriftReviewTicket was not generated upon distribution shift")
        self.assertIn("DRFT-UAV-01", ticket_found["ticket_id"])
        self.assertEqual(ticket_found["status"], "OPEN")
        self.assertEqual(ticket_found["channel"], "cht")
        self.assertGreater(ticket_found["drift_score"], 2.0)

        # 3. Verify threshold was NOT silently mutated
        self.assertEqual(NOMINAL_BASELINES["cht"]["mean"], 380.0)

        # 4. Verify ticket was persisted in EventStore
        events = self.event_store.query_events(aircraft_id="UAV-01", event_type="DRIFT_REVIEW_TICKET")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["channel"], "cht")

    def test_ticket_review_lifecycle(self):
        """Verify ticket acknowledgement and resolution lifecycle."""
        # Warmup and trigger drift
        for c in range(1, 40):
            val = 380.0 if c < 15 else 445.0
            self.detector.ingest_sample(
                {"rpm": 1400.0, "cht": val, "egt": 1585.0, "oil_pressure": 58.0, "cycle": c},
                aircraft_id="UAV-02",
                cycle=c,
                tenant_id="tenant-alpha",
            )

        tickets = self.detector.list_tickets(aircraft_id="UAV-02")
        self.assertGreaterEqual(len(tickets), 1)
        tid = tickets[0]["ticket_id"]

        # Acknowledge
        ack_ok = self.detector.acknowledge_ticket(tid, assigned_to="lead_engineer@fleet")
        self.assertTrue(ack_ok)
        self.assertEqual(self.detector.tickets[tid].status, "ACKNOWLEDGED")

        # Resolve
        res_ok = self.detector.resolve_ticket(
            tid,
            resolution_note="Inspected CHT cylinder thermistor; recalibrated in test cell.",
            resolved_by="chief_engineer@fleet",
        )
        self.assertTrue(res_ok)
        self.assertEqual(self.detector.tickets[tid].status, "RESOLVED")
        self.assertIn("thermistor", self.detector.tickets[tid].resolution_note)


class TestModelGovernanceAndPromotionGates(unittest.TestCase):
    """Verifies ModelEvalCards, ShadowModeRunner, and airworthiness promotion gates."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_governance_events.db")
        self.event_store = EventStore(db_path=self.db_path)
        self.gate = ModelPromotionGate(event_store=self.event_store)

        self.runtime_f32 = EdgePrognosticsRuntime(precision="GCS_FLOAT32")
        self.runtime_int8 = EdgePrognosticsRuntime(precision="EDGE_INT8")

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_model_eval_card_generation(self):
        """Generate eval card with offline metrics and check promotion readiness."""
        np.random.seed(42)
        y_true = np.linspace(125.0, 5.0, 100)
        y_pred = y_true + np.random.normal(0.0, 3.5, size=100)  # High accuracy candidate
        y_base = y_true + np.random.normal(0.0, 6.0, size=100)  # Baseline model

        card = self.gate.generate_eval_card(
            candidate_model_id="uav_rul_candidate_lstm_v1.1",
            version="1.1.0",
            y_true=y_true,
            y_pred=y_pred,
            y_baseline_pred=y_base,
            latency_ms=1.1,
            shadow_metrics={"passed_shadow_gate": True},
        )

        d = card.to_dict()
        self.assertIn("eval_id", d)
        self.assertLess(d["metrics"]["mae"], 8.0)
        self.assertGreater(d["metrics"]["r2"], 0.85)
        self.assertTrue(d["passed_offline_gate"])
        self.assertTrue(d["passed_shadow_gate"])
        self.assertTrue(d["overall_promotion_ready"])

    def test_shadow_mode_runner_evaluation(self):
        """Verify shadow mode runs challenger concurrently without operational impact."""
        runner = ShadowModeRunner(
            champion_runtime=self.runtime_f32,
            challenger_runtime=self.runtime_int8,
            model_id="challenger_int8",
        )

        for _ in range(15):
            window = np.random.uniform(0.1, 0.9, size=(50, 3)).astype(np.float32)
            rec = runner.evaluate_window(window, ground_truth_rul=100.0)
            self.assertIn("champion_rul", rec)
            self.assertIn("challenger_rul", rec)
            self.assertIn("absolute_delta", rec)

        metrics = runner.get_shadow_metrics()
        self.assertEqual(metrics["total_samples"], 15)
        self.assertLess(metrics["mean_delta_cycles"], 20.0)

    def test_promotion_gate_enforces_offline_and_human_signoff(self):
        """Failing candidate is rejected; passing candidate requires human sign-off."""
        # 1. Failing candidate with terrible R2
        y_true = np.linspace(100.0, 10.0, 50)
        y_bad = np.random.uniform(10.0, 150.0, size=50)  # Noise
        bad_card = self.gate.generate_eval_card(
            candidate_model_id="flawed_candidate",
            version="0.9.0",
            y_true=y_true,
            y_pred=y_bad,
            y_baseline_pred=y_true,
            latency_ms=25.0,  # Fails latency gate too
        )
        ok1, msg1 = self.gate.promote_candidate(bad_card.eval_id, approved_by="eng", justification="test")
        self.assertFalse(ok1)
        self.assertIn("Failed offline metric gate", msg1)

        # 2. Good candidate without human sign-off
        y_good = y_true + 1.0
        good_card = self.gate.generate_eval_card(
            candidate_model_id="high_accuracy_candidate",
            version="1.2.0",
            y_true=y_true,
            y_pred=y_good,
            y_baseline_pred=y_true + 3.0,
            latency_ms=1.4,
        )
        ok2, msg2 = self.gate.promote_candidate(good_card.eval_id, approved_by="", justification="")
        self.assertFalse(ok2)
        self.assertIn("Human sign-off required", msg2)

        # 3. Successful promotion with human sign-off
        ok3, msg3 = self.gate.promote_candidate(
            good_card.eval_id,
            approved_by="chief_avionics_engineer@fleet.defense",
            justification="Validated on 10,000 synthetic + C-MAPSS cycles; achieves 98.6% parity.",
        )
        self.assertTrue(ok3)
        self.assertEqual(self.gate.active_champion["model_id"], "high_accuracy_candidate")
        self.assertEqual(self.gate.active_champion["status"], "CHAMPION")

        # Verify EventStore audit trail persisted
        events = self.event_store.get_replay_events(flight_id="GOVERNANCE_AUDIT", event_type="MODEL_PROMOTION_DECISION")
        self.assertGreaterEqual(len(events), 1)
        self.assertEqual(events[0]["model_id"], "high_accuracy_candidate")

    def test_instantaneous_atomic_rollback(self):
        """Promote model then execute atomic rollback upon simulated regression."""
        y_true = np.linspace(100.0, 10.0, 50)
        card = self.gate.generate_eval_card(
            candidate_model_id="candidate_v2",
            version="2.0.0",
            y_true=y_true,
            y_pred=y_true + 0.5,
            y_baseline_pred=y_true + 2.0,
        )
        self.gate.promote_candidate(card.eval_id, approved_by="eng1", justification="Release v2")
        self.assertEqual(self.gate.active_champion["model_id"], "candidate_v2")

        # Rollback
        rb_ok, rb_msg = self.gate.rollback_model(
            reason="Unanticipated vibration divergence in high turbulence envelope",
            approved_by="operations_director@fleet.defense",
        )
        self.assertTrue(rb_ok)
        self.assertEqual(self.gate.active_champion["model_id"], "uav_rul_model.onnx")
        self.assertEqual(self.gate.active_champion["status"], "CHAMPION")
        self.assertEqual(self.gate.previous_champion["status"], "ROLLED_BACK")

        # Verify EventStore rollback audit trail persisted
        rb_events = self.event_store.get_replay_events(flight_id="GOVERNANCE_AUDIT", event_type="MODEL_ROLLBACK_DECISION")
        self.assertGreaterEqual(len(rb_events), 1)
        self.assertEqual(rb_events[0]["demoted_model"], "candidate_v2")


class TestDifferentialPrivacyFederatedLearning(unittest.TestCase):
    """Verifies DP-FedAvg math, participant attestation, quorum, and multi-tenant opt-in."""

    def setUp(self):
        self.coordinator = DifferentialPrivacyFederatedCoordinator(
            uav_ids=["UAV-01", "UAV-02", "UAV-03", "UAV-04", "UAV-05"],
            clipping_bound=0.15,
            target_epsilon=4.0,
            target_delta=1e-5,
        )

    def test_gradient_clipping_bound(self):
        """Verifies L2 norm clipping strictly bounds gradient vectors to clipping_bound C."""
        # 1. Normal gradient below C (norm ~0.08)
        small_vec = np.array([0.02, 0.03, -0.01, 0.04, 0.02, 0.01, -0.02, 0.01])
        c_small, norm_small = clip_gradients(small_vec, clipping_bound=0.15)
        self.assertAlmostEqual(norm_small, float(np.linalg.norm(small_vec)), places=5)
        np.testing.assert_allclose(c_small, small_vec)

        # 2. Exploding gradient above C (norm ~1.5)
        large_vec = np.ones(8) * 0.5
        c_large, norm_large = clip_gradients(large_vec, clipping_bound=0.15)
        self.assertAlmostEqual(float(np.linalg.norm(c_large)), 0.15, places=5)
        self.assertGreater(norm_large, 0.15)

    def test_dp_federated_averaging_with_calibrated_noise(self):
        """Verify DP-FedAvg injects calibrated Gaussian differential privacy noise."""
        deltas = {
            "UAV-01": np.array([0.05, -0.02, 0.03, 0.01, -0.01, 0.02, 0.04, -0.02]),
            "UAV-02": np.array([0.04, -0.01, 0.02, 0.02, -0.02, 0.01, 0.03, -0.01]),
            "UAV-03": np.array([0.06, -0.03, 0.04, 0.01, -0.01, 0.03, 0.05, -0.02]),
        }
        weights = {"UAV-01": 20, "UAV-02": 25, "UAV-03": 30}

        agg, metrics = dp_federated_average(
            deltas=deltas,
            sample_weights=weights,
            clipping_bound=0.15,
            epsilon=4.0,
            delta=1e-5,
            seed=42,
        )

        self.assertEqual(len(agg), 8)
        self.assertGreater(metrics["noise_sigma"], 0.0)
        self.assertIn("Differential Privacy", metrics["privacy_guarantee"])
        self.assertEqual(metrics["participants_count"], 3)

    def test_cryptographic_participant_attestation(self):
        """Verifies HMAC-SHA256 digital signature attestation accepts valid and rejects tampered updates."""
        delta = np.array([0.01, 0.02, 0.03, -0.01, 0.02, 0.01, -0.02, 0.01])
        valid_sig = self.coordinator.create_participant_signature("UAV-01", "tenant-alpha", delta)

        # 1. Valid attestation passes
        self.assertTrue(self.coordinator.verify_participant_attestation("UAV-01", "tenant-alpha", delta, valid_sig))

        # 2. Tampered delta fails
        tampered_delta = np.copy(delta)
        tampered_delta[0] += 0.05
        self.assertFalse(self.coordinator.verify_participant_attestation("UAV-01", "tenant-alpha", tampered_delta, valid_sig))

        # 3. Spoofed aircraft identity fails
        self.assertFalse(self.coordinator.verify_participant_attestation("UAV-02", "tenant-alpha", delta, valid_sig))

    def test_minimum_quorum_enforcement(self):
        """Less than 3 participants fails with InsufficientParticipantsError."""
        # Only 2 participants
        with self.assertRaises(InsufficientParticipantsError):
            self.coordinator.execute_round(participating_uavs=["UAV-01", "UAV-02"])

    def test_multi_tenant_opt_in_governance(self):
        """Un-opted tenants are excluded from federated aggregation rounds."""
        # Opt-out tenant-bravo
        self.coordinator.set_tenant_opt_in("tenant-bravo", False)
        self.assertFalse(self.coordinator.is_tenant_opted_in("tenant-bravo"))

        # UAV-03 and UAV-04 belong to tenant-bravo; UAV-01, UAV-02 (tenant-alpha), UAV-05 (default) are opted in (3 total)
        res = self.coordinator.execute_round(participating_uavs=["UAV-01", "UAV-02", "UAV-03", "UAV-04", "UAV-05"])

        # Confirm UAV-03 and UAV-04 were excluded due to opt-out
        self.assertIn("UAV-03", res["excluded_unopted_uavs"])
        self.assertIn("UAV-04", res["excluded_unopted_uavs"])
        self.assertNotIn("UAV-03", res["participating_uavs"])
        self.assertEqual(len(res["participating_uavs"]), 3)

        # Privacy budget accumulated
        self.assertGreater(res["cumulative_privacy_budget"]["cumulative_epsilon"], 0.0)


if __name__ == "__main__":
    unittest.main()
