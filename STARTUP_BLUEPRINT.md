# UAV Engine Digital Twin — Startup Blueprint (Detailed)

> Companion to `ROADMAP.md`. Based on a documentation-level review of the repo (`PROJECT_CONTEXT.md`, `improvement_plan.md`, directory layout). Verify against source before committing.
>
> **On novelty:** I cannot prove that no one has ever built a given idea. The features in Section 3 are chosen because they are uncommon in commercial UAV engine-health products or are uncommon *as a combination*. Before claiming novelty to investors, run the prior-art checklist in Section 11.

---

## 1. Product Thesis

**One-liner:** *Treat engine life like fuel.* Know how much life each flight consumes, plan missions around it, and prove it with tamper-evident records.

**Core questions the product answers**

1. Is it safe to launch this tail number on this mission today? (dispatch confidence)
2. How much engine life will this mission burn, and can we spend it differently? (life budgeting)
3. If something fails mid-flight, where can the aircraft still safely go? (engine-aware contingency)
4. Does this engine need overhaul now, or can the interval be extended? (condition-based overhaul, with evidence)

**Target segment:** operators of piston and heavy-fuel UAVs (MALE class and smaller), MRO shops, engine test cells, insurers of UAV fleets.

---

## 2. Gap Analysis of Current Repo

| Area | Observation (from docs) | Risk | Action |
|------|-------------------------|------|--------|
| Data | NASA C-MAPSS turbofan data relabeled for piston use | Fails due diligence | Replace or relabel as synthetic; build physics-first dataset |
| Model inputs | Scaler covers `rpm, cht, egt` only; system has 14 channels | Model ignores most signals | Train on all channels with per-channel normalization from engine profile |
| Validation | Simulator generates faults and the same stack detects them | Circular | Held-out fault families + real logs |
| Uncertainty | MC Dropout, 10 passes | No coverage guarantee | Conformal intervals |
| Authority | Phase 4: AI feeds throttle actuators | Certification (DO-178C, DO-326A) | Advisory-only, runtime-assurance envelope |
| Security | Local MQTT/WebSocket, no auth mentioned | Not deployable | mTLS, signed models, authz |
| Artifacts | `.h5`, `.pkl` | Unsafe to load, unversioned | ONNX + manifest + signature |
| Generality | One engine class hard-coded | Cannot scale to customers | Engine profiles |
| Frontend | Single `index.html`, 10 tabs | Hard to maintain | Component app, typed API client |
| Ops | `run.sh` | No reproducibility | Docker Compose, CI |

---

## 3. Differentiating Features

Each feature lists: idea, why it is uncommon, method, required inputs, validation, effort (S/M/L), and key risk.

### F1. Life Burn Rate — "Engine life as a fuel gauge"

- **Idea:** a live gauge of how much engine life is being consumed per flight hour, plus a *life budget* per mission, shown next to fuel.
- **Why uncommon:** most systems alarm on thresholds or output a remaining-life number. Few expose life as a consumable that can be planned like fuel.
- **Method:**
  - Rainflow counting on CHT/EGT/oil-temperature histories to extract thermal cycles.
  - Cumulative damage via Miner's rule with Coffin–Manson style cycle weighting for thermal fatigue.
  - Additional damage terms: time above temperature limits (creep-like), vibration RMS/kurtosis exposure, oil-pressure excursions, cold-start events.
  - Output a **relative Life Burn Index** (units: "equivalent nominal flight hours"). Treat it as relative until calibrated against teardown or overhaul data from real engines.
- **Inputs:** CHT[1–4], EGT[1–4], oil temp/pressure, vibration, RPM, MAP.
- **Validation:** monotonic consistency tests; correlation with overhaul findings from design partners; sensitivity analysis on damage exponents.
- **Effort:** M. **Risk:** absolute calibration needs real teardown data; ship as relative index first.

### F2. Life-Aware Mission Planner

- **Idea:** given a route and loiter requirement, find altitude/RPM/mixture schedules that meet the mission while minimizing Life Burn and respecting fuel.
- **Why uncommon:** route planners optimize time, fuel, risk from terrain/weather. Engine life is rarely a planner cost term.
- **Method:** extend the existing operating-point optimizer (L-BFGS-B) to a multi-segment problem. Cost = `w_life · LifeBurn + w_fuel · Fuel + w_time · Time`, with constraints from engine profile limits. Use the physics engine as the forward model; use a learned residual correction per airframe.
- **Output:** Pareto set (e.g., "fastest", "cheapest life", "balanced") with predicted mission completion probability.
- **Validation:** compare planned vs. replayed flights; check that the Pareto front is non-trivial.
- **Effort:** M. **Risk:** depends on F1 and a calibrated physics forward model.

