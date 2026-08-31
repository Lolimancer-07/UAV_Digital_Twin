# MALE UAV Aero Piston Engine Digital Twin — Complete Project Dossier & Context

> **Quick Summary for AI / Developers**: This document contains the complete context, architectural breakdown, dataset origins, data pipelines, AI models, networking protocols, and file responsibilities for the **UAV Digital Twin** repository. Read this file to understand the full system state without needing chat history.

---

## 1. Problem Statement & Mission Context

### Problem Statement Title
**AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs.**

### Operational Background
* **Target Platform**: Medium Altitude Long Endurance (MALE) UAVs operating long-duration Intelligence, Surveillance, and Reconnaissance (ISR) missions (e.g. 18,000+ ft altitude, 24+ hour endurance).
* **Core Risk**: Aero piston engine failures (e.g. Rotax 914 Turbo / Austro AE300 class) during flight lead to mission abort, catastrophic asset loss, or crash in hostile territory.
* **Flaw of Conventional Monitoring**: Traditional UAV engine management systems rely on reactive, single-sensor threshold warnings (e.g., alert triggers only *after* oil pressure drops or cylinder heads melt).
* **The Digital Twin Solution**: An indigenous, synchronized virtual representation combining **Real-Time Sensor Ingestion + Thermodynamic Physics Baseline Models + Hybrid AI Prognostics & Explainable Diagnostics (XAI) + Defense Ground Control Station (GCS) HMI**.

---

## 2. End-to-End System Architecture

```
                               ┌────────────────────────────────────────────────────────┐
                               │             LAYER 1: PROPULSION SIMULATION             │
                               │  - mission_sim.py / ecu_sim.c                          │
                               │  - 14-Channel Telemetry + SAE J1939 CAN Bridge         │
                               │  - ISA Altitude & Hot Desert Environmental Modeler     │
                               │  - Live Interactive Fault Injection Deck               │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │ MQTT (tcp://localhost:1883)
                                                          │ Topic: 'uav/engine/telemetry'
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │           LAYER 2: DIGITAL TWIN AI CORE                │
                               │  - backend/inference.py (Real-Time Ingestion Hub)      │
                               │  - backend/physics_engine.py (Otto Cycle P-V & Resids) │
                               │  - backend/uav_rul_model.h5 (Deep Stacked LSTM)        │
                               │  - backend/anomaly_model.pkl (Isolation Forest)        │
                               │  - backend/xai_engine.py (SHAP-like Root-Cause XAI)    │
                               │  - backend/health_index.py (Subsystem Health Scores)   │
                               │  - backend/maintenance_advisor.py (ATA-100 Advisories) │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │ WebSocket (ws://localhost:8765)
                                                          │ Bidirectional Telemetry & Telecommand
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │         LAYER 3: DEFENSE GCS GROUND STATION            │
                               │  - frontend/index.html                                 │
                               │  - Tab 1: Mission Telemetry & CAD Synoptic Schematic   │
                               │  - Tab 2: Deep LSTM RUL Curve & XAI Waterfall Chart    │
                               │  - Tab 3: Real-Time Thermodynamic P-V Indicator Loop   │
                               │  - Tab 4: Live SAE J1939 CAN Frame Sniffer (FDR)       │
                               │  - Tab 5: ATA-100 Maintenance Work Orders & Dossier    │
                               │  - Tactical Master Caution Speech Synthesizer          │
                               └────────────────────────────────────────────────────────┘
```

---

## 3. Directory & File Inventory

