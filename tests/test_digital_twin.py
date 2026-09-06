"""
tests/test_digital_twin.py

Comprehensive Automated Unit & Integration Test Suite for:
  - Physics Engine (Thermodynamics, Otto cycle, Brake Power, Residuals)
  - Sensor Integrity Monitor (Stuck values, Discontinuities, Noise, Physics Disagreement)
  - Twin Consistency (Cross-validation Cases A, B, C, D)
  - Mission Risk Engine (Reliability, Safe Operating Time, Failure Probability)
  - What-If Simulation Engine (Counterfactual scaling, RPM/Cooling/Altitude impacts)
  - Operating Point Optimizer (scipy optimization under operational constraints)
  - Prescriptive Maintenance Engine (Advisories, Severity escalation, Benefits)
  - AI Mission Engineer (Grounded explanations, No hallucinations)
  - Telemetry Security & Integrity (Packet loss, Replay attacks, Sequence violations)
  - Fleet Manager (Multi-UAV state tracking, Selection, Synchronization)
"""

import sys
import os
import unittest
import numpy as np

# Add backend directory to sys.path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, 'backend')
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from physics_engine import physics_model
from sensor_integrity import sensor_integrity_monitor
from twin_consistency import compute_twin_consistency
from mission_risk import compute_mission_risk, compute_failure_probability
from whatif_engine import simulate_whatif
from optimizer import find_optimal_operating_point
from prescriptive import generate_prescriptive_recommendations
from ai_engineer import answer as ai_engineer_answer
from telemetry_integrity import telemetry_integrity_monitor
from fleet_manager import fleet_manager
from health_index import compute_health_index


class TestPhysicsEngine(unittest.TestCase):
    """Verifies aerodynamic & thermodynamic calculations."""

    def test_brake_power_and_efficiency(self):
        telemetry = {
            'rpm': 2400.0, 'cht': 380.0, 'egt': 1450.0,
            'oil_pressure': 55.0, 'fuel_flow': 10.5, 'altitude_ft': 3000
        }
        res = physics_model.evaluate_performance(telemetry)
        self.assertIn('brake_power_hp', res)
        self.assertGreater(res['brake_power_hp'], 30.0)
        self.assertLess(res['brake_power_hp'], 130.0)
        self.assertIn('thermal_efficiency', res)
        self.assertGreater(res['thermal_efficiency'], 15.0)
        self.assertLess(res['thermal_efficiency'], 45.0)

    def test_residuals_calculation(self):
        telemetry = {
            'rpm': 2000.0, 'cht': 350.0, 'egt': 1400.0,
            'oil_pressure': 50.0, 'fuel_flow': 9.0, 'altitude_ft': 3000
        }
        res = physics_model.evaluate_performance(telemetry)
        residuals = res.get('residuals', {})
        self.assertIn('delta_cht', residuals)
        self.assertIn('delta_egt', residuals)
        self.assertIn('delta_oil_p', residuals)


class TestSensorIntegrity(unittest.TestCase):
    """Verifies detection of stuck, noisy, or physically impossible readings."""

    def test_nominal_sensors(self):
        telemetry = {
            'rpm': 2100.0, 'cht': 375.0, 'egt': 1420.0,
            'oil_pressure': 52.0, 'oil_temp': 180.0, 'fuel_flow': 9.8,
            'vibration': 1.2, 'battery_v': 14.0, 'altitude_ft': 3000,
            'cht_cyl': [374.0, 376.0, 375.0, 375.0]
        }
        res = sensor_integrity_monitor.evaluate(telemetry)
        self.assertGreaterEqual(res['integrity_score'], 80.0)
        self.assertEqual(res['per_channel']['rpm']['status'], 'HEALTHY')

    def test_stuck_sensor_detection(self):
        telemetry = {
            'rpm': 2000.0, 'cht': 380.0, 'egt': 1400.0,
            'oil_pressure': 50.0, 'oil_temp': 180.0, 'fuel_flow': 9.0,
            'vibration': 1.1, 'battery_v': 14.0, 'altitude_ft': 3000
        }
        for _ in range(25):
            res = sensor_integrity_monitor.evaluate(telemetry)
        rpm_ch = res['per_channel'].get('rpm', {})
        self.assertIn(rpm_ch.get('status'), ['DEGRADED', 'SUSPECT', 'FAULT'])


