"""
backend/federated_coordinator.py

Federated Learning Fleet Coordinator (Architectural Simulation Proof-of-Concept)
================================================================================
Demonstrates privacy-preserving collective intelligence across the 4-UAV fleet:
  1. Each UAV twin maintains a local proxy model (feature sensitivity weights
     for anomaly detection and degradation tracking).
  2. Edge nodes compute local parameter updates ("deltas" / gradients) from their
     recent flight telemetry without transmitting ANY raw sensor time-series data.
  3. The FederatedCoordinator aggregates local updates using Federated Averaging
     (FedAvg: McMahan et al.), yielding an improved global model version.
  4. The updated global weights are distributed back to all 4 UAV twins.

DISCLAIMER: This is an architectural simulation for demonstration and evaluation
purposes. It executes mathematically authentic FedAvg aggregation over simulated
gradient vectors, but does not implement distributed cryptographic enclaves or
secure multi-party computation (SMPC) frameworks.
"""

from typing import Dict, List, Any, Optional
import math
import numpy as np

# Core 8 aero propulsion features tracked by the digital twin
FEDERATED_FEATURES = [
    "rpm",
    "cht",
    "egt",
    "oil_pressure",
    "fuel_flow",
    "vibration",
    "battery_v",
    "inj_timing",
]

DEFAULT_UAV_IDS = ["UAV-01", "UAV-02", "UAV-03", "UAV-04"]


def federated_average(deltas: Dict[str, np.ndarray], sample_weights: Dict[str, int]) -> np.ndarray:
    """
    Computes the canonical Federated Averaging (FedAvg) aggregate:
        Δw_global = sum( (n_i / N) * Δw_i )
    where n_i is the number of local telemetry samples processed by UAV i.
    """
    if not deltas:
        raise ValueError("Cannot aggregate empty deltas dictionary")

    total_samples = sum(sample_weights.get(uid, 1) for uid in deltas)
    if total_samples <= 0:
        total_samples = len(deltas)

    # Initialize zero accumulator matching the dimension of the first delta
    first_vec = next(iter(deltas.values()))
    aggregate = np.zeros_like(first_vec, dtype=np.float64)

    for uid, delta in deltas.items():
        n_i = sample_weights.get(uid, 1)
        weight = n_i / total_samples
        aggregate += weight * np.array(delta, dtype=np.float64)

    return aggregate


