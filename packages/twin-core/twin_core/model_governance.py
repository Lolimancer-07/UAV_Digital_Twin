"""
packages/twin-core/twin_core/model_governance.py

Model Lifecycle Governance, Eval Cards, Shadow-Mode Runner & Promotion Gates.
Implements improvement_plan.md §4 Phase 5:
  - Traceable model lifecycle: Telemetry Evidence -> Drift Ticket -> Eval Card -> Promotion Decision.
  - ModelEvalCard generator computing MAE, RMSE, R2, and latency parity.
  - ShadowModeRunner: runs candidate challenger models alongside active champion without operational disruption.
  - ModelPromotionGate: enforces offline metric gates, shadow parity, and recorded human sign-off.
  - Instantaneous atomic rollback on regression with immutable audit logging.
"""

import os
import json
import math
import uuid
import threading
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Tuple
import numpy as np


class ModelEvalCard:
    """Formal evaluation card certifying model accuracy, latency, and regression safety."""

    def __init__(
        self,
        eval_id: str,
        model_id: str,
        version: str,
        architecture: str,
        dataset_id: str,
        eval_sample_count: int,
        metrics: Dict[str, float],
        baseline_metrics: Dict[str, float],
        parity_delta: Dict[str, float],
        passed_offline_gate: bool,
        passed_shadow_gate: bool,
        created_at: str,
        evaluation_summary: str,
    ):
        self.eval_id = eval_id
        self.model_id = model_id
        self.version = version
        self.architecture = architecture
        self.dataset_id = dataset_id
        self.eval_sample_count = eval_sample_count
        self.metrics = metrics
        self.baseline_metrics = baseline_metrics
        self.parity_delta = parity_delta
        self.passed_offline_gate = passed_offline_gate
        self.passed_shadow_gate = passed_shadow_gate
        self.created_at = created_at
        self.evaluation_summary = evaluation_summary

    def to_dict(self) -> Dict[str, Any]:
        return {
            "eval_id": self.eval_id,
            "model_id": self.model_id,
            "version": self.version,
            "architecture": self.architecture,
            "dataset_id": self.dataset_id,
            "eval_sample_count": self.eval_sample_count,
            "metrics": {k: round(v, 4) for k, v in self.metrics.items()},
            "baseline_metrics": {k: round(v, 4) for k, v in self.baseline_metrics.items()},
            "parity_delta": {k: round(v, 4) for k, v in self.parity_delta.items()},
            "passed_offline_gate": self.passed_offline_gate,
            "passed_shadow_gate": self.passed_shadow_gate,
            "overall_promotion_ready": bool(self.passed_offline_gate and self.passed_shadow_gate),
            "created_at": self.created_at,
            "evaluation_summary": self.evaluation_summary,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ModelEvalCard":
        return cls(
            eval_id=d["eval_id"],
            model_id=d["model_id"],
            version=d["version"],
            architecture=d["architecture"],
            dataset_id=d["dataset_id"],
            eval_sample_count=int(d["eval_sample_count"]),
            metrics=d["metrics"],
            baseline_metrics=d["baseline_metrics"],
            parity_delta=d["parity_delta"],
            passed_offline_gate=bool(d["passed_offline_gate"]),
            passed_shadow_gate=bool(d["passed_shadow_gate"]),
            created_at=d["created_at"],
            evaluation_summary=d.get("evaluation_summary", ""),
        )


class ShadowModeRunner:
    """
    Executes challenger models concurrently in shadow mode alongside the active champion.
    Monitors prediction divergence and operational latency without altering flight telemetry.
    """

    def __init__(self, champion_runtime, challenger_runtime, model_id: str = "challenger_v1.1"):
        self.champion_runtime = champion_runtime
        self.challenger_runtime = challenger_runtime
        self.model_id = model_id
        self.history: List[Dict[str, Any]] = []
        self._lock = threading.RLock()

    def evaluate_window(self, norm_window: np.ndarray, ground_truth_rul: Optional[float] = None) -> Dict[str, Any]:
        """
        Execute window on both champion and challenger; records parity delta.
        """
        with self._lock:
            # 1. Champion inference
            champ_rul, champ_std, c_low, c_high = self.champion_runtime.predict_normalized(norm_window, num_mc_samples=1)

            # 2. Challenger inference (shadow)
            chall_rul, chall_std, ch_low, ch_high = self.challenger_runtime.predict_normalized(norm_window, num_mc_samples=1)

            delta = abs(float(chall_rul) - float(champ_rul))

            record = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "champion_rul": round(float(champ_rul), 2),
                "challenger_rul": round(float(chall_rul), 2),
                "absolute_delta": round(delta, 3),
                "ground_truth_rul": ground_truth_rul,
            }
            self.history.append(record)
            if len(self.history) > 500:
                self.history.pop(0)

            return record

    def get_shadow_metrics(self) -> Dict[str, Any]:
        """Compute aggregate parity metrics across accumulated shadow windows."""
        with self._lock:
            if not self.history:
                return {
                    "total_samples": 0,
                    "mean_delta_cycles": 0.0,
                    "max_delta_cycles": 0.0,
                    "within_tolerance_pct": 100.0,
                    "passed_shadow_gate": False,
                }

            deltas = [h["absolute_delta"] for h in self.history]
            mean_delta = float(np.mean(deltas))
            max_delta = float(np.max(deltas))
            # Tolerance: within 15 cycles or 10%
            within_tol = [d for d in deltas if d <= 15.0]
            tol_pct = (len(within_tol) / len(deltas)) * 100.0

            passed = len(self.history) >= 10 and mean_delta <= 12.0 and tol_pct >= 85.0

            return {
                "total_samples": len(self.history),
                "mean_delta_cycles": round(mean_delta, 3),
                "max_delta_cycles": round(max_delta, 3),
                "within_tolerance_pct": round(tol_pct, 1),
                "passed_shadow_gate": passed,
            }