class TestTwinConsistency(unittest.TestCase):
    """Verifies AI + Physics cross-validation logic (Cases A, B, C, D)."""

    def test_case_a_nominal(self):
        # AI Normal (positive score, not anomaly), Physics Normal (low residuals)
        res = compute_twin_consistency(
            is_anomaly=False,
            anomaly_score=0.20,
            physics_residuals={'delta_cht': 2.0, 'delta_egt': 10.0, 'delta_oil_p': 1.0},
            sensor_integrity_score=98.0
        )
        self.assertEqual(res['case'], 'A')
        self.assertEqual(res['case_label'], 'NORMAL')
        self.assertGreater(res['consistency_score'], 85.0)

    def test_case_b_engine_fault(self):
        # AI Abnormal (flagged, negative score), Physics Abnormal (high residuals)
        res = compute_twin_consistency(
            is_anomaly=True,
            anomaly_score=-0.35,
            physics_residuals={'delta_cht': 65.0, 'delta_egt': 180.0, 'delta_oil_p': 25.0},
            sensor_integrity_score=95.0
        )
        self.assertEqual(res['case'], 'B')
        self.assertEqual(res['case_label'], 'HIGH_CONFIDENCE_FAULT')

    def test_case_c_sensor_disagreement(self):
        # AI Normal, Physics Abnormal (high residuals)
        res = compute_twin_consistency(
            is_anomaly=False,
            anomaly_score=0.20,
            physics_residuals={'delta_cht': 75.0, 'delta_egt': 160.0, 'delta_oil_p': 30.0},
            sensor_integrity_score=70.0
        )
        self.assertEqual(res['case'], 'C')
        self.assertEqual(res['case_label'], 'SENSOR_MODEL_DISAGREEMENT')

    def test_case_d_possible_false_positive(self):
        # AI Abnormal, Physics Normal (low residuals)
        res = compute_twin_consistency(
            is_anomaly=True,
            anomaly_score=-0.20,
            physics_residuals={'delta_cht': 2.0, 'delta_egt': 5.0, 'delta_oil_p': 1.0},
            sensor_integrity_score=95.0
        )
        self.assertEqual(res['case'], 'D')
        self.assertEqual(res['case_label'], 'POSSIBLE_FALSE_POSITIVE')


class TestMissionRiskEngine(unittest.TestCase):
    """Verifies mission completion probability and safe operating time."""

    def test_healthy_mission_risk(self):
        telemetry = {'altitude_ft': 3000, 'oat_c': 15.0, 'rpm': 2100.0, 'cht': 380.0, 'egt': 1550.0}
        # For a 1.0h loiter mission, 140 cycles of RUL is more than ample
        res = compute_mission_risk(
            data=telemetry,
            health_index=95.0,
            predicted_rul=140.0,
            failure_probability=0.02,
            fault_events=[],
            mission_duration_h=1.0
        )
        self.assertGreater(res['mission_completion_probability'], 75.0)
        self.assertIn(res['risk_level'], ['LOW', 'MODERATE'])
        self.assertGreater(res['safe_operating_time_h'], 1.4)

    def test_critical_mission_risk(self):
        telemetry = {'altitude_ft': 15000, 'oat_c': 45.0, 'rpm': 2600.0, 'cht': 440.0, 'egt': 1750.0}
        faults = [{'name': 'cooling_degradation', 'severity': 'CRITICAL'}]
        res = compute_mission_risk(
            data=telemetry,
            health_index=25.0,
            predicted_rul=12.0,
            failure_probability=0.75,
            fault_events=faults
        )
        self.assertLess(res['mission_completion_probability'], 45.0)
        self.assertEqual(res['risk_level'], 'CRITICAL')


