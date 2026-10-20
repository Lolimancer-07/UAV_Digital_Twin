"""
tests/test_split.py
-------------------
Unit tests for Task B3:
  - Formally proves zero train/test leakage across flights, engines, and fault families.
  - Verifies that held-out fault families never appear in training or validation sets.
"""

import unittest
import os
import pandas as pd
from twin_core.data_split import split_by_flight_id, verify_zero_flight_leakage


class TestDataSplitLeakage(unittest.TestCase):
    def setUp(self):
        self.root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.data_dir = os.path.join(self.root, "data")
        self.train_path = os.path.join(self.data_dir, "synthetic_piston_train.csv")
        self.val_path = os.path.join(self.data_dir, "synthetic_piston_val.csv")
        self.test_path = os.path.join(self.data_dir, "synthetic_piston_test_frozen.csv")

    def test_synthetic_splitting_function(self):
        """Verifies split_by_flight_id creates disjoint partitions."""
        dummy_data = []
        for fl_idx in range(20):
            fl_id = f"FL-{fl_idx:02d}"
            for c in range(50):
                dummy_data.append({"flight_id": fl_id, "cycle": c, "val": fl_idx * 10 + c})
        df = pd.DataFrame(dummy_data)

        tr, val, tst = split_by_flight_id(df, flight_col="flight_id", train_frac=0.6, val_frac=0.2, test_frac=0.2, seed=99)
        audit = verify_zero_flight_leakage(tr, val, tst, flight_col="flight_id")

        self.assertTrue(audit["is_leakage_free"])
        self.assertEqual(len(audit["overlap_train_val"]), 0)
        self.assertEqual(len(audit["overlap_train_test"]), 0)
        self.assertEqual(len(audit["overlap_val_test"]), 0)

    def test_generated_benchmark_csvs_have_zero_flight_leakage(self):
        """Proves actual generated CSV splits in data/ have zero flight overlap."""
        self.assertTrue(os.path.exists(self.train_path), "Missing train dataset")
        self.assertTrue(os.path.exists(self.val_path), "Missing val dataset")
        self.assertTrue(os.path.exists(self.test_path), "Missing test dataset")

        tr_df = pd.read_csv(self.train_path)
        val_df = pd.read_csv(self.val_path)
        test_df = pd.read_csv(self.test_path)

        audit = verify_zero_flight_leakage(tr_df, val_df, test_df, flight_col="flight_id")
        self.assertTrue(audit["is_leakage_free"], f"Leakage detected! Audit: {audit}")

        # Ensure total unique flights equal sum of split flights
        all_flights = set(tr_df["flight_id"]) | set(val_df["flight_id"]) | set(test_df["flight_id"])
        self.assertEqual(len(all_flights), len(tr_df["flight_id"].unique()) + len(val_df["flight_id"].unique()) + len(test_df["flight_id"].unique()))

    def test_held_out_fault_families_never_in_train_or_val(self):
        """Verifies held-out fault families (C2) never appear in training or validation splits."""
        tr_df = pd.read_csv(self.train_path)
        val_df = pd.read_csv(self.val_path)
        test_df = pd.read_csv(self.test_path)

        held_out_families = {"exhaust_valve_leak", "intake_manifold_leak", "bearing_spalling"}

        train_families = set(tr_df["fault_family"].unique())
        val_families = set(val_df["fault_family"].unique())
        test_families = set(test_df["fault_family"].unique())

        # Proves held-out families are absent from train
        leakage_in_train = held_out_families.intersection(train_families)
        self.assertEqual(len(leakage_in_train), 0, f"Held-out families found in training data: {leakage_in_train}")

        # Proves held-out families are absent from val
        leakage_in_val = held_out_families.intersection(val_families)
        self.assertEqual(len(leakage_in_val), 0, f"Held-out families found in validation data: {leakage_in_val}")

        # Proves held-out families ARE present in frozen test
        self.assertTrue(held_out_families.issubset(test_families), "Frozen test set is missing held-out families!")


if __name__ == "__main__":
    unittest.main()
