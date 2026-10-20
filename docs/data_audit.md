# Data Path & Provenance Audit

**Audit Date:** 2026-10-10  
**Phase:** Phase 0 — Credibility Fixes (Task A1)  
**System:** UAV Digital Twin Propulsion AI Pipeline  
**Target Platform:** MALE UAV Propulsion (Rotax 914 F Turbocharged 4-Cylinder Boxer)  

---

## 1. Executive Summary

This audit traces every machine-learning model and diagnostic component in the UAV Digital Twin codebase, recording:
1. Exact dataset provenance and real-world domain.
2. Input channels utilized vs dropped.
3. Normalization scalers and fit parameters.
4. Ground-truth label generation definitions.
5. Known leakage pathways and remedial actions taken in Phase 0.

---

## 2. Model-by-Model Data Path Audit

### Model 1: Deep LSTM RUL Prognostics Network

| Dimension | Audit Finding (Legacy State) | Phase 0 Remediation (Current State) |
|---|---|---|
| **Artifact** | `backend/uav_rul_model.h5` | `backend/uav_rul_model.h5` (+ `.sha256` checksum) |
| **Source Dataset** | NASA C-MAPSS Turbofan Run-to-Failure (`data/train_FD001(1).txt`) | Physics-first synthetic piston engine run-to-failure dataset (`data/synthetic_piston_train.csv`) + C-MAPSS retained strictly as external algorithmic benchmark |
| **Dataset Domain** | Commercial gas turbofan (NASA Commercial Modular Aero-Propulsion System Simulation) | 4-cylinder turbocharged piston engine with Otto thermodynamic dynamics |
| **Total Rows** | 20,631 cycles across 100 turbofan units | Configurable flight missions with 10 Hz telemetry |
| **Channels Used** | **Only 3 channels:** `rpm` (mapped from turbofan sensor 4/9), `cht` (mapped from sensor 2), `egt` (mapped from sensor 3) | **All 14 canonical channels:** `rpm`, `cht`, `egt`, `oil_pressure`, `oil_temp`, `fuel_flow`, `fuel_rail_pressure_bar`, `vibration`, `vibration_kurtosis`, `battery_v`, `bus_current_a`, `inj_timing`, `map_kpa`, `oat_c` |
| **Channels Dropped** | 21 turbofan columns dropped (op_settings 1–3, sensors 1, 5–21) | Zero canonical channels dropped |
| **Scaler Fit** | `sklearn.preprocessing.MinMaxScaler()` fitted only on 3 columns in turbofan temperature space | `ChannelScalerBundle` fitted on all 14 channels; stored with channel order contract in `backend/scaler.pkl` |
| **Label Definition** | `rul = max_cycle - cycle` piecewise linear calculation | Operating lifetime remaining until critical threshold breach under engine wear dynamics |
| **Leakage Identified** | **Severe:** 1) Arbitrary time-series slicing across sliding windows. 2) In `backend/inference.py:388-412`, when `true_rul > 0`, the prediction peeked at `true_rul` and calculated `predicted_rul = true_rul * health_factor + jitter`. | **Eliminated:** Slices partitioned strictly by flight/engine ID before windowing. In `inference.py`, ground-truth shortcut removed; predictions are evaluated purely through LSTM inference over input buffer. |

---

### Model 2: Multi-Channel Isolation Forest Anomaly Detector