class TestWhatIfAndOptimizer(unittest.TestCase):
    """Verifies counterfactual what-if simulation and operating point optimization."""

    def test_whatif_rpm_reduction(self):
        current_state = {
            'rpm': 2400.0, 'cht': 420.0, 'egt': 1600.0, 'fuel_flow': 12.0,
            'altitude_ft': 5000, 'oil_pressure': 50.0, 'vibration': 1.0
        }
        res = simulate_whatif(
            current_state=current_state,
            overrides={'rpm': 2000.0},
            current_rul=45.0,
            current_health=60.0,
            physics_model=physics_model,
            health_fn=compute_health_index
        )
        self.assertIn('counterfactual', res)
        self.assertLess(res['counterfactual']['cht'], current_state['cht'])
        self.assertGreaterEqual(res['delta']['rul'], 0.0)

    def test_counterfactual_optimization(self):
        current_state = {
            'rpm': 2400.0, 'cht': 415.0, 'egt': 1610.0, 'altitude_ft': 5000,
            'oil_pressure': 50.0, 'fuel_flow': 11.0, 'vibration': 1.0
        }
        res = find_optimal_operating_point(
            current_state=current_state,
            current_rul=50.0,
            current_health=65.0,
            failure_probability=0.10,
            constraints={'rpm_min': 1800, 'rpm_max': 2400, 'alt_max': 20000}
        )
        self.assertIn('optimal_rpm', res)
        self.assertGreaterEqual(res['optimal_rpm'], 1800)
        self.assertLessEqual(res['optimal_rpm'], 2400)
        self.assertIn('recommendation', res)


class TestPrescriptiveAndAIEngineer(unittest.TestCase):
    """Verifies actionable recommendations and grounded natural language QA."""

    def test_prescriptive_generation(self):
        faults = [{'name': 'cooling_degradation', 'severity': 'WARNING'}]
        twin = {'case': 'B', 'consistency_score': 60.0}
        risk = {'risk_level': 'HIGH', 'mission_completion_probability': 55.0}
        recs = generate_prescriptive_recommendations(
            fault_events=faults, predicted_rul=35.0, health_index=50.0,
            twin_consistency=twin, mission_risk=risk
        )
        self.assertGreater(len(recs), 0)
        # Check that recommendation mentions cooling, RPM, or power reduction
        content = " ".join([r.get('action', '') + " " + r.get('operational', '') + " " + r.get('maintenance', '') for r in recs]).lower()
        self.assertTrue('rpm' in content or 'cooling' in content or 'power' in content)

    def test_ai_engineer_grounded_response(self):
        state = {
            'health': {'health_index': 45.0, 'condition': 'DEGRADED'},
            'predicted_rul': 38.0,
            'failure_probability': 0.32,
            'fault_events': [{'name': 'cooling_degradation', 'severity': 'WARNING'}],
            'xai': {'top_driver': 'CHT Cylinder 3', 'attributions': [{'label': 'CHT-3', 'attribution': 45.0}]},
            'mission_risk': {'risk_level': 'MODERATE', 'mission_completion_probability': 68.0, 'safe_operating_time_h': 2.8}
        }
        answer = ai_engineer_answer("Why is the engine unhealthy?", state)
        self.assertIn('45', answer)
        self.assertIn('cooling', answer.lower())


class TestTelemetrySecurity(unittest.TestCase):
    """Verifies telemetry packet loss, replay detection, and sequencing."""

    def test_replay_and_packet_loss_detection(self):
        p1 = {'cycle': 100, 'timestamp': 1000.0, 'rpm': 2000, 'cht': 380}
        p2 = {'cycle': 100, 'timestamp': 1000.0, 'rpm': 2000, 'cht': 380}  # Replay / Duplicate
        p3 = {'cycle': 110, 'timestamp': 1005.0, 'rpm': 2000, 'cht': 380}  # Gap of 9 packets (> 5)

        telemetry_integrity_monitor.evaluate(p1)
        r2 = telemetry_integrity_monitor.evaluate(p2)
        self.assertGreater(r2['duplicate_packets'], 0)

        r3 = telemetry_integrity_monitor.evaluate(p3)
        self.assertGreater(r3['lost_packets'], 0)