| Path | Language | Core Responsibility |
|---|---|---|
| `run.sh` | Bash | **Master Launcher**: Checks Mosquitto, compiles C simulator, starts `backend/inference.py`, starts `simulator/mission_sim.py`, and handles clean `Ctrl+C` shutdown. |
| `train_models.py` | Python | **Unified AI Pipeline**: End-to-end dataset prep, LSTM training, Scaler export, and Isolation Forest anomaly training in a single command. |
| `AI_MODELS_SPEC.md` | Markdown | Technical spec sheet covering AI architectures, hyper-parameters, loss functions, formulas, and latency benchmarks. |
| `backend/inference.py` | Python | Central Digital Twin microservice. Subscribes to MQTT at 10 Hz, executes AI inference, runs thermodynamic physics model, evaluates XAI, and streams JSON over WebSocket (`:8765`). |
| `backend/physics_engine.py` | Python | Physics-Informed Engine Model. Computes 4-stroke Otto cycle P-V coordinates, theoretical Brake Power (BHP), BSFC ($g/kWh$), and physical residuals ($\Delta = \text{Sensor} - \text{Model}$). |
| `backend/anomaly_detector.py` | Python | Multi-layer anomaly detector combining 300-tree Isolation Forest with domain expert rules covering all 8 Problem Statement fault categories. |
| `backend/xai_engine.py` | Python | Explainable AI engine decomposing multivariate anomalies into per-feature percentage attribution bars with natural-language diagnostic explanations. |
| `backend/health_index.py` | Python | Composite 0–100 Engine Health Index (EHI) with sub-scores for Thermal, Lubrication, Mechanical, Combustion, and Electrical subsystems. |
| `backend/maintenance_advisor.py` | Python | Autonomous maintenance advisor generating ATA-100 aerospace work orders (Chapters 72, 73, 75, 77, 79, 80) with urgency deadlines and step-by-step repair checklists. |
| `backend/uav_rul_model.h5` | Keras H5 | Pretrained Deep Stacked LSTM neural network predicting Remaining Useful Life (RUL) with 95% Confidence Intervals. |
| `backend/scaler.pkl` | Pickle | Feature scaling weights for `['rpm', 'cht', 'egt']`. |
| `backend/anomaly_model.pkl` | Pickle | Trained Isolation Forest bundle (300 estimators on healthy engine state). |
| `simulator/mission_sim.py` | Python | Multi-channel engine telemetry generator with 5 environmental flight profiles, multi-cylinder CHT/EGT gradients, interactive fault injection, and playback speed control. |
| `simulator/can_bridge.py` | Python | SAE J1939 Aero & UAVCAN frame encoder (PGN 61444, 65262, 65263, 65266, 65271, 65168). |
| `simulator/ecu_sim.c` | C | Native C high-frequency telemetry broadcast node using `libpaho-mqtt3c`. |
| `frontend/index.html` | HTML/JS | Defense-grade Ground Control Station (GCS) user interface with 5-tab cockpit console, interactive CAD synoptic diagram, P-V indicator, CAN sniffer, and voice annunciator. |
| `data/telemetry_ready.csv` | CSV | Preprocessed NASA CMAPSS propulsion dataset tailored for aero piston engine telemetry. |

---

## 4. Telemetry Channels & Sensor Specifications

The system tracks **14 synchronized parameters** at 10 Hz:

1. **Engine RPM**: 800–2800 RPM (continuous rating 2400 RPM).
2. **Cylinder Head Temp (CHT)**: Multi-cylinder (Cyl 1–4 array + Average in °F). Nominal $< 400^\circ\text{F}$, Critical $> 435^\circ\text{F}$.
3. **Exhaust Gas Temp (EGT)**: Multi-cylinder (Cyl 1–4 array + Average in °F). Nominal $< 1600^\circ\text{F}$, Critical $> 1670^\circ\text{F}$.
4. **Oil Gallery Pressure**: PSI. Nominal $45-75\text{ PSI}$, Critical $< 35\text{ PSI}$.
5. **Oil Sump Temperature**: °F. Nominal $170-205^\circ\text{F}$, Critical $> 240^\circ\text{F}$.
6. **Fuel Flow Rate**: L/hr. Proportional to RPM and power demand.
7. **Fuel Rail Pressure**: bar. Nominal $2.8-3.2\text{ bar}$, Critical $< 2.0\text{ bar}$.
8. **Vibration Signatures (RMS)**: $g\text{ RMS}$. Nominal $< 1.0g$, Critical $> 2.8g$.
9. **Vibration Kurtosis**: Crest factor index. Nominal $2.8-3.5$, Bearing wear $> 4.5$.
10. **Electrical Bus Voltage**: V DC. Nominal $13.6-14.2\text{ V}$, Low alternator $< 12.4\text{ V}$.
11. **Alternator Bus Current**: Amps. Nominal $15-35\text{ A}$.
12. **Ignition Timing Advance**: °BTDC. Nominal $26-30^\circ\text{BTDC}$.
13. **Manifold Absolute Pressure (MAP)**: kPa. Sea level $96-102\text{ kPa}$, High altitude $50-70\text{ kPa}$.
14. **Ground Truth RUL**: Remaining cycles until overhaul.

