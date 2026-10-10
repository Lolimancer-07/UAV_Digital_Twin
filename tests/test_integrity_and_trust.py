"""
tests/test_integrity_and_trust.py

Comprehensive Verification Suite for STARTUP_BLUEPRINT.md Phase 3:
Integrity, Trust & Cyber-Physical Assurance.
Implements STARTUP_BLUEPRINT.md §3 F4, F8, F9, F10 & §8 Phase 3:
  - F4: Physics Firewall (thermodynamic invariants, energy balance, rate limits, replay detection).
  - F9: Virtual Sensors & Degraded-Mode Continuity (physics-informed channel reconstruction).
  - F10: Engine Reliability Passport (cryptographically signed hash-chained ledger, 100% tamper detection).
  - F8: Causal Root-Cause Graph Engine (DAG traversal beyond SHAP bars).
  - REST API Endpoints (/api/firewall/*, /api/sensors/*, /api/passport/*, /api/diagnostics/*).
"""

import unittest
import json
import time
import math
import urllib.request
import urllib.error

from twin_core.physics_firewall import (
    PhysicsFirewall,
    physics_firewall,
)
from twin_core.virtual_sensors import (
    VirtualSensorReconstructor,
    virtual_sensors_engine,
)
from twin_core.reliability_passport import (
    PassportBlock,
    EngineReliabilityPassport,
    engine_passport,
)
from twin_core.causal_root_cause import (
    PROPULSION_CAUSAL_GRAPH,
    CausalRootCauseEngine,
    causal_engine,
)


class TestPhysicsFirewall(unittest.TestCase):
    """Verifies F4: Physics Firewall thermodynamic invariant inspection and cyber-tamper detection."""

    def setUp(self):
        self.firewall = PhysicsFirewall()

    def test_nominal_frame_passes(self):
        """Standard cruise telemetry passes all invariant layers with NOMINAL_VALID."""
        frame = {
            "rpm": 1400.0,
            "cht": 380.0,
            "egt": 1580.0,
            "oil_pressure": 58.0,
            "fuel_flow": 8.5,
            "vibration": 0.65,
            "seq": 100,
        }
        res = self.firewall.inspect_frame(frame)
        self.assertEqual(res["verdict"], PhysicsFirewall.VERDICT_NOMINAL)
        self.assertTrue(res["is_valid"])
        self.assertFalse(res["cyber_threat_detected"])

    def test_single_sensor_fault_detected(self):
        """Open thermocouple or impossible range is flagged as SENSOR_FAULT."""
        frame = {
            "rpm": 1400.0,
            "cht": 3500.0,  # Open circuit thermocouple voltage
            "egt": 1580.0,
            "oil_pressure": 58.0,
            "fuel_flow": 8.5,
            "seq": 101,
        }
        res = self.firewall.inspect_frame(frame)
        self.assertEqual(res["verdict"], PhysicsFirewall.VERDICT_SENSOR_FAULT)
        self.assertFalse(res["is_valid"])

    def test_real_physical_engine_fault_detected(self):
        """Coordinated high CHT, EGT, and vibration flagged as PHYSICAL_ENGINE_FAULT."""
        frame = {
            "rpm": 2350.0,
            "cht": 428.0,
            "egt": 1690.0,
            "oil_pressure": 48.0,
            "fuel_flow": 12.0,
            "vibration": 2.2,
            "seq": 102,
        }
        res = self.firewall.inspect_frame(frame)
        self.assertEqual(res["verdict"], PhysicsFirewall.VERDICT_PHYSICAL_FAULT)
        self.assertFalse(res["cyber_threat_detected"])

    def test_thermal_rate_of_change_cyber_violation(self):
        """Discontinuous 150°F CHT jump in 0.1s flagged as CYBER_TAMPER_SPOOF."""
        # Establish baseline
        self.firewall.inspect_frame({"rpm": 1400.0, "cht": 380.0, "egt": 1580.0, "fuel_flow": 8.5, "seq": 1})
        # Next frame jumps by 150°F in 0.1s (1500°F/s >> 18°F/s physical limit)
        injected = {"rpm": 1400.0, "cht": 530.0, "egt": 1580.0, "fuel_flow": 8.5, "seq": 2}
        res = self.firewall.inspect_frame(injected, dt_s=0.1)
        self.assertEqual(res["verdict"], PhysicsFirewall.VERDICT_CYBER_TAMPER)
        self.assertTrue(res["cyber_threat_detected"])

    def test_thermodynamic_over_unity_energy_violation(self):
        """High shaft power at full RPM with zero fuel chemical energy flagged as CYBER_TAMPER."""
        frame = {
            "rpm": 2400.0,   # High shaft work (~85 kW)
            "cht": 380.0,
            "egt": 1580.0,
            "oil_pressure": 55.0,
            "fuel_flow": 0.4, # Impossible idle fuel flow (<13 kW fuel input)
            "seq": 10,
        }
        res = self.firewall.inspect_frame(frame)
        self.assertEqual(res["verdict"], PhysicsFirewall.VERDICT_CYBER_TAMPER)
        self.assertTrue(res["cyber_threat_detected"])

    def test_replay_signature_detection(self):
        """Identical static float values repeated continuously flagged as replay loop."""
        static_frame = {"rpm": 1422.3, "cht": 381.4, "egt": 1582.1, "oil_pressure": 57.2, "fuel_flow": 8.44}
        for i in range(15):
            static_frame["seq"] = i
            res = self.firewall.inspect_frame(static_frame)
        
        self.assertEqual(res["verdict"], PhysicsFirewall.VERDICT_CYBER_TAMPER)
        self.assertIn("replay loop", " ".join(res["violations"]).lower())


