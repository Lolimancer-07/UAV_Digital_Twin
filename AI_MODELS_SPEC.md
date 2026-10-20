# UAV Digital Twin — AI Models Specification

> **Companion to:** [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) · [improvement_plan.md](improvement_plan.md)

---

## Overview

The system uses three trained machine-learning artifacts, all loaded at startup by
[`backend/inference.py`](backend/inference.py). This document records what each
model does, where it lives, how it was trained, and what its known limitations are.

> **Phase 1 target:** replace this hand-maintained document with auto-generated
> eval cards from a model manifest. See [improvement_plan.md §6](improvement_plan.md).

---

## 1. Deep LSTM RUL Prognostics Model

| Property | Value |
|---|---|
| **File** | `backend/uav_rul_model.h5` |
| **Format** | Keras HDF5 (TensorFlow ≥ 2.16) |
| **Task** | Remaining Useful Life (RUL) regression |
| **Architecture** | Stacked LSTM with MC Dropout (128 units → 64 units → Dense 32 → Dense 1) |
| **Input shape** | `(batch, 50, 3)` — 50-cycle window of `[rpm, cht, egt]` normalized by `ChannelScalerBundle` |
| **Output** | Scalar RUL estimate (cycles / flight minutes) |
| **Uncertainty** | Monte Carlo Dropout, 10 samples per inference, batched into one `@tf.function` call |
| **Training data** | Physics-first aero piston engine synthetic degradation dataset (`data/synthetic_piston_train.csv`) generated with Rotax 914 thermodynamics. NASA C-MAPSS turbofan dataset (`data/train_FD001(1).txt`) is maintained strictly as an external algorithmic benchmark. |
| **Scaler** | `backend/scaler.pkl` — `ChannelScalerBundle` (MinMaxScaler) fitted on `[rpm, cht, egt]` model input channels with contract order enforcement |
| **Known limitations** | Trained on physics-first simulation data; empirical validation against physical dynamometer / in-flight piston logs is in outreach phase. Strictly advisory, not flight-critical control. |
| **Phase 4 target** | Export to ONNX; INT8 post-training quantization; parity suite vs GCS float32 |
| **Hash** | Recorded in `backend/uav_rul_model.h5.sha256` and `backend/model_card.json` |

### Inference path

```python
# 50-cycle rolling buffer of normalized [rpm, cht, egt] telemetry
# Normalized by ChannelScalerBundle with strict channel order validation
lstm_input = np.array(buffer[-50:]).reshape(1, 50, 3)

# 10 MC Dropout samples batched in one @tf.function call (~7 ms on CPU)
preds = _lstm_mc_predict_compiled(
    np.repeat(lstm_input, 10, axis=0)
).numpy().flatten()

predicted_rul = float(np.mean(preds))
rul_std       = float(np.std(preds))
rul_lower     = max(0.0, predicted_rul - 1.645 * rul_std)   # 90% CI
rul_upper     = predicted_rul + 1.645 * rul_std
```

### Honest Prediction Protocol (Phase 0 Fix)

In legacy development, an uncalibrated model peeked at `data["true_rul"]` when present in the telemetry stream.
In Phase 0, **this ground-truth shortcut was completely removed**.
The inference engine now evaluates RUL strictly through the trained LSTM network over the 14-channel scaled sensor window, with genuine MC Dropout uncertainty bands, ensuring full defensibility and zero train/test leakage.


---

## 2. Multivariate Anomaly Detector

| Property | Value |
|---|---|
| **File** | `backend/anomaly_model.pkl` |
| **Format** | scikit-learn pickle (Isolation Forest) |
| **Task** | Multivariate unsupervised anomaly detection |
| **Algorithm** | `sklearn.ensemble.IsolationForest` |
| **Input** | 10-channel telemetry vector: `[rpm, cht, egt, oil_pressure, oil_temp, fuel_flow, vibration, battery_v, map_kpa, bus_current_a]` |
| **Output** | `(is_anomaly: bool, anomaly_score: float, fault_events: list)` |
| **Training** | `backend/train_anomaly_detector.py` — trained on 5000 synthetic nominal cycles from the mission simulator; takes ~60 s on first run |
| **Known limitations** | Trained entirely on synthetic simulator data. Distribution may not match real engine telemetry. Threshold (-0.05) is heuristic. |
| **Rule-based augmentation** | 8 hard-coded fault classifiers layered on top of Isolation Forest scores (over-temperature, oil pressure low, injector clog, vibration, battery, etc.) |
| **Phase 1 target** | Model manifest with hash; refuse to load if hash mismatches artifact |
| **Hash** | *(not yet recorded — Phase 1 deliverable)* |

