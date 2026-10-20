# Fault Family & Scenario Taxonomy

**Document:** `eval/FAULT_FAMILIES.md`  
**Standard:** Phase 0 Evaluation Protocol (Tasks C2, C3, C4)  
**System:** UAV Digital Twin (Rotax 914 F Propulsion Class)  

---

## 1. Overview & Partitioning Strategy

To guarantee honest evaluation and avoid optimistic bias, fault families and operational regimes are strictly partitioned:

| Partition | Scope | Purpose |
|---|---|---|
| **Training (F1–F4)** | Known physical failure families seen during model training | Establish nominal envelope and baseline fault recognition |
| **Validation (F1–F4)** | Same failure families, unseen flights and seeds | Hyperparameter tuning and model selection |
| **Held-Out Test (F5–F7)** | **Never seen during training or validation** | Test zero-shot generalization of the anomaly detector and physics twin |
| **Hard Negatives (HN1–HN3)** | Stressful, unusual, but healthy operations | Measure false alarm rate per flight hour under operational extremes |
| **Sensor Faults (SF1–SF3)** | Instrumentation degradation (not engine damage) | Evaluate separation of sensor faults from true propulsion emergencies |

---

## 2. Failure Families Specification

### A. Training Fault Families (Known)

#### Family F1: `cooling_degradation`
- **Physical Mechanism:** Cylinder 3 external fin blockage, cowl flap actuator failure, or cooling airflow deficit.
- **Sensor Signature:** Rapid CHT rise on cylinder 3 (>420°F); collateral CHT rise on cylinder 2; gradual oil temperature elevation (+30°F); nominal EGT.
- **Severity:** WARNING initially, trips CRITICAL at CHT > 430°F.
- **Ground Truth Trigger:** Cycle offset where thermal resistance step-change occurs.

#### Family F2: `injector_clog`
- **Physical Mechanism:** Fuel injector partial orifice clogging on cylinder 1.
- **Sensor Signature:** Cylinder 1 runs lean; EGT on cylinder 1 climbs >1640°F; overall fuel flow decreases by ~15–30%; fuel rail pressure drops.
- **Severity:** WARNING.
- **Ground Truth Trigger:** Cycle offset where fuel metering restriction initiates.

#### Family F3: `oil_leak`
- **Physical Mechanism:** Oil cooler line rupture, filter seal blowout, or scavenge pump failure.
- **Sensor Signature:** Severe drop in oil pressure (<30 PSI) combined with oil temperature spike (>230°F) and gradual mechanical friction vibration increase.
- **Severity:** CRITICAL emergency.
- **Ground Truth Trigger:** Cycle offset where hydraulic pressure loss begins.

#### Family F4: `misfire`
- **Physical Mechanism:** Ignition spark plug fouling or high-tension lead breakdown on cylinder 2.
- **Sensor Signature:** Cylinder 2 goes cold (EGT drops by >300°F); unburnt fuel causes RPM sag (~200 RPM) and large mechanical vibration signature (RMS > 2.5g, Kurtosis > 5.0).
- **Severity:** CRITICAL emergency.
- **Ground Truth Trigger:** Cycle offset where combustion cutoff occurs.

---

### B. Held-Out Fault Families (Task C2 — Frozen Test Set Only)

#### Family F5: `exhaust_valve_leak` (HELD OUT)
- **Physical Mechanism:** Exhaust valve seat erosion and thermal blowby on cylinder 4.
- **Sensor Signature:** Continuous flame blowby into exhaust runner causes cylinder 4 EGT to exceed 1670°F while CHT remains near nominal; periodic inter-cylinder thermal delta exceeding 90°F; gradual engine shaft power loss.
- **Training Status:** **Strictly absent from training set.**
- **Diagnostic Expectation:** Physics residual engine and Isolation Forest must detect abnormal cylinder temperature gradient without dedicated rule overfitting.

