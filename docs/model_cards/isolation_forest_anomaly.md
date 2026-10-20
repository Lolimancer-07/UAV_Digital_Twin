# Model Card: Multi-Channel Isolation Forest Anomaly Detector

**Model Name:** `anomaly_isolation_forest_v1`  
**Artifact File:** [`backend/anomaly_model.pkl`](file:///home/rishi/UAV_Digital_Twin/backend/anomaly_model.pkl)  
**Checksum:** Recorded in `backend/anomaly_model.pkl.sha256` (`6b579742f2d0975765cb1db6040d1df69baec1dfad0bf6384fa6e75a6c11fc6b`)  
**Format:** Scikit-Learn Pickle Bundle (Python 3.14+, scikit-learn 1.7.2)  
**Date of Release:** 2026-10-10 (Phase 0 Credibility Protocol)  

---

## 1. Model Overview & Intended Use

- **Task:** Unsupervised multivariate propulsion anomaly detection.
- **Intended Use:** Detection of out-of-distribution engine operating states, multi-sensor coupling deviations, and impending component wear before single-channel redlines trip.
- **Ensemble Integration:** Acts as Layer 1 of the two-layer propulsion anomaly detection stack, feeding into deterministic aviation rule classifiers and temporal hysteresis debouncing.

---

## 2. Architecture & Input Contract

- **Algorithm:** Isolation Forest (`sklearn.ensemble.IsolationForest`)
  - Trees (`n_estimators`): 300
  - Contamination: 0.03 (3% expected anomaly rate in nominal baseline)
  - Max Samples: 'auto'
  - Random Seed: 42 (deterministic training)
- **Input Channels (10 channels):**
  1. `rpm` (Propulsion rotational speed)
  2. `cht` (Cylinder head temperature)
  3. `egt` (Exhaust gas temperature)
  4. `oil_pressure` (Lubrication circuit pressure)
  5. `oil_temp` (Oil sump temperature)
  6. `fuel_flow` (Volumetric fuel consumption)
  7. `vibration` (RMS acceleration)
  8. `battery_v` (Avionics bus voltage)
  9. `map_kpa` (Manifold absolute pressure)
  10. `bus_current_a` (Electrical generator load)
- **Decision Threshold:** Continuous decision function output where score `< -0.05` indicates an anomalous outlier.

---

## 3. Training & Validation Data

- **Primary Training Dataset:** `data/synthetic_piston_train.csv` (Rotax 914 F Boxer 4 simulation).
  - Domain: `synthetic (physics-first simulation)`
  - Dataset SHA-256: `1ba599d7bffd205f49f15e806a3268227a875b75edec1f17bef5312594199578`
  - Training Subset: Filtered strictly to certified nominal operations (`fault_family == 'none'`), comprising 3,716 samples.
  - Zero Leakage: Completely disjoint from validation and frozen test sets.

---

## 4. Performance Metrics (Frozen Test Set)

- **Nominal False Alarm Rate:** 25.2 False Alarms / Flight Hour (suppressed to 0.0 FA/hr when debounced by Layer 2 hysteresis).
- **Major Mechanical Fault Detection:**
  - Oil Leak: 100% detection rate
  - Injector Clog: 100% detection rate
  - Bearing Spalling (Held-out): 100% detection rate
- **Inference Latency:** < 1.5 ms per single-vector decision evaluation.

---

## 5. Failure Modes & Mitigations

1. **Environmental Extremes (Hot Day Desert / Tactical Surges):** Elevated ambient temperature can depress decision scores; mitigated by dynamic altitude/ambient compensation in Layer 2.
2. **Sensor Electrical Noise:** High variance spikes are filtered by `FaultHysteresisFilter` (requires 3 consecutive detections to latch, 5 clean cycles to evict).
3. **Instrumentation Failure (Stuck/Drift Sensors):** Pre-screened by `SensorIntegrityMonitor` to ensure damaged sensors are isolated rather than misdiagnosed as catastrophic engine failures.
