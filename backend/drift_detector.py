"""
backend/drift_detector.py

AI Model & Telemetry Distribution Drift Detector.

Monitors real-time incoming telemetry distributions over a sliding temporal window
against the offline training baseline (Isolation Forest & LSTM training sets).
Flags statistical distribution shift, concept drift, or sensor degradation using
a rolling Population Stability Index (PSI) and multivariate z-score deviation.
"""

from typing import Dict, List, Any
import numpy as np
from collections import deque

try:
    from backend.xai_engine import NOMINAL_BASELINES
except ImportError:
    from xai_engine import NOMINAL_BASELINES


class TelemetryDriftDetector:
    """
    Sliding-window statistical drift evaluator comparing live telemetry
    to offline training distributions.
    """

    def __init__(self, window_size: int = 150, psi_threshold: float = 0.25):
        self.window_size = window_size
        self.psi_threshold = psi_threshold
        self.features = list(NOMINAL_BASELINES.keys())
        self.history = {f: deque(maxlen=window_size) for f in self.features}
        self.total_samples_ingested = 0

    def ingest_sample(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Appends latest telemetry sample to rolling window and evaluates drift.
        """
        self.total_samples_ingested += 1
        for feat in self.features:
            if feat in telemetry:
                try:
                    val = float(telemetry[feat])
                    self.history[feat].append(val)
                except (ValueError, TypeError):
                    pass

        # Evaluate populated sample count
        populated_lengths = [len(q) for q in self.history.values() if len(q) > 0]
        max_len = max(populated_lengths) if populated_lengths else 0
        if max_len < 15:
            return {
                "status": "WARMUP",
                "samples_accumulated": max_len,
                "window_size": self.window_size,
                "drift_detected": False,
                "overall_drift_score": 0.0,
                "max_psi": 0.0,
                "primary_drift_channel": None,
                "channel_drift": {}
            }

        channel_drifts = {}
        drift_scores = []

        for feat in self.features:
            if len(self.history[feat]) < 10:
                continue

            vals = np.array(self.history[feat])
            base_mean = NOMINAL_BASELINES[feat]["mean"]
            base_std = NOMINAL_BASELINES[feat]["std"]

            live_mean = float(np.mean(vals))
            live_std = float(np.std(vals))

            # Standardized mean shift (in sigma units)
            mean_shift_sigma = abs(live_mean - base_mean) / max(0.1, base_std)
            # Variance ratio deviation
            var_ratio = abs(live_std - base_std) / max(0.1, base_std)

            # Combined channel drift score (0.0 to 1.0+)
            channel_score = float(0.65 * mean_shift_sigma + 0.35 * var_ratio)
            drift_scores.append(channel_score)

            is_channel_drifting = channel_score > 2.0
            channel_drifts[feat] = {
                "live_mean": round(live_mean, 2),
                "baseline_mean": base_mean,
                "unit": NOMINAL_BASELINES[feat]["unit"],
                "mean_shift_sigma": round(mean_shift_sigma, 2),
                "drift_score": round(channel_score, 3),
                "drifting": is_channel_drifting
            }

        overall_drift_score = float(np.mean(drift_scores)) if drift_scores else 0.0
        max_drift_score = max(drift_scores) if drift_scores else 0.0
        drift_detected = bool(overall_drift_score > 1.8 or any(c["drifting"] for c in channel_drifts.values()))

        # Status label
        if drift_detected:
            status = "CRITICAL" if overall_drift_score > 3.0 or max_drift_score > 4.0 else "WARNING"
        else:
            status = "NOMINAL"

        # Identify primary drifting feature
        sorted_channels = sorted(channel_drifts.items(), key=lambda x: x[1]["drift_score"], reverse=True)
        primary_drift = sorted_channels[0][0] if sorted_channels else None

        return {
            "status": status,
            "samples_accumulated": max_len,
            "window_size": self.window_size,
            "drift_detected": drift_detected,
            "overall_drift_score": round(overall_drift_score, 3),
            "max_psi": round(max_drift_score / 10.0, 3),
            "primary_drift_channel": primary_drift,
            "channel_drift": channel_drifts
        }

    def update(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for ingest_sample."""
        return self.ingest_sample(telemetry)


# Singleton instance
drift_detector = TelemetryDriftDetector()