| Dimension | Audit Finding (Legacy State) | Phase 0 Remediation (Current State) |
|---|---|---|
| **Artifact** | `backend/anomaly_model.pkl` | `backend/anomaly_model.pkl` (+ `.sha256` checksum) |
| **Source Dataset** | Hybrid derived dataset (`data/telemetry_ready.csv`) with 5 channels synthesized via formulaic degradation `deg = 1 - rul/260` | Physics-first nominal flight training split (`data/synthetic_piston_train.csv`) generated from aero-piston simulator |
| **Total Rows** | ~14,000 healthy cycles (`rul > 100`) | Nominal flight operations spanning standard flight profiles (takeoff, climb, cruise, loiter) |
| **Channels In** | 8 channels: `rpm`, `cht`, `egt`, `oil_pressure`, `fuel_flow`, `vibration`, `battery_v`, `inj_timing` | Canonical channels loaded dynamically from `config/channels.yaml` |
| **Channels Dropped** | 6 channels dropped: `oil_temp`, `fuel_rail_pressure_bar`, `vibration_kurtosis`, `bus_current_a`, `map_kpa`, `oat_c` | Evaluated across full propulsion sensor suite |
| **Scaler Fit** | Unscaled raw values fed into trees | Tree-based model (scale invariant) with bundle validation metadata |
| **Label Definition** | Unsupervised: trained on healthy envelope (`RUL > 100`); contamination = 0.03 | Trained strictly on certified nominal flights without active failure modes |
| **Leakage Identified** | Ad-hoc equations tied oil pressure, vibration, and timing directly to `deg = 1 - rul/260`, leaking RUL into anomaly features. | Physics simulator couples wear to thermal and mechanical work rates rather than an artificial static equation. |

---

### Model 3: Aviation Rule-Based Fault Classifiers

| Dimension | Audit Finding (Legacy State) | Phase 0 Remediation (Current State) |
|---|---|---|
| **Implementation** | `backend/anomaly_detector.py` Layer 2 | `backend/anomaly_detector.py` driven by `config/channels.yaml` & `backend/engine_config.py` |
| **Rules Evaluated** | 8 hardcoded rules: `OVERHEATING`, `LOW_OIL_PRESSURE`, `HIGH_VIBRATION`, `LEAN_MIXTURE`, `CYLINDER_IMBALANCE`, `CHARGING_FAILURE`, `THERMAL_RUNAWAY`, `BEARING_DEGRADATION` | Config-driven thresholds derived from Rotax 914 Pilot's Operating Handbook (POH) |
| **Debouncing** | Hysteresis: 3 triggers to trip, 5 clean cycles to clear | Retained and verified against false alarms |

---

### Model 4: Thermodynamic Physics Residual Baseline

| Dimension | Audit Finding (Legacy State) | Phase 0 Remediation (Current State) |
|---|---|---|
| **Implementation** | `backend/physics_engine.py` (Otto 4-stroke thermodynamic cycle) | Otto thermodynamic simulation calculating BHP, BSFC, manifold density, and heat transfer |
| **Residuals Calculated** | `delta_cht`, `delta_egt`, `delta_oil_p`, `delta_fuel` | Evaluated against centralized thresholds in `backend/engine_config.py` |

---

### Model 5: AI Copilot Natural Language Intent Classifier

| Dimension | Audit Finding (Legacy State) | Phase 0 Remediation (Current State) |
|---|---|---|
| **Artifact** | `backend/ml_chatbot/intent_clf.joblib` | `backend/ml_chatbot/intent_clf.joblib` |
| **Training Source** | 22 synthetic operator query exemplars across 5 intent classes | Retained for NLP dispatch; isolated from telemetry and prognostics pipeline |

---

## 3. Summary of Identified Flaws & Resolutions

1. **Turbofan vs Piston Conflation:** The legacy project presented NASA C-MAPSS turbofan data as UAV piston thermodynamics by renaming sensor columns. In Phase 0, C-MAPSS is formally relabeled as an external turbofan algorithmic benchmark, and all piston engine models are trained on physics-first aero piston data.
2. **Channel Starvation:** The LSTM model trained on only 3 of 14 available channels, ignoring lube, fuel pressure, vibration, and electrical telemetry. In Phase 0, all 14 channels are ingested and scaled.
3. **Inference Ground Truth Shortcut:** In `backend/inference.py`, if telemetry had `true_rul > 0`, the engine calculated RUL from ground truth rather than model inference. In Phase 0, this shortcut is completely eradicated; predictions reflect genuine inference.
4. **Split Contamination:** Windowing before splitting allowed overlapping sequences to appear in both train and validation splits. In Phase 0, partitioning is performed strictly by flight and engine ID prior to window creation.
