#!/usr/bin/env python3
"""
train_models.py
---------------
Unified AI model training pipeline for UAV Digital Twin (Phase 0).
Implements Tasks B1, B2, B3, B5, B6:
  1. Loads physics-first aero piston dataset (synthetic_piston_train.csv & val.csv).
  2. Fits ChannelScalerBundle on model input channels ['rpm', 'cht', 'egt'] and exports backend/scaler.pkl.
  3. Trains Deep LSTM on flight-partitioned time series with zero window leakage across flights.
  4. Trains Multi-Channel Isolation Forest on certified nominal operations (fault_family == 'none').
  5. Computes SHA-256 hashes for all generated model artifacts and writes backend/model_card.json.

Usage:
  python3 train_models.py
"""

import os
import sys
import json
import pickle
import random
import hashlib
import numpy as np
import pandas as pd

# Set fixed random seeds for deterministic retraining (Task B5)
SEED = 42
random.seed(SEED)
np.random.seed(SEED)

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
tf.random.set_seed(SEED)

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.metrics import mean_squared_error, mean_absolute_error

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
TWIN_CORE = os.path.join(ROOT, "packages", "twin-core")
if TWIN_CORE not in sys.path:
    sys.path.insert(0, TWIN_CORE)

from twin_core.channel_config import get_channel_config, ChannelScalerBundle
from backend.train_anomaly_detector import train as train_anomaly_detector

DATA_DIR = os.path.join(ROOT, "data")
TRAIN_DATA_PATH = os.path.join(DATA_DIR, "synthetic_piston_train.csv")
VAL_DATA_PATH = os.path.join(DATA_DIR, "synthetic_piston_val.csv")
BACKEND_DIR = os.path.join(ROOT, "backend")

RUL_MODEL_PATH = os.path.join(BACKEND_DIR, "uav_rul_model.h5")
SCALER_PATH = os.path.join(BACKEND_DIR, "scaler.pkl")
ANOMALY_MODEL_PATH = os.path.join(BACKEND_DIR, "anomaly_model.pkl")
MODEL_CARD_PATH = os.path.join(BACKEND_DIR, "model_card.json")

os.makedirs(BACKEND_DIR, exist_ok=True)


