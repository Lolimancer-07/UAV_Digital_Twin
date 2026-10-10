"""
tests/test_scale_out_engineering.py

Comprehensive Verification Suite for Phase 8: Scale-out Engineering.
Implements improvement_plan.md §4 Phase 8:
  - Multi-airframe platform profiles as pure data (Rotax 914, Austro AE300, Continental CD155, PBS TJ100).
  - Horizontal ingest partitioning by aircraft_id to avoid single-worker starvation.
  - Multi-tier backpressure shedding policies (Nominal, Interpolated, Emergency) with 100% safety alert retention.
  - FinOps Cost-per-Aircraft-per-Month (CPAM) calculation <= $28.50 with >85% software gross margin.
  - Automated chaos drills: BROKER_DOWN (zero data loss), STORE_DOWN (zero crash), MODEL_MISSING (physics fallback).
  - Scale-out REST API endpoints (/api/scale/*).
"""

import unittest
import json
import time
import urllib.request
import urllib.error

from twin_core.platform_profiles import (
    PLATFORM_PROFILES_DATA,
    PlatformProfileRegistry,
    platform_registry,
)
from twin_core.scale_ingest import (
    AircraftIngestPartition,
    BackpressureController,
    PartitionedIngestRouter,
)
from twin_core.cost_tracker import (
    DEFAULT_CLOUD_UNIT_COSTS,
    CloudCostTracker,
    cost_tracker,
)
from twin_core.chaos_engine import (
    ChaosEngineDrillRunner,
    chaos_runner,
)


class TestPlatformProfilesAsData(unittest.TestCase):
    """Verifies data-driven multi-engine platform profiles without code branching."""

    def setUp(self):
        self.registry = PlatformProfileRegistry()

    def test_default_profiles_loaded(self):
        """Verifies standard engine variants exist in pure data registry."""
        profiles = self.registry.list_profiles()
        pids = [p["profile_id"] for p in profiles]
        self.assertIn("ROTAX_914", pids)
        self.assertIn("AUSTRO_AE300", pids)
        self.assertIn("CONTINENTAL_CD155", pids)
        self.assertIn("PBS_TJ100", pids)

    def test_get_and_set_active_profile(self):
        """Verifies retrieving and switching active profile."""
        rotax = self.registry.get_profile("ROTAX_914")
        self.assertIsNotNone(rotax)
        self.assertEqual(rotax["specs"]["cylinders"], 4)
        self.assertEqual(rotax["baselines"]["rpm"], 1400.0)

        # Switch to Austro AE300 Diesel
        ok = self.registry.set_active_profile("AUSTRO_AE300")
        self.assertTrue(ok)
        active = self.registry.get_profile()
        self.assertEqual(active["profile_id"], "AUSTRO_AE300")
        self.assertEqual(active["powertrain_type"], "HEAVY_FUEL_DIESEL")

    def test_register_new_airframe_profile(self):
        """Verifies adding a customer engine profile dynamically via data payload."""
        custom_profile = {
            "profile_id": "WILLIAMS_FJ33",
            "name": "Williams FJ33 Light Turbofan",
            "powertrain_type": "TURBOFAN",
            "airframe_class": "High-Altitude Long-Endurance (HALE)",
            "fuel_type": "JET_A",
            "specs": {
                "cylinders": 0,
                "displacement_l": 0.0,
                "compression_ratio": 14.0,
                "rated_power_hp": 1800.0,
                "rated_rpm": 45000.0,
                "redline_rpm": 52000.0,
            },
            "baselines": {
                "rpm": 45000.0,
                "cht": 0.0,
                "egt": 1350.0,
                "oil_pressure": 55.0,
                "oil_temp": 175.0,
                "fuel_flow": 48.0,
                "vibration": 0.90,
            },
            "thresholds": {
                "cht_warning": 0.0,
                "cht_critical": 0.0,
                "oil_p_warning": 35.0,
                "oil_p_critical": 28.0,
                "vibration_critical": 3.0,
            },
        }
        ok, err = self.registry.register_profile(custom_profile)
        self.assertTrue(ok)
        self.assertIsNone(err)

        fetched = self.registry.get_profile("WILLIAMS_FJ33")
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["specs"]["rated_power_hp"], 1800.0)

    def test_profile_schema_validation(self):
        """Verifies validation failure on incomplete profile payload."""
        incomplete = {"profile_id": "INVALID_ENG"}
        ok, err = self.registry.register_profile(incomplete)
        self.assertFalse(ok)
        self.assertIn("Missing required sub-dict", err)


