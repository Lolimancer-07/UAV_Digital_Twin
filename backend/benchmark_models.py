"""
backend/benchmark_models.py

Offline Model Evaluation & Benchmarking Module for UAV Engine RUL Prognostics.
Compares:
  1. Linear Regression (Baseline)
  2. Random Forest Regressor (Ensemble)
  3. Gradient Boosting Regressor (Boosting)
  4. Deep LSTM Model (Pretrained Sequence Architecture)

Calculates:
  - MAE (Mean Absolute Error, cycles)
  - RMSE (Root Mean Squared Error, cycles)
  - R² Score (Coefficient of Determination)
  - Inference Latency (milliseconds per sample)

Outputs a comprehensive comparison table and saves a structured JSON report.
"""

import os
import sys
import time
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score
import pickle

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf
from tensorflow.keras.models import load_model

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, 'data', 'telemetry_ready.csv')
MODEL_PATH = os.path.join(ROOT, 'backend', 'uav_rul_model.h5')
SCALER_PATH = os.path.join(ROOT, 'backend', 'scaler.pkl')
REPORT_PATH = os.path.join(ROOT, 'backend', 'model_benchmark_report.json')

def run_benchmarks():
    print("=" * 70)
    print("  UAV DIGITAL TWIN — PROGNOSTICS MODEL BENCHMARKING SUITE")
    print("=" * 70)

    if not os.path.exists(DATA_PATH):
        print(f"Error: Dataset not found at {DATA_PATH}")
        sys.exit(1)

    print(f"[1/5] Ingesting dataset: {DATA_PATH}...")
    df = pd.read_csv(DATA_PATH)
    features = ['rpm', 'cht', 'egt']
    target = 'rul'

    X = df[features].values
    y = df[target].values

    # Identical 80/20 train/test split with fixed random seed
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)
    print(f"      Total samples: {len(df)} | Train: {len(X_train)} | Test: {len(X_test)}")

    results = {}

    # 1. Linear Regression
    print("\n[2/5] Benchmarking Linear Regression...")
    lr = LinearRegression()
    t0 = time.perf_counter()
    lr.fit(X_train, y_train)
    fit_time = time.perf_counter() - t0

    # Test latency over 1,000 samples
    sample_sub = X_test[:1000]
    t0 = time.perf_counter()
    y_pred_lr = lr.predict(X_test)
    total_infer_time = time.perf_counter() - t0
    latency_ms = (total_infer_time / len(X_test)) * 1000

    results['Linear Regression'] = {
        'MAE': round(float(mean_absolute_error(y_test, y_pred_lr)), 2),
        'RMSE': round(float(root_mean_squared_error(y_test, y_pred_lr)), 2),
        'R2': round(float(r2_score(y_test, y_pred_lr)), 4),
        'Latency_ms': round(float(latency_ms), 4),
        'Type': 'Linear Baseline'
    }
    print(f"      MAE: {results['Linear Regression']['MAE']} | RMSE: {results['Linear Regression']['RMSE']} | Latency: {results['Linear Regression']['Latency_ms']:.4f} ms")

    # 2. Random Forest
    print("\n[3/5] Benchmarking Random Forest Regressor (n=50)...")
    rf = RandomForestRegressor(n_estimators=50, max_depth=12, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    t0 = time.perf_counter()
    y_pred_rf = rf.predict(X_test)
    total_infer_time = time.perf_counter() - t0
    latency_ms = (total_infer_time / len(X_test)) * 1000

    results['Random Forest'] = {
        'MAE': round(float(mean_absolute_error(y_test, y_pred_rf)), 2),
        'RMSE': round(float(root_mean_squared_error(y_test, y_pred_rf)), 2),
        'R2': round(float(r2_score(y_test, y_pred_rf)), 4),
        'Latency_ms': round(float(latency_ms), 4),
        'Type': 'Non-linear Ensemble'
    }
    print(f"      MAE: {results['Random Forest']['MAE']} | RMSE: {results['Random Forest']['RMSE']} | Latency: {results['Random Forest']['Latency_ms']:.4f} ms")

    # 3. Gradient Boosting
    print("\n[4/5] Benchmarking Gradient Boosting Regressor...")
    gb = GradientBoostingRegressor(n_estimators=60, max_depth=5, random_state=42)
    gb.fit(X_train, y_train)
    t0 = time.perf_counter()
    y_pred_gb = gb.predict(X_test)
    total_infer_time = time.perf_counter() - t0
    latency_ms = (total_infer_time / len(X_test)) * 1000

    results['Gradient Boosting'] = {
        'MAE': round(float(mean_absolute_error(y_test, y_pred_gb)), 2),
        'RMSE': round(float(root_mean_squared_error(y_test, y_pred_gb)), 2),
        'R2': round(float(r2_score(y_test, y_pred_gb)), 4),
        'Latency_ms': round(float(latency_ms), 4),
        'Type': 'Sequential Boosting'
    }
    print(f"      MAE: {results['Gradient Boosting']['MAE']} | RMSE: {results['Gradient Boosting']['RMSE']} | Latency: {results['Gradient Boosting']['Latency_ms']:.4f} ms")

    # 4. Deep LSTM Model
    print("\n[5/5] Benchmarking Pretrained Deep LSTM Architecture...")
    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        with open(SCALER_PATH, 'rb') as f:
            scaler = pickle.load(f)
        lstm = load_model(MODEL_PATH)

        # Build sequence evaluation windows (window=50)
        window = 50
        seq_X = []
        seq_y = []
        for engine_id, grp in df.groupby('engine_id'):
            vals = scaler.transform(grp[features].values)
            ruls = grp[target].values
            if len(vals) >= window:
                for i in range(len(vals) - window + 1):
                    seq_X.append(vals[i:i+window])
                    seq_y.append(ruls[i+window-1])

        seq_X = np.array(seq_X)
        seq_y = np.array(seq_y)

        # Evaluate on test slice
        test_slice_X = seq_X[-1500:]
        test_slice_y = seq_y[-1500:]

        t0 = time.perf_counter()
        y_pred_lstm = lstm.predict(test_slice_X, verbose=0).flatten()
        total_infer_time = time.perf_counter() - t0
        latency_ms = (total_infer_time / len(test_slice_X)) * 1000

        results['Deep LSTM (Selected)'] = {
            'MAE': round(float(mean_absolute_error(test_slice_y, y_pred_lstm)), 2),
            'RMSE': round(float(root_mean_squared_error(test_slice_y, y_pred_lstm)), 2),
            'R2': round(float(r2_score(test_slice_y, y_pred_lstm)), 4),
            'Latency_ms': round(float(latency_ms), 4),
            'Type': 'Recurrent Deep Neural Net (Temporal)'
        }
        print(f"      MAE: {results['Deep LSTM (Selected)']['MAE']} | RMSE: {results['Deep LSTM (Selected)']['RMSE']} | Latency: {results['Deep LSTM (Selected)']['Latency_ms']:.4f} ms")
    else:
        print("      LSTM model file not found, skipping sequence model.")

    # Save benchmark report
    with open(REPORT_PATH, 'w') as f:
        json.dump(results, f, indent=2)

    # Print Summary Table
    print("\n" + "=" * 70)
    print("                 OFFLINE MODEL BENCHMARK RESULTS")
    print("=" * 70)
    print(f"{'Model':<24} {'MAE (cyc)':<12} {'RMSE (cyc)':<12} {'R² Score':<12} {'Latency (ms)':<12}")
    print("-" * 70)
    for model_name, m in results.items():
        print(f"{model_name:<24} {m['MAE']:<12} {m['RMSE']:<12} {m['R2']:<12} {m['Latency_ms']:<12.4f}")
    print("=" * 70)
    print("Selected Production Model: Deep LSTM")
    print("Rationale: Captures dynamic temporal degradation trajectories and supports Monte Carlo Dropout uncertainty estimation.")
    print(f"Full benchmark artifact written to: {REPORT_PATH}")
    print("=" * 70)

if __name__ == '__main__':
    run_benchmarks()
