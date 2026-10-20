# Prior-Art & Patent Landscape Analysis

**System:** UAV Engine Digital Twin Platform  
**Document Ref:** DOC-PRIOR-ART-2026-V1  
**Audience:** Founders, Patent Attorneys, Technical Diligence Auditors  
**Companion Reference:** `STARTUP_BLUEPRINT.md §11`

---

## 1. Executive Summary

This document establishes the prior-art positioning and IP landscape for the AeroTwin Propulsion Digital Twin. Each differentiating capability is categorized across three standard defense/commercial IP postures:
1. **Novel Combination:** Integration of two distinct domains (e.g. thermodynamics + cyber-intrusion detection) not previously paired in aerospace prognostics.
2. **Known but Productized:** Academic or lab-grade techniques (e.g. split conformal prediction, Rainflow counting) engineered into an integrated real-time edge runtime.
3. **Proprietary Moat:** Airframe-specific calibrated models, physics residuals, and signed evidence ledgers.

---

## 2. Feature-by-Feature Prior-Art Matrix

| Feature | Description | Prior-Art Citations & Search Query | Positioning |
|:---|:---|:---|:---:|
| **F1: Life Burn Rate** | Engine life treated as consumable fuel via Rainflow cycle counting & Coffin-Manson cumulative damage. | • US Patent 8,406,948 B2 (*Engine component life consumption monitoring*)<br>• ASTM E1049-85 (*Cycle Counting in Fatigue Analysis*) | **Known but Productized**<br>Transformed from post-flight batch NDT into live cockpit/GCS gauge. |
| **F2: Life-Aware Mission Planner** | Multi-segment Pareto optimization balancing mission success vs life burn vs fuel. | • US Patent 9,697,736 B2 (*Flight path optimization for engine life*)<br>• Search: `remaining useful life + mission planning + engine` | **Novel Combination**<br>Combines live degraded engine forward physics with multi-objective Pareto dispatch. |
| **F3: Engine-Aware Contingency Footprint** | Dynamic reachable area cone and emergency site ranking under degraded power state. | • FAA AC 90-89B (*Amateur-Built Aircraft Flight Testing - Glide Range*)<br>• Search: `aircraft forced landing + engine degradation forecast` | **Novel Combination**<br>Connects conformal RUL samples to variable gliding cones with wind vector integration. |
| **F4: Physics Firewall** | Detection of spoofed or replayed CAN/telemetry frames using thermodynamic invariants. | • US Patent 10,742,668 B2 (*Cyber-physical intrusion detection*)<br>• Search: `CAN + thermodynamic + intrusion` | **Novel Combination**<br>Enforces Otto-cycle First Law conservation to reject individually plausible cyber attacks. |
| **F5: Conformal Prognostics** | Finite-sample coverage guarantees ($1 - \alpha$) via split conformal prediction & ACI. | • Vovk et al. (*Algorithmic Learning in a Random World*, 2005)<br>• Gibbs & Candès (*Adaptive Conformal Inference*, NeurIPS 2021) | **Known but Productized**<br>Applied distribution-free coverage guarantees to turbomachinery/piston RUL. |
| **F6: Per-Airframe Self-Calibration** | Hierarchical Bayesian online adaptation with anti-poisoning update gating. | • Gelman et al. (*Bayesian Data Analysis*, 2013)<br>• Search: `online Bayesian engine baseline calibration` | **Novel Combination**<br>Bayesian tail adaptation frozen by anomaly/firewall gates to stop baseline poisoning. |
| **F7: Abstention-First Alerting** | Explicit `UNCERTAIN` state on OOD data; flight-phase dynamic thresholds & alert budget. | • Hendrycks & Gimpel (*Baseline for Detecting Misclassified and Out-of-Distribution Examples*, 2017) | **Known but Productized**<br>Mitigates operator alarm fatigue through flight-phase budgets. |
| **F8: Causal Root Cause** | Interventional graph traversal (cooling $\to$ CHT $\to$ oil temp $\to$ oil press). | • Pearl (*Causality: Models, Reasoning, and Inference*, 2009)<br>• Search: `causal graph + aircraft engine diagnostics` | **Novel Combination**<br>Replaces black-box SHAP attributions with structural causal DAG traversals. |
| **F9: Virtual Sensors** | Analytical redundancy reconstructing dropped sensors with hysteresis switchover. | • NASA TM-107386 (*Analytical Redundancy for Aircraft Sensor Fault Detection*) | **Known but Productized**<br>Integrated into edge runtime with automatic synthetic provenance flags. |
| **F10: Engine Reliability Passport** | Hash-chained flight blocks signed by edge device keys into an exportable evidence pack. | • ISO/IEC 18014 (*Time-stamping services & hash-chaining*)<br>• Search: `hash chain + engine maintenance record` | **Novel Combination**<br>Cryptographic digital passport tracking condition across airframes and MRO facilities. |
| **F14: Twin Trust Score** | Self-auditing confidence metric combining prediction error, drift, sensor trust, and OOD. | • Search: `digital twin self-audit confidence metric` | **Novel Combination**<br>Explicit self-auditing trust metric warning operators when twin should not be trusted. |

---

## 3. Commercial Landscape Comparison

| Competitor / System | Primary Focus | Differentiator vs AeroTwin Platform |
|:---|:---|:---|
| **GE / Collins Micro-Q** | Commercial turbofan health monitoring | AeroTwin targets tactical piston/turboprop UAVs with edge offline runtime & zero TF footprint. |
| **Dynon / Garmin Engine Monitors** | Threshold-based cockpit warnings | Passive threshold alerts trip on thermocouple noise; AeroTwin discriminates sensor drift from real failure. |
| **Uptake / SparkCognition** | Generic industrial predictive maintenance | Lack thermodynamic first-principles cross-validation; susceptible to false alarms on aero dynamics. |

---

## 4. Patent Filing Recommendations

Before commercial disclosure at defense/commercial expos:
1. File provisional patent application on **Physics Firewall for Cyber-Physical Telemetry Integrity** (Method of detecting spoofed avionics frames via thermodynamic energy balance residuals).
2. File provisional patent application on **Life-Aware Contingency Reachability Engine** (Method of evaluating emergency recovery landing envelopes based on sampled prognostics).
