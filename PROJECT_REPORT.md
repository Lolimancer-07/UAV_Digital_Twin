# UAV Digital Twin — Complete Project Report

A full-stack **Unmanned Aerial Vehicle (UAV) Digital Twin** with an AI-powered Ground Control Station (GCS): a simulated twin-cylinder internal-combustion UAV engine streams live telemetry over MQTT, a Python backend runs an 18-stage intelligence pipeline on every packet, and a Next.js dashboard renders it all in real time.

---

## 1. What Is a Digital Twin (Every Term Explained)

| Term | Meaning |
|---|---|
| **Digital Twin** | A live software replica of a physical machine (here, a UAV engine) fed by real-time sensor data, so you can monitor, predict, and command it without touching hardware. |
| **GCS** | Ground Control Station — the operator's dashboard. |
| **Telemetry** | Streams of sensor readings (temperatures, pressures, RPM) sent from the vehicle. |
| **RUL** | Remaining Useful Life — how many flight cycles the engine has left before failure. |
| **MQTT** | A lightweight publish/subscribe messaging protocol; the UAV "publishes" telemetry to a topic (`uav/engine/telemetry`) and the backend "subscribes" to it. |
| **WebSocket** | Two-way persistent browser connection; the backend pushes computed results to the dashboard at `ws://localhost:8765`. |
| **LSTM** | Long Short-Term Memory — a recurrent neural network that learns patterns over time sequences; used here for RUL prediction. |
| **MC Dropout** | Monte Carlo Dropout — running the network many times with dropout enabled to produce an *uncertainty band* around each prediction, not just a single number. |
| **Isolation Forest** | An unsupervised ML anomaly-detection algorithm that isolates "weird" data points. |
| **XAI** | Explainable AI — attributing an anomaly to the specific sensor causing it. |
| **CHT** | Cylinder Head Temperature. **EGT** — Exhaust Gas Temperature. **BSFC** — Brake-Specific Fuel Consumption (fuel burned per unit of power). **BHP** — Brake Horsepower. |
| **C-MAPSS** | NASA's Commercial Modular Aero-Propulsion System Simulation dataset — the benchmark turbofan degradation data the ML models are trained on (`data/train_FD001(1).txt`). |
| **FedAvg** | Federated Averaging — training ML models on multiple edge devices and averaging their weight updates instead of centralizing raw data. |
| **ATA-100** | Aviation maintenance documentation standard; work orders here use ATA chapters (72 = engine, 73 = fuel, 77 = engine indicating, 79 = oil). |
| **SAE J1939 / CAN** | The vehicle bus standard used by trucks/engines; the project simulates a virtual CAN bus with PGNs (Parameter Group Numbers) 65262/65271/65272. |

---

## 2. Project Structure (every file explained)

