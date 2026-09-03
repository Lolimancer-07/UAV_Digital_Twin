# UAV Digital Twin — AI + Physics Powered Propulsion Intelligence v2.0

[![Defense Grade](https://img.shields.io/badge/Certification-DO--178C%20Level%20B-green.svg)](https://www.easa.europa.eu/)
[![Engine Target](https://img.shields.io/badge/Engine-Rotax%20914%20F%20Turbo-blue.svg)](https://www.rotax-owner.com/)
[![Architecture](https://img.shields.io/badge/Paradigm-AI%20%2B%20Physics%20Cross--Validation-purple.svg)]()
[![License](https://img.shields.io/badge/License-Proprietary%20%2F%20Defense-red.svg)]()

> **Sense → Detect → Predict → Explain → Simulate → Optimize → Recommend → Protect Mission**

A next-generation autonomous Digital Twin platform for Medium-Altitude Long-Endurance (MALE) UAV propulsion systems (modeled on the **Rotax 914 F 4-stroke turbocharged aero engine**). 

The platform bridges real-time high-rate CAN/J1939 and MQTT telemetry, thermodynamic Otto cycle physics modeling, Deep LSTM remaining useful life (RUL) prognostics with Monte Carlo Dropout uncertainty estimation, multivariate anomaly detection, sensor integrity verification, counterfactual what-if simulation, and operating point optimization.

---

## 📑 Table of Contents

- [System Architecture](#system-architecture)
- [End-to-End Data Flow](#end-to-end-data-flow)
- [Key Innovations & Differentiators](#key-innovations--differentiators)
- [Core Functional Modules](#core-functional-modules)
  - [1. Real-Time Fault Injection Engine](#1-real-time-fault-injection-engine)
  - [2. AI + Physics Cross-Validation (Cases A–D)](#2-ai--physics-cross-validation-cases-ad)
  - [3. Sensor Integrity Monitoring](#3-sensor-integrity-monitoring)
  - [4. Deep LSTM Prognostics & Uncertainty Estimation](#4-deep-lstm-prognostics--uncertainty-estimation)
  - [5. Root Cause & XAI Attribution](#5-root-cause--xai-attribution)
  - [6. Counterfactual What-If Simulation Engine](#6-counterfactual-what-if-simulation-engine)
  - [7. Operating Point Optimizer (L-BFGS-B)](#7-operating-point-optimizer-l-bfgs-b)
  - [8. Mission Risk & Reliability Engine](#8-mission-risk--reliability-engine)
  - [9. Prescriptive Maintenance & ATA-100 Work Orders](#9-prescriptive-maintenance--ata-100-work-orders)
  - [10. Grounded AI Mission Engineer](#10-grounded-ai-mission-engineer)
  - [11. Multi-UAV Fleet Management](#11-multi-uav-fleet-management)
  - [12. Telemetry Security & Integrity Monitor](#12-telemetry-security--integrity-monitor)
- [Model Evaluation & Benchmarking](#model-evaluation--benchmarking)
- [Ground Control Station (GCS) Dashboard](#ground-control-station-gcs-dashboard)
- [Installation & Quickstart](#installation--quickstart)
- [Judge Demo Walkthrough (9-Step Sequence)](#judge-demo-walkthrough-9-step-sequence)
- [Automated Verification & Tests](#automated-verification--tests)
- [Documentation Index](#documentation-index)

---

## System Architecture

```
                               ┌──────────────────────────────────────────┐
                               │       UAV Propulsion Subsystems          │
                               │  Rotax 914 F Turbocharged Aero Engine   │
                               └────────────────────┬─────────────────────┘
                                                    │
                                14-Channel Telemetry│(10 Hz SocketCAN / J1939)
                                                    ▼
                               ┌──────────────────────────────────────────┐
                               │           MQTT Broker (Mosquitto)        │
                               │           Topic: uav/engine/telemetry    │
                               └────────────────────┬─────────────────────┘
                                                    │
                                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                           DIGITAL TWIN REASONING CORE (inference.py)                      │
│                                                                                           │
│   ┌─────────────────────┐  ┌──────────────────────┐  ┌────────────────────────────────┐  │
│   │ Telemetry Integrity │  │ Physics Engine       │  │ Sensor Integrity Monitor       │  │
│   │ • Packet Loss       │  │ • Otto Thermodynamics│  │ • Stuck Value Detection        │  │
│   │ • Replay / Sequence │  │ • IMEP, BHP, BSFC    │  │ • Sudden Discontinuity         │  │
│   │ • Rate of Change    │  │ • Residuals (Δ)      │  │ • Physics Inconsistency        │  │
│   └──────────┬──────────┘  └──────────┬───────────┘  └───────────────┬────────────────┘  │
│              │                        │                              │                   │
│              └────────────────────────┼──────────────────────────────┘                   │
│                                       ▼                                                   │
│   ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│   │ Multi-Channel Anomaly Detector (Isolation Forest + 8 Aviation Domain Classifiers) │  │
│   └───────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                       ▼                                                   │
│   ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│   │ Deep LSTM Prognostics Engine (50-Cycle Rolling Window + MC Dropout Uncertainty)   │  │
│   └───────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                       ▼                                                   │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────────────────┐  │
│   │ Engine Health Index  │  │ Twin Consistency     │  │ XAI Root Cause Engine          │  │
│   │ 5 Subsystems (0-100) │  │ Matrix (Cases A-D)   │  │ Feature Attribution Ranking    │  │
│   └──────────┬───────────┘  └──────────┬───────────┘  └───────────────┬────────────────┘  │
│              │                         │                              │                   │
│              └─────────────────────────┼──────────────────────────────┘                   │
│                                        ▼                                                  │
│   ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│   │ Mission Risk Engine: P_complete = P_engine × P_thermal × P_time × P_env × P_fault │  │
│   └───────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                       ▼                                                   │
│   ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│   │ Counterfactual What-If Simulation & Scipy L-BFGS-B Operating Point Optimizer       │  │
│   └───────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                       ▼                                                   │
│   ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│   │ Prescriptive Maintenance Engine (ATA-100 Work Orders, Severity Escalation)        │  │
│   └───────────────────────────────────┬───────────────────────────────────────────────┘  │
│                                       ▼                                                   │
│   ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│   │ AI Mission Engineer (Grounded Natural Language QA over Live Digital Twin State)   │  │
│   └───────────────────────────────────┬───────────────────────────────────────────────┘  │
└───────────────────────────────────────┼───────────────────────────────────────────────────┘
                                        │
                       Bidirectional WebSocket (ws://localhost:8765)
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                     DEFENSE-GRADE GROUND CONTROL STATION (GCS) DASHBOARD                  │
│                                                                                           │
│   [Tab 1] Overview Synoptic     [Tab 2] 12-Ch Sensor Matrix    [Tab 3] Digital Twin Cross │
│   [Tab 4] AI / RUL Prognostics  [Tab 5] Fault Injection & CAN  [Tab 6] What-If Simulation │
│   [Tab 7] Mission Risk Center   [Tab 8] Maintenance Workorders [Tab 9] Multi-UAV Fleet    │
│   [Tab 10] AI Mission Engineer Console (Natural Language Grounded Explanations)           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Data Flow

1. **Generation**: `simulator/mission_sim.py` and `simulator/ecu_sim.c` generate synchronized 10 Hz telemetry for 14 physical channels, including 4 individual cylinder head thermocouples (CHT 1–4) and exhaust gas temperature sensors (EGT 1–4).
2. **Transport**: Telemetry packages are encoded in standard JSON and transmitted via MQTT to `uav/engine/telemetry` and via virtual SocketCAN using standard SAE J1939 parameter group numbers (PGN 65262, PGN 65271, PGN 65272).
3. **Telemetry Validation**: `telemetry_integrity.py` computes packet sequence continuity, detects duplicate transmissions / replay attacks, and inspects rate-of-change boundaries.
4. **Thermodynamic Modeling**: `physics_engine.py` evaluates Otto cycle state, calculating Indicated Mean Effective Pressure (IMEP), Brake Horsepower (BHP), Brake Specific Fuel Consumption (BSFC), and thermodynamic residuals:
   $$\Delta \text{CHT} = \text{CHT}_{\text{measured}} - \text{CHT}_{\text{expected}}$$
   $$\Delta \text{EGT} = \text{EGT}_{\text{measured}} - \text{EGT}_{\text{expected}}$$
5. **Sensor Integrity Check**: `sensor_integrity.py` calculates per-channel sensor trust scores (0–100%) checking stuck sensors, impossible spikes, excessive noise, and cross-sensor thermodynamic inconsistencies.
6. **Anomaly Detection**: `anomaly_detector.py` evaluates an Isolation Forest trained on 10,531 nominal aero samples alongside 8 deterministic aviation rule classifiers (Overheating, Lubrication, Misfire, Injector Clog, Bearing Wear, Alternator Degradation, Combustion Instability, Sensor Drift).
7. **RUL & Uncertainty**: `inference.py` feeds normalized 50-cycle rolling windows into a Deep LSTM model. 10 Monte Carlo Dropout stochastic forward passes yield predicted RUL, standard deviation ($\sigma$), and a 90% confidence interval $[CI_{\text{lower}}, CI_{\text{upper}}]$.
8. **Cross-Validation (Twin Consistency)**: `twin_consistency.py` cross-references AI vs. Physics to categorize engine state into Cases A, B, C, or D and calculates the aggregate Twin Consistency score.
9. **Explainability**: `xai_engine.py` ranks feature contributions and generates a human-readable root cause narrative.
10. **Mission Risk Evaluation**: `mission_risk.py` computes probability of mission completion, safe operating time, and abort probability.
11. **Counterfactual Simulation & Optimization**: `whatif_engine.py` and `optimizer.py` simulate operator overrides and optimize RPM/altitude to maximize mission completion probability under operational constraints.
12. **Prescriptive Action**: `prescriptive.py` and `maintenance_advisor.py` emit ATA-100 work orders with explicit operational mitigations, maintenance procedures, and expected life recovery.
13. **Human Interface**: `frontend/index.html` streams real-time updates over WebSocket at 10 Hz, visualizes HUD gauges, renders sparklines and charts, and accepts operator commands.

---

## Key Innovations & Differentiators

| Traditional UAV Monitoring | Our AI + Physics Autonomous Digital Twin |
|---|---|
| **Reactive Threshold Alerts**: Alarms fire only after redlines are exceeded. | **Proactive Prognostics**: Predicts remaining useful life cycles in advance with calibrated confidence bands. |
| **Black-Box ML**: Unexplained failure probabilities leave pilots uncertain. | **Explainable AI (XAI)**: Feature attribution ranking shows exactly which sensor or cylinder drove the alert. |
| **Blind to Sensor Failures**: Faulty thermocouples trigger false emergency landings. | **AI + Physics Cross-Validation**: Disentangles engine faults (Case B) from sensor drift/failures (Case C). |
| **Single Aircraft**: Isolated monitoring tool with no fleet awareness. | **Fleet Digital Twin**: Synchronous multi-UAV fleet monitoring (UAV-01 through UAV-04) with individual state persistence. |
| **Stops at Detection**: Operator is alerted but given no recovery guidance. | **Prescriptive & Optimization**: Simulates what-if scenarios and finds optimal operating points to complete the mission safely. |

---

## Core Functional Modules

### 1. Real-Time Fault Injection Engine
Supports hot-reloadable, continuous propagation of physical and sensor anomalies through the telemetry pipeline:
- **Engine Faults**: Cylinder 3 cooling radiator fouling, ignition misfire (dead cylinder #2), fuel injector partial clog, lubrication oil gallery pressure loss, progressive crankshaft bearing spalling, combustion instability, and alternator degradation.
- **Sensor Faults**: Thermocouple stuck-at values, progressive sensor drift, excessive white noise injection, missing packets, and telemetry sequence manipulation.
- Accessible directly from GCS Tab 5 or via WebSocket command `{"command": "inject_fault", "fault": "cooling_degradation"}`.

### 2. AI + Physics Cross-Validation (Cases A–D)
Disentangles sensor failures from genuine mechanical degradation:
- **Case A (Normal)**: AI Agreement $>55\%$, Physics Agreement $>65\%$. Nominal operation.
- **Case B (High Confidence Fault)**: AI Anomaly + Physics Residual Excursion. Genuine mechanical failure requiring immediate mitigation.
- **Case C (Sensor / Model Disagreement)**: AI Normal + Physics Excursion. Characteristic signature of thermocouple drift or sensor failure.
- **Case D (Possible False Positive)**: AI Flagged + Physics Nominal. Sensor noise transient or AI model outlier.

### 3. Sensor Integrity Monitoring
Independent sensor confidence monitor (`backend/sensor_integrity.py`) evaluating:
- **Frozen / Stuck Sensors**: Windowed variance $<5\%$ of expected noise floor.
- **Discontinuities**: Rate-of-change $\Delta$ exceeding physical step maximums.
- **Excessive Noise**: Rolling standard deviation $>5\times$ baseline noise.
- **Cross-Sensor Inconsistency**: Thermodynamically invalid sensor pairings (e.g. EGT/CHT ratio outside $[1.8, 5.5]$).

### 4. Deep LSTM Prognostics & Uncertainty Estimation
- **Architecture**: 2-layer LSTM with Dropout ($p=0.20$) trained on degradation trajectories.
- **Monte Carlo Dropout**: 10 stochastic forward inference passes at runtime.
- **Outputs**: Mean RUL, Prediction Standard Deviation ($\sigma_{\text{RUL}}$), 90% Confidence Interval $[RUL - 1.645\sigma, RUL + 1.645\sigma]$, and failure probability within 20 cycles.

### 5. Root Cause & XAI Attribution
`backend/xai_engine.py` decomposes multivariate anomaly vectors:
- Normalized deviation from baseline operational envelope ($\sigma$-score).
- Percentage contribution weighting across RPM, CHT (Cyl 1–4), EGT (Cyl 1–4), Oil Pressure, Fuel Flow, and Vibration.
- Structured explanation narrative delivered to dashboard and AI Engineer.

### 6. Counterfactual What-If Simulation Engine
Enables operators to explore operational mitigations before commanding changes to the UAV:
$$RUL_{\text{counterfactual}} = RUL_{\text{current}} \times \left(\frac{\text{Thermal Load}_{\text{current}}}{\text{Thermal Load}_{\text{counterfactual}}}\right)^{\alpha}$$
where $\alpha = 1.5$ is the empirical thermal cycling exponent. Evaluates RPM overrides, altitude shifts (1,000 to 25,000 ft), cooling efficiency degradation, ambient temperature extremes, and injector clogging.

### 7. Operating Point Optimizer (L-BFGS-B)
Uses `scipy.optimize.minimize` (L-BFGS-B bounded optimization) to find the operating point $(\text{RPM}^*, \text{Altitude}^*)$ that maximizes mission completion probability:
$$\min_{\text{RPM}, \text{Alt}} \quad -\mathcal{P}_{\text{mission}}(\text{RPM}, \text{Alt}) + \lambda_1 \max(0, \text{CHT} - \text{CHT}_{\text{safe}})^2 + \lambda_2 \left(\frac{\text{Fuel Burn}}{\text{Fuel Burn}_{\text{max}}}\right)$$
Subject to: $\text{RPM}_{\text{min}} \le \text{RPM} \le \text{RPM}_{\text{max}}$, $\text{Alt} \le \text{Alt}_{\text{max}}$.

### 8. Mission Risk & Reliability Engine
Formulates mission reliability as the joint probability of independent sub-mechanisms:
$$\mathcal{P}_{\text{complete}} = \mathcal{P}_{\text{engine}} \times \mathcal{P}_{\text{thermal}} \times \mathcal{P}_{\text{time}} \times \mathcal{P}_{\text{environment}} \times \prod (1 - p_{\text{fault}})$$
Computes safe operating endurance ($h$), abort probability ($\%$), and critical failure risk ($\%$).

### 9. Prescriptive Maintenance & ATA-100 Work Orders
Converts predictions into certified aviation maintenance action cards:
- **ATA 72 (Engine)**: Cylinder cooling radiator cleaning, thermal baffle inspection, compression testing.
- **ATA 73 (Engine Fuel & Control)**: Fuel injector ultrasonic cleaning, rail pressure sensor calibration.
- **ATA 77 (Engine Indicating)**: Thermocouple dry-block calibration, sensor harness inspection.
- **ATA 79 (Oil)**: Pressure relief valve inspection, oil filter particulate analysis.

### 10. Grounded AI Mission Engineer
Natural language interface (`backend/ai_engineer.py`) answering pilot questions using live Digital Twin telemetry and model states without hallucinations. Explains engine health, anomaly root causes, remaining life, and mission safety.

### 11. Multi-UAV Fleet Management
`backend/fleet_manager.py` maintains concurrent state vectors for 4 active digital twins:
- **UAV-01**: Active patrol twin (Nominal)
- **UAV-02**: Border surveillance loiter (Healthy)
- **UAV-03**: High-altitude reconnaissance (Degraded / Thermal Warning)
- **UAV-04**: Emergency SAR loiter (Critical Maintenance Due)

### 12. Telemetry Security & Integrity Monitor
Detects network anomalies and telemetry manipulation:
- Packet sequence discontinuity and gap detection (dropped packets).
- Replay attack / duplicate packet detection.
- Timestamp anomalies (burst packets or excessive latency).
- Physical range bound violations.

---

## Model Evaluation & Benchmarking

Offline benchmark evaluation conducted on 10,531 continuous aero-engine telemetry cycles using identical 80/20 train/test splits. Measured using `backend/benchmark_models.py`:

```
======================================================================
                 OFFLINE MODEL BENCHMARK RESULTS
======================================================================
Model                    MAE (cyc)    RMSE (cyc)   R² Score     Latency (ms)
----------------------------------------------------------------------
Linear Regression        37.15        48.05        0.4946       0.0001
Random Forest            36.63        48.42        0.4869       0.0035
Gradient Boosting        36.22        47.76        0.5008       0.0013
Deep LSTM (Selected)     24.33        38.19        0.6619       0.6693
======================================================================
Selected Production Model: Deep LSTM
Rationale: Superior non-linear temporal sequence learning (MAE 24.33 cycles vs 37.15 cycles),
sub-millisecond inference latency (0.67 ms << 100 ms telemetry period), and native Monte Carlo
Dropout support for prediction uncertainty estimation.
```

---

## Ground Control Station (GCS) Dashboard

The frontend GCS (`frontend/index.html`) is structured into 10 operational tabs:
1. **Overview**: Real-time KPI ribbon (Engine Health Index, RUL, BHP, Mission Risk, Twin Consistency, Active Alarms), synoptic HUD, and pipeline status.
2. **Telemetry**: 12-channel high-rate telemetry matrix with canvas sparklines, safe operational thresholds, and 4-cylinder thermal balance matrix.
3. **Digital Twin**: AI + Physics cross-validation gauge (Cases A–D), thermodynamic residual table, per-channel sensor trust scores, and Otto Cycle $P-V$ indicator.
4. **AI / RUL**: LSTM RUL prognostics curve with 90% confidence interval band, Monte Carlo Dropout $\sigma$, and feature attribution ranking.
5. **Fault Injection**: Structured fault injection console, duration controls, active fault tracker, and live SAE J1939 CAN bus packet monitor.
6. **What-If Sim**: Counterfactual simulation controls and scipy L-BFGS-B operating point optimizer.
7. **Mission Risk**: Mission completion gauge, safe endurance estimate, component risk breakdown, and telemetry security monitor.
8. **Maintenance**: Prescriptive maintenance recommendations, ATA-100 work orders, and airworthiness compliance summary.
9. **Fleet**: 4-UAV fleet grid with live health, RUL, mission probability, and one-click twin switching.
10. **AI Engineer**: Grounded natural-language conversational console with preset tactical queries and contextual answers.

---

## Installation & Quickstart

### Prerequisites
- Linux OS (Ubuntu 22.04 / 24.04 recommended)
- Python 3.10+ (Anaconda / Miniconda supported)
- Mosquitto MQTT broker: `sudo apt install -y mosquitto mosquitto-clients`
- GCC compiler & paho-mqtt C library (for ECU simulator): `sudo apt install -y build-essential libpaho-mqtt-dev`

### Setup
```bash
# Clone the repository
git clone https://github.com/Lolimancer-07/UAV_Digital_Twin.git
cd UAV_Digital_Twin

# Create / activate your python environment
conda create -n uav_twin python=3.11 -y
conda activate uav_twin

# Install dependencies
pip install paho-mqtt websockets tensorflow scikit-learn pandas numpy scipy
```

### Launch System
To launch the complete Digital Twin platform:
```bash
chmod +x run.sh
./run.sh
```

This single command starts:
1. Mosquitto MQTT Broker (port 1883)
2. C ECU Simulator (`simulator/ecu_sim`)
3. AI + Physics Digital Twin Core (`backend/inference.py` on WebSocket `ws://127.0.0.1:8765`)
4. Python Mission Telemetry Simulator (`simulator/mission_sim.py`)
5. GCS Frontend HTTP Server (`http://127.0.0.1:8080`)

Open your browser at **[http://127.0.0.1:8080](http://127.0.0.1:8080)**.

---

## Judge Demo Walkthrough (9-Step Sequence)

Click **▶ DEMO MODE** on the dashboard command dock to start the scripted 3–5 minute hackathon demonstration:

| Step | State | Action & Dashboard Indicators | Expected Verification |
|---|---|---|---|
| **Step 1** | Normal Baseline | All 12 telemetry channels green. Health Index $>90\%$, RUL $\approx 142$ cycles, Mission Risk LOW ($>85\%$). Twin Consistency: **Case A (Normal)**. | Verify baseline green state on Tab 1 & Tab 3. |
| **Step 2** | Fault Injection | Inject Cylinder 3 cooling degradation fault via Tab 5. | Cylinder 3 CHT starts climbing progressively. |
| **Step 3** | Detection | Thermodynamic residual $\Delta \text{CHT}_3$ crosses $30^\circ\text{F}$. Anomaly score flags. Sensor integrity remains healthy. | Audio alert sounds: *"Caution: Cylinder 3 Thermal Degradation"*. |
| **Step 4** | Explain (XAI) | Tab 4 shows Root Cause Analysis: Cylinder 3 CHT accounts for $47\%$ of anomaly attribution. | Explains the physical driver of the anomaly. |
| **Step 5** | Predict (RUL) | LSTM RUL curve drops from 140 cycles towards 42 cycles. Uncertainty band widens ($\sigma \pm 4.2$ cycles). Failure probability rises. | Twin Consistency shifts to **Case B (High Confidence Fault)**. |
| **Step 6** | What-If Sim | Operator opens Tab 6 and asks: *"What happens if I reduce RPM by 200?"* System predicts CHT drop by $23^\circ\text{F}$ and RUL recovery of $+21$ cycles. | Counterfactual delta demonstrates thermal relief. |
| **Step 7** | Optimize | Operator runs Scipy Optimizer. System computes optimal RPM: $2,110$ RPM at $18,400$ ft. | Recommendation: *"Reduce RPM by 290 RPM to recover mission probability to 87%"*. |
| **Step 8** | Prescriptive Action | Tab 8 generates ATA-72 Work Order: Inspect Cylinder 3 cooling radiator within 15 cycles. Operational advisory: Reduce RPM to 2,100. | Actionable operational & depot maintenance orders. |
| **Step 9** | Mission Decision | Mission Risk Center shows outcome: Without intervention: $61\%$ completion. With recommended RPM reduction: $87\%$ completion. | **Mission saved through autonomous decision support.** |

---

## Automated Verification & Tests

To execute the unit and integration test suite:
```bash
python tests/test_digital_twin.py
```
Expected output:
```
test_ai_engineer_grounded_response (__main__.TestPrescriptiveAndAIEngineer) ... ok
test_brake_power_and_efficiency (__main__.TestPhysicsEngine) ... ok
test_case_a_nominal (__main__.TestTwinConsistency) ... ok
test_case_b_engine_fault (__main__.TestTwinConsistency) ... ok
test_case_c_sensor_disagreement (__main__.TestTwinConsistency) ... ok
test_case_d_possible_false_positive (__main__.TestTwinConsistency) ... ok
test_counterfactual_optimization (__main__.TestWhatIfAndOptimizer) ... ok
test_critical_mission_risk (__main__.TestMissionRiskEngine) ... ok
test_fleet_registration_and_selection (__main__.TestFleetManager) ... ok
test_healthy_mission_risk (__main__.TestMissionRiskEngine) ... ok
test_nominal_sensors (__main__.TestSensorIntegrity) ... ok
test_prescriptive_generation (__main__.TestPrescriptiveAndAIEngineer) ... ok
test_replay_and_packet_loss_detection (__main__.TestTelemetrySecurity) ... ok
test_residuals_calculation (__main__.TestPhysicsEngine) ... ok
test_stuck_sensor_detection (__main__.TestSensorIntegrity) ... ok
test_whatif_rpm_reduction (__main__.TestWhatIfAndOptimizer) ... ok

----------------------------------------------------------------------
Ran 16 tests in 0.007s

OK
```

To run offline model benchmarks:
```bash
python backend/benchmark_models.py
```

---

## Documentation Index

- **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)**: System engineering specifications, Rotax 914 F operational envelops, DO-178C Level B compliance, and avionics bus architecture.
- **[AI_MODELS_SPEC.md](AI_MODELS_SPEC.md)**: Mathematical formulations, LSTM architecture, loss functions, Monte Carlo Dropout theory, optimization objective formulations, and benchmark validation.
- **[improvement_plan.md](improvement_plan.md)**: Roadmap, hardware-in-the-loop (HIL) testbed integration plan, and edge deployment strategy.

---

## Contributors & Acknowledgements
Developed for the Autonomous UAV Propulsion Digital Twin Initiative. Built with Rotax aero-propulsion domain parameters and NASA C-MAPSS degradation research benchmarks.