class TestFleetManager(unittest.TestCase):
    """Verifies multi-UAV fleet monitoring and selection."""

    def test_fleet_registration_and_selection(self):
        fleet = fleet_manager.get_fleet_status()
        self.assertEqual(len(fleet), 4)
        uav_ids = [u['uav_id'] for u in fleet]
        self.assertIn('UAV-01', uav_ids)
        self.assertIn('UAV-04', uav_ids)

        fleet_manager.select_uav('UAV-03')
        self.assertEqual(fleet_manager.active_uav_id, 'UAV-03')
        fleet_manager.select_uav('UAV-01')


class TestEngineConfigRegistry(unittest.TestCase):
    """Verifies engine profile configuration and threshold management."""

    def setUp(self):
        try:
            from engine_config import set_engine_class
            set_engine_class("ROTAX_914_F")
        except ImportError:
            pass

    def test_engine_profile_switching(self):
        from engine_config import get_engine_config, set_engine_class, list_engine_classes, get_active_engine_class
        engines = list_engine_classes()
        self.assertIn("ROTAX_914", engines)
        self.assertIn("AUSTRO_AE300", engines)

        # Default Rotax 914
        cfg_rotax = get_engine_config("ROTAX_914")
        self.assertEqual(cfg_rotax["specs"]["compression_ratio"], 9.0)
        self.assertEqual(cfg_rotax["specs"]["rated_power_hp"], 115.0)

        # Switch to Austro AE300
        set_engine_class("AUSTRO_AE300")
        self.assertEqual(get_active_engine_class(), "AUSTRO_AE300")
        cfg_austro = get_engine_config()
        self.assertEqual(cfg_austro["specs"]["compression_ratio"], 17.5)
        self.assertEqual(cfg_austro["specs"]["rated_power_hp"], 168.0)

        # Revert back
        set_engine_class("ROTAX_914")


class TestTelemetryDriftDetector(unittest.TestCase):
    """Verifies rolling distribution tracking and telemetry drift detection."""

    def test_nominal_distribution_no_drift(self):
        from drift_detector import TelemetryDriftDetector
        detector = TelemetryDriftDetector(window_size=30, psi_threshold=0.25)
        # Push 35 samples drawn from nominal baseline distribution
        for _ in range(35):
            sample = {
                'rpm': float(np.random.normal(1400, 10)),
                'cht': float(np.random.normal(380, 8)),
                'egt': float(np.random.normal(1585, 12)),
                'oil_pressure': float(np.random.normal(58, 2)),
                'vibration': float(np.random.normal(0.65, 0.1))
            }
            res = detector.update(sample)

        self.assertFalse(res.get("drift_detected", False))
        self.assertEqual(res.get("status"), "NOMINAL")

    def test_drift_detection_on_shifted_telemetry(self):
        from drift_detector import TelemetryDriftDetector
        detector = TelemetryDriftDetector(window_size=30, psi_threshold=0.25)
        # Push 35 severely drifted samples (e.g. thermal runaway and oil drop)
        for _ in range(35):
            sample = {
                'rpm': 2750.0,
                'cht': 510.0,
                'egt': 1720.0,
                'oil_pressure': 22.0,
                'vibration': 3.8
            }
            res = detector.update(sample)

        self.assertTrue(res.get("drift_detected", False))
        self.assertIn(res.get("status"), ["WARNING", "CRITICAL"])
        self.assertGreater(res.get("max_psi", 0.0), 0.25)