class TestPartitionedIngestAndBackpressure(unittest.TestCase):
    """Verifies horizontal partitioning, load shedding, and safety alert preservation."""

    def setUp(self):
        self.router = PartitionedIngestRouter(max_partition_size=100)

    def test_partitioning_by_aircraft(self):
        """Telemetry routes to separate partitions by aircraft_id."""
        self.router.ingest_frame({"aircraft_id": "UAV-ALPHA", "cycle": 1, "cht": 380.0})
        self.router.ingest_frame({"aircraft_id": "UAV-BRAVO", "cycle": 1, "cht": 380.0})

        metrics = self.router.get_partition_metrics()
        self.assertEqual(metrics["active_partitions_count"], 2)
        self.assertEqual(metrics["total_fleet_ingested"], 2)

        alpha_m = self.router.get_partition_metrics("UAV-ALPHA")
        self.assertEqual(alpha_m["queue_depth"], 1)

    def test_backpressure_controller_policy_transitions(self):
        """Verifies controller thresholds (Nominal < 70%, Interpolated >= 70%, Emergency >= 90%)."""
        ctrl = BackpressureController(high_watermark=0.70, emergency_watermark=0.90)
        self.assertEqual(ctrl.determine_policy(0.50), BackpressureController.POLICY_NOMINAL)
        self.assertEqual(ctrl.determine_policy(0.75), BackpressureController.POLICY_INTERPOLATED)
        self.assertEqual(ctrl.determine_policy(0.95), BackpressureController.POLICY_EMERGENCY)

    def test_emergency_backpressure_and_safety_alert_preservation(self):
        """
        Under emergency queue saturation, nominal frames are shed,
        while anomaly & safety alert frames are 100% retained.
        """
        router = PartitionedIngestRouter(max_partition_size=10)
        partition = router._get_or_create_partition("UAV-STRESS")

        # Fill partition to 95% capacity (10 max)
        for i in range(9):
            partition.queue.append({"cycle": i, "cht": 380.0})

        # Nominal frame should be shed under emergency policy
        nom_frame = {"aircraft_id": "UAV-STRESS", "cycle": 100, "cht": 380.0, "oil_pressure": 55.0}
        res_nom = router.ingest_frame(nom_frame)
        self.assertEqual(res_nom["status"], "SHED_UNDER_BACKPRESSURE")
        self.assertEqual(res_nom["policy_applied"], BackpressureController.POLICY_EMERGENCY)

        # Critical frame with extreme CHT (425 F) must be PRESERVED
        crit_frame = {"aircraft_id": "UAV-STRESS", "cycle": 101, "cht": 425.0, "oil_pressure": 55.0}
        res_crit = router.ingest_frame(crit_frame)
        self.assertEqual(res_crit["status"], "ACCEPTED")
        self.assertEqual(res_crit["priority"], "HIGH_CRITICAL")

        # Explicit safety alert event frame must be PRESERVED
        alert_frame = {
            "aircraft_id": "UAV-STRESS",
            "cycle": 102,
            "event_type": "SAFETY_ALERT",
            "msg": "Terrain avoidance limit reached",
        }
        res_alert = router.ingest_frame(alert_frame)
        self.assertEqual(res_alert["status"], "ACCEPTED")
        self.assertEqual(res_alert["priority"], "HIGH_CRITICAL")

        m = router.get_partition_metrics("UAV-STRESS")
        self.assertGreater(m["total_critical_retained"], 0)
        self.assertGreater(m["total_shed"], 0)

    def test_process_partition_queue(self):
        """Verifies draining partition frames via worker handler."""
        router = PartitionedIngestRouter(max_partition_size=50)
        for i in range(15):
            router.ingest_frame({"aircraft_id": "UAV-DRAIN", "cycle": i})

        processed_items = []
        count = router.process_partition_queue("UAV-DRAIN", lambda f: processed_items.append(f), batch_size=10)
        self.assertEqual(count, 10)
        self.assertEqual(len(processed_items), 10)
        m = router.get_partition_metrics("UAV-DRAIN")
        self.assertEqual(m["queue_depth"], 5)


class TestCloudCostTracker(unittest.TestCase):
    """Verifies FinOps Cost-per-Aircraft-per-Month (CPAM) <= $28.50 and >85% gross margin."""

    def setUp(self):
        self.tracker = CloudCostTracker()

    def test_monthly_cpam_baseline(self):
        """Verifies 50 flight hours / mo CPAM stays well within $28.50 target."""
        metrics = self.tracker.compute_monthly_cost_per_aircraft(
            flight_hours_per_month=50.0,
            telemetry_hz=10.0,
            average_inference_latency_ms=12.0,
            retention_days=90,
        )

        cpam = metrics["cost_per_aircraft_per_month_usd"]
        self.assertLessEqual(cpam, 28.50)
        self.assertTrue(metrics["target_met"])
        self.assertGreater(metrics["gross_margin_pct"], 85.0)

        # Check breakdown existence
        bd = metrics["breakdown"]
        self.assertIn("compute_cpu_usd", bd)
        self.assertIn("memory_ram_usd", bd)
        self.assertIn("storage_usd", bd)
        self.assertIn("network_egress_usd", bd)
        self.assertEqual(metrics["total_frames_processed"], 1800000)

    def test_high_utilization_scaling(self):
        """Verifies scaling under 200 flight hours / month."""
        metrics = self.tracker.compute_monthly_cost_per_aircraft(flight_hours_per_month=200.0)
        self.assertGreater(metrics["total_frames_processed"], 7000000)
        # Even at 200 hours, cost should remain well below fleet tier price ($1,500/mo)
        self.assertLess(metrics["cost_per_aircraft_per_month_usd"], 20.0)
        self.assertGreater(metrics["gross_margin_pct"], 90.0)


