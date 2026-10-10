"""
tests/test_planning_and_decision_support.py

Comprehensive Verification Suite for STARTUP_BLUEPRINT.md Phase 4:
Planning & Decision Support.
Implements STARTUP_BLUEPRINT.md §3 F1, F2, F3 & §8 Phase 4:
  - F1: Life Burn Rate & Thermal Fatigue Damage Accumulator (Miner's rule, Coffin-Manson).
  - F2: Life-Aware Multi-Segment Mission Planner (Pareto set: Fastest, Cheapest Life, Balanced).
  - Pre-flight dispatch Go/No-Go evaluation & mission life budgeting.
  - F3: Engine-Aware Contingency Footprint & Monte Carlo landing site reachability.
  - REST API Endpoints (/api/missions/*, /api/contingency/*).
"""

import unittest
import json
import time
import urllib.request
import urllib.error

from twin_core.life_burn import (
    LifeBurnCalculator,
    RainflowCycleCounter,
    life_burn_calc,
    rainflow_counter,
)
from twin_core.mission_planner import (
    MissionSegment,
    LifeAwareMissionPlanner,
    mission_planner,
)
from twin_core.contingency_footprint import (
    DEFAULT_RECOVERY_SITES,
    haversine_distance_nmi,
    calculate_bearing_deg,
    ContingencyFootprintCalculator,
    contingency_engine,
)


class TestLifeBurnAndDamageAccumulation(unittest.TestCase):
    """Verifies F1: Life Burn Rate calculation and rainflow thermal fatigue counting."""

    def setUp(self):
        self.calc = LifeBurnCalculator()
        self.rainflow = RainflowCycleCounter()

    def test_nominal_cruise_lbi(self):
        """At baseline nominal temperatures and vibration, LBI should be ~1.0."""
        res = self.calc.compute_instantaneous_lbi(
            cht=380.0,
            egt=1580.0,
            oil_temp=185.0,
            oil_pressure=58.0,
            vibration=0.65,
            rpm=1400.0,
        )
        lbi = res["life_burn_index"]
        self.assertAlmostEqual(lbi, 1.0, delta=0.2)
        self.assertEqual(res["wear_regime"], "NOMINAL_CRUISE")

    def test_gentle_loiter_conservation_lbi(self):
        """Under throttled-back gentle loiter, LBI drops well below 1.0."""
        res = self.calc.compute_instantaneous_lbi(
            cht=340.0,
            egt=1420.0,
            oil_temp=170.0,
            oil_pressure=58.0,
            vibration=0.45,
            rpm=1200.0,
        )
        lbi = res["life_burn_index"]
        self.assertLess(lbi, 0.85)
        self.assertEqual(res["wear_regime"], "ECONOMY_CONSERVATION")

    def test_severe_overtemperature_damage_lbi(self):
        """Under severe CHT excursion (432°F) and high vibration, LBI accelerates sharply."""
        res = self.calc.compute_instantaneous_lbi(
            cht=432.0,
            egt=1720.0,
            oil_temp=215.0,
            oil_pressure=36.0,
            vibration=1.85,
            rpm=2350.0,
        )
        lbi = res["life_burn_index"]
        self.assertGreater(lbi, 2.20)
        self.assertEqual(res["wear_regime"], "SEVERE_DAMAGE_ACCUMULATION")
        self.assertGreater(res["components"]["overtemp_penalty"], 0.0)

    def test_rainflow_cycle_counting(self):
        """Extracts thermal cycle reversals from CHT time-series."""
        # Temperature fluctuations: 380 -> 420 -> 370 -> 410 -> 380
        series = [380.0, 395.0, 420.0, 410.0, 370.0, 390.0, 410.0, 380.0]
        extrema = self.rainflow.extract_reversals(series)
        self.assertEqual(len(extrema), 5)  # [380, 420, 370, 410, 380]

        cycles = self.rainflow.count_cycles(series)
        self.assertGreater(len(cycles), 0)
        for c in cycles:
            self.assertIn("range", c)
            self.assertIn("relative_damage", c)
            self.assertGreater(c["range"], 5.0)

    def test_flight_damage_accumulation(self):
        """Translates 4.0 flight hours at 1.4 LBI into 5.6 equivalent hours consumed."""
        res = self.calc.evaluate_flight_profile_damage(
            flight_duration_hours=4.0,
            average_lbi=1.4,
            initial_consumed_hours=100.0,
            tbo_hours=1500.0,
        )
        self.assertEqual(res["equivalent_hours_consumed"], 5.6)
        self.assertEqual(res["total_accumulated_hours"], 105.6)
        self.assertEqual(res["remaining_life_hours"], 1394.4)
        self.assertGreater(res["life_consumed_pct"], 7.0)