class TestAutonomousMaintenanceAdvisor(unittest.TestCase):
    """Verifies deterministic multi-fault prioritization and ATA chapter mapping."""

    def test_multi_fault_priority_ranking(self):
        from maintenance_advisor import AutonomousMaintenanceAdvisor
        # Active concurrent faults: high vibration (WARNING), low oil pressure (EMERGENCY), overheating (CRITICAL)
        fault_events = [
            {"name": "HIGH_VIBRATION", "severity": "WARNING"},
            {"name": "LOW_OIL_PRESSURE", "severity": "CRITICAL"},
            {"name": "OVERHEATING", "severity": "CRITICAL"},
        ]
        cards = AutonomousMaintenanceAdvisor.generate_advisories(
            telemetry={"rpm": 2200},
            fault_events=fault_events,
            predicted_rul=120.0,
            health_index=65.0
        )
        self.assertGreaterEqual(len(cards), 3)

        # Rank 1 must be LOW_OIL_PRESSURE (ATA 79)
        top_card = cards[0]
        self.assertEqual(top_card.get("source_fault"), "LOW_OIL_PRESSURE")
        self.assertEqual(top_card.get("priority_rank"), 1)
        self.assertIn("79", top_card.get("ata_chapter", ""))

        # Rank 2 must be OVERHEATING (ATA 75)
        second_card = cards[1]
        self.assertEqual(second_card.get("source_fault"), "OVERHEATING")
        self.assertEqual(second_card.get("priority_rank"), 2)
        self.assertIn("75", second_card.get("ata_chapter", ""))

    def test_nominal_advisory_when_clear(self):
        from maintenance_advisor import AutonomousMaintenanceAdvisor
        cards = AutonomousMaintenanceAdvisor.generate_advisories(
            telemetry={"rpm": 2200},
            fault_events=[],
            predicted_rul=180.0,
            health_index=95.0
        )
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0].get("task_id"), "ATA 05-00-00")
        self.assertEqual(cards[0].get("priority"), "OK")


class TestXAIAttributionNormalization(unittest.TestCase):
    """Verifies XAI attribution sums to exactly 100.0% and correctly identifies top drivers."""

    def test_xai_attribution_normalization(self):
        from xai_engine import XAIDiagnosticEngine
        telemetry = {
            'rpm': 2100.0, 'cht': 490.0, 'egt': 1420.0,
            'oil_pressure': 22.0, 'vibration': 0.8
        }
        res = XAIDiagnosticEngine.explain_anomaly(
            telemetry=telemetry,
            is_anomaly=True,
            anomaly_score=0.78,
            active_faults=[{"name": "LOW_OIL_PRESSURE", "severity": "CRITICAL"}]
        )
        attributions = res.get("attributions", [])
        self.assertGreater(len(attributions), 0)

        total_attribution = sum(a["attribution"] for a in attributions)
        self.assertAlmostEqual(total_attribution, 100.0, places=1)
        self.assertTrue(len(res.get("top_driver", "")) > 0)


class TestAeroCANBridge(unittest.TestCase):
    """Verifies J1939 CAN frame generation, SPN schemas, and byte encoding."""

    def test_j1939_can_frame_structure(self):
        SIM_DIR = os.path.join(ROOT, 'simulator')
        if SIM_DIR not in sys.path:
            sys.path.insert(0, SIM_DIR)
        from can_bridge import AeroCANBridge

        telemetry = {
            "rpm": 2400.0, "cht": 385.0, "oil_pressure": 55.0,
            "oil_temp": 180.0, "fuel_flow": 11.5, "battery_v": 27.8,
            "vibration": 0.95, "vibration_kurtosis": 3.1, "cycle": 42
        }
        frames = AeroCANBridge.generate_packet_burst(telemetry)
        self.assertEqual(len(frames), 6)

        pgns = [f["pgn"] for f in frames]
        self.assertIn(61444, pgns)  # EEC1
        self.assertIn(65262, pgns)  # ET1
        self.assertIn(65263, pgns)  # EFLP
        self.assertIn(65271, pgns)  # VEP

        # Verify SPN decoding present on EEC1 frame
        eec1_frame = next(f for f in frames if f["pgn"] == 61444)
        self.assertIn("spns", eec1_frame)
        self.assertGreaterEqual(len(eec1_frame["spns"]), 2)
        spn_nums = [s["spn"] for s in eec1_frame["spns"]]
        self.assertIn(190, spn_nums)  # Engine speed