class TestVirtualSensors(unittest.TestCase):
    """Verifies F9: Virtual Sensors & Degraded-Mode Continuity during sensor dropouts."""

    def setUp(self):
        self.engine = VirtualSensorReconstructor()

    def test_drop_one_cht_cylinder_reconstructed(self):
        """When cylinder 3 CHT fails (None/dropout), reconstructs from peer cylinders with provenance."""
        raw = {
            "rpm": 1400.0,
            "cht": 382.0,
            "cht_1": 378.0,
            "cht_2": 380.0,
            "cht_3": None,  # Broken thermocouple
            "cht_4": 386.0,
            "egt": 1580.0,
            "oil_pressure": 58.0,
            "fuel_flow": 8.5,
        }
        processed = self.engine.process_telemetry_frame(raw)
        
        self.assertIsNotNone(processed["cht_3"])
        self.assertAlmostEqual(processed["cht_3"], 387.0, delta=5.0)
        
        prov = processed["virtual_sensors"]
        self.assertTrue(prov["has_virtual_channels"])
        self.assertIn("cht_3", prov["reconstructed_channels"])
        self.assertGreaterEqual(prov["channel_confidences"]["cht_3"], 0.80)

    def test_drop_oil_pressure_reconstructed(self):
        """When oil pressure sensor reads NaN, reconstructs from RPM and oil temperature."""
        raw = {
            "rpm": 1400.0,
            "cht": 380.0,
            "oil_temp": 185.0,
            "oil_pressure": float("nan"),
            "fuel_flow": 8.5,
        }
        processed = self.engine.process_telemetry_frame(raw)
        
        self.assertFalse(math.isnan(processed["oil_pressure"]))
        self.assertAlmostEqual(processed["oil_pressure"], 58.0, delta=4.0)
        self.assertIn("oil_pressure", processed["virtual_sensors"]["reconstructed_channels"])

    def test_hysteresis_recovery(self):
        """Reconstructed channel reverts to physical only after stable consecutive healthy cycles."""
        # Frame 1: Failed
        frame_fail = {"rpm": 1400.0, "cht_1": None, "cht": 380.0}
        self.engine.process_telemetry_frame(frame_fail)
        self.assertTrue(self.engine.virtual_active.get("cht_1"))

        # Frame 2-10: Recovering but within hysteresis window (< 10)
        for _ in range(8):
            self.engine.process_telemetry_frame({"rpm": 1400.0, "cht_1": 380.0, "cht": 380.0})
            self.assertTrue(self.engine.virtual_active.get("cht_1"))

        # After 10 cycles, hysteresis resets virtual flag
        for _ in range(3):
            self.engine.process_telemetry_frame({"rpm": 1400.0, "cht_1": 380.0, "cht": 380.0})
        self.assertFalse(self.engine.virtual_active.get("cht_1"))