class TestLifeAwareParetoMissionPlanner(unittest.TestCase):
    """Verifies F2: Multi-segment mission planner and Pareto trade-off optimization."""

    def setUp(self):
        self.planner = LifeAwareMissionPlanner()

    def test_pareto_plans_generation(self):
        """Verifies FASTEST, CHEAPEST_LIFE, BALANCED, and NAIVE_BASELINE exist and trade off."""
        out = self.planner.plan_mission_pareto(current_rul_hours=100.0, fuel_capacity_gal=65.0)
        self.assertEqual(out["status"], "OPTIMIZATION_SUCCESS")
        plans = out["plans"]

        self.assertIn("FASTEST", plans)
        self.assertIn("CHEAPEST_LIFE", plans)
        self.assertIn("BALANCED", plans)
        self.assertIn("NAIVE_BASELINE", plans)

        fastest = plans["FASTEST"]
        cheapest_life = plans["CHEAPEST_LIFE"]
        balanced = plans["BALANCED"]

        # Pareto trade-off assertions:
        # Fastest must take less time than cheapest life
        self.assertLess(fastest["total_flight_time_hours"], cheapest_life["total_flight_time_hours"])
        # Cheapest life must consume less engine life than fastest
        self.assertLess(cheapest_life["total_life_consumed_hours"], fastest["total_life_consumed_hours"])
        # Balanced must have high completion probability
        self.assertGreaterEqual(balanced["predicted_completion_probability"], 0.80)

    def test_custom_mission_segments(self):
        """Optimizes a custom 3-segment mission profile."""
        custom_segments = [
            MissionSegment("Tactical Ingress", "CRUISE", 60.0, 7000.0),
            MissionSegment("Extended Reconnaissance", "LOITER", 0.0, 5000.0, loiter_duration_hours=2.0),
            MissionSegment("Tactical Egress", "CRUISE", 60.0, 7000.0),
        ]
        out = self.planner.plan_mission_pareto(segments=custom_segments)
        self.assertEqual(out["input_mission"]["segment_count"], 3)
        self.assertEqual(out["input_mission"]["total_distance_nmi"], 120.0)

    def test_dispatch_evaluation_go(self):
        """Healthy engine evaluates to GO with positive life budget margin."""
        res = self.planner.evaluate_mission_dispatch(
            aircraft_id="UAV-01",
            current_health_index=94.0,
            current_rul_hours=120.0,
            accumulated_life_hours=250.0,
        )
        self.assertEqual(res["dispatch_verdict"], "GO")
        self.assertTrue(res["life_budget"]["within_budget"])
        self.assertGreater(res["mission_feasibility_score"], 80.0)

    def test_dispatch_evaluation_nogo(self):
        """Severe degradation evaluates to NO_GO with explicit diagnostic reasons."""
        res = self.planner.evaluate_mission_dispatch(
            aircraft_id="UAV-CRITICAL",
            current_health_index=45.0,  # Below 65.0 threshold
            current_rul_hours=2.0,      # Insufficient for 4h mission
            accumulated_life_hours=1498.0,
        )
        self.assertEqual(res["dispatch_verdict"], "NO_GO")
        notes = " ".join(res["dispatch_notes"])
        self.assertIn("Health Index", notes)
        self.assertIn("exceeds remaining RUL", notes)


