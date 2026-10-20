"""
backend/train_anomaly_detector.py
----------------------------------
Trains an Isolation Forest anomaly detector on nominal flight operations from the
physics-first aero piston simulator (Rotax 914 F domain).
Implements Phase 0 honesty fixes:
  - Trains on genuine aero piston thermodynamics instead of turbofan proxy mappings
  - Sets fixed random seed for reproducible training
  - Generates SHA-256 hash sidecar
"""

import os
import sys
import pickle
import hashlib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

SEED = 42
np.random.seed(SEED)

PRIMARY_CSV = os.path.join(_REPO_ROOT, "data", "synthetic_piston_train.csv")
LEGACY_CSV = os.path.join(_REPO_ROOT, "data", "telemetry_ready.csv")
OUTPUT_PATH = os.path.join(_REPO_ROOT, "backend", "anomaly_model.pkl")

CONTAMINATION = 0.03
N_ESTIMATORS = 300

FEATURES = [
    "rpm", "cht", "egt",
    "oil_pressure", "oil_temp",
    "fuel_flow", "vibration",
    "battery_v", "map_kpa", "bus_current_a",
]


def train():
    print("=" * 60)
    print("  TRAINING ISOLATION FOREST ANOMALY DETECTOR (PHASE 0)")
    print("=" * 60)

    if not os.path.exists(PRIMARY_CSV):
        print(f"Generating synthetic piston dataset first...")
        from simulator.generate_dataset import generate_benchmark_datasets
        generate_benchmark_datasets(output_dir=os.path.join(_REPO_ROOT, "data"), base_seed=SEED)

    if os.path.exists(PRIMARY_CSV):
        print(f"Loading physics-first aero piston training dataset from {PRIMARY_CSV}...")
        df = pd.read_csv(PRIMARY_CSV)
        dataset_source = "synthetic_piston_train.csv"
        provenance = "synthetic (physics-first simulation)"
        domain = "piston_aero"
        # Train strictly on healthy nominal flight operations
        healthy_df = df[df.get("fault_family", "none") == "none"].copy()
    else:
        print(f"Fallback to legacy dataset at {LEGACY_CSV}...")
        df = pd.read_csv(LEGACY_CSV)
        dataset_source = "telemetry_ready.csv"
        provenance = "derived-benchmark (legacy turbofan)"
        domain = "turbofan_legacy"
        healthy_df = df[df.get("rul", 150) > 100].copy()

    print(f"  Total records: {len(df):,} | Healthy baseline samples: {len(healthy_df):,}")

    # Ensure all features exist in dataframe
    for f in FEATURES:
        if f not in healthy_df.columns:
            healthy_df[f] = 0.0

    X_train = healthy_df[FEATURES].values

    print(f"Fitting Isolation Forest ({N_ESTIMATORS} trees, contamination={CONTAMINATION}, random_state={SEED})...")
    detector = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        max_samples="auto",
        random_state=SEED,
        n_jobs=-1,
    )
    detector.fit(X_train)
    print("  ✓ Isolation Forest fitted successfully.")

    # Compute data hash
    with open(PRIMARY_CSV if os.path.exists(PRIMARY_CSV) else LEGACY_CSV, "rb") as f:
        data_hash = hashlib.sha256(f.read()).hexdigest()

    # Model bundle
    bundle = {
        "model": detector,
        "features": FEATURES,
        "domain": domain,
        "meta": {
            "dataset": dataset_source,
            "dataset_provenance": provenance,
            "dataset_sha256": data_hash,
            "n_estimators": N_ESTIMATORS,
            "contamination": CONTAMINATION,
            "train_samples": len(healthy_df),
            "seed": SEED,
            "features": FEATURES,
            "domain": domain,
        },
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "wb") as f:
        pickle.dump(bundle, f, protocol=4)
    print(f"  ✓ Model saved → {OUTPUT_PATH}")

    # Compute model sha256
    with open(OUTPUT_PATH, "rb") as f:
        model_hash = hashlib.sha256(f.read()).hexdigest()

    with open(f"{OUTPUT_PATH}.sha256", "w") as f:
        f.write(f"{model_hash}  {os.path.basename(OUTPUT_PATH)}\n")
    print(f"  ✓ Checksum saved → {OUTPUT_PATH}.sha256 ({model_hash[:16]}...)")


if __name__ == "__main__":
    train()
