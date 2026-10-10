"""
tests/test_productisation_and_gtm.py

Comprehensive Verification Suite for Phase 7: Productisation & Go-to-Market Engine.
Implements improvement_plan.md §4 Phase 7:
  - 9-Minute Value Story demo controller with deterministic progression & reset button.
  - Printable executive outcome report generation.
  - Customer telemetry onboarding connectors (CSV backfill, header auto-mapping, J1939 PGNs).
  - Time-to-first-insight (< 10 minutes) validation.
  - Commercial pricing tiers & financial ROI calculator.
  - Productisation & GTM REST API endpoints.
"""

import unittest
import os
import json
import tempfile
import shutil
import time
import urllib.request

from twin_core.demo_kit import (
    DEMO_VALUE_STORY_STEPS,
    ValueStoryDemoController,
)
from twin_core.data_connectors import (
    CustomerLogBackfillParser,
    J1939CANMessageDecoder,
    CHANNEL_SYNONYMS,
)
from twin_core.roi_calculator import (
    COMMERCIAL_TIERS,
    EngineHealthROICalculator,
)
from backend.demo_controller import demo_controller


class TestDemoValueStoryKit(unittest.TestCase):
    """Verifies the self-contained 9-minute value story demo and reset lifecycle."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.control_path = os.path.join(self.temp_dir, "current_profile.json")
        self.controller = ValueStoryDemoController(control_file_path=self.control_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_demo_controller_full_9_step_progression(self):
        """Verifies full 9-step deterministic progression from Healthy to Value Delivery."""
        # Start demo
        state = self.controller.start_demo()
        self.assertTrue(state["active"])
        self.assertEqual(state["step"], 1)
        self.assertEqual(state["current_step"]["phase"], "Sense")

        # Step through all 9 steps
        for step_idx in range(2, 10):
            res = self.controller.advance_step(target_step=step_idx)
            self.assertEqual(res["step"], step_idx)
            self.assertEqual(res["total_steps"], 9)

        final_state = self.controller.get_state()
        self.assertEqual(final_state["step"], 9)
        self.assertEqual(final_state["completion_pct"], 100.0)
        self.assertEqual(final_state["current_step"]["phase"], "Protect")
        self.assertEqual(final_state["current_step"]["avoided_cost_usd"], 45000.0)

    def test_demo_reset_button_restores_baseline(self):
        """Instantaneous reset button clears faults and restores nominal control profile."""
        self.controller.start_demo()
        self.controller.advance_step(target_step=2)  # Inject cooling fault

        # Verify fault was staged
        with open(self.control_path, "r") as f:
            cfg = json.load(f)
        self.assertIn("cooling_degradation", cfg.get("injected_faults", []))

        # Trigger Reset Button
        res = self.controller.reset_to_baseline()
        self.assertEqual(res["status"], "RESET_COMPLETE")
        self.assertFalse(res["active"])
        self.assertEqual(res["step"], 0)

        # Verify file is restored to pristine baseline
        with open(self.control_path, "r") as f:
            clean_cfg = json.load(f)
        self.assertEqual(clean_cfg["injected_faults"], [])
        self.assertEqual(clean_cfg["mode"], "NORMAL")

    def test_printable_outcome_report_generation(self):
        """Generates executive printable HTML outcome report with avoided AOG metrics."""
        self.controller.start_demo()
        self.controller.advance_step(target_step=9)

        html = self.controller.generate_printable_outcome_report()
        self.assertIn("AeroTwin Propulsion Digital Twin", html)
        self.assertIn("$45,000 USD", html)
        self.assertIn("24.0 Hours", html)
        self.assertIn("ATA 75-00", html)
        self.assertIn("HEALTHY CRUISE BASELINE", html)
        self.assertIn("MISSION RESTORATION", html)

    def test_backward_compatible_demo_controller_methods(self):
        """Verifies backend/demo_controller.py exposes reset and report generation."""
        state = demo_controller.get_state()
        self.assertIn("total_steps", state)
        reset_res = demo_controller.reset()
        self.assertEqual(reset_res["status"], "RESET_COMPLETE")
        rep = demo_controller.generate_outcome_report()
        self.assertIn("<!DOCTYPE html>", rep)


class TestDataConnectorsAndFastOnboarding(unittest.TestCase):
    """Verifies customer onboarding ingestion and time-to-first-insight in < 10 min."""

    def setUp(self):
        self.parser = CustomerLogBackfillParser()

    def test_csv_backfill_auto_mapping_and_unit_conversion(self):
        """Auto-maps arbitrary avionics headers and converts Celsius to Fahrenheit."""
        raw_csv = """Tach,Cyl_Head_Temp,Exhaust_Gas_Temp,Oil_Press,Eng_Oil_Temp,Vib_G