### F3. Engine-Aware Contingency Footprint ("where can I still go?")

- **Idea:** when degradation appears, compute the reachable region the aircraft can safely cover under the *predicted degraded engine state*, and rank candidate landing sites.
- **Why uncommon:** emergency-landing aids usually assume a fixed glide or fuel range. Tying the reachable set to a live degradation forecast is rare.
- **Method:**
  - Sample future engine-state trajectories from the conformal RUL distribution (F5).
  - For each sample, compute endurance at derated power and resulting range with wind.
  - Intersect with candidate sites (airfields, designated recovery areas) loaded from a configurable list.
  - Display probability that each site is reachable, not just a yes/no.
- **Validation:** Monte Carlo coverage test; scenario replay where a fault is injected at varied mission points.
- **Effort:** M. **Risk:** site data and wind quality; keep advisory and clearly labeled.

### F4. Physics Firewall (telemetry integrity and cyber-tamper detection)

- **Idea:** detect spoofed, injected or replayed CAN/telemetry frames by checking them against thermodynamic and cross-channel invariants, not only against signatures.
- **Why uncommon:** engine health systems assume trusted sensors; security tools watch network patterns. Using the engine physics itself as an integrity check is a rarer combination. Relevant for defense.
- **Method:**
  - Invariant set: energy balance residual, fuel-flow vs. RPM/MAP consistency, CHT/EGT lag relationships, rate-limit physical plausibility.
  - Per-channel integrity score (extend the existing Sensor Integrity Monitor).
  - Replay/duplicate detection via frame counters and timing jitter statistics.
  - Distinguish *sensor fault* vs. *physical fault* vs. *suspected tampering* in the alert class.
- **Validation:** red-team test set: stuck, drifting, replayed, coordinated multi-channel spoof that is individually plausible.
- **Effort:** M. **Risk:** false positives under unusual-but-legitimate operation; tune with OOD gating (F7).

### F5. Conformal Prognostics with Adaptive Coverage

- **Idea:** RUL and degradation forecasts with intervals that carry a statistical coverage guarantee, adapted online as the engine ages.
- **Method:** split conformal prediction on RUL residuals with a rolling calibration set; adaptive conformal inference to handle distribution shift; report empirical coverage per engine profile and per flight regime.
- **Validation:** empirical coverage vs. nominal (e.g., 90%) on held-out engines/flights; interval width as a secondary metric.
- **Effort:** S–M. **Risk:** exchangeability assumptions break under drift; use the adaptive variant and monitor coverage.

### F6. Per-Airframe Self-Calibrating Twin

- **Idea:** every tail number gets its own baseline, learned online, so alarms mean "different from *this* engine's normal."
- **Method:** hierarchical Bayesian model: fleet-level prior over physics parameters (e.g., friction, heat transfer coefficients) + per-engine posterior updated with healthy-flight data. Freeze updates when the anomaly score is high so faults are not absorbed into the baseline.
- **Validation:** false-alarm rate per flight hour before/after personalization; detection lead time unchanged or improved.
- **Effort:** M. **Risk:** baseline poisoning; guard with update gating and drift alarms.

### F7. Abstention-First Alerting (know when the twin does not know)

- **Idea:** the system explicitly reports "out of distribution / low confidence" rather than guessing, and manages an **alert budget** per mission phase to fight alarm fatigue.
- **Method:**
  - OOD detection on the feature embedding (e.g., Mahalanobis distance or ensemble disagreement).
  - Cost-sensitive thresholds that vary by flight phase (takeoff, climb, loiter, descent).
  - Alert states: `INFO`, `ADVISORY`, `CAUTION`, `WARNING`, plus `UNCERTAIN`.
- **Validation:** operator-simulated study; measure alerts per hour and time-to-acknowledge; AUROC of OOD detector on held-out operating regimes.
- **Effort:** S–M. **Risk:** tuning; start with conservative defaults.

### F8. Causal Root-Cause Graph (beyond SHAP bars)

