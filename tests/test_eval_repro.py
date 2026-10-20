"""
tests/test_eval_repro.py
------------------------
Guardrail Unit Tests for Task E:
  - Verifies that synthetic dataset generation from a seed is bit-for-bit reproducible.
  - Verifies that frozen test set hash matches the dataset manifest.
  - Verifies that eval/run_eval.py produces deterministic baseline metrics.
"""

import unittest
import os
import sys
import hashlib
import json
import pandas as pd

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
_TWIN_CORE = os.path.join(_REPO_ROOT, "packages", "twin-core")
if _TWIN_CORE not in sys.path:
    sys.path.insert(0, _TWIN_CORE)

from simulator.generate_dataset import PistonMissionSimulator
from eval.run_eval import (
    BaselineFixedThresholds,
    BaselinePhysicsResidualOnly,
    BaselineIsolationForestOnly,
    BaselineFusedSystem,
    TEST_SET_PATH,
    ANOMALY_MODEL_PATH,
)
from backend.anomaly_detector import AnomalyDetector



class TestEvalReproducibility(unittest.TestCase):
    def setUp(self):
        self.root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.manifest_path = os.path.join(self.root, "data", "dataset_manifest.json")

    def test_simulator_generates_identical_records_from_same_seed(self):
        """Proves generator determinism: identical seed produces identical flight records."""
        sim1 = PistonMissionSimulator(seed=123)
        sim2 = PistonMissionSimulator(seed=123)

        fl1 = sim1.simulate_flight("FL-TEST", duration_cycles=50, fault_type="nominal", engine_initial_wear=0.1)
        fl2 = sim2.simulate_flight("FL-TEST", duration_cycles=50, fault_type="nominal", engine_initial_wear=0.1)

        self.assertEqual(len(fl1), len(fl2))
        for r1, r2 in zip(fl1, fl2):
            self.assertEqual(r1["rpm"], r2["rpm"])
            self.assertEqual(r1["cht"], r2["cht"])
            self.assertEqual(r1["egt"], r2["egt"])
            self.assertEqual(r1["oil_pressure"], r2["oil_pressure"])
            self.assertEqual(r1["vibration"], r2["vibration"])

    def test_frozen_test_set_matches_manifest_hash(self):
        """Verifies integrity of the frozen test set against data/dataset_manifest.json."""
        self.assertTrue(os.path.exists(TEST_SET_PATH), "Missing frozen test set")
        self.assertTrue(os.path.exists(self.manifest_path), "Missing dataset manifest")

        with open(TEST_SET_PATH, "rb") as f:
            actual_hash = hashlib.sha256(f.read()).hexdigest()

        with open(self.manifest_path, "r") as f:
            manifest = json.load(f)

        expected_hash = manifest["datasets"]["synthetic_piston_test_frozen.csv"]["sha256"]
        self.assertEqual(actual_hash, expected_hash, "Frozen test set hash mismatch! File was altered.")

    def test_baseline_evaluator_produces_consistent_results(self):
        """Verifies that running baselines on a fixed slice produces identical classifications."""
        self.assertTrue(os.path.exists(TEST_SET_PATH))
        df = pd.read_csv(TEST_SET_PATH)
        slice_df = df.head(100).copy()

        detector = AnomalyDetector(ANOMALY_MODEL_PATH)
        b1 = BaselineFixedThresholds()
        b2 = BaselinePhysicsResidualOnly()
        b3 = BaselineIsolationForestOnly(detector)
        b4 = BaselineFusedSystem(detector)

        p1_a = b1.predict_flight(slice_df)
        p1_b = b1.predict_flight(slice_df)
        self.assertEqual(p1_a, p1_b, "Baseline 1 is non-deterministic!")

        p2_a = b2.predict_flight(slice_df)
        p2_b = b2.predict_flight(slice_df)
        self.assertEqual(p2_a, p2_b, "Baseline 2 is non-deterministic!")

        p3_a = b3.predict_flight(slice_df)
        p3_b = b3.predict_flight(slice_df)
        self.assertEqual(p3_a, p3_b, "Baseline 3 is non-deterministic!")

        p4_a = b4.predict_flight(slice_df)
        p4_b = b4.predict_flight(slice_df)
        self.assertEqual(p4_a, p4_b, "Baseline 4 is non-deterministic!")


if __name__ == "__main__":
    unittest.main()
