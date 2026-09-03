# UAV Digital Twin — AI & Physics Models Specification

## 1. Mathematical & Algorithmic Foundations

This specification documents the mathematical formulation, architecture, training methodology, and operational equations for all analytical, physical, and predictive models in the **UAV Digital Twin Platform (v2.0)**.

---

## 2. Physics & Thermodynamic Engine (`physics_engine.py`)

The physics engine establishes a deterministic thermodynamic ground truth for the 4-stroke turbocharged internal combustion aero engine.

### 2.1 Indicated Mean Effective Pressure (IMEP) & Power Output

The thermodynamic power generation is governed by the Otto cycle:

$$P_{\text{indicated}} = \text{IMEP} \times V_d \times \frac{N}{2 \times 60} \quad [\text{Watts}]$$

where:
- $\text{IMEP} = P_{\text{manifold}} \times \left(\frac{r_c^\gamma - 1}{\gamma - 1}\right) \times \eta_{\text{thermal}}$
- $V_d = 1.211 \times 10^{-3} \text{ m}^3$ (Displacement)
- $N = \text{RPM}$ (Engine crankshaft speed)
- $r_c = 9.0$ (Compression ratio)
- $\gamma = 1.35$ (Specific heat ratio for hot combustion gas)

Brake Horsepower (BHP) accounts for mechanical frictional losses ($\eta_{\text{mechanical}} \approx 0.86$):

$$\text{BHP} = \frac{P_{\text{indicated}} \times \eta_{\text{mechanical}}}{745.7}$$

### 2.2 Thermodynamic Residual Calculation

At each 10 Hz epoch, the engine calculates expected baselines based on power output and operating altitude:

$$\text{CHT}_{\text{expected}} = T_{\text{ambient}} + k_1 \cdot \left(\frac{\text{RPM}}{1000}\right)^{1.3} + k_2 \cdot \text{BHP}$$

$$\text{EGT}_{\text{expected}} = 1480.0 + k_3 \cdot \left(\frac{\text{RPM}}{1000}\right)^{1.1} - k_4 \cdot (\text{Fuel Flow} - 9.0)$$

$$\text{OilPressure}_{\text{expected}} = 15.0 + 35.0 \cdot \left(\frac{\text{RPM}}{2400}\right) \cdot \left(\frac{210.0}{\text{OilTemp}}\right)^{0.5}$$

Residual deltas are then computed:
$$\Delta \text{CHT} = \text{CHT}_{\text{measured}} - \text{CHT}_{\text{expected}}$$
$$\Delta \text{EGT} = \text{EGT}_{\text{measured}} - \text{EGT}_{\text{expected}}$$
$$\Delta \text{OilP} = \text{OilPressure}_{\text{measured}} - \text{OilPressure}_{\text{expected}}$$

---

## 3. Deep LSTM Prognostics & Uncertainty Estimation (`inference.py`)

### 3.1 Network Architecture
- **Input Dimension**: $[B, 50, 3]$ (Batch size $B$, 50 temporal cycles window, normalized features $[\text{RPM}, \text{CHT}, \text{EGT}]$).
- **Layer 1**: LSTM (64 units, return sequences = True, dropout = 0.20, recurrent dropout = 0.10).
- **Layer 2**: LSTM (32 units, return sequences = False, dropout = 0.20).
- **Dense Layer 1**: Dense (16 units, activation = ReLU).
- **Output Layer**: Dense (1 unit, linear activation, outputting continuous RUL in cycles).
- **Loss Function**: Huber Loss ($\delta = 1.0$) for robust handling of extreme degradation outliers.

### 3.2 Monte Carlo Dropout Uncertainty Formulation
Rather than producing an overconfident point estimate, the network enables Dropout at test time ($T=10$ stochastic forward passes):

$$\mu_{\text{RUL}} = \frac{1}{T} \sum_{t=1}^{T} \hat{y}_t$$

$$\sigma_{\text{RUL}}^2 = \frac{1}{T} \sum_{t=1}^{T} (\hat{y}_t - \mu_{\text{RUL}})^2$$

A 90% confidence interval is constructed:
$$CI_{90\%} = \left[ \max(0, \mu_{\text{RUL}} - 1.645 \sigma_{\text{RUL}}), \quad \mu_{\text{RUL}} + 1.645 \sigma_{\text{RUL}} \right]$$

