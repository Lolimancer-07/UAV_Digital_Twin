"""Unit tests for the additive, simulation-only Mission Command Center."""

import os
import sys
import unittest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from mission_command import (  # noqa: E402
    MissionCommandController,
    build_mission_command_state,
    build_recovery_plan,
    build_simulation_summary,
)


class TestMissionCommandCenter(unittest.TestCase):
    def setUp(self):
        self.telemetry = {
            "cycle": 73,
            "uav_id": "UAV-01",
            "rpm": 2420.0,
            "cht": 438.0,
            "egt": 1655.0,
            "altitude_ft": 9000.0,
            "oat_c": 42.0,
            "latitude": 26.79,
            "longitude": 78.15,
            "heading_deg": 65.0,
            "ground_speed_kts": 58.0,
            "mission_progress_pct": 44.0,
        }
        self.risk = {
            "mission_completion_probability": 36.0,
            "safe_operating_time_h": 0.8,
            "mission_at_risk": True,
            "risk_level": "CRITICAL",
            "risk_narrative": "Mission completion is critically low.",
            "components": {"environmental": 82.0},
        }
        self.faults = [{"name": "cooling_degradation", "severity": "CRITICAL"}]

    def test_recovery_plan_is_conservative_and_simulation_only(self):
        plan = build_recovery_plan(
            self.telemetry,
            self.risk,
            {"health_index": 32.0},
            self.faults,
        )

        self.assertTrue(plan["requires_operator_approval"])
        self.assertEqual(plan["execution_mode"], "SIMULATION_ONLY")
        self.assertLess(plan["parameters"]["target_rpm"], self.telemetry["rpm"])
        self.assertLess(plan["parameters"]["target_altitude_ft"], self.telemetry["altitude_ft"])

    def test_command_state_contains_map_trust_and_relief_candidate(self):
        state = build_mission_command_state(
            data=self.telemetry,
            mission_risk=self.risk,
            health={"health_index": 32.0},
            twin_consistency={"consistency_score": 92.0, "case": "B", "case_label": "HIGH_CONFIDENCE_FAULT"},
            sensor_integrity={"integrity_score": 94.0},
            telemetry_integrity={"integrity_score": 98.0},
            fault_events=self.faults,
            fleet_status=[
                {"uav_id": "UAV-01", "health": 32.0, "rul": 12.0, "mission_probability": 36.0, "fault_count": 1, "alert": "CRITICAL"},
                {"uav_id": "UAV-02", "health": 89.0, "rul": 110.0, "mission_probability": 88.0, "fault_count": 0, "alert": "NOMINAL"},
            ],
            is_anomaly=True,
        )

        self.assertEqual(state["mode"], "SIMULATED_TRAINING_CORRIDOR")
        self.assertEqual(state["route"]["position"]["latitude"], 26.79)
        self.assertGreater(state["trust"]["confidence"], 90.0)
        self.assertEqual(state["fleet_reassignment"]["candidate"]["uav_id"], "UAV-02")
        self.assertTrue(state["fleet_reassignment"]["required"])
        self.assertGreater(len(state["route"]["recovery_sites"]), 0)

    def test_audit_timeline_is_deduplicated_and_records_approval(self):
        controller = MissionCommandController()
        controller.observe(73, "CRITICAL", self.risk, {"case": "B", "case_label": "HIGH_CONFIDENCE_FAULT"}, self.faults)
        event_count = len(controller.events())
        controller.observe(74, "CRITICAL", self.risk, {"case": "B", "case_label": "HIGH_CONFIDENCE_FAULT"}, self.faults)
        self.assertEqual(len(controller.events()), event_count)

        controller.record_action(75, "PLAN_APPROVED", "Operator recorded a simulated recovery plan.")
        self.assertEqual(controller.events()[0]["type"], "PLAN_APPROVED")

    def test_simulation_summary_compares_existing_whatif_output(self):
        plan = build_recovery_plan(self.telemetry, self.risk, {"health_index": 32.0}, self.faults)
        summary = build_simulation_summary(
            plan=plan,
            whatif_result={
                "current": {"rul": 18.0},
                "counterfactual": {"rul": 31.0},
                "delta": {"rul": 13.0, "cht": -28.0},
            },
            baseline_mission_risk=self.risk,
            projected_mission_risk={"mission_completion_probability": 54.0},
        )

        self.assertEqual(summary["status"], "SIMULATED")
        self.assertEqual(summary["probability_delta"], 18.0)
        self.assertEqual(summary["thermal_relief_f"], 28.0)


if __name__ == "__main__":
    unittest.main()
