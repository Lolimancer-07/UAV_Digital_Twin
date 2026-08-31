"""
backend/train_anomaly_detector.py
----------------------------------
Trains an Isolation Forest anomaly detector on the "healthy" portion of the
CMAPSS dataset (RUL > 100 cycles). Uses the same synthetic sensor physics
model as ecu_sim.c so the detector sees realistic 7-feature vectors.

Run from UAV_Digital_Twin root:
    /home/rishi/anaconda3/bin/python backend/train_anomaly_detector.py
"""
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import MinMaxScaler
import pickle
import os

# ── Config ──────────────────────────────────────────────────────────────────
CSV_PATH      = 'data/telemetry_ready.csv'
OUTPUT_PATH   = 'backend/anomaly_model.pkl'
MAX_RUL       = 260.0
HEALTHY_RUL   = 100          # Only train on "healthy" engine data
CONTAMINATION = 0.03         # Expect ~3% anomalies in full dataset
N_ESTIMATORS  = 300

FEATURES = ['rpm', 'cht', 'egt',
            'oil_pressure', 'fuel_flow', 'vibration',
            'battery_v', 'inj_timing']

# ── Load and compute synthetic sensors (mirrors ecu_sim.c exactly) ──────────
print("Loading dataset...")
df = pd.read_csv(CSV_PATH)
print(f"  {len(df):,} rows loaded.")

# Degradation factor [0=new, 1=end-of-life] — same formula as C simulator
deg = (1.0 - (df['rul'] / MAX_RUL)).clip(0.0, 1.0)

df['oil_pressure'] = 65.0 - (deg * 30.0) + np.random.normal(0, 1.5, len(df))
df['oil_pressure'] = df['oil_pressure'].clip(10, 80)

df['fuel_flow']    = (df['rpm'] / 1400.0) * 8.5 + np.random.normal(0, 0.15, len(df))
df['fuel_flow']    = df['fuel_flow'].clip(0.5, 15)

df['vibration']    = 0.3 + (deg * 3.2) + np.random.normal(0, 0.08, len(df))
df['vibration']    = df['vibration'].clip(0, 10)

df['battery_v']    = 13.8 - (deg * 0.8) + np.random.normal(0, 0.05, len(df))
df['battery_v']    = df['battery_v'].clip(11, 15)

df['inj_timing']   = 28.0 - (deg * 8.0) + np.random.normal(0, 0.3, len(df))
df['inj_timing']   = df['inj_timing'].clip(10, 35)

# ── Train only on healthy data ───────────────────────────────────────────────
healthy_df = df[df['rul'] > HEALTHY_RUL].copy()
print(f"  Healthy samples (RUL > {HEALTHY_RUL}): {len(healthy_df):,}")

X_train = healthy_df[FEATURES].values

# ── Fit Isolation Forest ─────────────────────────────────────────────────────
print(f"\nTraining Isolation Forest ({N_ESTIMATORS} trees, "
      f"contamination={CONTAMINATION})...")
detector = IsolationForest(
    n_estimators=N_ESTIMATORS,
    contamination=CONTAMINATION,
    max_samples='auto',
    random_state=42,
    n_jobs=-1,
    verbose=0
)
detector.fit(X_train)
print("  Training complete.")

# Quick sanity check on full dataset
labels     = detector.predict(df[FEATURES].values)
n_anomaly  = (labels == -1).sum()
print(f"\nSanity check — anomalies flagged in full dataset: "
      f"{n_anomaly} / {len(df)} ({100*n_anomaly/len(df):.1f}%)")

# Verify high-anomaly rate near end-of-life (RUL < 20)
end_of_life = df[df['rul'] < 20]
eol_labels  = detector.predict(end_of_life[FEATURES].values)
eol_anom    = (eol_labels == -1).sum()
print(f"  End-of-life (RUL < 20) anomaly rate: "
      f"{eol_anom} / {len(end_of_life)} ({100*eol_anom/max(1,len(end_of_life)):.1f}%)")

# ── Save model bundle ────────────────────────────────────────────────────────
os.makedirs('backend', exist_ok=True)
bundle = {
    'model':    detector,
    'features': FEATURES,
    'meta': {
        'healthy_rul_threshold': HEALTHY_RUL,
        'n_estimators':          N_ESTIMATORS,
        'contamination':         CONTAMINATION,
        'train_samples':         len(healthy_df),
    }
}
with open(OUTPUT_PATH, 'wb') as f:
    pickle.dump(bundle, f)

print(f"\n✅ Anomaly detector saved → '{OUTPUT_PATH}'")
print(f"   Features: {FEATURES}")