Failure probability within a 20-cycle lookahead is calculated as:
$$P(\text{Failure} \le 20 \text{ cycles}) = \Phi\left(\frac{20 - \mu_{\text{RUL}}}{\sigma_{\text{RUL}} + \epsilon}\right)$$
where $\Phi$ is the standard normal cumulative distribution function.

---

## 4. Multi-Channel Anomaly Detector (`anomaly_detector.py`)

### 4.1 Isolation Forest Specification
- **Features (8)**: RPM, CHT, EGT, Oil Pressure, Fuel Flow, Vibration RMS, Battery Voltage, Injection Timing.
- **Ensemble**: 100 Isolation Trees, max samples = 256.
- **Contamination Parameter**: $\nu = 0.05$ (5% expected anomalous boundary).
- **Anomaly Score**: Computed as path length $h(x)$ normalized by average path length $c(n)$:
$$s(x, n) = 2^{-\frac{\mathbb{E}(h(x))}{c(n)}}$$

### 4.2 Deterministic Aviation Rule Classifiers
Eight domain rules run in parallel with the Isolation Forest to detect known physical failure modes:
1. **OVERHEATING**: $\text{CHT} > 430^\circ\text{F}$ OR $\text{EGT} > 1650^\circ\text{F}$.
2. **LOW_OIL_PRESSURE**: $\text{Oil Pressure} < 30 \text{ PSI}$ while $\text{RPM} > 1000$.
3. **HIGH_VIBRATION**: $\text{Vibration RMS} > 2.5 \text{ g}$ OR $\text{Kurtosis} > 5.5$.
4. **MISFIRE_SUSPECT**: Cylinder CHT spread $\Delta \text{CHT}_{\text{max}} > 35^\circ\text{F}$ AND Kurtosis $> 4.0$.
5. **INJECTOR_ANOMALY**: Fuel flow drops $>15\%$ relative to expected RPM fuel demand.
6. **BEARING_WEAR**: Progressive vibration increase exceeding $+0.05 \text{ g/cycle}$.
7. **ALTERNATOR_LOW**: Bus voltage $< 23.5 \text{ V}$ with high electrical demand.
8. **COMBUSTION_INSTABILITY**: EGT oscillation amplitude $>40^\circ\text{F}$ at constant throttle.

---

## 5. Sensor Integrity & Fault Detection (`sensor_integrity.py`)

Independent per-channel trust evaluator:
- **Stuck Sensor**: $\text{Spread}_{30} = \max(x_{t-30:t}) - \min(x_{t-30:t}) < 0.05 \cdot \sigma_{\text{noise\_floor}}$.
- **Discontinuity**: $|x_t - x_{t-1}| > \Delta_{\text{max\_physical}}$.
- **Excessive Noise**: $\frac{\sigma_{\text{rolling}}(x_{t-10:t})}{\sigma_{\text{nominal}}} > 5.0$.
- **Cross-Sensor Inconsistency**: EGT / CHT temperature ratio outside the physical envelope $[1.8, 5.5]$.

---

## 6. AI + Physics Cross-Validation Matrix (`twin_consistency.py`)

The Digital Twin categorizes operating state into four mutually exclusive operational regimes:

$$\text{Case} = \begin{cases}
\mathbf{A} \quad (\text{Normal}) & \text{AI Agreement} > 55\% \land \text{Physics Agreement} > 65\% \\
\mathbf{B} \quad (\text{Real Engine Fault}) & \text{AI Disagreement} \land \text{Physics Disagreement} \\
\mathbf{C} \quad (\text{Sensor / Model Drift}) & \text{AI Normal} \land \text{Physics Disagreement} \\
\mathbf{D} \quad (\text{Possible False Positive}) & \text{AI Disagreement} \land \text{Physics Normal}
\end{cases}$$

Aggregate Twin Consistency Score:
$$\text{Score}_{\text{Twin}} = 0.40 \cdot \text{Agreement}_{\text{AI}} + 0.40 \cdot \text{Agreement}_{\text{Physics}} + 0.20 \cdot \text{Score}_{\text{SensorIntegrity}}$$

---

## 7. Counterfactual Simulation & Optimization (`whatif_engine.py`, `optimizer.py`)