class TestEngineReliabilityPassport(unittest.TestCase):
    """Verifies F10: Engine Reliability Passport tamper-evident ledger and tamper detection."""

    def setUp(self):
        self.passport = EngineReliabilityPassport(engine_serial="TEST-SERIAL-1001")

    def test_genesis_and_append_flight_block(self):
        """Genesis block created and subsequent flight blocks hash-chained."""
        self.assertEqual(len(self.passport.chain), 1)
        genesis = self.passport.chain[0]
        self.assertEqual(genesis.block_index, 0)
        self.assertEqual(genesis.prev_hash, EngineReliabilityPassport.GENESIS_HASH)

        # Append flight
        blk = self.passport.append_flight_record(
            aircraft_id="UAV-01",
            flight_id="FLIGHT-2026-10-A",
            flight_hours=3.5,
            life_burn_equivalent_hours=3.8,
            max_cht_f=395.0,
            max_vibration_g=0.72,
        )
        self.assertEqual(len(self.passport.chain), 2)
        self.assertEqual(blk.block_index, 1)
        self.assertEqual(blk.prev_hash, genesis.block_hash)

        # Untampered chain verification
        audit = self.passport.verify_integrity()
        self.assertTrue(audit["is_valid"])
        self.assertEqual(audit["status"], "PASS_UNBROKEN_INTEGRITY")

    def test_tamper_detection_on_modified_flight_data(self):
        """100% tamper detection: Modifying flight hours breaks hash verification."""
        self.passport.append_flight_record("UAV-01", "FLIGHT-1", 2.0, 2.0, 380.0, 0.6)
        self.passport.append_flight_record("UAV-01", "FLIGHT-2", 4.0, 4.0, 385.0, 0.65)

        # Adversary attempts to tamper with historical block 1 flight hours (fraudulent logbook rollback)
        self.passport.chain[1].flight_hours = 0.5

        audit = self.passport.verify_integrity()
        self.assertFalse(audit["is_valid"])
        self.assertEqual(audit["tampered_block_index"], 1)
        self.assertIn("hash mismatch", audit["reason"].lower())

    def test_tamper_detection_on_broken_prev_hash(self):
        """Deleting an intermediate block breaks prev_hash chain linkage."""
        self.passport.append_flight_record("UAV-01", "FLIGHT-1", 2.0, 2.0, 380.0, 0.6)
        self.passport.append_flight_record("UAV-01", "FLIGHT-2", 4.0, 4.0, 385.0, 0.65)

        # Adversary deletes intermediate block 1 (trying to hide a flight record)
        del self.passport.chain[1]

        audit = self.passport.verify_integrity()
        self.assertFalse(audit["is_valid"])
        self.assertEqual(audit["tampered_block_index"], 1)
        self.assertIn("prev_hash broken", audit["reason"].lower())

    def test_evidence_pack_export(self):
        """Exports evidence pack with unbroken audit report and printable HTML."""
        pack = self.passport.export_evidence_pack()
        self.assertEqual(pack["engine_serial"], "TEST-SERIAL-1001")
        self.assertTrue(pack["audit_verdict"]["is_valid"])
        self.assertIn("printable_evidence_html", pack)
        self.assertIn("Engine Reliability Passport", pack["printable_evidence_html"])