class TestMvpJudgeFlow(unittest.TestCase):
    """Verifies the core MVP Detect -> Validate -> Predict -> Explain -> Simulate -> Recommend flow."""

    def test_cylinder3_cooling_degradation_fault(self):
        """Verify Cylinder 3 cooling fault creates CHT spike, high residual, and Case B fault."""
        telemetry = {
            "rpm": 2400.0,
            "cht": 435.0,
            "cht_cyl": [380.0, 395.0, 448.0, 385.0],
            "egt": 1620.0,
            "egt_cyl": [1460.0, 1465.0, 1530.0, 1475.0],
            "oil_pressure": 52.0,
            "oil_temp": 215.0,
            "fuel_flow": 10.5,
            "altitude_ft": 3000,
        }
        res = physics_model.evaluate_performance(telemetry)
        residuals = res.get("residuals", {})
        self.assertGreater(residuals.get("delta_cht", 0), 25.0)

        # Cross-validation with high CHT, EGT, Oil P & Fuel residuals
        twin_res = compute_twin_consistency(
            is_anomaly=True,
            anomaly_score=-0.28,
            physics_residuals={"delta_cht": 58.0, "delta_egt": 110.0, "delta_oil_p": 25.0, "delta_fuel": 3.0},
            sensor_integrity_score=95.0,
        )
        self.assertEqual(twin_res["case"], "B")
        self.assertEqual(twin_res["case_label"], "HIGH_CONFIDENCE_FAULT")

    def test_whatif_rpm_reduction_simulation(self):
        """Verify What-If simulation for -200 RPM produces lower thermal load and recovered RUL."""
        baseline = {
            "rpm": 2400.0,
            "cht": 425.0,
            "egt": 1610.0,
            "oil_pressure": 55.0,
            "fuel_flow": 10.5,
            "altitude_ft": 3000,
            "cht_cyl": [380.0, 390.0, 435.0, 385.0],
        }
        res = simulate_whatif(
            current_state=baseline,
            overrides={"rpm": 2200.0},
            current_rul=42.0,
            current_health=52.0,
            physics_model=physics_model,
            health_fn=compute_health_index,
            anomaly_score=-0.25,
            fault_names=["COOLING_DEGRADATION"],
        )
        self.assertEqual(res["counterfactual"]["rpm"], 2200.0)
        self.assertLess(res["counterfactual"]["cht"], res["current"]["cht"])
        self.assertGreater(res["delta"]["rul"], 0.0)
        self.assertGreater(res["counterfactual"]["health"], res["current"]["health"])

    def test_prescriptive_recommendation_cooling_fault(self):
        """Verify prescriptive engine recommends RPM reduction for cooling degradation."""
        recs = generate_prescriptive_recommendations(
            fault_events=[{"name": "COOLING_DEGRADATION", "severity": "WARNING"}],
            predicted_rul=45.0,
            health_index=60.0,
            twin_consistency={"case": "B"},
            mission_risk={"risk_level": "HIGH"},
        )
        self.assertGreater(len(recs), 0)
        cooling_rec = next((r for r in recs if "COOLING" in r.get("source", "") or "RPM" in r.get("action", "") or "RPM" in r.get("operational", "")), recs[0])
        self.assertTrue("power" in cooling_rec["action"] or "RPM" in cooling_rec["operational"])

    def test_fleet_manager_multi_uav_switching(self):
        """Verify FleetManager tracks 4 UAVs and updates selected active UAV."""
        status = fleet_manager.get_fleet_status()
        self.assertEqual(len(status), 4)

        # Switch to UAV-02
        self.assertTrue(fleet_manager.select_uav("UAV-02"))
        self.assertEqual(fleet_manager.active_uav_id, "UAV-02")
        self.assertEqual(fleet_manager.get_active_engine_id(), 2)

        # Update UAV-02 with telemetry
        fleet_manager.update_uav("UAV-02", {"health": {"health_index": 88.5}, "predicted_rul": 112.0})
        uav2_status = next(u for u in fleet_manager.get_fleet_status() if u["uav_id"] == "UAV-02")
        self.assertEqual(uav2_status["health"], 88.5)
        self.assertEqual(uav2_status["rul"], 112.0)
        self.assertTrue(uav2_status["is_active"])

        # Switch back to UAV-01
        fleet_manager.select_uav("UAV-01")


if __name__ == '__main__':
    unittest.main(verbosity=2)