class TestChaosEngineDrills(unittest.TestCase):
    """Verifies automated chaos drills: broker down, store down, and model missing."""

    def setUp(self):
        self.runner = ChaosEngineDrillRunner()

    def test_broker_down_store_and_forward(self):
        """Verifies broker disconnect buffers all frames and recovers with zero data loss."""
        res = self.runner.run_broker_down_drill(duration_frames=40)
        self.assertTrue(res["passed"])
        self.assertEqual(res["drill_type"], ChaosEngineDrillRunner.DRILL_BROKER_DOWN)
        self.assertEqual(res["frames_injected"], 40)
        self.assertEqual(res["frames_recovered"], 40)
        self.assertEqual(res["data_loss_rate_pct"], 0.0)
        self.assertEqual(res["status"], "PASS")

    def test_store_down_memory_fallback(self):
        """Verifies disk/store crash diverts into memory fallback buffer with zero crash."""
        res = self.runner.run_store_down_drill()
        self.assertTrue(res["passed"])
        self.assertEqual(res["drill_type"], ChaosEngineDrillRunner.DRILL_STORE_DOWN)
        self.assertFalse(res["process_crashed"])
        self.assertEqual(res["fallback_buffer_retained"], 20)
        self.assertEqual(res["status"], "PASS")

    def test_model_missing_physics_degradation(self):
        """Verifies missing ML model degrades gracefully to Otto-cycle physics residuals."""
        res = self.runner.run_model_missing_drill()
        self.assertTrue(res["passed"])
        self.assertEqual(res["drill_type"], ChaosEngineDrillRunner.DRILL_MODEL_MISSING)
        self.assertEqual(res["fallback_engine"], "PHYSICS_FALLBACK_RESIDUALS")
        self.assertIn("Safe operational fallback", res["degradation_warning"])
        self.assertEqual(res["status"], "PASS")


class TestScaleOutRESTApi(unittest.TestCase):
    """Verifies Phase 8 Scale-Out REST endpoints."""

    @classmethod
    def setUpClass(cls):
        from backend.api_server import start_api_server_thread
        cls.port = 18802
        cls.server_thread = start_api_server_thread(host="127.0.0.1", port=cls.port)
        time.sleep(0.3)

    def test_scale_profiles_api(self):
        # 1. GET /api/scale/profiles
        url = f"http://127.0.0.1:{self.port}/api/scale/profiles"
        with urllib.request.urlopen(url, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertGreaterEqual(len(data["profiles"]), 4)

        # 2. POST /api/scale/profiles (register custom profile)
        new_prof = {
            "profile_id": "API_TEST_TURBOPROP",
            "name": "API Test Turboprop",
            "specs": {"cylinders": 0, "rated_power_hp": 850.0},
            "baselines": {"rpm": 2000.0, "cht": 0.0, "egt": 1100.0},
            "thresholds": {"oil_p_warning": 40.0, "oil_p_critical": 30.0},
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(new_prof).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")

    def test_scale_ingest_api(self):
        # 1. POST /api/scale/ingest/frame
        url_frame = f"http://127.0.0.1:{self.port}/api/scale/ingest/frame"
        frame_payload = {
            "aircraft_id": "UAV-REST-01",
            "cycle": 10,
            "rpm": 2400.0,
            "cht": 380.0,
        }
        req = urllib.request.Request(
            url_frame,
            data=json.dumps(frame_payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "ACCEPTED")
            self.assertEqual(data["aircraft_id"], "UAV-REST-01")

        # 2. GET /api/scale/ingest/status
        url_status = f"http://127.0.0.1:{self.port}/api/scale/ingest/status?aircraft_id=UAV-REST-01"
        with urllib.request.urlopen(url_status, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertEqual(data["ingest_metrics"]["aircraft_id"], "UAV-REST-01")

    def test_scale_cost_metrics_api(self):
        # GET /api/scale/cost/metrics?flight_hours_per_month=60
        url = f"http://127.0.0.1:{self.port}/api/scale/cost/metrics?flight_hours_per_month=60"
        with urllib.request.urlopen(url, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            metrics = data["cost_metrics"]
            self.assertTrue(metrics["target_met"])
            self.assertLessEqual(metrics["cost_per_aircraft_per_month_usd"], 28.50)

    def test_scale_chaos_drill_api(self):
        # POST /api/scale/chaos/drill (BROKER_DOWN)
        url = f"http://127.0.0.1:{self.port}/api/scale/chaos/drill"
        req = urllib.request.Request(
            url,
            data=json.dumps({"drill_type": "BROKER_DOWN"}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "PASS")
            self.assertTrue(data["passed"])
            self.assertEqual(data["drill_type"], "BROKER_DOWN")


if __name__ == "__main__":
    unittest.main()