- **Idea:** root-cause attribution that follows a causal graph (cooling → CHT → oil temp → viscosity → oil pressure), so explanations say *why*, not only *which feature mattered*.
- **Method:** encode the engine's subsystem causal graph in the engine profile; run interventional "what-if" using the existing counterfactual engine; rank root causes by explained residual along causal paths. Output both graph view and plain-language text.
- **Validation:** inject faults with known causes; measure top-1/top-3 root-cause accuracy vs. the current XAI bars.
- **Effort:** M. **Risk:** graph misspecification; keep graphs editable and versioned per profile.

### F9. Virtual Sensors and Degraded-Mode Continuity

- **Idea:** if a probe fails, the twin reconstructs the channel from physics and correlated sensors, flags the value as *synthetic*, and keeps health scoring alive.
- **Method:** physics-informed regression per critical channel (CHT[i], EGT[i], oil pressure, fuel rail pressure) with uncertainty; automatic switchover when the integrity score drops; reverse switchover with hysteresis.
- **Validation:** drop-one-sensor ablation across the test set; error and calibration of reconstructed values.
- **Effort:** M. **Risk:** masking real faults; always display "virtual" provenance.

### F10. Engine Reliability Passport (tamper-evident health ledger)

- **Idea:** a portable, cryptographically verifiable record of an engine's operating history and health evidence that travels with it across aircraft, owners and MRO shops.
- **Why uncommon:** logbooks are mostly paper or siloed software; verifiable machine-generated evidence is rare.
- **Method:**
  - Hash-chained flight-segment summaries signed by the edge device key.
  - Periodic anchoring of the chain head to the cloud (a simple append-only log is enough; a blockchain is not required).
  - Export as a signed evidence pack (PDF + JSON) for MRO, resale and insurers.
- **Validation:** tamper tests (modify, delete, reorder); independent verifier CLI.
- **Effort:** S–M. **Risk:** key management; use hardware-backed keys where available.

### F11. Crank-Speed Signature Diagnostics (no new sensors where a timing signal exists)

- **Idea:** per-cylinder combustion and misfire diagnostics from instantaneous crankshaft angular speed.
- **Reality check:** this needs high-rate timing from a crank or ignition pulse signal (kHz-class capture), not the 10 Hz telemetry stream. Include only if the target engine exposes such a signal.
- **Method:** compute angular-speed fluctuation per combustion event, extract per-cylinder contribution, detect weak or missing events and compression anomalies.
- **Validation:** bench data or high-rate logs with known misfire injection.
- **Effort:** L. **Risk:** hardware access; treat as stretch.

### F12. Alternator-Ripple Torsional Proxy (research track)

- **Idea:** alternator current/voltage ripple carries engine torque pulsation information, offering a low-cost vibration/misfire proxy using signals already on the bus.
- **Method:** high-rate bus sampling, spectral analysis at firing-order harmonics, compare with accelerometer ground truth.
- **Effort:** L. **Risk:** research-grade; run as an experiment, do not promise in a pitch until validated.

### F13. Telemetry Foundation Model (moat feature)

- **Idea:** self-supervised pretraining on unlabeled flight logs across engines, then few-shot adaptation to a new engine profile.
- **Method:** masked-channel / next-window prediction on normalized multivariate sequences; profile-conditioned embeddings; fine-tune heads for anomaly and RUL.
- **Validation:** data-efficiency curve (performance vs. number of labeled flights on a new engine).
- **Effort:** L. **Risk:** requires multi-engine data; schedule after pilots.

### F14. Twin Trust Score (the twin audits itself)

- **Idea:** a score for how far the twin's predictions have diverged from reality (prediction error, calibration drift, sensor integrity, OOD rate) so operators know when to stop trusting it.
- **Effort:** S. **Risk:** low; high credibility value.

### Feature priority matrix

| Feature | Differentiation | Effort | Depends on | Phase |
|---------|-----------------|--------|------------|-------|
| F5 Conformal prognostics | Medium | S–M | Phase 0 data | 2 |
| F14 Twin Trust Score | Medium | S | F5, F7 | 2 |
| F7 Abstention-first alerting | High | S–M | Phase 1 | 2 |
| F1 Life Burn Rate | High | M | Phase 0 | 2 |
| F6 Self-calibrating twin | High | M | Phase 1 | 2–3 |
| F9 Virtual sensors | High | M | Integrity monitor | 3 |
| F10 Reliability Passport | High | S–M | Edge keys | 3 |
| F4 Physics Firewall | High (defense) | M | Integrity monitor | 3 |
| F8 Causal root-cause | Medium–High | M | Profiles | 3 |
| F2 Life-aware planner | High | M | F1 | 3–4 |
| F3 Contingency footprint | High | M | F5 | 4 |
| F13 Foundation model | Moat | L | Multi-engine data | 5 |
| F11 / F12 | Research | L | Hardware | Stretch |