### Fault classifiers (rule-based, in `anomaly_detector.py`)

| Fault | Trigger condition | Severity |
|---|---|---|
| `over_temperature` | CHT > 450°F OR EGT > 1700°F | CRITICAL |
| `oil_pressure_low` | oil_pressure < 30 PSI | CRITICAL |
| `injector_clog` | fuel_flow < 7.0 L/hr | WARNING |
| `cooling_degradation` | CHT > 420°F AND oil_temp > 200°F | WARNING |
| `vibration_fault` | vibration > 2.5 g | CRITICAL |
| `battery_fault` | battery_v < 12.5 V | WARNING |
| `oil_temp_high` | oil_temp > 220°F | WARNING |
| `combustion_instability` | EGT spread > 150°F (cylinder-level) | WARNING |

---

## 3. AI Copilot Intent Classifier

| Property | Value |
|---|---|
| **File** | `backend/ml_chatbot/intent_clf.joblib` |
| **Format** | scikit-learn joblib (TF-IDF + Logistic Regression pipeline) |
| **Task** | Natural-language question → intent category classification |
| **Algorithm** | `TfidfVectorizer + LogisticRegression` (multi-class) |
| **Training** | `backend/ml_chatbot/train_intent_clf.py` — ~3 s on first run, small synthetic dataset |
| **Known limitations** | Very small training set; high bias toward training phrases. Falls back to keyword matching on low-confidence outputs. |
| **Fallback** | If classifier is unavailable or confidence < threshold, the AI Engineer falls back to rule-based keyword matching |
| **Phase 1 target** | Replace with intent routing that uses the Decision Envelope fields as grounding context |

---

## Model Manifest Target (Phase 1)

The following JSON structure will be the model manifest format once Phase 1 is implemented.
All three models will have entries in `packages/contracts/model_manifest.json`.

```json
{
  "models": [
    {
      "model_id": "uav_rul_lstm_v1",
      "version": "1.0.0",
      "task": "rul_regression",
      "runtime": "tensorflow_2.x",
      "hash": "sha256:<to_be_computed>",
      "file": "backend/uav_rul_model.h5",
      "trained_at": "<date>",
      "input_shape": [1, 50, 3],
      "metrics": {
        "mae": null,
        "rmse": null,
        "r2": null,
        "latency_ms_cpu": 7
      },
      "eval_set_id": "nasa_cmapss_fd001"
    },
    {
      "model_id": "anomaly_isolation_forest_v1",
      "version": "1.0.0",
      "task": "anomaly_detection",
      "runtime": "sklearn",
      "hash": "sha256:<to_be_computed>",
      "file": "backend/anomaly_model.pkl",
      "trained_at": "<date>",
      "eval_set_id": "synthetic_mission_sim_5000_cycles"
    },
    {
      "model_id": "intent_clf_v1",
      "version": "1.0.0",
      "task": "intent_classification",
      "runtime": "sklearn",
      "hash": "sha256:<to_be_computed>",
      "file": "backend/ml_chatbot/intent_clf.joblib",
      "trained_at": "<date>",
      "eval_set_id": "synthetic_intent_phrases"
    }
  ]
}
```

---

## Known risks

| Risk | Description | Mitigation |
|---|---|---|
| Pickle fragility | `anomaly_model.pkl` and `scaler.pkl` are version-sensitive to scikit-learn and NumPy | Phase 1: replace with deterministic-format loaders; record hash at train time |
| TensorFlow pin | `uav_rul_model.h5` requires TF ≥ 2.16, < 2.23; TF pins conflict with NumPy 2.x | Phase 4: export to ONNX; remove TF from inference path |
| Simulator-shaped distribution | All models trained on synthetic data; real engines may differ significantly | Validate on public C-MAPSS or customer recordings; add real-data acceptance gate |
| No promotion gates | Models are trained and deployed with no offline evaluation, shadow comparison, or human sign-off | Phase 5: model registry, staging/shadow, promotion gates, rollback |