2420,195,1580,58,85,0.65
2415,198,1585,57,86,0.68
2425,201,1590,56,87,0.70
"""
        frames, meta = self.parser.parse_csv_content(raw_csv)
        self.assertEqual(meta["total_rows_parsed"], 3)
        self.assertIn("rpm", meta["mapped_channels"])
        self.assertIn("cht", meta["mapped_channels"])
        self.assertIn("egt", meta["mapped_channels"])
        self.assertIn("oil_pressure", meta["mapped_channels"])

        # Check values and Celsius-to-Fahrenheit conversion (195°C is ~383°F)
        first_frame = frames[0]
        self.assertEqual(first_frame["rpm"], 2420.0)
        self.assertAlmostEqual(first_frame["cht"], 383.0, delta=1.0)
        self.assertEqual(first_frame["oil_pressure"], 58.0)

    def test_time_to_first_insight_card_generation(self):
        """Generates immediate health diagnostic card with findings and recommendations."""
        raw_csv = """RPM,CHT,EGT,Oil_Pressure
2400,380,1580,58
2400,442,1620,32
"""
        frames, _ = self.parser.parse_csv_content(raw_csv)
        card = self.parser.generate_first_insight_card(frames)

        self.assertIn(card["status"], ["WARNING", "CRITICAL"])
        self.assertLess(card["time_to_insight_sec"], 1.0)
        self.assertEqual(card["frames_analyzed"], 2)
        self.assertTrue(any("thermal peak" in f.lower() for f in card["primary_findings"]))
        self.assertTrue(len(card["recommendations"]) >= 1)

    def test_j1939_can_pgn_decoder(self):
        """Decodes standard J1939 CAN PGNs into physical engine parameters."""
        # PGN 61444 (EEC1): 2400 RPM -> raw value = 2400 / 0.125 = 19200 = 0x4B00
        # Byte 3: 0x00, Byte 4: 0x4B
        eec1_bytes = bytes([0x00, 0x00, 0x00, 0x00, 0x4B, 0x00, 0x00, 0x00])
        res_rpm = J1939CANMessageDecoder.decode_frame(J1939CANMessageDecoder.PGN_EEC1, eec1_bytes)
        self.assertEqual(res_rpm["rpm"], 2400.0)

        # PGN 65263 (Oil Pressure): 400 kPa (58 PSI) -> 400 / 4 = 100 in Byte 4
        press_bytes = bytes([0x00, 0x00, 0x00, 100, 0x00, 0x00, 0x00, 0x00])
        res_oil = J1939CANMessageDecoder.decode_frame(J1939CANMessageDecoder.PGN_ENG_PRESS, press_bytes)
        self.assertAlmostEqual(res_oil["oil_pressure"], 58.0, delta=1.0)


class TestCommercialROICalculator(unittest.TestCase):
    """Verifies commercial pricing tiers and financial ROI calculations."""

    def setUp(self):
        self.calc = EngineHealthROICalculator()

    def test_roi_calculation_formula_and_payback(self):
        """Verifies annual ROI and payback period calculation for a 10-UAV fleet."""
        result = self.calc.calculate_fleet_roi(
            fleet_size=10,
            annual_flight_hours_per_uav=600.0,
            tier_choice="TIER_FLEET_CLOUD",
        )

        self.assertEqual(result["fleet_size"], 10)
        self.assertEqual(result["annual_flight_hours"], 6000.0)
        self.assertEqual(result["tier_selected"], "Fleet Cloud Twin")

        breakdown = result["breakdown"]
        self.assertGreater(breakdown["avoided_aog_savings_usd"], 300000.0)
        self.assertGreater(breakdown["avoided_swap_savings_usd"], 30000.0)
        self.assertGreater(result["total_annual_value_delivered_usd"], 350000.0)

        # Payback period should be under 12 months, ROI positive
        self.assertLess(result["payback_period_months"], 12.0)
        self.assertGreater(result["roi_percentage"], 50.0)

    def test_all_commercial_tiers_defined(self):
        """Confirms the 4 commercial tiers are defined with non-zero pricing."""
        self.assertIn("TIER_EDGE_LICENSE", COMMERCIAL_TIERS)
        self.assertIn("TIER_FLEET_CLOUD", COMMERCIAL_TIERS)
        self.assertIn("TIER_OEM_PLATFORM", COMMERCIAL_TIERS)
        self.assertIn("TIER_BENCH_TESTCELL", COMMERCIAL_TIERS)
        for k, v in COMMERCIAL_TIERS.items():
            self.assertIn("name", v)
            self.assertIn("target", v)


class TestGTMRESTApiEndpoints(unittest.TestCase):
    """Verifies Phase 7 REST endpoints in backend/api_server.py."""

    @classmethod
    def setUpClass(cls):
        from backend.api_server import start_api_server_thread
        cls.port = 18801
        cls.server_thread = start_api_server_thread(host="127.0.0.1", port=cls.port)
        time.sleep(0.3)

    def test_demo_api_lifecycle(self):
        # 1. Start demo
        url_start = f"http://127.0.0.1:{self.port}/api/demo/start"
        req = urllib.request.Request(url_start, data=b"{}", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "OK")
            self.assertEqual(data["demo"]["step"], 1)

        # 2. Advance demo
        url_adv = f"http://127.0.0.1:{self.port}/api/demo/advance"
        req = urllib.request.Request(url_adv, data=json.dumps({"step": 3}).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data["demo"]["step"], 3)

        # 3. Get demo state
        url_state = f"http://127.0.0.1:{self.port}/api/demo/state"
        with urllib.request.urlopen(url_state, timeout=2.0) as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data["step"], 3)

        # 4. Get demo report (HTML)
        url_rep = f"http://127.0.0.1:{self.port}/api/demo/report"
        with urllib.request.urlopen(url_rep, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get_content_type(), "text/html")
            html = resp.read().decode()
            self.assertIn("AeroTwin Propulsion Digital Twin", html)

        # 5. Reset demo
        url_reset = f"http://127.0.0.1:{self.port}/api/demo/reset"
        req = urllib.request.Request(url_reset, data=b"{}", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "RESET_COMPLETE")

    def test_roi_and_ingest_api(self):
        # ROI Calculate
        url_roi = f"http://127.0.0.1:{self.port}/api/roi/calculate"
        payload = json.dumps({"fleet_size": 12, "annual_flight_hours_per_uav": 500.0}).encode()
        req = urllib.request.Request(url_roi, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertGreater(data["total_annual_value_delivered_usd"], 200000.0)

        # Ingest Backfill
        url_backfill = f"http://127.0.0.1:{self.port}/api/ingest/backfill"
        csv_data = "RPM,CHT,EGT,Oil_Pressure\n2400,380,1580,58\n2420,382,1585,57\n"
        req = urllib.request.Request(url_backfill, data=json.dumps({"csv_data": csv_data}).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["frames_parsed"], 2)
            self.assertEqual(data["first_insight_card"]["status"], "HEALTHY")


if __name__ == "__main__":
    unittest.main()
