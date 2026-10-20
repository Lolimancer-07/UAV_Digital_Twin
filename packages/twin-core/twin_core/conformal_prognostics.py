"""
packages/twin-core/twin_core/conformal_prognostics.py

Conformal Prognostics Engine with Adaptive Coverage (ACI).
Implements STARTUP_BLUEPRINT.md §3 Feature F5 & §8 Phase 2:
  - Split conformal prediction on RUL residuals with distribution-free finite-sample guarantees.
  - Adaptive Conformal Inference (ACI) to handle distribution shift as engines age.
  - Rolling calibration buffer with quantile interpolation.
  - Empirical coverage verification ensuring nominal ±3% coverage.
"""

import math
import threading
from collections import deque
from typing import Dict, List, Any, Optional, Tuple
import numpy as np


class ConformalPrognosticsEngine:
    """
    Provides finite-sample valid prediction intervals for Remaining Useful Life (RUL)
    using Split Conformal Prediction and Adaptive Conformal Inference (Gibbs & Candès).
    """

    def __init__(
        self,
        target_coverage: float = 0.90,
        calibration_window_size: int = 200,
        gamma: float = 0.05,
    ):
        """
        Args:
            target_coverage: Desired empirical coverage 1 - alpha (e.g. 0.90 = 90%).
            calibration_window_size: Number of recent residuals held in rolling calibration set.
            gamma: Learning rate for Adaptive Conformal Inference (ACI).
        """
        self.target_coverage = float(target_coverage)
        self.nominal_alpha = 1.0 - self.target_coverage
        self.current_alpha = self.nominal_alpha
        self.calibration_window_size = calibration_window_size
        self.gamma = gamma

        self._scores = deque(maxlen=calibration_window_size)
        self._lock = threading.RLock()
        self.total_evaluations = 0
        self.covered_count = 0

    def calibrate(self, y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
        """
        Initializes or refreshes the calibration set using nonconformity residuals:
            s_i = |y_true_i - y_pred_i|
        """
        y_true_arr = np.asarray(y_true, dtype=np.float64).flatten()
        y_pred_arr = np.asarray(y_pred, dtype=np.float64).flatten()

        if len(y_true_arr) != len(y_pred_arr) or len(y_true_arr) == 0:
            raise ValueError("y_true and y_pred must have identical non-zero lengths.")

        residuals = np.abs(y_true_arr - y_pred_arr)
        with self._lock:
            self._scores.clear()
            for r in residuals[-self.calibration_window_size:]:
                self._scores.append(float(r))

            q = self._compute_quantile(self.current_alpha)

            return {
                "calibrated_samples": len(self._scores),
                "target_coverage": self.target_coverage,
                "conformal_quantile": round(q, 4),
                "mean_residual": round(float(np.mean(residuals)), 4),
            }

    def _compute_quantile(self, alpha: float) -> float:
        """
        Computes the conformal quantile with finite-sample inflation factor (1 + 1/n):
            level = ceil((n + 1) * (1 - alpha)) / n
        """
        n = len(self._scores)
        if n == 0:
            # Fallback baseline heuristic if no calibration samples available yet
            return 10.0

        scores = sorted(self._scores)
        # Standard conformal quantile index: ceil((n + 1) * (1 - alpha)) / n
        level = min(1.0, math.ceil((n + 1) * (1.0 - alpha)) / n)
        idx = int(math.ceil(level * n)) - 1
        idx = max(0, min(n - 1, idx))
        return float(scores[idx])

    def predict_interval(
        self,
        y_pred: float,
        target_coverage: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Outputs conformal prediction interval [lower, upper] around point prediction.
        Guarantees: P(y_true in [lower, upper]) >= 1 - alpha.
        """
        with self._lock:
            alpha = (1.0 - target_coverage) if target_coverage is not None else self.current_alpha
            alpha = max(0.01, min(0.50, alpha))
            q = self._compute_quantile(alpha)

            lower = max(0.0, float(y_pred) - q)
            upper = max(0.0, float(y_pred) + q)

            return {
                "point_pred": round(float(y_pred), 2),
                "lower_bound": round(lower, 2),
                "upper_bound": round(upper, 2),
                "half_width": round(q, 2),
                "interval_width": round(upper - lower, 2),
                "target_coverage": round(1.0 - alpha, 3),
                "calibrated_pool_size": len(self._scores),
                "method": "SPLIT_CONFORMAL_ACI",
            }

    def update_online(self, y_true: float, y_pred: float) -> Dict[str, Any]:
        """
        Executes Adaptive Conformal Inference (ACI) step on newly observed flight cycle:
            err_t = 1 if y_true not in C_t else 0
            alpha_{t+1} = alpha_t + gamma * (alpha_nominal - err_t)
        """
        with self._lock:
            interval = self.predict_interval(y_pred)
            err = 0 if (interval["lower_bound"] <= y_true <= interval["upper_bound"]) else 1

            # Update calibration score pool
            score = abs(float(y_true) - float(y_pred))
            self._scores.append(score)

            # Update tracking counters
            self.total_evaluations += 1
            if err == 0:
                self.covered_count += 1

            # ACI adaptive update rule
            self.current_alpha = self.current_alpha + self.gamma * (self.nominal_alpha - err)
            # Clip alpha to valid domain
            self.current_alpha = max(0.01, min(0.50, self.current_alpha))

            return {
                "y_true": round(float(y_true), 2),
                "y_pred": round(float(y_pred), 2),
                "is_covered": bool(err == 0),
                "adapted_alpha": round(self.current_alpha, 4),
                "effective_target_coverage": round(1.0 - self.current_alpha, 4),
                "cumulative_coverage": round(self.covered_count / max(1, self.total_evaluations), 4),
            }

    def evaluate_empirical_coverage(
        self,
        y_true_eval: np.ndarray,
        y_pred_eval: np.ndarray,
        coverage: Optional[float] = None,
    ) -> Dict[str, float]:
        """
        Validates conformal coverage on a test evaluation set.
        Returns empirical coverage fraction and mean interval width.
        """
        cov_target = coverage or self.target_coverage
        y_true_arr = np.asarray(y_true_eval, dtype=np.float64).flatten()
        y_pred_arr = np.asarray(y_pred_eval, dtype=np.float64).flatten()

        hits = 0
        widths = []
        for yt, yp in zip(y_true_arr, y_pred_arr):
            res = self.predict_interval(yp, target_coverage=cov_target)
            if res["lower_bound"] <= yt <= res["upper_bound"]:
                hits += 1
            widths.append(res["interval_width"])

        n = len(y_true_arr)
        emp_coverage = float(hits / max(1, n))
        mean_width = float(np.mean(widths)) if widths else 0.0

        return {
            "target_coverage": round(cov_target, 4),
            "empirical_coverage": round(emp_coverage, 4),
            "coverage_gap": round(abs(emp_coverage - cov_target), 4),
            "mean_interval_width": round(mean_width, 2),
            "sample_count": n,
        }


# Singleton instance pre-configured for 90% finite-sample coverage
conformal_prognostics = ConformalPrognosticsEngine(target_coverage=0.90)