---

## 4. Target Architecture

```
EDGE (onboard)                                   CLOUD (fleet)
┌────────────────────────────────────┐          ┌─────────────────────────────────────┐
│ Adapters: SocketCAN/J1939, MAVLink │          │ Ingest gateway (MQTT5, mTLS)        │
│           ROS 2, serial            │          │ Stream processor (windowing, QC)    │
│ Profile loader (YAML)              │  store-  │ Time-series store + object store    │
│ Feature pipeline                   │  and-    │ Model registry (signed releases)    │
│ ONNX runtime (anomaly, RUL, OOD)   │  forward │ Twin state service (per tail no.)   │
│ Physics engine + virtual sensors   │ ───────► │ Fleet analytics, federated rounds   │
│ Life Burn + integrity + firewall   │          │ Evidence-pack / passport service    │
│ Safety envelope (advisory only)    │          │ API (REST/gRPC) + auth (OIDC)       │
│ Hash-chained, signed flight log    │          └───────────────┬─────────────────────┘
└────────────────────────────────────┘                          │
                                                   Web console / GCS plugin / API clients
```

### Proposed repository layout

```
uav-twin/
├── profiles/                 # engine profiles (YAML) + JSON schema
│   ├── rotax_912.yaml
│   ├── rotax_914.yaml
│   └── schema.json
├── edge/
│   ├── adapters/             # can_j1939.py, mavlink.py, ros2.py, replay.py
│   ├── pipeline/             # features.py, integrity.py, firewall.py
│   ├── models/               # onnx runtime wrappers
│   ├── physics/              # otto.py, thermal.py, virtual_sensors.py
│   ├── life/                 # rainflow.py, damage.py, burn_rate.py
│   ├── safety/               # envelope.py (advisory only)
│   └── ledger/               # chain.py, signing.py, verify.py
├── cloud/
│   ├── ingest/  api/  registry/  fleet/  evidence/
├── ml/
│   ├── data/                 # dataset builders, schemas, splits
│   ├── train/                # anomaly, rul, ood, calibration
│   ├── conformal/            # split + adaptive conformal
│   ├── export/               # onnx export + manifest + signing
│   └── eval/                 # benchmark harness, reports
├── sim/                      # fault injector, domain randomization, mission sim
├── web/                      # component frontend (typed client)
├── tests/                    # unit, property, replay-regression, red-team
├── deploy/                   # docker, compose, helm (later)
└── docs/                     # assurance case, model cards, API
```

### Engine profile example

```yaml
engine: rotax_914
version: 1
cylinders: 4
rated_rpm: 5500          # verify against manufacturer data
channels:
  - id: cht_1
    unit: degF
    rate_hz: 10
    limits: {caution: 400, warning: 435}
    sensor: {type: thermocouple_J, plausible_rate_per_s: 15}
  - id: oil_press
    unit: psi
    rate_hz: 10
    limits: {low_warning: 35, low_caution: 45}
physics:
  model: otto_4stroke
  params: {bore_mm: 84, stroke_mm: 61, compression_ratio: 9.0}   # verify
causal_graph:
  edges: [[cooling_airflow, cht], [cht, oil_temp], [oil_temp, oil_press]]
damage:
  rainflow_channels: [cht_1, cht_2, cht_3, cht_4, egt_avg]
  exponents: {thermal_cycle: 2.0, vibration: 1.5}               # placeholders until calibrated
phases: [taxi, takeoff, climb, cruise, loiter, descent, landing]
```

*All numeric parameters above are placeholders. Replace with verified manufacturer data before use.*

### Telemetry schema (edge → cloud)

```json
{
  "schema": "twin.telemetry.v1",
  "tail": "UAV-07",
  "engine_profile": "rotax_914@1",
  "ts_ns": 1760000000000000000,
  "seq": 128394,
  "phase": "loiter",
  "channels": {"rpm": 4800, "cht_1": 372.1, "...": 0},
  "derived": {"ehi": 91.2, "life_burn_rate": 1.08, "trust": 0.94},
  "flags": {"virtual": ["cht_3"], "uncertain": false},
  "sig": "base64..."
}
```

