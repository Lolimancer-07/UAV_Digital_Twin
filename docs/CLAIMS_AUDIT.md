# UAV Digital Twin — Claims Audit & Traceability Matrix

**Document:** `docs/CLAIMS_AUDIT.md`  
**Standard:** Phase 0 Credibility Fixes (Task D2)  
**Audit Date:** 2026-10-10  
**Scope:** `README.md`, `PROJECT_CONTEXT.md`, `AI_MODELS_SPEC.md`, `improvement_plan.md`, and Frontend UI  

---

## 1. Executive Summary

In accordance with Phase 0 Task D2 ("Make every number the project reports defensible"), every quantitative claim, accuracy figure, or capability assertion across the repository documentation and user interface has been audited. Claims that lacked empirical ground truth have been rewritten, bound to measurable baseline tests, or removed.

---

## 2. Quantitative Claims Audit Table

| Source Location | Original Claim / Text | Audit Verdict | Remediation / Revised Text | Measured Evidence / Justification |
|---|---|---|---|---|
| `README.md` (Telemetry & Domain) | "Trained on Rotax aero-propulsion domain parameters and NASA C-MAPSS degradation research benchmarks" | **REWRITTEN** | "Trained on physics-first aero piston simulation with Rotax 914 thermodynamic parameters; NASA C-MAPSS turbofan data retained strictly as external algorithmic benchmark." | C-MAPSS is turbofan data (Brayton cycle). Relabeled in `data/DATASETS.md` and `AI_MODELS_SPEC.md`. |
| `README.md` (RUL Accuracy) | "Sub-cycle RUL Prognostics Accuracy (RMSE < 2.5 cycles)" | **REWRITTEN** | "Validation RUL RMSE = 61.0 cycles (MAE = 50.1 cycles) on physics-first piston simulation without ground-truth cheating." | Legacy code peeked at `data["true_rul"]` in `inference.py:388-412`. Removed shortcut in Phase 0; honest numbers reported. |
| `README.md` (Anomaly Recall) | "99.4% Anomaly Detection Recall across all propulsion failures" | **REWRITTEN** | "100% detection recall on major mechanical/lube failures (bearing spalling, oil leak, misfire) with 12–16 cycle lead times on frozen test set." | Measured in `results/baseline_report.md` on held-out fault families. |
| `AI_MODELS_SPEC.md` (§1.1) | "Trained on NASA C-MAPSS turbofan run-to-failure dataset (FD001 subset); CHT remapped to piston range" | **REWRITTEN** | "Trained on physics-first aero piston synthetic dataset (`synthetic_piston_train.csv`) generated with Rotax 914 thermodynamics. NASA C-MAPSS is an external benchmark." | Audit Task A3 and A1 (`docs/data_audit.md`). |
| `AI_MODELS_SPEC.md` (§1.3) | "The raw LSTM output is calibrated against ground-truth RUL from the simulator (`true_rul`)" | **DELETED** | Removed entire calibration cheat section. RUL is evaluated purely through model inference over input buffer. | Task B4: eliminated test leakage shortcut from `backend/inference.py`. |
| `PROJECT_CONTEXT.md` (Models) | "Multi-channel LSTM RUL prognostics engine" (previously used only 3 channels) | **VERIFIED** | Model input channels explicitly configured in `config/channels.yaml` and verified by `ChannelScalerBundle`. | `tests/test_channels.py` enforces channel contract. |
| `improvement_plan.md` (§4 Phase 0) | "Stop shipping unsafe artifacts as the only format; add hash file and record training data version next to each." | **VERIFIED** | Every `.h5` and `.pkl` has `.sha256` sidecar; verified by `tests/test_model_governance_cards.py` and `model_card.json`. | Task B6 and `backend/model_card.json`. |
| Frontend UI (`export-dialog.tsx`) | "Full 14-channel sensor records, health index, RUL estimates, and anomaly flags across all cycles." | **VERIFIED** | All 14 canonical channels are now formally tracked in `config/channels.yaml`. | Full telemetry export verified. |

---

## 3. Policy & Enforcement Checklist

- [x] No claim implies NASA C-MAPSS turbofan data is piston engine telemetry.
- [x] No claim of RUL prediction peeking at ground truth `true_rul`.
- [x] Every reported quantitative metric links directly to `results/baseline_report.md`.
- [x] Known limitations clearly displayed: simulation-only validation, no real engine run-to-failure data yet, advisory only.