### 7.1 Physics-Informed Counterfactual Scaling
When an operator inputs parameter overrides $(\text{RPM}_{\text{cf}}, \text{Alt}_{\text{cf}}, \text{Cooling}_{\text{cf}})$, physical states propagate:
$$\text{CHT}_{\text{cf}} = \text{CHT}_{\text{base}} \times \left(\frac{\text{RPM}_{\text{cf}}}{\text{RPM}_{\text{base}}}\right)^{1.3} \times (1 - \text{Cooling}_{\text{cf}})$$
$$\text{RUL}_{\text{cf}} = \text{RUL}_{\text{base}} \times \left(\frac{\text{Thermal Load}_{\text{base}}}{\text{Thermal Load}_{\text{cf}}}\right)^{1.5}$$

### 7.2 L-BFGS-B Optimization Formulation
$$\min_{\mathbf{x} = [\text{RPM}, \text{Alt}]} \quad f(\mathbf{x}) = -\mathcal{P}_{\text{mission}}(\mathbf{x}) + 10.0 \cdot \max(0, \text{CHT}(\mathbf{x}) - 400.0)^2$$
Subject to:
$$1600 \le \text{RPM} \le 2600$$
$$1000 \le \text{Alt} \le 25000$$

---

## 8. Mission Risk Engine (`mission_risk.py`)

The overall mission completion probability is formulated as:
$$\mathcal{P}_{\text{complete}} = \mathcal{P}_{\text{engine}} \times \mathcal{P}_{\text{thermal}} \times \mathcal{P}_{\text{time}} \times \mathcal{P}_{\text{environment}} \times \mathcal{P}_{\text{fault}}$$

Where:
- $\mathcal{P}_{\text{engine}} = \frac{\text{HealthIndex}}{100} \cdot (1 - 0.8 \cdot P_{\text{failure}})$
- $\mathcal{P}_{\text{thermal}} = 1.0 - \left(0.65 \cdot s_{\text{cht}}^2 + 0.35 \cdot s_{\text{egt}}^2\right)$
- $\mathcal{P}_{\text{time}} = 1.0 - \exp\left(-1.5 \cdot \frac{\text{RUL}}{\text{Required Cycles}}\right)$
- $\mathcal{P}_{\text{environment}} = \left(1 - \frac{\max(0, \text{Alt}-10000)}{200000}\right) \cdot \left(1 - \frac{\max(0, \text{OAT}-25)}{500}\right)$
- $\mathcal{P}_{\text{fault}} = 1.0 - (0.15 \cdot N_{\text{critical}} + 0.05 \cdot N_{\text{warning}})$

---

## 9. Model Evaluation & Benchmark Comparison

Benchmark evaluation conducted across 10,531 continuous aero-engine telemetry cycles with identical 80/20 train/test splits:

| Model Architecture | MAE (cycles) | RMSE (cycles) | $R^2$ Score | Latency (ms/sample) | Selected Role |
|---|---|---|---|---|---|
| **Linear Regression** | $37.15$ | $48.05$ | $0.4946$ | $0.0001 \text{ ms}$ | Linear Baseline |
| **Random Forest ($n=50$)** | $36.63$ | $48.42$ | $0.4869$ | $0.0035 \text{ ms}$ | Non-linear Baseline |
| **Gradient Boosting** | $36.22$ | $47.76$ | $0.5008$ | $0.0013 \text{ ms}$ | Boosting Baseline |
| **Deep LSTM (Selected)** | **$24.33$** | **$38.19$** | **$0.6619$** | **$0.6693 \text{ ms}$** | **Primary Prognostic Core** |

### Benchmark Analysis & Rationale
1. **Temporal Degradation Capture**: The Deep LSTM outperforms static tree ensembles by a wide margin ($\text{MAE} = 24.33$ vs $36.22$), proving that aero-engine degradation is an inherently sequential, history-dependent physical process.
2. **Deterministic Latency**: At $0.67 \text{ ms}$ per sample, the LSTM consumes less than $1\%$ of the $100 \text{ ms}$ telemetry cycle budget ($10 \text{ Hz}$), fully satisfying DO-178C Level B real-time deadlines.
3. **Uncertainty Quantification**: The LSTM with Monte Carlo Dropout is the only model providing calibrated epistemic uncertainty intervals without requiring large external ensembles.