---

## 5. Fault Taxonomy & Detection Mechanics

The system detects and isolates all **8 mandated fault categories**:

1. **Ignition Misfire (`MISFIRE_SUSPECT`)**: Cyclic RPM drop, unburned fuel EGT excursion, single cylinder temperature collapse.
2. **Injector Abnormalities (`INJECTOR_ANOMALY`)**: Rail pressure drop below 2.2 bar, fuel flow vs RPM mismatch.
3. **Cooling System Degradation (`COOLING_DEGRADATION`)**: CHT rise combined with elevated oil temperature due to radiator fouling or airflow starvation.
4. **Lubrication Breakdown (`LOW_OIL_PRESSURE`, `LUBRICATION_ISSUE`)**: Oil pressure drops below hydrodynamic minimum ($< 38\text{ PSI}$) or oil temperature spikes $> 230^\circ\text{F}$.
5. **Sensor Drift / Failure (`SENSOR_DRIFT`)**: Thermocouple open-circuit ($< 1200^\circ\text{F}$ when CHT is high) or physically impossible cross-sensor gradients.
6. **Combustion Instability (`COMBUSTION_INSTABILITY`)**: Ignition timing retardation with high-frequency mechanical vibration jitter.
7. **Overheating Runaway Trends (`OVERHEATING`)**: CHT $> 420^\circ\text{F}$ or EGT $> 1650^\circ\text{F}$.
8. **Abnormal Vibration Signatures (`HIGH_VIBRATION`)**: Vibration RMS $> 2.2g$ or kurtosis $> 4.2$ indicating bearing spalling or shaft imbalance.

---

## 6. Protocols & Data Formats

### A. MQTT Broker
- **Host / Port**: `localhost:1883`
- **Topic**: `uav/engine/telemetry`
- **Payload**: JSON packet broadcast at 10 Hz containing raw telemetry, environmental mode, and CAN frame bursts.

### B. WebSocket Server
- **Host / Port**: `ws://localhost:8765`
- **Direction**: Bidirectional
- **Inbound Commands from Frontend**:
  - `{"command": "set_profile", "profile": "HIGH_ALTITUDE"}`
  - `{"command": "set_speed", "speed": 2.0}`
  - `{"command": "set_paused", "paused": true}`
  - `{"command": "inject_fault", "fault": "oil_leak"}`
  - `{"command": "clear_faults"}`
- **Outbound Stream to Frontend**: Synchronized Digital Twin payload containing raw telemetry, RUL prognostics + CI bounds, physics P-V points, XAI attribution, health index, ATA work-orders, and CAN traffic.

### C. SAE J1939 CAN Bus Frames
Encoded in standard 29-bit format:
- `0x0CF00400` (PGN 61444 / EEC1): Engine Speed & Torque
- `0x18FEEE00` (PGN 65262 / ET1): CHT & Oil Temperature
- `0x18FEEF00` (PGN 65263 / EFLP): Oil Pressure
- `0x18FEF200` (PGN 65266 / LFE): Fuel Flow Rate
- `0x18FEF700` (PGN 65271 / VEP): Bus Voltage & Current
- `0x18FE9000` (PGN 65168 / VIB): Vibration RMS & Kurtosis

---

## 7. How to Execute, Train & Test

### Run the Complete Stack
```bash
./run.sh
```
*Opens Mosquitto, starts AI inference, launches mission simulator, and connects at `ws://localhost:8765`.*  
*Open `frontend/index.html` in browser.*

### Retrain All AI Models
```bash
./train_models.py
```
*Re-generates `backend/uav_rul_model.h5`, `backend/scaler.pkl`, and `backend/anomaly_model.pkl`.*

### Clean Stop
Press `Ctrl+C` in the running terminal. `run.sh` cleanly terminates all background Python and C processes with zero orphaned processes.
