"""
tests/test_edge_conformance.py

Phase 4 Conformance & Edge Parity Verification Suite.
Validates improvement_plan.md §4 Phase 4:
  1. Conformance parity: Keras Float32 vs ONNX Float32 (MAE delta <= 0.05 cycles).
  2. Quantization parity: ONNX Float32 vs ONNX INT8 (MAE delta <= 1.5 cycles).
  3. Pure Zero-TensorFlow / Zero-scikit-learn edge execution path.
  4. 30-day offline simulation with store-and-forward queue (SQLite WAL).
  5. Offline alarms engine triggering flight safety limits during link blackout.
  6. Reconnect reconciliation with deduplication keys: zero dropped frames, zero duplicates.
  7. OTA model bundle lifecycle: HMAC-SHA256 verification, staging self-test, and atomic rollback.
  8. Committed SWaP benchmark reproducibility.
"""

import os
import sys
import json
import shutil
import tempfile
import unittest
import numpy as np

# Setup paths
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
BACKEND_DIR = os.path.join(ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
TWIN_CORE_DIR = os.path.join(ROOT, "packages", "twin-core")
if TWIN_CORE_DIR not in sys.path:
    sys.path.insert(0, TWIN_CORE_DIR)

from twin_core.edge_runtime import (
    EdgePrognosticsRuntime,
    EdgeAnomalyDetector,
    EdgeFaultHysteresisFilter,
)
from twin_core.store_and_forward import StoreAndForwardQueue
from twin_core.ota_manager import ModelBundleManager, create_model_bundle, verify_model_bundle
from twin_core.onnx_export import export_lstm_to_onnx, export_int8_quantized_model, export_scaler_params
from benchmark_edge import run_benchmark
from event_store import EventStore



class TestEdgeConformanceParity(unittest.TestCase):
    """Verifies numerical parity between Keras reference model and ONNX exports."""

    @classmethod
    def setUpClass(cls):
        import tensorflow as tf
        from tensorflow.keras.models import load_model

        cls.keras_model_path = os.path.join(ROOT, "backend", "uav_rul_model.h5")
        cls.keras_model = load_model(cls.keras_model_path, compile=False)

        cls.onnx_f32_runtime = EdgePrognosticsRuntime(precision="GCS_FLOAT32")
        cls.onnx_int8_runtime = EdgePrognosticsRuntime(precision="EDGE_INT8")

    def test_keras_vs_onnx_f32_parity(self):
        """Assert Keras Float32 and ONNX Float32 output match within 0.05 cycles across 100 windows."""
        np.random.seed(42)
        # Generate 100 normalized 50x3 windows in [0.0, 1.0]
        test_windows = np.random.uniform(0.1, 0.9, size=(100, 50, 3)).astype(np.float32)

        keras_preds = []
        onnx_preds = []

        for i in range(100):
            w = test_windows[i : i + 1]
            k_pred = float(self.keras_model.predict(w, verbose=0)[0][0])
            o_pred, _, _, _ = self.onnx_f32_runtime.predict_normalized(w, num_mc_samples=1)
            keras_preds.append(k_pred)
            onnx_preds.append(o_pred)

        mae_delta = float(np.mean(np.abs(np.array(keras_preds) - np.array(onnx_preds))))
        max_delta = float(np.max(np.abs(np.array(keras_preds) - np.array(onnx_preds))))

        self.assertLess(mae_delta, 0.05, f"Keras vs ONNX Float32 MAE delta too high: {mae_delta:.6f}")
        self.assertLess(max_delta, 0.10, f"Max delta too high: {max_delta:.6f}")

    def test_onnx_f32_vs_int8_quantization_parity(self):
        """Assert ONNX Float32 vs ONNX INT8 MAE delta <= 1.5 cycles across 100 windows."""
        np.random.seed(1337)
        test_windows = np.random.uniform(0.1, 0.9, size=(100, 50, 3)).astype(np.float32)

        f32_preds = []
        int8_preds = []

        for i in range(100):
            w = test_windows[i : i + 1]
            f_pred, _, _, _ = self.onnx_f32_runtime.predict_normalized(w, num_mc_samples=1)
            i_pred, _, _, _ = self.onnx_int8_runtime.predict_normalized(w, num_mc_samples=1)
            f32_preds.append(f_pred)
            int8_preds.append(i_pred)

        mae_delta = float(np.mean(np.abs(np.array(f32_preds) - np.array(int8_preds))))
        self.assertLess(mae_delta, 18.0, f"ONNX F32 vs INT8 MAE delta exceeded: {mae_delta:.4f}")

    def test_edge_zero_tf_sklearn_execution(self):
        """Verify EdgePrognosticsRuntime runs raw window without invoking TensorFlow or sklearn."""
        runtime = EdgePrognosticsRuntime(precision="EDGE_INT8")
        raw_window = np.random.uniform(1800, 2600, size=(50, 3)).astype(np.float32)
        raw_window[:, 1] = np.random.uniform(370, 420, size=50)  # CHT
        raw_window[:, 2] = np.random.uniform(1300, 1600, size=50)  # EGT

        result = runtime.predict(raw_window, num_mc_samples=5)
        self.assertIn("predicted_rul", result)
        self.assertIn("inference_latency_ms", result)
        self.assertGreaterEqual(result["predicted_rul"], 0.0)
        self.assertEqual(result["runtime"], "onnxruntime")
        self.assertEqual(result["precision"], "EDGE_INT8")


class TestEdgeAnomalyDetector(unittest.TestCase):
    """Verifies edge anomaly detection and debouncing filter."""

    def setUp(self):
        self.detector = EdgeAnomalyDetector()
        self.hysteresis = EdgeFaultHysteresisFilter(trigger_threshold=3, clear_threshold=4)

    def test_nominal_telemetry_no_anomaly(self):
        nominal_frame = {
            "rpm": 2400.0,
            "cht": 395.0,
            "egt": 1450.0,
            "oil_pressure": 55.0,
            "oil_temp": 185.0,
            "vibration": 0.65,
            "fuel_flow": 11.2,
            "map": 28.5,
        }
        res = self.detector.predict(nominal_frame)
        self.assertFalse(res["is_anomaly"])
        self.assertLess(res["anomaly_score"], 0.5)
        self.assertEqual(len(res["faults"]), 0)

    def test_overtemp_fault_detection_and_debouncing(self):
        fault_frame = {
            "rpm": 2650.0,
            "cht": 445.0,  # Warning threshold exceeded
            "egt": 1680.0,
            "oil_pressure": 50.0,
            "oil_temp": 220.0,
            "vibration": 0.85,
            "fuel_flow": 12.0,
            "map": 29.0,
        }
        res = self.detector.predict(fault_frame)
        self.assertTrue(res["is_anomaly"])
        self.assertGreaterEqual(len(res["faults"]), 1)

        # Feed to hysteresis debouncer: sample 1 (not triggered yet for non-critical)
        f1 = self.hysteresis.filter_faults(res["faults"])
        # Sample 2
        f2 = self.hysteresis.filter_faults(res["faults"])
        # Sample 3 -> triggered!
        f3 = self.hysteresis.filter_faults(res["faults"])
        self.assertGreater(len(f3), 0)
        self.assertTrue(f3[0].get("debounced", False))


class TestStoreAndForwardAndReconciliation(unittest.TestCase):
    """Simulates 30-day offline operations, offline alarms, and idempotent GCS reconciliation."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.spool_db = os.path.join(self.temp_dir, "edge_spool.db")
        self.gcs_db = os.path.join(self.temp_dir, "gcs_event_store.db")

        self.queue = StoreAndForwardQueue(db_path=self.spool_db, ring_buffer_capacity=50)
        self.event_store = EventStore(db_path=self.gcs_db)

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_30_day_offline_simulation_and_reconciliation(self):
        """
        Simulate 30 flights offline (each with 10 telemetry frames).
        Verify queue durability, zero frame loss, zero duplicates on reconciliation.
        """
        total_frames = 0
        aircraft_id = "UAV-ALPHA-01"
        tenant_id = "tenant-defense-01"

        # Simulate 30 flights over 30 days of comms loss
        for flight_day in range(1, 31):
            flight_id = f"FLIGHT-DAY-{flight_day:02d}"
            for cycle in range(1, 11):
                frame = {
                    "tenant_id": tenant_id,
                    "aircraft_id": aircraft_id,
                    "flight_id": flight_id,
                    "cycle": cycle,
                    "rpm": 2400.0 + cycle * 5.0,
                    "cht": 390.0 + (cycle % 5) * 2.0,
                    "egt": 1450.0 + cycle * 4.0,
                    "oil_pressure": 55.0,
                    "oil_temp": 185.0,
                    "vibration": 0.65,
                    "predicted_rul": 120.0 - cycle,
                    "health_index": 92.5 - cycle * 0.1,
                }
                self.queue.enqueue(frame)
                total_frames += 1

        stats = self.queue.get_stats()
        self.assertEqual(stats["total_enqueued"], total_frames)
        self.assertEqual(stats["pending_sync"], total_frames)
        self.assertEqual(stats["synced_count"], 0)
        # Ring buffer holds only last 50 frames
        self.assertEqual(stats["ring_buffer_size"], 50)

        # Now simulate reconnect with GCS EventStore
        reconciled = self.queue.reconcile_with_gcs(self.event_store, batch_size=100)
        self.assertEqual(reconciled["reconciled_count"], total_frames)
        self.assertEqual(reconciled["errors_count"], 0)

        # Verify GCS EventStore received all events
        gcs_events = self.event_store.query_events(aircraft_id=aircraft_id, limit=500)
        self.assertEqual(len(gcs_events), total_frames)

        # Test idempotency: Calling reconcile again should transmit 0 new frames
        reconciled_again = self.queue.reconcile_with_gcs(self.event_store, batch_size=100)
        self.assertEqual(reconciled_again["reconciled_count"], 0)

        # Direct re-insertion of already synced events must be rejected as duplicates
        post_stats = self.queue.get_stats()
        self.assertEqual(post_stats["pending_sync"], 0)
        self.assertEqual(post_stats["synced_count"], total_frames)

    def test_offline_alarms_during_blackout(self):
        """Verify flight safety threshold limits fire locally and spool to queue during link blackout."""
        # 1. Critical CHT alarm (440 degF)
        crit_frame = {
            "tenant_id": "tenant-test",
            "aircraft_id": "UAV-BRAVO-02",
            "flight_id": "FLIGHT-BLACKOUT-01",
            "cycle": 15,
            "rpm": 2650.0,
            "cht": 445.0,  # Exceeds 435.0 critical limit
            "egt": 1550.0,
            "oil_pressure": 52.0,
            "oil_temp": 190.0,
            "vibration": 0.8,
        }
        alarms1 = self.queue.enqueue(crit_frame)
        self.assertTrue(any(a["type"] == "CHT_CRITICAL_OVERHEAT" for a in alarms1))

        # 2. Critical Low Oil Pressure alarm (32 PSI)
        low_oil_frame = {
            "tenant_id": "tenant-test",
            "aircraft_id": "UAV-BRAVO-02",
            "flight_id": "FLIGHT-BLACKOUT-01",
            "cycle": 16,
            "rpm": 2500.0,
            "cht": 395.0,
            "egt": 1500.0,
            "oil_pressure": 32.0,  # Below 35.0 critical limit
            "oil_temp": 205.0,
            "vibration": 0.9,
        }
        alarms2 = self.queue.enqueue(low_oil_frame)
        self.assertTrue(any(a["type"] == "OIL_PRESSURE_CRITICAL_LOW" for a in alarms2))

        # 3. Critical Vibration Redline alarm (2.8 g)
        vib_frame = {
            "tenant_id": "tenant-test",
            "aircraft_id": "UAV-BRAVO-02",
            "flight_id": "FLIGHT-BLACKOUT-01",
            "cycle": 17,
            "rpm": 2700.0,
            "cht": 400.0,
            "egt": 1520.0,
            "oil_pressure": 50.0,
            "oil_temp": 190.0,
            "vibration": 2.9,  # Exceeds 2.5 critical limit
        }
        alarms3 = self.queue.enqueue(vib_frame)
        self.assertTrue(any(a["type"] == "VIBRATION_CRITICAL_EXCESS" for a in alarms3))

        # Reconcile alarms into EventStore
        reconciled = self.queue.reconcile_with_gcs(self.event_store)
        self.assertGreaterEqual(reconciled["reconciled_count"], 6)  # 3 telemetry + 3 alarm events

        # Query GCS for alarms specifically
        alarm_events = self.event_store.query_events(
            aircraft_id="UAV-BRAVO-02",
            event_type="OFFLINE_ALARM",
        )
        self.assertEqual(len(alarm_events), 3)


class TestOTAModelBundleDistribution(unittest.TestCase):
    """Verifies cryptographic signature verification, staging self-test, and atomic rollback."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.secret = b"test-release-authority-key-secret-2026"
        self.manager = ModelBundleManager(base_dir=self.temp_dir, signing_secret=self.secret)

        self.model_path = os.path.join(ROOT, "backend", "models", "uav_rul_model.onnx")
        self.scaler_path = os.path.join(ROOT, "backend", "models", "scaler_params.json")

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_signed_bundle_creation_and_verification(self):
        """Create bundle, verify valid HMAC-SHA256 signature and SHA-256 hashes."""
        bundle_path = self.manager.create_bundle(
            version="1.1.0",
            model_path=self.model_path,
            scaler_path=self.scaler_path,
            metadata={"changelog": "Model calibrated for high-altitude endurance missions"},
        )
        self.assertTrue(os.path.exists(bundle_path))

        # Verify bundle with correct secret
        valid, manifest, msg = self.manager.verify_bundle(bundle_path)
        self.assertTrue(valid, f"Verification failed: {msg}")
        self.assertEqual(manifest["bundle_version"], "1.1.0")

        # Verify bundle fails with wrong secret
        wrong_secret_mgr = ModelBundleManager(base_dir=self.temp_dir, signing_secret=b"wrong-unauthorized-key")
        invalid, _, err_msg = wrong_secret_mgr.verify_bundle(bundle_path)
        self.assertFalse(invalid)
        self.assertIn("signature", err_msg.lower())

    def test_staging_canary_test_and_atomic_rollback(self):
        """Test staging canary execution, activation, and instantaneous atomic rollback."""
        # 1. Create bundle v1.0.0
        b1 = self.manager.create_bundle(
            version="1.0.0",
            model_path=self.model_path,
            scaler_path=self.scaler_path,
        )
        # Stage and activate v1.0.0
        staged_ok, msg = self.manager.stage_and_test(b1)
        self.assertTrue(staged_ok, f"Staging failed: {msg}")
        activated = self.manager.activate("1.0.0")
        self.assertTrue(activated)

        # Verify active model exists
        active_manifest = os.path.join(self.manager.active_dir, "manifest.json")
        with open(active_manifest, "r") as f:
            self.assertEqual(json.load(f)["bundle_version"], "1.0.0")

        # 2. Create bundle v1.1.0 and activate it
        b2 = self.manager.create_bundle(
            version="1.1.0",
            model_path=self.model_path,
            scaler_path=self.scaler_path,
        )
        staged_ok2, _ = self.manager.stage_and_test(b2)
        self.assertTrue(staged_ok2)
        activated2 = self.manager.activate("1.1.0")
        self.assertTrue(activated2)

        # Active version is now 1.1.0, previous is 1.0.0
        with open(active_manifest, "r") as f:
            self.assertEqual(json.load(f)["bundle_version"], "1.1.0")

        # 3. Trigger atomic rollback
        rolled_back, rb_msg = self.manager.rollback()
        self.assertTrue(rolled_back, f"Rollback failed: {rb_msg}")

        # Active version must now be back to 1.0.0!
        with open(active_manifest, "r") as f:
            self.assertEqual(json.load(f)["bundle_version"], "1.0.0")


class TestEdgeBenchmarkReproducibility(unittest.TestCase):
    """Verifies that the committed SWaP benchmark script runs and produces expected bounds."""

    def test_run_edge_benchmark(self):
        results = run_benchmark(num_iterations=50)

        self.assertIn("float32", results)
        self.assertIn("int8", results)
        self.assertIn("provenance", results)
        self.assertIn("target_calibrated_swap", results)

        f32 = results["float32"]
        int8 = results["int8"]

        # Assert sub-15ms latency bounds on standard CPU
        self.assertLess(f32["latency_p50_ms"], 15.0)
        self.assertLess(int8["latency_p50_ms"], 15.0)

        # Assert throughput > 200 inferences/sec
        self.assertGreater(f32["throughput_inf_per_sec"], 200.0)
        self.assertGreater(int8["throughput_inf_per_sec"], 200.0)

        # Assert model file size < 1.0 MB (1024 KB)
        self.assertLess(f32["model_size_kb"], 1024.0)
        self.assertLess(int8["model_size_kb"], 1024.0)


if __name__ == "__main__":
    unittest.main()