```
UAV_Digital_Twin/
├── run.sh                  # One-command orchestrator (starts everything)
├── requirements.txt        # Python dependencies
├── prep.py                 # Cleans raw NASA C-MAPSS data -> data/telemetry_ready.csv
├── train_model.py          # Trains the LSTM RUL model -> backend/uav_rul_model.h5
├── train_models.py         # Benchmarks Linear/RF/GBM vs LSTM
├── README.md               # 401-line architecture doc
├── AI_MODELS_SPEC.md       # ML model specifications
├── PROJECT_CONTEXT.md      # Project background notes
├── improvement_plan.md     # Roadmap
│
├── backend/                # The intelligence core (Python)
│   ├── inference.py        # MAIN PIPELINE - brain of the twin (757 lines)
│   ├── physics_engine.py   # Otto-cycle physics model + residual deltas
│   ├── anomaly_detector.py # Isolation Forest + 8 rule-based fault classifiers
│   ├── sensor_integrity.py # Stuck-sensor / noise / cross-sensor checks
│   ├── telemetry_integrity.py # Packet gaps, duplicates, replay attacks
│   ├── health_index.py     # 0-100 composite health across 5 subsystems
│   ├── twin_consistency.py # Cross-validates AI vs physics (Cases A-D)
│   ├── xai_engine.py       # Which sensor drives the anomaly
│   ├── mission_risk.py     # Probability the mission completes
│   ├── whatif_engine.py    # "What if we fly at different RPM/altitude?"
│   ├── optimizer.py        # scipy L-BFGS-B: best RPM/altitude operating point
│   ├── prescriptive.py     # Human-readable recommended actions by RUL band
│   ├── maintenance_advisor.py # ATA-100 work orders
│   ├── ai_engineer.py      # Natural-language Q&A (template-based, no LLM)
│   ├── fleet_manager.py    # 4 concurrent UAV twins (UAV-01..04)
│   ├── mission_command.py  # Recovery/abort planning, haversine geo math
│   ├── demo_controller.py  # Scripted judge-demo scenario sequencer
│   ├── federated_coordinator.py # FedAvg across edge model deltas
│   ├── drift_detector.py   # Data-distribution drift monitoring
│   ├── edge_profile.py     # Onboard vs ground inference profile swapping
│   ├── engine_config.py    # Engine-class registry (hot-swappable profiles)
│   ├── physics_check.py    # Independent Otto-efficiency sanity checks
│   ├── benchmark_models.py # Model comparison run (LSTM won: MAE 24.33, R² 0.66)
│   ├── train_anomaly_detector.py # One-time training of anomaly_model.pkl
│   ├── anomaly_model.pkl   # Trained Isolation Forest artifact
│   ├── scaler.pkl          # Feature scaler artifact
│   ├── uav_rul_model.h5    # Trained LSTM model artifact
│   └── model_benchmark_report.json # Benchmark results
│
├── simulator/              # The "physical" UAV side
│   ├── mission_sim.py      # Python telemetry generator (10 Hz, 14 channels)
│   ├── can_bridge.py       # Virtual SAE J1939 SocketCAN bridge
│   ├── ecu_sim.c           # C ECU simulator (libpaho MQTT)
│   ├── ecu_sim             # Compiled binary of the above
│   └── current_profile.json # Hot-reloadable flight profile
│
├── frontend/               # Next.js 16 + React 19 + TypeScript + Tailwind v4
│   ├── app/                # App-Router pages: dashboard, prognostics, telemetry,
│   │                       # thermodynamics, maintenance, mission-command, fleet,
│   │                       # dossier, can + dynamic [area]/page.tsx
│   ├── components/         # telemetry-provider (WebSocket client), prognostics-panel,
│   │                       # mission-command-center, can-bus-monitor, ai-copilot-sheet,
│   │                       # what-if / optimize / edge-swap dialogs, ui/* (shadcn)
│   ├── index.html          # Zero-dependency fallback GCS (served on :8080)
│   └── package.json        # pnpm; recharts, lucide-react, sonner, zod, dnd-kit
│
├── data/
│   ├── train_FD001(1).txt  # Raw NASA C-MAPSS turbofan training data
│   └── telemetry_ready.csv # Cleaned dataset produced by prep.py
│
└── tests/
    ├── test_digital_twin.py
    ├── test_mission_command.py
    └── test_federated_and_edge.py
```

---

## 3. The 18-Stage Pipeline (`backend/inference.py`)

`inference.py` is the brain — the docstring at `backend/inference.py:8-27` declares the exact stage order, and lines 53-60 wire in the intelligence modules. Per telemetry packet, at 10 Hz:

1. **MQTT ingestion** — subscribes to `uav/engine/telemetry`; receives 14-channel engine data (CHT1–4, EGT1–4, RPM, fuel, altitude, etc.).
2. **Telemetry integrity** (`telemetry_integrity.py`) — packet sequence gaps, duplicates, replay-attack detection, timestamp/range bounds.
3. **Sensor integrity** (`sensor_integrity.py`) — stuck sensors, discontinuities, excess noise, cross-sensor thermodynamic inconsistency; produces per-channel trust 0–100%.
4. **Physics engine** (`physics_engine.py`) — Otto-cycle thermodynamics, BHP, BSFC, and *residual deltas* (physics-predicted vs actual).
5. **Anomaly detection** (`anomaly_detector.py`) — Isolation Forest (trained, `anomaly_model.pkl`) plus 8 rule-based fault classifiers.
6. **RUL prediction** — LSTM with MC Dropout uncertainty bands (`uav_rul_model.h5`).
7. **Health index** (`health_index.py`, `compute_health_index` @ line 53) — 0–100 composite across 5 subsystems.
8. **Twin consistency** (`twin_consistency.py`) — cross-validates the AI against physics (Cases A–D: AI/physics agree/disagree matrix).
9. **XAI** (`xai_engine.py`) — identifies which sensor actually drives the anomaly.
10. **Mission risk** (`mission_risk.py`) — P(complete) = P_engine × P_thermal × P_time × P_env × ∏(1−p_fault); safe endurance and abort probability.
11. **What-If cache** (`whatif_engine.py`) — counterfactual RUL via thermal-load exponent α=1.5; computed on GCS command, cached here.
12. **Optimizer** (`optimizer.py`) — scipy L-BFGS-B finds the best RPM/altitude operating point, penalizing CHT safety violations and fuel burn.
13. **Prescriptive actions** (`prescriptive.py`) — concrete human-readable actions per RUL band.
14. **Maintenance advisor** (`maintenance_advisor.py`) — ATA-100-spec work orders (ATA 72/73/77/79).
15. **AI Engineer** (`ai_engineer.py`) — template-based natural-language Q&A for operators; deliberately *no LLM*, so it cannot hallucinate.
16. **Fleet manager** (`fleet_manager.py`) — tracks 4 concurrent UAV twins: UAV-01..04 with patrol / surveillance / recon-degraded / SAR-critical missions.
17. **Demo controller** (`demo_controller.py`) — scripted scenario sequencing for demonstrations.
18. **WebSocket server** — broadcasts the fully composed state to the dashboard at `ws://localhost:8765` and receives GCS commands (inject fault, what-if, optimize, fleet switch).

