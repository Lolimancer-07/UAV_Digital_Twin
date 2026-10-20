"""
tests/test_channels.py
----------------------
Unit tests for Task B1 & B2:
  - config/channels.yaml specification validation
  - ChannelScalerBundle fitting on all channels
  - Strict validation that fails if any input channel is missing or reordered
  - Serialization and checksum verification
"""

import unittest
import os
import tempfile
import numpy as np
import pandas as pd
from twin_core.channel_config import (
    ChannelConfig,
    ChannelScalerBundle,
    get_channel_config,
    CHANNELS_CONFIG_PATH,
)


class TestChannelConfig(unittest.TestCase):
    def setUp(self):
        self.cfg = get_channel_config()

    def test_channels_yaml_exists_and_loads(self):
        self.assertTrue(os.path.exists(CHANNELS_CONFIG_PATH), f"Missing {CHANNELS_CONFIG_PATH}")
        names = self.cfg.get_channel_names()
        self.assertEqual(len(names), 14, f"Expected 14 canonical channels, got {len(names)}: {names}")
        expected = [
            "rpm", "cht", "egt", "oil_pressure", "oil_temp",
            "fuel_flow", "fuel_rail_pressure_bar", "vibration",
            "vibration_kurtosis", "battery_v", "bus_current_a",
            "inj_timing", "map_kpa", "oat_c"
        ]
        self.assertEqual(names, expected)

    def test_channel_bounds_and_normal_ranges(self):
        bounds = self.cfg.get_bounds()
        normals = self.cfg.get_normal_ranges()
        for name in self.cfg.get_channel_names():
            self.assertIn(name, bounds)
            self.assertIn(name, normals)
            b_min, b_max = bounds[name]
            n_min, n_max = normals[name]
            self.assertLess(b_min, b_max)
            self.assertLess(n_min, n_max)
            self.assertGreaterEqual(n_min, b_min)
            self.assertLessEqual(n_max, b_max)


class TestChannelScalerBundle(unittest.TestCase):
    def setUp(self):
        self.cfg = get_channel_config()
        self.channels = self.cfg.get_channel_names()

        # Create dummy synthetic dataframe
        np.random.seed(42)
        n = 50
        data = {c: np.random.uniform(10.0, 100.0, size=n) for c in self.channels}
        self.df = pd.DataFrame(data)

    def test_fit_and_transform_all_channels(self):
        bundle = ChannelScalerBundle(channels=self.channels)
        transformed = bundle.fit_transform(self.df)

        self.assertEqual(transformed.shape, (50, 14))
        self.assertTrue(np.all(transformed >= 0.0))
        self.assertTrue(np.all(transformed <= 1.0))

    def test_missing_channel_raises_value_error(self):
        bundle = ChannelScalerBundle(channels=self.channels)
        bundle.fit(self.df)

        incomplete_df = self.df.drop(columns=["oil_temp"])
        with self.assertRaises(ValueError) as ctx:
            bundle.transform(incomplete_df)
        self.assertIn("oil_temp", str(ctx.exception))

    def test_missing_channel_in_dict_raises_value_error(self):
        bundle = ChannelScalerBundle(channels=self.channels)
        bundle.fit(self.df)

        sample_dict = {c: 50.0 for c in self.channels if c != "rpm"}
        with self.assertRaises(ValueError) as ctx:
            bundle.transform_dict(sample_dict)
        self.assertIn("rpm", str(ctx.exception))

    def test_reordered_channel_dataframe_raises_value_error(self):
        bundle = ChannelScalerBundle(channels=self.channels)
        bundle.fit(self.df)

        # Reverse column order
        reordered_cols = list(reversed(self.channels))
        reordered_df = self.df[reordered_cols]

        with self.assertRaises(ValueError) as ctx:
            bundle.transform(reordered_df)
        self.assertIn("reordered or misaligned", str(ctx.exception))

    def test_save_and_load_with_sha256(self):
        bundle = ChannelScalerBundle(channels=self.channels)
        bundle.fit(self.df)

        with tempfile.TemporaryDirectory() as tmpdir:
            save_path = os.path.join(tmpdir, "test_scaler.pkl")
            bundle.save(save_path)

            self.assertTrue(os.path.exists(save_path))
            self.assertTrue(os.path.exists(f"{save_path}.sha256"))

            loaded = ChannelScalerBundle.load(save_path)
            self.assertEqual(loaded.channels, self.channels)

            # Test transform equivalence
            t1 = bundle.transform(self.df)
            t2 = loaded.transform(self.df)
            np.testing.assert_allclose(t1, t2)


if __name__ == "__main__":
    unittest.main()
