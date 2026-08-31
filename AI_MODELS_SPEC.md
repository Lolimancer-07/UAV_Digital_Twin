# AI Models & Predictive Analytics Architecture Specification
**Project**: MALE UAV Aero Piston Engine Digital Twin System  
**Framework**: TensorFlow 2.x / Scikit-Learn / NumPy / Pandas  

---

## 1. AI Architecture Overview

```
                          ┌────────────────────────┐
                          │ 14-Channel Telemetry   │
                          │ (CAN / MQTT Stream)    │
                          └───────────┬────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
    │  Model 1: LSTM   │    │ Model 2: Iso-    │    │ Model 3: Hybrid  │
    │  RUL Prognostics │    │ Forest Anomaly   │    │ PINN Physics Res │
    │  (Remaining Life)│    │ (Fault Detector) │    │ (Thermodynamics) │
    └─────────┬────────┘    └─────────┬────────┘    └─────────┬────────┘
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      ▼
                        ┌────────────────────────┐
                        │   Explainable AI &     │
                        │ ATA Maintenance Engine │
                        └────────────────────────┘
```

---

## 2. Model 1: Deep LSTM Remaining Useful Life (RUL) Prognostics

* **Model Artifact**: `backend/uav_rul_model.h5`
* **Scaler Weights**: `backend/scaler.pkl`
* **Objective**: Continuous regression estimation of Remaining Useful Life (in flight cycles) with 95% Confidence Interval.
* **Input Window**: $(N, 50, 3)$ — 50 consecutive flight cycles of normalized `['rpm', 'cht', 'egt']`.
* **Output**: Scalar $\hat{y} \in [0, 260]$ representing remaining cycles before overhaul/failure.

### Neural Network Topology:
```
Layer 1: LSTM (128 units, return_sequences=True, input_shape=(50, 3))
Layer 2: Dropout (rate=0.20)
Layer 3: LSTM (64 units, return_sequences=False)
Layer 4: Dropout (rate=0.20)
Layer 5: Dense (32 units, activation='relu')
Layer 6: Dense (1 unit, linear output)
```

* **Optimizer**: Adam ($\alpha = 0.001$, $\beta_1 = 0.9, \beta_2 = 0.999$)
* **Loss Function**: Mean Squared Error ($\text{MSE}$)
* **Performance Metrics**:
  * $\text{RMSE} \approx 14.8\text{ cycles}$
  * $\text{MAE} \approx 10.2\text{ cycles}$
  * Inference Latency: $< 2.5\text{ ms}$ on single CPU thread

---

## 3. Model 2: Multi-Channel Isolation Forest Anomaly Detector

* **Model Artifact**: `backend/anomaly_model.pkl`
* **Objective**: Unsupervised multivariate outlier detection flagging anomalies in sub-second inference time.
* **Input Vector**: $X \in \mathbb{R}^8$ with features:
  `['rpm', 'cht', 'egt', 'oil_pressure', 'fuel_flow', 'vibration', 'battery_v', 'inj_timing']`
* **Hyperparameters**:
  * `n_estimators`: 300 isolation trees
  * `contamination`: 0.03 (trained on healthy regime where $\text{RUL} > 100$)
  * `max_samples`: `'auto'`
* **Outputs**:
  * $\text{Prediction} \in \{+1 \text{ (Normal)}, -1 \text{ (Anomaly)}\}$
  * $\text{Decision Score} \in [-0.5, +0.3]$ (More negative indicates extreme outlier)
* **Performance**:
  * End-of-Life ($\text{RUL} < 20$) Fault Recall: **100%**
  * Healthy Regime False Positive Rate: $< 2.8\%$

---

## 4. Model 3: Hybrid Physics-Informed Residual Engine (PINN)

* **Code Reference**: `backend/physics_engine.py`
* **Objective**: Compare live telemetry against a continuous theoretical 4-stroke Otto thermodynamic model.
* **Physics Formulations**:
  $$\text{Ideal Otto Efficiency: } \eta_{ideal} = 1 - \frac{1}{r^{\gamma - 1}} \quad (r=9.0, \gamma=1.33)$$
  $$\text{Brake Power: } P_{brake} = \text{BMEP} \times V_d \times \frac{N}{120} \quad [\text{kW}]$$
  $$\text{Residual Vector: } \mathbf{R} = \mathbf{X}_{measured} - \mathbf{X}_{physics\_expected}$$
* **Detection Threshold**: Flags sensor drift or degradation when $\|\mathbf{R}\|_2 > 3\sigma$ before physical threshold limits are breached.

---

## 5. Explainable AI (XAI) Root Cause Diagnostic Layer

* **Code Reference**: `backend/xai_engine.py`
* **Attribution Algorithm**:
  $$Z_i = \frac{|X_i - \mu_i|}{\sigma_i}, \quad S_i = Z_i^{1.8}$$
  $$\text{Attribution Percentage: } A_i = \left( \frac{S_i}{\sum_j S_j} \right) \times 100\%$$
* **Outputs**: Feature attribution waterfall, affected subsystem mapping, and natural-language root-cause explanation.

---

## 6. Training & Retraining

To retrain the complete AI stack from scratch:
```bash
/home/rishi/anaconda3/bin/python train_models.py
```