class FederatedCoordinator:
    """
    Coordinates federated learning rounds across the 4 UAV twins.
    """

    def __init__(self, uav_ids: Optional[List[str]] = None):
        self.uav_ids = uav_ids or list(DEFAULT_UAV_IDS)
        self.dim = len(FEDERATED_FEATURES)

        # Global model weights vector (normalized uniform initialization)
        self.global_weights = np.ones(self.dim, dtype=np.float64) / self.dim
        self.round_number = 0
        self.learning_rate = 0.5
        self.base_loss = 0.068

        # Per-UAV local state
        self.local_weights: Dict[str, np.ndarray] = {
            uid: np.copy(self.global_weights) for uid in self.uav_ids
        }
        self.local_sample_counts: Dict[str, int] = {
            uid: 0 for uid in self.uav_ids
        }
        self.local_recent_deltas: Dict[str, np.ndarray] = {
            uid: np.zeros(self.dim, dtype=np.float64) for uid in self.uav_ids
        }

        # Round history for live telemetry streaming
        self.round_history: List[Dict[str, Any]] = []
        self.latest_round_result: Optional[Dict[str, Any]] = None

    def record_local_observation(self, uav_id: str, telemetry_slice: Dict[str, float]):
        """
        Simulates local onboard edge feature accumulation.
        Raw values are never sent to the coordinator; only local sample count increments.
        """
        if uav_id not in self.local_sample_counts:
            self.local_sample_counts[uav_id] = 0
        self.local_sample_counts[uav_id] += 1

    def compute_simulated_local_delta(self, uav_id: str, seed_variance: float = 0.05) -> np.ndarray:
        """
        Generates a synthetic local model update (gradient vector) representing
        the UAV's edge-computed feature sensitivity delta:
          - UAV-01 (Nominal): Small, balanced gradient
          - UAV-02 (Mid-life): Slight thermal bias gradient
          - UAV-03 (High altitude): Lean fuel-air gradient
          - UAV-04 (Wear/Maintenance): Elevated vibration & thermal gradient
        """
        idx = self.uav_ids.index(uav_id) if uav_id in self.uav_ids else 0
        # Deterministic but realistic gradient pattern based on mission profile
        rng = np.random.RandomState(42 + self.round_number * 10 + idx)
        gradient = rng.normal(loc=0.0, scale=seed_variance, size=self.dim)

        # Inherent airframe specialization
        if uav_id == "UAV-04":
            # Cylinder & thermal wear channel
            gradient[1] += 0.03  # CHT sensitivity
            gradient[5] += 0.02  # Vibration sensitivity
        elif uav_id == "UAV-03":
            gradient[2] += 0.025 # EGT sensitivity
            gradient[4] -= 0.015 # Fuel flow sensitivity

        # Clip delta magnitude to prevent exploding gradients
        norm = np.linalg.norm(gradient)
        if norm > 0.15:
            gradient = gradient * (0.15 / norm)

        return gradient

    def execute_round(self, participating_uavs: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Executes one full Federated Learning round:
          1. Collects local parameter deltas from participating edge nodes.
          2. Applies Federated Averaging (FedAvg).
          3. Updates global model weights: w_new = w_old + lr * Δw_avg.
          4. Pushes new global weights back to participating nodes.
          5. Returns detailed audit record for GCS visualization.
        """
        self.round_number += 1
        participants = participating_uavs or list(self.uav_ids)

        local_deltas: Dict[str, np.ndarray] = {}
        sample_weights: Dict[str, int] = {}
        delta_norms: Dict[str, float] = {}

        for uid in participants:
            delta = self.compute_simulated_local_delta(uid)
            local_deltas[uid] = delta
            # Ensure at least 15 samples per round per participant
            samples = max(15, self.local_sample_counts.get(uid, 20) + (self.round_number * 3))
            sample_weights[uid] = samples
            delta_norms[uid] = float(np.round(np.linalg.norm(delta), 4))
            self.local_recent_deltas[uid] = delta

        # FedAvg Aggregation
        aggregate_delta = federated_average(local_deltas, sample_weights)
        agg_norm = float(np.round(np.linalg.norm(aggregate_delta), 4))

        # Update global model
        self.global_weights = self.global_weights + (self.learning_rate * aggregate_delta)
        # Normalize weights
        sum_w = np.sum(np.abs(self.global_weights))
        if sum_w > 0:
            self.global_weights = self.global_weights / sum_w

        # Synchronize edge nodes
        for uid in self.uav_ids:
            self.local_weights[uid] = np.copy(self.global_weights)
            self.local_sample_counts[uid] = 0

        # Projected model convergence loss (monotonic asymptotic decay towards floor)
        min_floor = 0.012
        decay = math.exp(-0.15 * self.round_number)
        current_loss = float(np.round(min_floor + (self.base_loss - min_floor) * decay, 4))
        version_str = f"v{1 + self.round_number // 10}.{self.round_number % 10}"

        round_data = {
            "round": self.round_number,
            "global_model_version": version_str,
            "participating_uavs": participants,
            "sample_counts": sample_weights,
            "delta_norms": delta_norms,
            "aggregate_delta_norm": agg_norm,
            "fleet_loss": current_loss,
            "status": "CONVERGED_ROUND",
            "privacy_guarantee": "Zero raw telemetry leaves edge nodes — differential model gradients only",
            "global_weights": {
                feat: float(np.round(self.global_weights[i], 4))
                for i, feat in enumerate(FEDERATED_FEATURES)
            },
            "timestamp_cycles": self.round_number * 25,
        }

        self.latest_round_result = round_data
        self.round_history.append(round_data)
        if len(self.round_history) > 20:
            self.round_history.pop(0)

        return round_data

    def get_status(self) -> Dict[str, Any]:
        """Returns the current state of the federated coordinator for telemetry payloads."""
        if not self.latest_round_result:
            # Seed initial baseline state
            version_str = f"v1.0"
            return {
                "round": 0,
                "global_model_version": version_str,
                "participating_uavs": list(self.uav_ids),
                "sample_counts": {uid: 0 for uid in self.uav_ids},
                "delta_norms": {uid: 0.0 for uid in self.uav_ids},
                "aggregate_delta_norm": 0.0,
                "fleet_loss": round(self.base_loss, 4),
                "status": "INITIALIZED",
                "privacy_guarantee": "Zero raw telemetry leaves edge nodes — differential model gradients only",
                "global_weights": {
                    feat: float(np.round(self.global_weights[i], 4))
                    for i, feat in enumerate(FEDERATED_FEATURES)
                },
                "rounds_completed": len(self.round_history),
            }

        status = dict(self.latest_round_result)
        status["rounds_completed"] = len(self.round_history)
        return status


# Singleton instance
federated_coordinator = FederatedCoordinator()