class TestCausalRootCauseEngine(unittest.TestCase):
    """Verifies F8: Causal Directed Acyclic Graph (DAG) root-cause attribution."""

    def setUp(self):
        self.engine = CausalRootCauseEngine()

    def test_cooling_airflow_restriction_diagnosis(self):
        """High CHT with normal EGT, high oil temp, and low oil press attributes COOLING restriction."""
        telemetry = {
            "cht": 425.0,        # High CHT
            "egt": 1580.0,       # Normal EGT (rules out lean mixture!)
            "oil_temp": 210.0,   # Secondary oil heating
            "oil_pressure": 38.0,# Secondary viscosity loss
            "vibration": 0.70,
        }
        res = self.engine.diagnose_root_cause(telemetry)
        primary = res["primary_root_cause"]
        self.assertEqual(primary["root_cause_id"], "COOLING_AIRFLOW_RESTRICTION")
        self.assertIn("COOLING_AIRFLOW_RESTRICTION -> CHT", primary["causal_path"])
        self.assertGreater(primary["confidence"], 0.85)

    def test_lean_mixture_diagnosis(self):
        """High EGT followed by secondary CHT rise attributes LEAN_MIXTURE."""
        telemetry = {
            "cht": 412.0,
            "egt": 1720.0,       # Extreme EGT spike
            "oil_temp": 188.0,
            "oil_pressure": 55.0,
            "vibration": 0.80,
        }
        res = self.engine.diagnose_root_cause(telemetry)
        primary = res["primary_root_cause"]
        self.assertEqual(primary["root_cause_id"], "LEAN_MIXTURE_OR_INJECTOR_CLOG")
        self.assertIn("EGT", primary["causal_path"])

    def test_isolated_oil_pump_wear_diagnosis(self):
        """Isolated oil pressure drop with normal engine temperatures attributes OIL_PUMP_WEAR."""
        telemetry = {
            "cht": 380.0,
            "egt": 1580.0,
            "oil_temp": 185.0,   # Oil temp normal -> not thermal thinning!
            "oil_pressure": 28.0,# Isolated pressure drop
            "vibration": 0.65,
        }
        res = self.engine.diagnose_root_cause(telemetry)
        primary = res["primary_root_cause"]
        self.assertEqual(primary["root_cause_id"], "OIL_PUMP_WEAR_OR_RELIEF_VALVE")


class TestIntegrityAndTrustRESTApi(unittest.TestCase):
    """Verifies Phase 3 Integrity and Trust REST endpoints."""

    @classmethod
    def setUpClass(cls):
        from backend.api_server import start_api_server_thread
        cls.port = 18804
        cls.server_thread = start_api_server_thread(host="127.0.0.1", port=cls.port)
        time.sleep(0.3)

    def test_firewall_inspect_api(self):
        url = f"http://127.0.0.1:{self.port}/api/firewall/inspect"
        payload = {"rpm": 1400.0, "cht": 380.0, "egt": 1580.0, "oil_pressure": 58.0, "fuel_flow": 8.5}
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["verdict"], "NOMINAL_VALID")
            self.assertTrue(data["is_valid"])

    def test_sensors_reconstruct_api(self):
        url = f"http://127.0.0.1:{self.port}/api/sensors/reconstruct"
        payload = {"rpm": 1400.0, "cht_1": 380.0, "cht_2": 382.0, "cht_3": None, "oil_temp": 185.0}
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertIsNotNone(data["cht_3"])
            self.assertTrue(data["virtual_sensors"]["has_virtual_channels"])

    def test_passport_lifecycle_api(self):
        # 1. Append record
        url_append = f"http://127.0.0.1:{self.port}/api/passport/append"
        payload = {"aircraft_id": "UAV-PASS-01", "flight_id": "FL-01", "flight_hours": 3.0}
        req = urllib.request.Request(url_append, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)

        # 2. Verify
        url_ver = f"http://127.0.0.1:{self.port}/api/passport/verify"
        with urllib.request.urlopen(url_ver, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertTrue(data["audit"]["is_valid"])

        # 3. Export
        url_exp = f"http://127.0.0.1:{self.port}/api/passport/export"
        with urllib.request.urlopen(url_exp, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertIn("printable_evidence_html", data["evidence_pack"])

    def test_diagnostics_causal_root_cause_api(self):
        url = f"http://127.0.0.1:{self.port}/api/diagnostics/causal-root-cause"
        payload = {"telemetry": {"cht": 425.0, "egt": 1580.0, "oil_temp": 210.0, "oil_pressure": 38.0}}
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "DIAGNOSIS_COMPLETE")
            self.assertEqual(data["primary_root_cause"]["root_cause_id"], "COOLING_AIRFLOW_RESTRICTION")


if __name__ == "__main__":
    unittest.main()
