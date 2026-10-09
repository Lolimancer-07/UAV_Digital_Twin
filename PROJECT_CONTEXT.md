# UAV Digital Twin — Project Context

> **Companion to:** [README.md](README.md) · [AI_MODELS_SPEC.md](AI_MODELS_SPEC.md) · [improvement_plan.md](improvement_plan.md)

---

## What this system is

A **propulsion health digital twin** for piston and turboprop uncrewed aircraft.
It ingests live engine telemetry, cross-validates AI predictions against physics
baselines, and tells operators what is wrong (and exactly what to do) before a
mission is lost.

**Core value proposition:** the system distinguishes a *failing sensor* from a
*failing engine* — and provides an ATA-100-mapped work order, not just an alert.

---

## System architecture (current, single-machine)

```
ECU/sensors → MQTT (paho, 10 Hz)
                │
                ▼
backend/inference.py          ← main process (MQTT loop)
  │  Sensor integrity          ← per-channel trust scores
  │  Physics engine            ← Otto-cycle / BHP / BSFC / residuals
  │  Anomaly detector          ← Isolation Forest + 8 rule-based classifiers
  │  RUL prognostics           ← LSTM + MC Dropout uncertainty
  │  Health index              ← weighted composite (5 subsystems)
  │  Twin consistency          ← Cases A–D cross-validation
  │  XAI engine                ← top sensor drivers ranked by sigma
  │  Mission risk              ← completion probability + safe endurance
  │  What-If / Optimizer       ← counterfactual RPM/altitude search
  │  Prescriptive              ← human-readable maintenance actions
  │  Maintenance advisor       ← ATA-100 work orders
  │  AI Engineer               ← natural-language Q&A (intent + ML)
  │  Fleet manager             ← 4 UAVs simultaneously
  │  Federated coordinator     ← POC simulated aggregation
  │  Edge profile manager      ← POC SWaP/deployment mode
  │  Demo controller           ← scripted scenario sequencer
  │  Mission Command Center    ← human-in-the-loop recovery planning
  │
  ├─ WebSocket (ws://127.0.0.1:8765) → frontend/
  └─ Control file (simulator/current_profile.json) ← read by simulator

simulator/mission_sim.py      ← Python physics simulator (MQTT publisher)
simulator/ecu_sim.c           ← C ECU simulator (compiled, paho-mqtt3c)

frontend/                     ← Next.js 15 GCS dashboard (port 3000)
  app/                        ← App Router pages
  components/                 ← React components
  lib/telemetry/              ← types, formatters, thresholds, utils
  hooks/use-telemetry-socket  ← WebSocket consumer + history ring buffer
```

---

## Key directories

| Path | Purpose |
|---|---|
| `backend/` | All Python reasoning modules + trained model artifacts |
| `backend/inference.py` | Orchestration monolith — MQTT consumer + WS server |
| `simulator/` | Mission simulator (Python + C ECU sim) |
| `frontend/` | Next.js 15 GCS dashboard |
| `tests/` | pytest unit + integration test suite |
| `packages/contracts/` | Decision Envelope v1 JSON Schema (machine-readable contract) |
| `packages/sim-models/scenarios/` | Deterministic golden-file scenarios for CI and demo |
| `.github/workflows/` | CI pipeline (backend pytest, frontend typecheck, envelope contract test) |

---

## Decision Envelope

Every WebSocket message from the inference engine is a **Decision Envelope**.
The canonical schema is in [`packages/contracts/decision_envelope_v1.json`](packages/contracts/decision_envelope_v1.json).

Key fields:

| Field | Description |
|---|---|
| `envelope_version` | Schema version (`"1.0"`). Consumers must reject unknown major versions. |
| `cycle` | Flight cycle counter (monotonically increasing per engine) |
| `alert` | Top-level status: `NOMINAL` / `WARNING` / `CRITICAL` |
| `predicted_rul` | Remaining useful life in cycles (LSTM + MC Dropout calibrated) |
| `twin_consistency.case` | Cross-validation verdict: A (agree nominal), B (agree fault), C (disagree — sensor suspect), D (both signal fault) |
| `prescriptive` | Human-readable maintenance action list |
| `sensor_integrity` | Per-channel trust scores |

---

## Twin Consistency Cases

| Case | AI | Physics | Interpretation |
|---|---|---|---|
| A | Nominal | Nominal | Healthy engine, trust both |
| B | Fault | Fault | Genuine engine fault, act on prescriptive output |
| C | Nominal | Fault OR Fault | Nominal | Sensor discrepancy — investigate sensor before grounding |
| D | Fault | Fault (severe) | High-confidence fault — RTB advisory likely |

---

## Simulated / POC components

The following components are **explicitly labelled as simulations** and do not
represent production-grade implementations. No buyer should be misled.

- `backend/federated_coordinator.py` — POC local aggregation, no secure aggregation or DP noise
- `backend/edge_profile.py` — POC SWaP numbers, not measured on target hardware
- `simulator/` — synthetic degradation, not validated on real run-to-failure data

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `UAV_TWIN_WS_HOST` | `127.0.0.1` | WebSocket bind host |
| `UAV_TWIN_WS_PORT` | `8765` | WebSocket bind port |
| `UAV_TWIN_AUTH_TOKEN` | *(empty)* | Shared auth token (Phase 3 will replace with OIDC) |
| `NEXT_PUBLIC_UAV_TWIN_WS_URL` | `ws://127.0.0.1:8765` | WebSocket URL for browser |

> ⚠️ **`NEXT_PUBLIC_*` env vars are published to the browser bundle.** Never set
> `UAV_TWIN_AUTH_TOKEN` via `NEXT_PUBLIC_*`. See [improvement_plan.md §8 risks](improvement_plan.md).

---

## Running the system

```bash
# One-command startup (starts MQTT broker, ECU sim, inference engine, simulator, Next.js)
./run.sh

# Frontend only (if backend is already running)
cd frontend && pnpm dev

# Tests
pytest tests/ -v

# Envelope contract test only
pytest tests/test_envelope.py -v
```

---

## Improvement roadmap

See [improvement_plan.md](improvement_plan.md) for the full 8-phase startup-isation plan,
including the 12-month sequencing, risks, and anti-goals.
