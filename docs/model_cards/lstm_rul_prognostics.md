# Model Card: Deep Stacked LSTM RUL Prognostics Network

**Model Name:** `uav_rul_lstm_v1`  
**Artifact File:** [`backend/uav_rul_model.h5`](file:///home/rishi/UAV_Digital_Twin/backend/uav_rul_model.h5)  
**Checksum:** Recorded in `backend/uav_rul_model.h5.sha256` (`f8d6aa54a5fdcca841d243a3f3cc2b00d67f3d964eb9da4145ebe0dcada13054`)  
**Format:** Keras HDF5 (TensorFlow ≥ 2.16)  
**Date of Release:** 2026-10-10 (Phase 0 Credibility Protocol)  

---

## 1. Model Overview & Intended Use

- **Task:** Remaining Useful Life (RUL) time-to-failure regression for aero piston propulsion engines.
- **Intended Use:** Advisory decision support for remote UAV ground control station (GCS) flight dispatchers, contingency planners, and maintenance personnel.
- **Out-of-Scope / Prohibited Uses:** Primary flight-critical engine control (FADEC), automatic fuel cutoff, emergency landing auto-trigger without human-in-the-loop oversight.

---

## 2. Architecture & Input Contract

- **Architecture:** Stacked Long Short-Term Memory (LSTM) with Monte Carlo Dropout
  - Input Layer: `(batch, 50, 3)` (50-cycle temporal window)
  - Layer 1: LSTM (128 units, return_sequences=True) + Dropout (p=0.20)
  - Layer 2: LSTM (64 units, return_sequences=False) + Dropout (p=0.20)
  - Layer 3: Dense (32 units, activation='relu')
  - Output Layer: Dense (1 unit, linear output)
- **Input Channels:** `[rpm, cht, egt]` configured via `config/channels.yaml`
- **Scaler:** `ChannelScalerBundle` (MinMaxScaler) saved in `backend/scaler.pkl` with strict channel order enforcement.
- **Uncertainty Quantification:** Monte Carlo Dropout (10 forward passes batched via `@tf.function`), yielding mean predicted RUL and 90% confidence intervals `[rul_lower, rul_upper]`.

---

## 3. Training & Validation Data

- **Primary Training Dataset:** `data/synthetic_piston_train.csv` (Rotax 914 F Boxer 4 thermodynamics simulation).
  - Domain: `synthetic (physics-first simulation)`
  - Dataset SHA-256: `1ba599d7bffd205f49f15e806a3268227a875b75edec1f17bef5312594199578`
  - Samples: 4,500 records across 18 unique flights.
- **Validation Dataset:** `data/synthetic_piston_val.csv` (2,250 records across 9 distinct flights, zero flight overlap with training set).
- **Benchmark Reference:** NASA C-MAPSS FD001 turbofan run-to-failure dataset (`data/train_FD001(1).txt`), maintained strictly as an external algorithmic benchmark.

---

## 4. Performance Metrics

- **Validation RMSE:** 61.04 cycles
- **Validation MAE:** 50.07 cycles
- **Inference Latency:** ~7 ms per 10-sample Monte Carlo forward pass on modern x86_64 CPU.

---

## 5. Failure Modes & Known Limitations

1. **Simulation-to-Reality Gap:** The model has been verified against physics-first synthetic simulation. Real-world flight logs and dynamometer data are pending outreach acquisition (see `docs/REAL_DATA_OUTREACH.md`).
2. **Buffer Warmup:** Requires a 50-cycle history buffer (replicates available frames during initial warmup cycles 1–49).
3. **Severe Multi-Sensor Degradation:** Corrupted RPM readings or thermocouple shorts degrade accuracy; relies on `SensorIntegrityMonitor` to catch invalid inputs before inference.
