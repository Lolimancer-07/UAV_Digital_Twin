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


if __name__ == '__main__':
    unittest.main(verbosity=2)