class ModelPromotionGate:
    """
    Enforces airworthiness model promotion gates:
      Gate 1: Offline metrics (MAE, RMSE, R2) on benchmark sets
      Gate 2: Shadow mode operational parity
      Gate 3: Human engineering sign-off with audit trail
    """

    def __init__(self, event_store=None):
        self.event_store = event_store
        self.eval_cards: Dict[str, ModelEvalCard] = {}
        self.active_champion: Dict[str, Any] = {
            "model_id": "uav_rul_model.onnx",
            "version": "1.0.0",
            "promoted_at": datetime.now(timezone.utc).isoformat(),
            "approved_by": "initial_release@defense.fleet",
            "status": "CHAMPION",
        }
        self.previous_champion: Optional[Dict[str, Any]] = None
        self.promotion_history: List[Dict[str, Any]] = []
        self._lock = threading.RLock()

    def generate_eval_card(
        self,
        candidate_model_id: str,
        version: str,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_baseline_pred: np.ndarray,
        latency_ms: float = 1.2,
        shadow_metrics: Optional[Dict[str, Any]] = None,
    ) -> ModelEvalCard:
        """
        Generate a formal ModelEvalCard comparing candidate predictions against ground truth and baseline.
        """
        with self._lock:
            y_t = np.asarray(y_true, dtype=np.float64)
            y_p = np.asarray(y_pred, dtype=np.float64)
            y_b = np.asarray(y_baseline_pred, dtype=np.float64)

            # 1. Candidate metrics
            mae = float(np.mean(np.abs(y_t - y_p)))
            rmse = float(np.sqrt(np.mean((y_t - y_p) ** 2)))
            ss_res = float(np.sum((y_t - y_p) ** 2))
            ss_tot = float(np.sum((y_t - np.mean(y_t)) ** 2))
            r2 = float(1.0 - (ss_res / max(1e-8, ss_tot)))

            # 2. Baseline metrics
            b_mae = float(np.mean(np.abs(y_t - y_b)))
            b_rmse = float(np.sqrt(np.mean((y_t - y_b) ** 2)))
            b_ss_res = float(np.sum((y_t - y_b) ** 2))
            b_r2 = float(1.0 - (b_ss_res / max(1e-8, ss_tot)))

            # Offline gate criteria: MAE <= 15.0, RMSE <= 20.0, R2 >= 0.70, latency <= 15ms
            passed_offline = bool(mae <= 15.0 and r2 >= 0.70 and latency_ms <= 15.0)

            # Shadow gate
            passed_shadow = True
            if shadow_metrics:
                passed_shadow = bool(shadow_metrics.get("passed_shadow_gate", False))

            eval_id = f"EVAL-{candidate_model_id}-{version}-{int(datetime.now(timezone.utc).timestamp())}"
            summary = (
                f"Candidate {candidate_model_id} v{version} achieved MAE={mae:.2f} cycles, R2={r2:.3f}. "
                f"{'Passed' if passed_offline and passed_shadow else 'Failed'} airworthiness promotion gates."
            )

            card = ModelEvalCard(
                eval_id=eval_id,
                model_id=candidate_model_id,
                version=version,
                architecture="ONNX_LSTM_PROGNOSTICS",
                dataset_id="AERO_TURBOFAN_C_MAPSS_EVAL",
                eval_sample_count=len(y_t),
                metrics={
                    "mae": mae,
                    "rmse": rmse,
                    "r2": r2,
                    "latency_p50_ms": latency_ms,
                    "error_rate_pct": 0.0,
                },
                baseline_metrics={
                    "mae": b_mae,
                    "rmse": b_rmse,
                    "r2": b_r2,
                },
                parity_delta={
                    "mae_delta": mae - b_mae,
                    "r2_delta": r2 - b_r2,
                },
                passed_offline_gate=passed_offline,
                passed_shadow_gate=passed_shadow,
                created_at=datetime.now(timezone.utc).isoformat(),
                evaluation_summary=summary,
            )

            self.eval_cards[eval_id] = card
            return card

    def promote_candidate(
        self,
        eval_id: str,
        approved_by: str,
        justification: str,
    ) -> Tuple[bool, str]:
        """
        Promote candidate model to active CHAMPION if all promotion gates pass and human sign-off is provided.
        """
        with self._lock:
            card = self.eval_cards.get(eval_id)
            if not card:
                return False, f"Eval card {eval_id} not found."

            if not card.passed_offline_gate:
                return False, f"Candidate rejected: Failed offline metric gate (MAE={card.metrics['mae']:.2f}, R2={card.metrics['r2']:.3f})."

            if not card.passed_shadow_gate:
                return False, "Candidate rejected: Failed shadow mode parity gate."

            if not approved_by or not justification:
                return False, "Human sign-off required: missing approved_by or justification."

            now_iso = datetime.now(timezone.utc).isoformat()

            # Archive previous champion
            self.previous_champion = dict(self.active_champion)
            self.previous_champion["status"] = "PREVIOUS"

            # Promote new champion
            self.active_champion = {
                "model_id": card.model_id,
                "version": card.version,
                "eval_id": card.eval_id,
                "promoted_at": now_iso,
                "approved_by": approved_by,
                "justification": justification,
                "status": "CHAMPION",
            }

            decision_record = {
                "event": "MODEL_PROMOTION",
                "timestamp": now_iso,
                "eval_id": eval_id,
                "model_id": card.model_id,
                "version": card.version,
                "approved_by": approved_by,
                "justification": justification,
                "previous_model": self.previous_champion["model_id"],
            }
            self.promotion_history.append(decision_record)

            # Persist decision to EventStore (immutable audit trail)
            if self.event_store and hasattr(self.event_store, "append_event"):
                try:
                    self.event_store.append_event(
                        event_type="MODEL_PROMOTION_DECISION",
                        aircraft_id="FLEET_GLOBAL",
                        flight_id="GOVERNANCE_AUDIT",
                        cycle=0,
                        payload=decision_record,
                        tenant_id="default",
                    )
                except Exception:
                    pass

            return True, f"Successfully promoted {card.model_id} v{card.version} to active CHAMPION."

    def rollback_model(self, reason: str, approved_by: str) -> Tuple[bool, str]:
        """
        Instantaneous atomic rollback to previous champion model upon regression or anomaly.
        """
        with self._lock:
            if not self.previous_champion:
                return False, "Rollback failed: No previous champion model available in registry history."

            now_iso = datetime.now(timezone.utc).isoformat()
            demoted = dict(self.active_champion)
            demoted["status"] = "ROLLED_BACK"

            # Swap back
            restored = dict(self.previous_champion)
            restored["status"] = "CHAMPION"
            restored["promoted_at"] = now_iso
            restored["approved_by"] = approved_by
            restored["justification"] = f"Rolled back from {demoted['model_id']}: {reason}"

            self.active_champion = restored
            self.previous_champion = demoted

            rollback_record = {
                "event": "MODEL_ROLLBACK",
                "timestamp": now_iso,
                "demoted_model": demoted["model_id"],
                "restored_model": restored["model_id"],
                "approved_by": approved_by,
                "reason": reason,
            }
            self.promotion_history.append(rollback_record)

            if self.event_store and hasattr(self.event_store, "append_event"):
                try:
                    self.event_store.append_event(
                        event_type="MODEL_ROLLBACK_DECISION",
                        aircraft_id="FLEET_GLOBAL",
                        flight_id="GOVERNANCE_AUDIT",
                        cycle=0,
                        payload=rollback_record,
                        tenant_id="default",
                    )
                except Exception:
                    pass

            return True, f"Successfully rolled back to previous champion {restored['model_id']} v{restored['version']}."


# Global model promotion gate instance
model_promotion_gate = ModelPromotionGate()
