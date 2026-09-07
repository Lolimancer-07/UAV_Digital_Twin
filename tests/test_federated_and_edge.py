"""
tests/test_federated_and_edge.py

Unit tests for:
  1. FederatedCoordinator & FedAvg aggregation algorithm.
  2. EdgeProfileManager SWaP configurations & quantization precision.
  3. WebSocket control security on new federated & edge commands.
"""

import os
import sys
import unittest
import numpy as np

# Ensure project root and backend directory are in sys.path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
BACKEND_DIR = os.path.join(ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from backend.federated_coordinator import (
    FederatedCoordinator,
    federated_average,
    FEDERATED_FEATURES,
)
from backend.edge_profile import EdgeProfileManager, EDGE_PROFILES


class TestFederatedLearning(unittest.TestCase):
    """Verifies Federated Averaging (FedAvg) math and coordinator lifecycle."""

    def test_federated_average_mathematical_correctness(self):
        """Verify FedAvg computes exact sample-weighted gradient combination."""
        deltas = {
            "UAV-01": np.array([1.0, 2.0, 3.0]),
            "UAV-02": np.array([5.0, 6.0, 7.0]),
        }
        sample_weights = {
            "UAV-01": 10,
            "UAV-02": 30,
        }
        # Expected: (10*[1, 2, 3] + 30*[5, 6, 7]) / 40 = [4.0, 5.0, 6.0]
        agg = federated_average(deltas, sample_weights)
        np.testing.assert_allclose(agg, np.array([4.0, 5.0, 6.0]), rtol=1e-5)

    def test_federated_coordinator_round_progression(self):
        """Verify round counter, versioning, and node synchronization."""
        coordinator = FederatedCoordinator(uav_ids=["UAV-01", "UAV-02", "UAV-03", "UAV-04"])
        initial_status = coordinator.get_status()
        self.assertEqual(initial_status["round"], 0)
        self.assertEqual(initial_status["global_model_version"], "v1.0")

        # Record observations
        coordinator.record_local_observation("UAV-01", {"rpm": 1400})
        coordinator.record_local_observation("UAV-02", {"rpm": 1410})

        # Execute round 1
        result = coordinator.execute_round()
        self.assertEqual(result["round"], 1)
        self.assertEqual(result["global_model_version"], "v1.1")
        self.assertEqual(len(result["participating_uavs"]), 4)
        self.assertGreater(result["aggregate_delta_norm"], 0.0)
        self.assertLessEqual(result["fleet_loss"], coordinator.base_loss)

        # Confirm all 4 local node weights synchronized with global weights
        for uid in coordinator.uav_ids:
            np.testing.assert_allclose(coordinator.local_weights[uid], coordinator.global_weights)

        # Execute round 2
        result2 = coordinator.execute_round()
        self.assertEqual(result2["round"], 2)
        self.assertEqual(result2["global_model_version"], "v1.2")
        self.assertEqual(len(coordinator.round_history), 2)


class TestEdgeProfileManager(unittest.TestCase):
    """Verifies Edge / SWaP configuration and quantization simulation."""

    def test_default_profile_loading(self):
        """Verify initial profile is GCS_FLOAT32 with correct specifications."""
        mgr = EdgeProfileManager()
        prof = mgr.get_active_profile()
        self.assertEqual(prof["mode_id"], "GCS_FLOAT32")
        self.assertEqual(prof["inference_latency_ms"], 12.4)
        self.assertEqual(prof["memory_footprint_mb"], 420.0)
        self.assertEqual(prof["power_tdp_w"], 250.0)
        self.assertFalse(prof["quantization_active"])

    def test_mode_toggling(self):
        """Verify switching between GCS_FLOAT32 and EDGE_INT8 updates specs."""
        mgr = EdgeProfileManager()
        edge_prof = mgr.set_mode("EDGE_INT8")
        self.assertEqual(edge_prof["mode_id"], "EDGE_INT8")
        self.assertEqual(edge_prof["inference_latency_ms"], 4.8)
        self.assertEqual(edge_prof["memory_footprint_mb"], 38.0)
        self.assertEqual(edge_prof["power_tdp_w"], 12.0)
        self.assertTrue(edge_prof["quantization_active"])

        # Switch back
        gcs_prof = mgr.set_mode("GCS_FLOAT32")
        self.assertEqual(gcs_prof["mode_id"], "GCS_FLOAT32")
        self.assertFalse(gcs_prof["quantization_active"])

    def test_quantization_noise_simulation(self):
        """Verify INT8 quantization rounds precision while FP32 preserves exact floats."""
        mgr = EdgeProfileManager(default_mode="GCS_FLOAT32")
        raw_features = np.array([0.12345678, -0.98765432, 0.55555555])

        # In FP32 mode: identical
        fp32_features = mgr.apply_quantization(raw_features)
        np.testing.assert_array_equal(fp32_features, raw_features)

        # In INT8 mode: discretized to 8-bit dynamic range
        mgr.set_mode("EDGE_INT8")
        int8_features = mgr.apply_quantization(raw_features)
        self.assertFalse(np.array_equal(int8_features, raw_features))
        # Differences should be small (quantization noise < 1/127)
        max_diff = np.max(np.abs(int8_features - raw_features))
        self.assertLess(max_diff, 0.02)


class TestSecurityAndCommandDispatch(unittest.TestCase):
    """Verifies that new commands respect the command interface."""

    def test_command_handling_integrity(self):
        """Ensure process_gcs_command handles new actions cleanly."""
        import backend.inference as inf

        # Trigger federated round command
        cmd_fed = {"command": "trigger_federated_round"}
        inf.process_gcs_command(cmd_fed)
        fed_status = inf.federated_coordinator.get_status()
        self.assertGreaterEqual(fed_status["round"], 1)

        # Trigger edge mode command
        cmd_edge = {"command": "set_edge_mode", "mode": "EDGE_INT8"}
        inf.process_gcs_command(cmd_edge)
        active_prof = inf.edge_profile_manager.get_active_profile()
        self.assertEqual(active_prof["mode_id"], "EDGE_INT8")

        # Reset back to GCS_FLOAT32
        cmd_gcs = {"command": "set_edge_mode", "mode": "GCS_FLOAT32"}
        inf.process_gcs_command(cmd_gcs)
        active_prof2 = inf.edge_profile_manager.get_active_profile()
        self.assertEqual(active_prof2["mode_id"], "GCS_FLOAT32")


if __name__ == "__main__":
    unittest.main()