### API surface (cloud)

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/fleet` | Fleet list with health, life burn, trust |
| `GET /v1/tails/{id}/twin` | Current twin state |
| `POST /v1/missions/score` | Go/no-go + life budget for a planned mission |
| `POST /v1/missions/plan` | Life-aware plan (Pareto set) |
| `GET /v1/tails/{id}/passport` | Signed evidence pack |
| `POST /v1/models/release` | Publish signed model bundle |
| `WS /v1/stream/{tail}` | Live telemetry + alerts |

---

## 5. Data Strategy (the make-or-break item)

1. **Tier A — real logs:** public experimental-aircraft engine-monitor logs, partner flying clubs, MRO test cells. Anonymize and version.
2. **Tier B — physics-first synthetic:** extend the simulator with domain randomization (sensor noise, lags, wear states, ambient, sensor placement) and **held-out fault families** not used for training.
3. **Tier C — public benchmark:** release the synthetic generator and fault library openly, clearly labeled as synthetic.

**Rules**

- Label every dataset `real` or `synthetic` in metadata and in model cards.
- Never report results on a split that shares fault generators with training.
- Keep a frozen **test set per release**, and a **replay-regression set** that must not degrade.

---

## 6. ML and Physics Pipeline

| Stage | Method | Output |
|-------|--------|--------|
| Features | Windowed stats, spectral features for vibration, phase-conditioned normalization | Feature vector per window |
| Anomaly | Isolation Forest baseline + deep autoencoder or ensemble | Score + embedding |
| OOD | Mahalanobis / ensemble disagreement on embedding | OOD flag |
| RUL | Sequence model (LSTM or temporal CNN/transformer) + conformal wrapper | RUL + interval |
| Physics residual | Otto-cycle expected vs. measured (BHP, BSFC, temperatures) | Residual vector |
| Fusion | Physics + AI cross-validation (extend existing Cases A–D) | Fault class + confidence |
| Life | Rainflow + damage accumulation | Life Burn Index |
| Calibration | Online Bayesian per-airframe update with gating | Personalized baseline |

**Benchmarking:** keep the existing offline comparison (Linear, RF, GB, LSTM) and add: isolation-forest-only, physics-only, and the fused system, so the value of fusion is measured, not assumed.

---

## 7. Assurance, Safety and Security

**Safety**
- Advisory-only outputs; no write path to flight control.
- Runtime-assurance style envelope: independent, simple monitor that can suppress or flag unreliable advice (see ASTM F3269 concepts).
- Maintain an assurance case document: hazards, mitigations, tests, known limitations.
- Model cards per release: data, metrics, limits, failure modes.

**Security**
- mTLS everywhere; per-device keys; short-lived tokens.
- Signed ONNX bundles with manifest (hash, profile compatibility, metrics).
- No pickle or HDF5 loading from untrusted sources.
- Role-based access in cloud; audit log of model releases.
- Threat model covering CAN injection, replay, model tampering, telemetry exfiltration.

---

## 8. Detailed Execution Plan

### Phase 0 — Credibility (weeks 1–2)
| Task | Acceptance criteria |
|------|---------------------|
| Replace/relabel training data | README and model card state data origin; no turbofan data presented as piston |
| Train on all channels | Config-driven channel list; tests fail if a channel is silently dropped |
| Held-out fault families | At least 3 fault generators excluded from training |
| Baseline report | Per-fault precision, recall, lead time, false alarms/hour |
| Claims audit | Every README claim links to a measurement or is removed |

### Phase 1 — Platform core (weeks 3–6)
| Task | Acceptance criteria |
|------|---------------------|
| Engine profile loader + JSON schema | Two profiles load; invalid profile rejected with clear error |
| ONNX export + signed bundle | Edge refuses unsigned or mismatched bundles |
| MQTT5 + mTLS, authenticated WS | No anonymous connections in compose stack |
| Docker Compose + CI | `docker compose up` runs the stack; CI runs tests and replay-regression |
| Frontend componentization | Typed client; at least 3 core views ported |
| Replay adapter | Any recorded log can drive the full stack deterministically |

### Phase 2 — Core differentiators (weeks 7–10)
| Task | Acceptance criteria |
|------|---------------------|
| F5 Conformal RUL | Empirical coverage within ±3 pts of nominal on held-out data |
| F7 Abstention + alert budget | OOD AUROC reported; alerts/hour measured against baseline |
| F1 Life Burn Rate v1 | Gauge in UI; unit tests for rainflow and damage monotonicity |
| F14 Twin Trust Score | Score drops when injected drift/sensor faults appear |
| Go/no-go score | `POST /v1/missions/score` returns score and contributing factors |

### Phase 3 — Integrity and trust (weeks 11–14)
| Task | Acceptance criteria |
|------|---------------------|
| F6 Per-airframe calibration | False alarms reduced vs. generic baseline, no loss in lead time |
| F9 Virtual sensors | Drop-one-sensor test keeps health scoring functional with flagged provenance |
| F4 Physics Firewall | Red-team set detection rate and false-positive rate reported |
| F10 Reliability Passport | Independent verifier detects any tampering in test suite |
| F8 Causal root-cause | Top-3 accuracy beats current XAI on injected-fault set |
| HIL bench | Recorded or live CAN into edge stack; latency and memory measured |

### Phase 4 — Planning and pilots (weeks 15–20)
| Task | Acceptance criteria |
|------|---------------------|
| F2 Life-aware planner | Pareto plans differ meaningfully; replay-validated |
| F3 Contingency footprint | Reachability probabilities validated by Monte Carlo |
| Pilots | 1–2 design partners onboarded with real logs |
| Evidence packs | Partner reviews and gives written feedback |

### Phase 5 — Moat (after pilots)
- F13 foundation model, federated rounds, F11/F12 research tracks, AR overlay.

---

## 9. Validation Metrics

| Metric | Target / reporting |
|--------|--------------------|
| Detection lead time per fault class | Reported on held-out families |
| False alarms per flight hour | Defined threshold agreed with partner |
| RUL interval coverage | Matches nominal ±3 pts |
| OOD detection AUROC | Reported per operating regime |
| Virtual sensor error | MAE and calibration per channel |
| Firewall detection / false-positive rate | Red-team set |
| Edge latency, CPU, RAM | Measured on target hardware, published |
| Passport tamper detection | 100% in test suite |
| Twin Trust Score correlation with actual error | Reported |

---

## 10. Business Plan Sketch

**Customers:** UAV operators (commercial, defense contractors), MRO shops, engine test cells, insurers.

**Packaging**

| Tier | Contents |
|------|----------|
| Core | Edge agent, health index, alerts, console |
| Fleet | Life burn, go/no-go, trust score, analytics |
| Assurance | Passport, evidence packs, audit exports |
| Enterprise | Federated learning, custom engine profiles, SSO, support |

**Go-to-market**
1. Open benchmark and synthetic generator → credibility and inbound.
2. Free pilot with 1–2 operators on recorded logs (no hardware risk).
3. Paid pilot with edge agent on a bench or aircraft.
4. Expand to MRO and insurers via passport and evidence packs.

**Moat:** per-engine fleet data, profile library, signed evidence history, advisory design that avoids certification burden.

**Key risks**

| Risk | Mitigation |
|------|------------|
| No real data | Secure a design partner in Phase 0–1 |
| Slow defense procurement | Lead with commercial and MRO |
| Overpromising novelty | Prior-art check, honest model cards |
| Certification scope creep | Remain advisory-only |
| Small team | Cut F11–F13 until pilots justify them |

---

## 11. Prior-Art Checklist (do before claiming novelty)

- [ ] Search patents (Google Patents, Espacenet) for: "remaining useful life" + "mission planning" + "engine"; "life consumption" + "route"; "CAN" + "thermodynamic" + "intrusion"; "hash chain" + "engine maintenance record".
- [ ] Search literature (Google Scholar, arXiv) for: conformal prediction + RUL; instantaneous angular speed misfire; alternator ripple engine diagnostics; physics-informed cyber-physical intrusion detection.
- [ ] Review commercial products: engine monitors for general aviation, UAV fleet health platforms, predictive maintenance vendors.
- [ ] Record findings in `docs/prior_art.md` and position each feature as *novel*, *novel combination*, or *known but productized*.
- [ ] Consult a patent attorney before publishing details of any feature you may want to protect.

---

## 12. If You Can Only Do Five Things

1. Phase 0 credibility fixes
2. F5 Conformal RUL
3. F1 Life Burn Rate
4. F7 Abstention-first alerting + F14 Twin Trust Score
5. F10 Reliability Passport

This set is feasible for a small team, demonstrable in a demo, and clearly different from a threshold dashboard.