def sha256_file(filepath: str) -> str:
    with open(filepath, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def write_hash_sidecar(filepath: str) -> str:
    h = sha256_file(filepath)
    with open(f"{filepath}.sha256", "w") as f:
        f.write(f"{h}  {os.path.basename(filepath)}\n")
    return h


def main():
    print("=" * 70)
    print("  UAV DIGITAL TWIN — DEFENSIVE AI TRAINING PIPELINE (PHASE 0)")
    print("=" * 70)

    # Step 1: Ensure datasets exist
    if not os.path.exists(TRAIN_DATA_PATH) or not os.path.exists(VAL_DATA_PATH):
        print("\n[Step 1/5] Generating physics-first synthetic datasets...")
        from simulator.generate_dataset import generate_benchmark_datasets
        generate_benchmark_datasets(output_dir=DATA_DIR, base_seed=SEED)

    print("\n[Step 1/5] Loading physics-first training & validation telemetry...")
    train_df = pd.read_csv(TRAIN_DATA_PATH)
    val_df = pd.read_csv(VAL_DATA_PATH)
    train_data_hash = sha256_file(TRAIN_DATA_PATH)
    print(f"  ✓ Train records: {len(train_df):,} across {train_df['flight_id'].nunique()} flights.")
    print(f"  ✓ Val records:   {len(val_df):,} across {val_df['flight_id'].nunique()} flights.")
    print(f"  ✓ Data SHA-256:  {train_data_hash[:16]}...")

    # Step 2: Fit ChannelScalerBundle (Task B1 & B2)
    print("\n[Step 2/5] Fitting ChannelScalerBundle on model input channels...")
    cfg = get_channel_config()
    lstm_features = ["rpm", "cht", "egt"]
    scaler_bundle = ChannelScalerBundle(channels=lstm_features)
    scaler_bundle.fit(train_df[lstm_features])
    scaler_bundle.save(SCALER_PATH)
    scaler_hash = write_hash_sidecar(SCALER_PATH)
    print(f"  ✓ Scaler saved with channel list {lstm_features} → {SCALER_PATH} (SHA-256: {scaler_hash[:16]}...)")

    # Step 3: Extract time windows strictly per-flight (Task B3: Zero Leakage)
    print("\n[Step 3/5] Extracting sliding time windows (seq_len=50) strictly per-flight...")
    sequence_length = 50

    def build_flight_windows(df: pd.DataFrame, bundle: ChannelScalerBundle, seq_len: int):
        X, y = [], []
        # Normalise features within dataset
        df_scaled = df.copy()
        df_scaled[bundle.channels] = bundle.transform(df[bundle.channels])

        for flight_id, group in df_scaled.groupby("flight_id"):
            mat = group[bundle.channels].values
            ruls = group["true_rul"].values
            # Only create windows within the flight boundary
            for i in range(len(group) - seq_len):
                X.append(mat[i : i + seq_len])
                y.append(ruls[i + seq_len])

        return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)

    X_train, y_train = build_flight_windows(train_df, scaler_bundle, sequence_length)
    X_val, y_val = build_flight_windows(val_df, scaler_bundle, sequence_length)
    print(f"  ✓ Extracted {len(X_train):,} train windows and {len(X_val):,} validation windows.")
    print(f"  ✓ Input tensor shape: {X_train.shape}")

    # Step 4: Train Deep LSTM Model
    print("\n[Step 4/5] Training Deep Stacked LSTM Prognostics Network...")
    lstm_model = Sequential([
        LSTM(128, input_shape=(sequence_length, len(lstm_features)), return_sequences=True),
        Dropout(0.2),
        LSTM(64, return_sequences=False),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(1)
    ])

    optimizer = Adam(learning_rate=0.001)
    lstm_model.compile(optimizer=optimizer, loss='mean_squared_error', metrics=['mae'])

    callbacks = [
        EarlyStopping(monitor='val_loss', patience=6, restore_best_weights=True, verbose=0),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=3, min_lr=1e-5, verbose=0)
    ]

    history = lstm_model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=30,
        batch_size=64,
        callbacks=callbacks,
        verbose=1
    )

    lstm_model.save(RUL_MODEL_PATH)
    rul_model_hash = write_hash_sidecar(RUL_MODEL_PATH)
    print(f"  ✓ Deep LSTM Model saved → {RUL_MODEL_PATH} (SHA-256: {rul_model_hash[:16]}...)")

    # Evaluate validation metrics
    val_preds = lstm_model.predict(X_val, verbose=0).flatten()
    val_rmse = float(np.sqrt(mean_squared_error(y_val, val_preds)))
    val_mae = float(mean_absolute_error(y_val, val_preds))
    print(f"  📊 RUL Validation Performance: RMSE = {val_rmse:.2f} cycles | MAE = {val_mae:.2f} cycles")

    # Step 5: Train Isolation Forest Anomaly Detector
    print("\n[Step 5/5] Training Multi-Channel Isolation Forest Anomaly Detector...")
    train_anomaly_detector()
    anom_hash = sha256_file(ANOMALY_MODEL_PATH)

    # Step 6: Write Comprehensive Model Card (Task B6 & D4)
    model_card = {
        "system": "UAV Digital Twin Propulsion AI Suite",
        "phase": "Phase 0 — Credibility Fixes",
        "generated_at": pd.Timestamp.now().isoformat(),
        "random_seed": SEED,
        "runtime_environment": {
            "python": sys.version.split()[0],
            "tensorflow": tf.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "datasets": {
            "training": {
                "file": "data/synthetic_piston_train.csv",
                "provenance": "synthetic (physics-first simulation)",
                "sha256": train_data_hash,
                "rows": len(train_df),
                "flights": int(train_df["flight_id"].nunique()),
            },
            "validation": {
                "file": "data/synthetic_piston_val.csv",
                "provenance": "synthetic (physics-first simulation)",
                "sha256": sha256_file(VAL_DATA_PATH),
                "rows": len(val_df),
                "flights": int(val_df["flight_id"].nunique()),
            },
        },
        "models": {
            "uav_rul_lstm": {
                "artifact": "backend/uav_rul_model.h5",
                "sha256": rul_model_hash,
                "task": "Remaining Useful Life Regression",
                "architecture": "Stacked LSTM (128 -> 64 -> Dense 32 -> Dense 1)",
                "input_shape": [1, sequence_length, len(lstm_features)],
                "input_channels": lstm_features,
                "val_rmse_cycles": round(val_rmse, 2),
                "val_mae_cycles": round(val_mae, 2),
            },
            "channel_scaler": {
                "artifact": "backend/scaler.pkl",
                "sha256": scaler_hash,
                "channels": lstm_features,
                "type": "ChannelScalerBundle (MinMaxScaler)",
            },
            "anomaly_detector": {
                "artifact": "backend/anomaly_model.pkl",
                "sha256": anom_hash,
                "task": "Multivariate Unsupervised Anomaly Detection",
                "algorithm": "IsolationForest",
                "contamination": 0.03,
                "n_estimators": 300,
            },
        },
    }

    with open(MODEL_CARD_PATH, "w") as f:
        json.dump(model_card, f, indent=2)
    print(f"  ✓ Model Card metadata saved → {MODEL_CARD_PATH}")

    print("\n" + "=" * 70)
    print("  PHASE 0 DEFENSIVE MODEL TRAINING COMPLETE ✓")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