class TestContingencyFootprintCalculator(unittest.TestCase):
    """Verifies F3: Engine-aware contingency footprint & Monte Carlo reachability analysis."""

    def setUp(self):
        self.engine = ContingencyFootprintCalculator()

    def test_default_sites_and_registration(self):
        """Verifies default candidate airfields and adding custom recovery site."""
        sites = self.engine.list_sites()
        self.assertGreaterEqual(len(sites), 4)

        custom = {
            "site_id": "TEST-LZ",
            "name": "Emergency Highway Strip 12",
            "site_type": "CIVIL_RUNWAY",
            "lat": 34.300,
            "lon": -116.700,
            "elevation_ft": 2000.0,
            "runway_length_ft": 4000.0,
            "suitability_score": 0.8,
        }
        ok = self.engine.register_site(custom)
        self.assertTrue(ok)
        self.assertEqual(len(self.engine.list_sites()), len(sites) + 1)

    def test_haversine_and_bearing(self):
        """Verifies great-circle math and true bearing calculations."""
        # Distance from (34.0, -116.0) to (34.0, -117.0) is approx 49.8 nautical miles
        dist = haversine_distance_nmi(34.0, -116.0, 34.0, -117.0)
        self.assertAlmostEqual(dist, 49.8, delta=1.5)

        # Due West bearing should be ~270 degrees
        bearing = calculate_bearing_deg(34.0, -116.0, 34.0, -117.0)
        self.assertAlmostEqual(bearing, 270.0, delta=2.0)

    def test_contingency_footprint_monte_carlo(self):
        """Simulates 200 Monte Carlo trajectories with degraded engine and wind."""
        res = self.engine.calculate_contingency_footprint(
            current_lat=34.200,
            current_lon=34.200 - 150.950, # local coordinates
            current_altitude_ft=8500.0,
            derated_power_pct=65.0,
            conformal_rul_mean_h=1.5,
            conformal_rul_sigma_h=0.2,
            wind_speed_kts=20.0,
            wind_direction_deg=270.0,
            mc_samples=200,
        )
        self.assertEqual(res["status"], "FOOTPRINT_COMPUTED")
        
        # 8-cardinal directional footprint radius
        radii = res["footprint_radii_nmi"]
        self.assertIn("N", radii)
        self.assertIn("E", radii)
        self.assertIn("W", radii)
        # Tailwind to East (270 heading blowing East) should yield higher radius than Headwind to West
        self.assertGreater(radii["E"], radii["W"])

        # Ranked recovery sites
        ranked = res["ranked_recovery_sites"]
        self.assertGreater(len(ranked), 0)
        top_site = ranked[0]
        self.assertIn("reachability_probability", top_site)
        self.assertIn("composite_safety_score", top_site)
        self.assertGreaterEqual(top_site["reachability_probability"], 0.0)
        self.assertLessEqual(top_site["reachability_probability"], 1.0)


class TestPlanningRESTApi(unittest.TestCase):
    """Verifies Planning & Decision Support REST endpoints."""

    @classmethod
    def setUpClass(cls):
        from backend.api_server import start_api_server_thread
        cls.port = 18803
        cls.server_thread = start_api_server_thread(host="127.0.0.1", port=cls.port)
        time.sleep(0.3)

    def test_get_contingency_sites_api(self):
        url = f"http://127.0.0.1:{self.port}/api/contingency/sites"
        with urllib.request.urlopen(url, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertGreaterEqual(len(data["sites"]), 4)

    def test_post_missions_plan_api(self):
        url = f"http://127.0.0.1:{self.port}/api/missions/plan"
        payload = {"current_rul_hours": 110.0, "fuel_capacity_gal": 65.0}
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OPTIMIZATION_SUCCESS")
            plans = data["plans"]
            self.assertIn("FASTEST", plans)
            self.assertIn("CHEAPEST_LIFE", plans)
            self.assertIn("BALANCED", plans)

    def test_post_missions_score_api(self):
        url = f"http://127.0.0.1:{self.port}/api/missions/score"
        payload = {
            "aircraft_id": "UAV-API-TEST",
            "current_health_index": 91.0,
            "current_rul_hours": 95.0,
            "accumulated_life_hours": 310.0,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["dispatch_verdict"], "GO")
            self.assertTrue(data["life_budget"]["within_budget"])

    def test_post_contingency_footprint_api(self):
        url = f"http://127.0.0.1:{self.port}/api/contingency/footprint"
        payload = {
            "current_lat": 34.250,
            "current_lon": -116.800,
            "current_altitude_ft": 8000.0,
            "derated_power_pct": 60.0,
            "conformal_rul_mean_h": 1.4,
            "conformal_rul_sigma_h": 0.2,
            "wind_speed_kts": 15.0,
            "wind_direction_deg": 270.0,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "FOOTPRINT_COMPUTED")
            self.assertIn("ranked_recovery_sites", data)
            self.assertIn("footprint_radii_nmi", data)


if __name__ == "__main__":
    unittest.main()