#### Family F6: `intake_manifold_leak` (HELD OUT)
- **Physical Mechanism:** Unmetered air ingestion downstream of turbocharger / throttle body due to cracked intake runner gasket.
- **Sensor Signature:** Manifold Absolute Pressure (MAP) drops significantly relative to commanded throttle; severe lean combustion across all cylinders (elevated EGT); engine hunting and unstable RPM idle oscillations.
- **Training Status:** **Strictly absent from training set.**
- **Diagnostic Expectation:** Physics model flags BSFC / volumetric efficiency residual discrepancy; Isolation Forest flags out-of-envelope MAP-RPM correlation.

#### Family F7: `bearing_spalling` (HELD OUT)
- **Physical Mechanism:** Micro-spalling and fatigue flaking on crankshaft main journal bearing race.
- **Sensor Signature:** Early sharp spike in vibration kurtosis (>6.0) while vibration RMS remains initially below critical redline; subsequent steady rise in vibration RMS (>2.8g) combined with oil temperature thermal rise from friction drag.
- **Training Status:** **Strictly absent from training set.**
- **Diagnostic Expectation:** System must flag impending mechanical destruction based on vibration distribution shape before catastrophically tripping raw RMS threshold.

---

### C. Hard Negatives (Task C3 — Healthy Engine Operational Extremes)

#### Hard Negative HN1: `hot_day_desert_climb`
- **Operating Conditions:** Outside Air Temperature (OAT) = 46°C (115°F), full climb power (2700 RPM) at low airspeed (1500 ft MSL).
- **Behavior:** Elevated CHT (~408°F) and elevated oil temperature (~210°F), but within certified manufacturer envelope. Engine is 100% mechanically healthy.
- **Target:** **Zero false alarms.** System must not trigger emergency shutdown or critical fault latching.

#### Hard Negative HN2: `rapid_tactical_throttle`
- **Operating Conditions:** Aggressive throttle excursions and evasive loiter maneuvers (sinusoidal RPM surges between 1400 and 2600 RPM).
- **Behavior:** Transient spikes in vibration RMS (~1.6g) and rapid fluctuations in fuel flow and manifold pressure. Engine is 100% healthy.
- **Target:** **Zero false alarms.** Hysteresis filter and dynamic limits must debounce transient spikes.

#### Hard Negative HN3: `sensor_noise_burst`
- **Operating Conditions:** Normal cruise loiter at 6000 ft MSL; external RF/EMI transmitter pulse couples noise bursts into telemetry bus (3x normal noise variance for 2 seconds).
- **Behavior:** High instantaneous sample variance across electrical and temperature lines. Engine is 100% healthy.
- **Target:** **Zero false alarms.** Sensor integrity monitor must flag transient noise floor increase without latching false engine fault.

---

### D. Sensor Fault Scenarios (Task C4 — Instrumentation Failure)

#### Sensor Fault SF1: `sensor_stuck`
- **Failure:** CHT thermocouple ADC freezes, reporting an unchanging 382.5°F regardless of throttle changes or cooling airflow.
- **Expected Classification:** `SensorIntegrityMonitor` flags `STUCK_SENSOR` on CHT channel (trust score drops to 0.0); engine twin uses virtual CHT sensor or marks sensor invalid rather than diagnosing engine failure.

#### Sensor Fault SF2: `sensor_drift`
- **Failure:** Oil pressure transducer calibration resistor drifts, causing reported oil pressure to steadily decline to 22 PSI over 30 seconds while oil temperature, RPM, and vibration remain perfectly nominal.
- **Expected Classification:** Contradiction check: lack of thermal or vibration correlate identifies transducer drift, separating sensor defect from true loss of lubrication.

#### Sensor Fault SF3: `sensor_dropout`
- **Failure:** Telemetry wiring intermittent open circuit causes EGT reading to drop to 0.0 / null intermittently.
- **Expected Classification:** `SensorIntegrityMonitor` flags `OUT_OF_BOUNDS / IMPOSSIBLE_VALUE` on EGT; telemetry integrity monitor rejects corrupted frames.