---

## 4. The Simulator Side (`simulator/`)

- **`mission_sim.py`** — the virtual UAV. Generates 14-channel telemetry at 10 Hz, injects faults on command, hot-reloads `current_profile.json` (so flight profiles change live), handles simulated navigation, and publishes to MQTT via paho (`read_control` @ 77, `simulated_navigation` @ 109, `build_telemetry_packet` @ 134).
- **`can_bridge.py`** — `AeroCANBridge` (@ 20) mirrors the telemetry onto a virtual SAE J1939 SocketCAN bus (PGNs 65262/65271/65272), so the CAN monitor tab in the UI shows a realistic avionics bus.
- **`ecu_sim.c`** — an Engine Control Unit simulator written in C using libpaho; compiled to `ecu_sim` by `run.sh` for a realistic embedded-software component.

---

## 5. The Frontend (`frontend/`)

- **Stack**: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/ui primitives (`components/ui/*`), recharts for charts, lucide-react icons, sonner toasts, zod validation, dnd-kit, TanStack Table. Package manager: pnpm.
- **Pages** (`frontend/app/`): main dashboard, prognostics, telemetry, thermodynamics, maintenance, mission-command, fleet, dossier, can-bus, plus a dynamic `[area]/page.tsx` module-detail route.
- **Key component — `telemetry-provider.tsx`**: the WebSocket client connecting to `ws://127.0.0.1:8765`; every panel subscribes to its state.
- **Dialogs**: what-if (counterfactual simulation), optimize (best operating point), edge-swap (onboard vs ground inference), security posture.
- **`ai-copilot-sheet`**: UI for the `ai_engineer.py` Q&A.
- **`frontend/index.html`**: a zero-dependency static fallback GCS with 10 tabs, served on port 8080 so the demo still works if Next.js fails.

---

## 6. How It Runs End-to-End (`run.sh`)

1. Kills leftover processes from previous runs.
2. Starts **Mosquitto** MQTT broker on port 1883.
3. Compiles `ecu_sim.c` if stale; trains the anomaly model if `anomaly_model.pkl` is missing.
4. Starts `backend/inference.py` and waits for port 8765 (the WebSocket brain) to come up.
5. Starts `simulator/mission_sim.py` — telemetry begins flowing.
6. Starts the Next.js dev server on port 3000 and serves the fallback GCS on 8080.
7. A `trap` on exit tears everything down cleanly on Ctrl+C.

**Data flow**: simulator → MQTT topic `uav/engine/telemetry` → 18-stage inference pipeline → WebSocket 8765 → React dashboard. GCS commands flow back down the same WebSocket into the pipeline/simulator.

---

## 7. ML Models & Training

- **Dataset**: NASA C-MAPSS `train_FD001(1).txt` → cleaned by `prep.py` into `telemetry_ready.csv`.
- **Benchmark** (`benchmark_models.py`): Linear Regression, Random Forest, Gradient Boosting vs LSTM over 10,531 cycles. **LSTM selected** — MAE 24.33 cycles, R² 0.66 (`model_benchmark_report.json`).
- **Artifacts**: `uav_rul_model.h5` (LSTM), `anomaly_model.pkl` (Isolation Forest), `scaler.pkl`.
- **Trust strategy**: ML predictions are never trusted blindly — `twin_consistency.py` compares them against an independent physics model, and `physics_check.py` independently validates Otto-cycle thermodynamic sanity.

---

## 8. Testing

`tests/test_digital_twin.py`, `test_mission_command.py`, `test_federated_and_edge.py` (pytest). Note: `run.sh` does not run them; they run via `python -m pytest` separately.

---

## 9. Design Highlights

- **Physics + AI fusion**: the twin never relies on a single source — AI, physics residuals, and integrity monitors cross-check each other.
- **Safety-first autonomy**: mission risk, abort planning, and recovery-site selection (`mission_command.py`, with haversine geo math) are computed continuously, not on request.
- **Explainability everywhere**: XAI attribution, per-sensor trust percentages, and a rule-based AI Engineer that answers questions without LLM hallucination risk.
- **Federated + edge-ready**: `federated_coordinator.py` and `edge_profile.py` model a realistic multi-UAV deployment where inference can shift between onboard and ground.

*Report generated from workspace inspection: full directory listing plus `backend/inference.py` header (lines 1–60); per-module line references derive from the exploration sweep of this session.*
