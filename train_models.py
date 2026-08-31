#!/usr/bin/env python3
"""
train_models.py
=============================================================================
UNIFIED AI MODEL TRAINING & EVALUATION PIPELINE
MALE UAV Aero Piston Engine Digital Twin
=============================================================================
This self-contained script trains and exports all AI models in a single step:
  1. Data Preparation & Normalization
  2. Deep LSTM Remaining Useful Life (RUL) Prognostics Model (backend/uav_rul_model.h5)
  3. Feature Scaler Weights (backend/scaler.pkl)
  4. Multi-Channel Isolation Forest Anomaly Detector (backend/anomaly_model.pkl)
  5. Model Validation & Performance Metrics Report (RMSE, MAE, Detection Accuracy)

Usage:
  /home/rishi/anaconda3/bin/python train_models.py
=============================================================================
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd

# Suppress TensorFlow GPU warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from sklearn.preprocessing import MinMaxScaler
from sklearn.ensemble import IsolationForest
from sklearn.metrics import mean_squared_error, mean_absolute_error

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(ROOT, 'data', 'telemetry_ready.csv')
BACKEND_DIR = os.path.join(ROOT, 'backend')
RUL_MODEL_PATH = os.path.join(BACKEND_DIR, 'uav_rul_model.h5')
SCALER_PATH = os.path.join(BACKEND_DIR, 'scaler.pkl')
ANOMALY_MODEL_PATH = os.path.join(BACKEND_DIR, 'anomaly_model.pkl')

os.makedirs(BACKEND_DIR, exist_ok=True)

print("=" * 70)
print("  UAV DIGITAL TWIN — UNIFIED AI MODEL TRAINING PIPELINE")
print("=" * 70)

# ── 1. Load & Prepare Dataset ────────────────────────────────────────────────
print("\n[Step 1/4] Loading & preparing telemetry dataset...")
if not os.path.exists(DATA_PATH):
    # Try preparing from raw if telemetry_ready.csv not found
    raw_path = os.path.join(ROOT, 'data', 'train_FD001(1).txt')
    if os.path.exists(raw_path):
        print("  → Prepping raw CMAPSS data...")
        cols = ['engine_id', 'cycle', 'os1', 'os2', 'os3'] + [f's{i}' for i in range(1, 22)]
        raw_df = pd.read_csv(raw_path, sep=r'\s+', header=None, names=cols)
        rul_max = raw_df.groupby('engine_id')['cycle'].max().reset_index()
        rul_max.columns = ['engine_id', 'max_cycle']
        raw_df = raw_df.merge(rul_max, on='engine_id', how='left')
        raw_df['rul'] = raw_df['max_cycle'] - raw_df['cycle']
        
        # Extract aero engine analog channels: rpm (s9), cht (s2), egt (s3)
        clean_df = raw_df[['engine_id', 'cycle', 's9', 's2', 's3', 'rul']].copy()
        clean_df.columns = ['engine_id', 'cycle', 'rpm', 'cht', 'egt', 'rul']
        clean_df.to_csv(DATA_PATH, index=False)
        df = clean_df
    else:
        print(f"  ❌ Error: Neither {DATA_PATH} nor raw dataset found.")
        sys.exit(1)
else:
    df = pd.read_csv(DATA_PATH)

print(f"  ✓ Total dataset records: {len(df):,} cycles across {df['engine_id'].nunique()} engine units.")

# ── 2. Train Deep LSTM Prognostics Model (RUL) ──────────────────────────────
print("\n[Step 2/4] Training Deep LSTM RUL Prognostics Network...")
lstm_features = ['rpm', 'cht', 'egt']
scaler = MinMaxScaler()
df_scaled = df.copy()
df_scaled[lstm_features] = scaler.fit_transform(df[lstm_features])

# Save Scaler
with open(SCALER_PATH, 'wb') as f:
    pickle.dump(scaler, f)
print(f"  ✓ Normalization scaler saved → {SCALER_PATH}")

# Time series windowing
sequence_length = 50
def build_lstm_windows(data, seq_len):
    X, y = [], []
    for _, group in data.groupby('engine_id'):
        mat = group[lstm_features].values
        ruls = group['rul'].values
        for i in range(len(group) - seq_len):
            X.append(mat[i:i + seq_len])
            y.append(ruls[i + seq_len])
    return np.array(X), np.array(y)

X, y = build_lstm_windows(df_scaled, sequence_length)
print(f"  ✓ Extracted time windows: {X.shape[0]:,} samples of shape (50 cycles, 3 features).")

# 80/20 Train/Validation Split
split_idx = int(len(X) * 0.80)
X_train, X_val = X[:split_idx], X[split_idx:]
y_train, y_val = y[:split_idx], y[split_idx:]

# Architecture: Bidirectional/Stacked LSTM with Dropout Regularization
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

print("  → Fitting LSTM network (epochs=30, batch_size=64)...")
history = lstm_model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=30,
    batch_size=64,
    callbacks=callbacks,
    verbose=1
)

lstm_model.save(RUL_MODEL_PATH)
print(f"  ✓ Deep LSTM Model saved → {RUL_MODEL_PATH}")

# Evaluate RUL Model
val_preds = lstm_model.predict(X_val, verbose=0).flatten()
val_rmse = np.sqrt(mean_squared_error(y_val, val_preds))
val_mae = mean_absolute_error(y_val, val_preds)
print(f"  📊 RUL Validation Performance: RMSE = {val_rmse:.2f} cycles | MAE = {val_mae:.2f} cycles")

# ── 3. Train Multi-Channel Isolation Forest Anomaly Detector ────────────────
print("\n[Step 3/4] Training Multi-Channel Isolation Forest Anomaly Detector...")
anom_features = ['rpm', 'cht', 'egt', 'oil_pressure', 'fuel_flow', 'vibration', 'battery_v', 'inj_timing']
max_rul = 260.0
deg = (1.0 - (df['rul'] / max_rul)).clip(0.0, 1.0)

# Synthesize realistic engine sub-channels
anom_df = df.copy()
anom_df['oil_pressure'] = (65.0 - (deg * 30.0) + np.random.normal(0, 1.5, len(df))).clip(10, 80)
anom_df['fuel_flow']    = ((anom_df['rpm'] / 1400.0) * 8.5 + np.random.normal(0, 0.15, len(df))).clip(0.5, 15)
anom_df['vibration']    = (0.3 + (deg * 3.2) + np.random.normal(0, 0.08, len(df))).clip(0, 10)
anom_df['battery_v']    = (13.8 - (deg * 0.8) + np.random.normal(0, 0.05, len(df))).clip(11, 15)
anom_df['inj_timing']   = (28.0 - (deg * 8.0) + np.random.normal(0, 0.3, len(df))).clip(10, 35)

# Train on healthy operation (RUL > 100)
healthy_samples = anom_df[anom_df['rul'] > 100][anom_features].values
print(f"  ✓ Healthy baseline training set: {len(healthy_samples):,} samples.")

iso_forest = IsolationForest(
    n_estimators=300,
    contamination=0.03,
    max_samples='auto',
    random_state=42,
    n_jobs=-1
)
iso_forest.fit(healthy_samples)

# Save Anomaly Model Bundle
anom_bundle = {
    'model': iso_forest,
    'features': anom_features,
    'meta': {
        'n_estimators': 300,
        'contamination': 0.03,
        'features': anom_features,
        'trained_samples': len(healthy_samples)
    }
}
with open(ANOMALY_MODEL_PATH, 'wb') as f:
    pickle.dump(anom_bundle, f)
print(f"  ✓ Anomaly Detector Bundle saved → {ANOMALY_MODEL_PATH}")

# Anomaly Benchmark
eol_samples = anom_df[anom_df['rul'] < 20][anom_features].values
eol_detected = (iso_forest.predict(eol_samples) == -1).sum()
eol_recall = (eol_detected / max(1, len(eol_samples))) * 100.0
print(f"  📊 Anomaly Detector End-of-Life Detection Recall: {eol_recall:.1f}% ({eol_detected}/{len(eol_samples)})")

# ── 4. Summary Report ────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("  AI TRAINING PIPELINE COMPLETE ✓")
print("=" * 70)
print(f"  1. LSTM RUL Model:      {RUL_MODEL_PATH}")
print(f"  2. Feature Scaler:       {SCALER_PATH}")
print(f"  3. Anomaly Model:       {ANOMALY_MODEL_PATH}")
print(f"  4. RUL Accuracy:        RMSE {val_rmse:.2f} cycles (MAE {val_mae:.2f})")
print(f"  5. Anomaly Recall:      {eol_recall:.1f}% on degraded propulsion states")
print("=" * 70 + "\n")
