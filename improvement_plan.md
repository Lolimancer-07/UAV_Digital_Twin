# UAV Digital Twin — Future Upgrade & Startup-isation Implementation Plan

> **Status:** planning document only. No code in this repo is changed by this plan.
> **Scope:** how to take the current single-machine hackathon system to a
> fundable, multi-tenant, deployable product without throwing away the existing
> reasoning core.
> **Companion docs referenced by [README.md](README.md):** this file replaces the
> dangling `improvement_plan.md` link; `PROJECT_CONTEXT.md` and
> `AI_MODELS_SPEC.md` are still missing and are tracked as Phase 0 deliverables.

---

## 0. Where the code actually is today (honest audit)

Grounded in the current tree, not aspiration.

| Area | Today | Startup-grade target |
|---|---|---|
| Reasoning core | [backend/inference.py](backend/inference.py) — 873-line monolith; imports 20 modules; module-level globals (`latest_state`, `engine_buffer`); MQTT loop in main thread, WS server in a side thread | Pure, importable `twin-core` library + thin ingest/serve processes |
| Transport | MQTT `uav/engine/telemetry` (paho) + SocketCAN J1939 ([simulator/can_bridge.py](simulator/can_bridge.py)) + one 10 Hz WebSocket broadcasting the **entire** state blob to **every** client | Edge ingest service + versioned event bus + per-subscription filtered streams |
| Contract | Implicit and triplicated: backend dict → [frontend/lib/telemetry/types.ts](frontend/lib/telemetry/types.ts) (566 lines, hand-mirrored) → tests. Only `mission_command` carries `schema_version: "1.0"` | One machine-readable contract, generated clients, contract tests in CI |
| Control plane | Backend writes [simulator/current_profile.json](simulator/current_profile.json); simulator polls it. No atomics, no schema, no lock | Versioned command API with validation, idempotency keys, audit trail |
| Auth | Single shared token `UAV_TWIN_AUTH_TOKEN`; the browser reads `NEXT_PUBLIC_UAV_TWIN_AUTH_TOKEN` (public bundle) | OIDC identity, orgs/roles, per-aircraft scoping, no secret in client code |
| Data | In-memory only (`use-telemetry-history`, `latest_state`). Replay page replays synthetic data | Append-only telemetry store; real replay; per-flight history; audit log |
| Models | `uav_rul_model.h5`, `scaler.pkl`, `anomaly_model.pkl`, `ml_chatbot/intent_clf.joblib` — pickles, no hashes, no version metadata, no promotion gate | Model registry with hashes + eval cards; ONNX/safetensors; staged promotion |
| Simulated features | `federated_coordinator.py` and `edge_profile.py` are explicitly labelled POC simulations | Either made real, or clearly surfaced in-product as "simulation" |
| Delivery | [run.sh](run.sh) orchestrates 6 processes, uses `pkill -9` + `fuser -k`, trains on first run | Container/orchestrator deployment, health probes, graceful shutdown |
| Quality gates | 3 test files, ~16 unittest cases, no CI (`.github` absent) | CI with lint, typecheck, unit, contract, integration, and perf gates |
| Security posture | `Access-Control-Allow-Origin: *` in [frontend/next.config.ts](frontend/next.config.ts), `allowedDevOrigins` contains a LAN IP | Strict origin policy, TLS everywhere, per-env config, SBOM |

**The asset worth protecting:** physics/AI cross-validation (Cases A–D), XAI
attribution, and prescriptive ATA-100 output. That combination — "is this a real
engine fault or a lying sensor, and what exactly do I do" — is the wedge. Almost
everything else is replaceable scaffolding.

---

## 1. The startup thesis (what "startup like" concretely means here)

**One-liner.** A propulsion health platform that never confuses a failing
sensor with a failing engine — and tells the operator, in plain language, what
to change before the mission is lost.

**Wedge (recommended).** Sell to operators of piston/turboprop uncrewed
aircraft (MALE ISR, survey, cargo, trainer) and their MRO shops. They already
have engines with thermocouples, oil pressure, fuel flow, vibration, and a data
bus. They do not have prognostics they trust, because generic ML trips on sensor
drift. Cross-validation is the differentiator, not "an LSTM".

**Alternative wedges to test in parallel (pick after 5 discovery calls):**
1. Engine OEM aftermarket — white-label health analytics for a Rotax/Continental-class OEM (long sales cycle, highest defensibility, data rights).
2. Ground-test / test-cell operators — dyno and HIL benches need exactly this pipeline with far less certification friction and a much faster sales cycle.
3. Adjacent powertrains (generators, marine diesels, industrial gensets) — same physics core, no airworthiness burden, good beachhead for cash.

**Moat, in order of durability.**
1. Cross-validated fault/sensor discrimination library, validated on real run-to-failure data (data rights → validation sets → trust).
2. Per-platform physics calibrations and cylinder-level signatures (hard to copy, compounds per fleet).
3. Prescriptive action library mapped to ATA chapters and OEM maintenance manuals (the thing maintenance planners actually consume).
4. Data flywheel: every customer flight improves anomaly baselines under privacy constraints (federated path already prototyped).

**Business model sketch (to be priced in Phase 1, from pilot data).**

| Tier | Buyer | Unit | Value metric |
|---|---|---|---|
| Edge license | Operator / integrator | per aircraft / year | aircraft under monitoring |
| Fleet cloud | Operator, MRO | per aircraft / month | aircraft × monitored flight hours |
| OEM / white-label | Engine OEM | annual license + per-unit royalty | serial numbers in the field |
| Test-cell / bench | Engine test houses | per bench / year | test campaigns |

Add-ons that monetise immediately: post-flight report PDFs for
airworthiness records, anomaly review service (human-in-the-loop),
integration fees for customer-specific buses.

**Startup metrics to instrument from day one:** time-to-first-insight (< 10 min
from connect to first actionable card), % of alerts that a customer marks
"useful" (alert precision proxy), false-alarm rate per 100 flight hours,
retained precision after 30 days (trust decay), aircraft per account, and
expansion revenue from added airframes.

---

## 2. Seven futureproofing laws for this codebase

1. **Contract first, code second.** The state blob is the product surface.
   Define it once, generate Python + TypeScript types, fail CI on drift.
2. **Deterministic core, dumb edges.** All reasoning must be pure functions of
   (window, config, model) → result. No globals, no I/O inside reasoning
   modules. That is what makes them testable, replayable, and certification-
   discussable.
3. **Everything is an event, nothing is a screenshot.** Persist inputs and
   decisions; every UI panel becomes a projection. This retires the fake replay
   page and gives you auditability for free.
4. **Version everything you can't change later:** contract, model manifest,
   config schema, control-file schema, firmware/model bundle for edge.
5. **No secret in the client, ever.** Public env vars are published artifacts.
6. **Two runtimes, one behaviour.** GCS float32 and edge INT8 must produce the
   same decision envelope with a declared accuracy delta, proven by a shared
   conformance suite.
7. **Simulation is a first-class product.** The simulator ([simulator/mission_sim.py](simulator/mission_sim.py),
   [simulator/ecu_sim.c](simulator/ecu_sim.c)) is your sales demo, your CI
   fixture, and your regression oracle. Treat it as a shippable component with
   its own contract and determinism guarantees (fixed seeds, recorded scenarios).

---

## 3. Target architecture

```
  AIRCRAFT / BENCH                                GROUND / CLOUD
  ┌───────────────────┐   MQTT / CAN / file      ┌──────────────────────────────────────┐
  │ ECU + sensors     │───────────────┐          │  ingest-gateway                      │
  │ edge-infer (ONNX) │               │          │  · authn/authz per aircraft          │
  │  local alarms     │───────────────┼─────────▶│  · schema validation, dedupe         │
  │  store & forward  │               │          │  · writes event log (append-only)    │
  └───────────────────┘               │          └───────────┬──────────────────────────┘
                                      │                      │
                                      │          ┌───────────▼──────────────────────────┐
                                      │          │  twin-core (pure, versioned)         │
                                      │          │  integrity→physics→anomaly→RUL→     │
                                      │          │  health→consistency→XAI→risk→       │
                                      │          │  prescriptive→advisor                │
                                      │          └───────────┬──────────────────────────┘
                                      │                      │ decision envelopes
                                      │          ┌───────────▼──────────┐  ┌───────────────┐
                                      │          │ stream-api (WS+gRPC) │  │ report-worker │
                                      │          │ per-tenant filtering │  │ PDF / audit   │
                                      │          └───────────┬──────────┘  └───────────────┘
                                      │                      │
                                      │          ┌───────────▼──────────────────────────┐
                                      └─────────▶│ GCS web app (Next.js, org-scoped)    │
                                                 │ replay · fleet · maintenance · copilot│
                                                 └──────────────────────────────────────┘
        model-registry  ←→  training-pipeline  ←→  drift-monitor  ←→  federated aggregator
```

**Module boundaries (target repo layout).**

| Path | Contents | Rule |
|---|---|---|
| `packages/contracts/` | JSON Schema / protobuf for telemetry, decisions, commands, model manifest; codegen for py + ts | nothing imports it transitively; it imports nothing |
| `packages/twin-core/` | today's `backend/*.py` reasoning modules, refactored pure | no MQTT, no WS, no filesystem, no env reads |
| `packages/sim-models/` | simulator profiles, scenario definitions, golden outputs | deterministic, seedable |
| `services/ingest-gateway/` | MQTT/CAN/file intake, validation, event log writes | only writer of the event log |
| `services/stream-api/` | WS + REST/gRPC fan-out, per-tenant authz, history queries | no reasoning logic |
| `services/report-worker/` | PDFs, work orders, compliance exports | consumes envelopes only |
| `apps/gcs/` | today's `frontend/` | rendering + command intent only |
| `apps/edge-agent/` | ONNX runtime, store-and-forward, OTA model pull | must run offline for 30+ days |
| `infra/` | compose dev stack, k8s/Terraform, CI | reproducible from scratch in one command |

Hard rule that buys the most futureproofing: **`twin-core` must be importable
and runnable with zero network and zero TensorFlow at import time** (models are
loaded lazily from a registry; runtime is ONNX).

---

## 4. Roadmap — 8 phases with exit criteria

Estimates are engineer-weeks (EW) for one strong engineer; parallelise where
noted. Each phase must leave the demo working — the demo is the sales asset and
must never regress.

### Phase 0 — Stabilise the demo and make it observable (2–3 EW)
**Goal:** stop the current system from being a single points of failure, and
make its behaviour measurable.
- Add CI (`.github/workflows/ci.yml`): lint, typecheck (frontend), `pytest tests/`
  with a coverage floor (start at current coverage, ratchet upward), and a
  headless smoke test that boots the stack and asserts one full telemetry cycle.
- Replace `pkill -9` / `fuser -k` in [run.sh](run.sh) with PID-file lifecycle
  management and graceful SIGTERM; add a `make dev` / compose equivalent.
- Structured JSON logging + correlation IDs (aircraft, flight, cycle). Keep the
  human console output for demos behind a flag.
- Atomic control-file writes (write-temp + rename) and a versioned schema for
  `current_profile.json`; add a file lock or replace with a local IPC command API.
- Freeze dependencies: pin exact versions, add Python 3.12 target, add
  `pip-compile`/`uv lock`; replace pickles with explicit formats behind loaders.
- Write the two missing docs: `PROJECT_CONTEXT.md`, `AI_MODELS_SPEC.md`.
**Exit criteria:** CI green on a clean clone; stack boots via one documented
command; every log line is machine-parseable; no `-9` kills in the launcher.

### Phase 1 — Extract the reasoning core (4–6 EW) *(critical path)*
**Goal:** `twin-core` as a versioned library with a frozen decision envelope.
- Move `backend/*.py` reasoning modules into `packages/twin-core/`; delete
  global state; inject window + config + model handle explicitly.
- Define **Decision Envelope v1** (see §6) covering every field the GCS consumes;
  generate `frontend/lib/telemetry/types.ts` from the contract — delete the
  hand-maintained duplicate.
- Build the **golden-file regression suite**: recorded telemetry scenarios →
  expected decisions with tolerances. This is the single highest-value test asset
  you will own.
- Add contract tests that fail when backend emits a field the contract lacks
  (and vice-versa). Add a schema-version bump policy (additive = minor,
  breaking = major + dual-emit window).
- Introduce a model manifest: `{id, version, hash, trained_on, metrics, runtime}`;
  verify hash at load; refuse mismatched artifacts.
**Exit criteria:** import `twin-core` with no network/TF at import; golden suite
green; type generation reproduces `types.ts` exactly; envelope v1 published.

### Phase 2 — Persist, replay, and audit (4–6 EW)
**Goal:** real history, real replay, provable outcomes.
- Append-only event store. Start pragmatic (Postgres + JSONB/Timescale, or
  DuckDB + Parquet for single-node pilots) with a documented migration path to
  ClickHouse/Timescale at fleet scale.
- Decision envelopes persisted alongside inputs; retention and per-tenant
  partition keys designed on day one.
- Turn [frontend/app/replay/page.tsx](frontend/app/replay/page.tsx) into a real
  replay over the event store (scrub, compare run A vs B, annotate).
- Audit log: who commanded what, when, with what effect — required for any
  regulated buyer.
- Post-flight report worker: assemble the decision trail into a PDF/JSON bundle
  suitable for a maintenance record.
**Exit criteria:** a pilot flight can be replayed frame-accurately after a
restart; every operator command appears in an immutable audit trail; report
generation is reproducible from stored events alone.

### Phase 3 — Multi-tenant platform and real auth (5–7 EW)
**Goal:** safe to run for more than one customer.
- OIDC login (customer IdP or hosted), org/role model (`viewer`, `dispatcher`,
  `maintainer`, `admin`), aircraft-scoped authorisation enforced server-side.
- Retire the shared token and `NEXT_PUBLIC_*` secret; browser never holds a
  long-lived credential. Query parameter/`Authorization` on the WS handshake with
  short-lived tokens and refresh.
- Lock down CORS, tighten `allowedDevOrigins`, add rate limits, per-tenant
  quotas, request size limits, and replay-attack protection on the command path.
- Per-tenant stream filtering: never broadcast the whole state to every client.
  Subscribe by aircraft + field groups; put a schema on the subscription message.
- Deploy pipeline: environments (dev/staging/prod), migrations, zero-downtime
  schema changes, feature flags for risky reasoning changes.
**Exit criteria:** two accounts cannot see each other's data (verified by an
automated isolation test); no secret in any client bundle; dev/staging/prod
deploy from CI with migrations; command path returns 401/403 correctly signed out.

### Phase 4 — Edge runtime that is real (5–7 EW)
**Goal:** the edge story survives a technical buyer's questions.
- Export the LSTM + scaler + anomaly model to ONNX (with INT8 post-training
  quantisation as an option); delete the TensorFlow dependency from the edge
  path; keep a compatibility shim for the float32 GCS path.
- Implement genuine store-and-forward: local ring buffer + durable queue,
  reconnect reconciliation with dedupe keys, offline alarms that still fire.
- Conformance suite proving GCS vs edge parity within declared tolerance
  (measures the accuracy delta instead of asserting it in a docstring).
- Replace doctored numbers in [backend/edge_profile.py](backend/edge_profile.py)
  with results measured on target hardware (Jetson Orin Nano / i.MX8 class);
  label benchmark provenance (hardware, batch, toolchain) in the artifact.
- OTA model bundle pull with signature verification and rollback.
**Exit criteria:** an edge agent runs 30 days offline, then reconciles with no
duplicates or gaps; parity suite passes; all published SWaP numbers are
reproducible from a committed benchmark script.

### Phase 5 — Data flywheel, drift, and federated learning (4–6 EW, continuous)
**Goal:** the fleet gets smarter than any single aircraft.
- Close the loop on [backend/drift_detector.py](backend/drift_detector.py):
  drift triggers a review ticket, not a silent threshold change.
- Model promotion gates: offline metrics + shadow-mode comparison + human
  sign-off recorded in the registry; automatic rollback on regression.
- Make federated learning real or explicitly labelled: secure aggregation and
  DP noise (minimal viable: DP-FedAvg at the aggregator), participant
  attestation, and a documented threat model. Until then, keep the POC's
  disclaimer visible in the UI so no buyer is misled.
- Customer-facing data rights: per-tenant opt-in for aggregate learning, with a
  written data-use policy. This is a sales unlock in defense-adjacent deals.
**Exit criteria:** a model change is traceable from telemetry evidence → eval
card → promotion decision; aggregate learning works with at least 3 participants
and a documented privacy budget; data-use policy is signed-off by legal.

### Phase 6 — Trust, compliance, and security posture (4–6 EW, then ongoing)
**Goal:** be answerable when a buyer's compliance team asks questions.
- Decide explicitly whether you need **airborne** software credit. Recommendation:
  stay ground-side/decision-support first (avoids DO-178C/DO-254 software
  certification, which is a multi-year, multi-million effort), and pursue
  process-level credibility instead: requirements traceability, tool
  qualification rationale, V&V evidence for the decision logic, and a safety
  case lite for the advisory function.
- If HIL/bench integration is the beachhead: build the HIL testbed plan around
  a deterministic scenario replay, fault-injection matrix, and a documented
  pass/fail envelope — cheaper credibility, faster revenue.
- Security: SBOM per release, dependency scanning, signed artifacts, secrets
  management, key rotation, incident runbook, penetration test before first
  enterprise pilot.
- Track SOC 2 Type I readiness (controls + evidence collection) once the first
  paying pilot signs; ISO 27001 only if enterprise buyers demand it.
- Export control review (ITAR/EAR) for defense customers; data residency options
  (per-region deployment) designed into storage partitions from Phase 2.
**Exit criteria:** a compliance questionnaire can be answered with documents,
not promises; every release has an SBOM and signed provenance; pen test findings
closed or risk-accepted in writing.

### Phase 7 — Productisation and go-to-market engine (continuous)
**Goal:** a repeatable motion from demo to paid pilot to renewal.
- **Demo kit:** promote [backend/demo_controller.py](backend/demo_controller.py)
  into a scripted, deterministic "9-minute value story" that runs on any laptop
  without hardware, with a reset button and a printable outcome report. Sales
  engineers should never have to hand-configure a fault injection.
- **Onboarding:** one-page connect guide per data source (MQTT topic mapping,
  CAN/DBC import, CSV/Parquet backfill for historical data). Target
  time-to-first-insight < 10 minutes using the customer's own recording.
- **Packaging & pricing:** tiers from §1, priced after 3 pilots; include an ROI
  calculator (avoided AOG hours, avoided false-positive engine swaps, extended
  inspection intervals).
- **Pilot-to-production gates:** documented success criteria with the customer
  (alert precision, accepted recommendations, measured downtime saved), reviewed
  at day 30/60/90.
- **Design partners first:** 5 discovery calls, 2 paid pilots, 1 referenceable
  logo before any fundraise narrative.
**Exit criteria:** a new customer is onboarded by a non-author using only the
docs; 3 paid pilots with written success criteria; ≥1 public case study;
renewal motion defined.

### Phase 8 — Scale-out engineering (as demand requires)
- Horizontal ingest (partition by aircraft), backpressure and shed policies,
  multi-region deployment, cost-per-aircraft-per-month tracked as a first-class
  metric, chaos/failure drills (broker down, store down, model missing).
- Multi-airframe-type support: platform profiles (Rotax 914 F, diesel, turboprop
  variants) as data, not code branches — this is the path from "one UAV" to
  "propulsion platform".

---

## 5. Cross-cutting workstreams (never "later", always incremental)

| Workstream | Minimum viable now | Scale target |
|---|---|---|
| Testing | Golden-file scenario suite + contract tests in CI | Property-based tests for physics bounds, chaos drills, shadow traffic |
| Observability | Structured logs + correlation IDs; counters for drop rate, latency, model errors | Metrics, traces, alerting on twin-health SLOs; per-tenant dashboards |
| Config | One typed config module; env validated at startup; no magic constants in modules | Config schema in contract; per-tenant overrides with audit |
| Docs | `PROJECT_CONTEXT.md`, `AI_MODELS_SPEC.md`, ADR folder, runbooks | Public docs site + integration guides + API reference generated from contracts |
| Security | Secrets out of client, strict CORS, input validation on commands | SBOM, pen test, key rotation, RBAC, per-tenant isolation tests |
| Model lifecycle | Model manifest + hash check | Registry, staging/shadow, promotion gates, rollback, drift-triggered review |
| Performance | Latency budget published (10 Hz ingest → decision < 100 ms on CPU) | Budgets per stage in CI; load tests at N aircraft; edge parity budget |
| Release | Semantic versioning of core + contract; changelog | Blue/green reasoning rollout, canary per tenant, automatic rollback |

---

## 6. Contracts to freeze (this is the futureproofing payoff)

**Decision Envelope v1** (single object; additions are minor, removals are major):

```json
{
  "envelope_version": "1.0",
  "emitted_at": "2026-10-09T12:00:00Z",
  "aircraft": { "id": "UAV-01", "engine_id": 1, "platform_profile": "rotax_914f" },
  "flight": { "id": "flight-2026-10-09-a", "cycle": 1042 },
  "inputs": { "schema_version": "1.0", "quality": { "packet_loss_pct": 0.0, "sensor_trust": {} } },
  "physics": { "bhp": 0, "bsfc": 0, "residuals": {} },
  "anomaly": { "score": 0.0, "verdict": "NOMINAL", "fault_class": null },
  "prognostics": { "rul": 0, "sigma": 0, "ci90": [0, 0], "model_id": "" },
  "twin_consistency": { "case": "A", "ai_agreement": 0.0, "physics_agreement": 0.0 },
  "xai": { "top_drivers": [] },
  "risk": { "mission_completion": 0.0, "safe_endurance_h": 0.0 },
  "prescriptive": { "advisories": [], "work_orders": [] },
  "provenance": { "core_version": "", "config_hash": "", "runtime": "gcs_float32" }
}
```

**Command Envelope v1:** `{command_version, command, aircraft_id, intent_id (idempotency key),
issued_by, issued_at, params, signature}` — every command validated against a
schema, authorised against the caller's scope, logged, and idempotent.

**Model Manifest:** `{model_id, version, task, hash, runtime, trained_at,
input_shape, metrics {mae, rmse, r2, latency_ms, hardware}, eval_set_id}`.

**Subscription Message:** which aircraft, which field groups, what minimum rate,
what backpressure policy. Replaces unconditional full-state broadcast.

---

## 7. Twelve-month sequencing (indicative)

| Quarter | Phases | Engineering | Business |
|---|---|---|---|
| Q1 | 0 → 1 | CI, stabilisation, core extraction, envelope v1, golden suite | 5 discovery calls, wedge selection, 1 design partner |
| Q2 | 2, 3 (start) | Event store, replay, audit, reports; auth + tenancy | First paid pilot (bench or operator); pricing hypothesis |
| Q3 | 3 (finish), 4 | Multi-tenant prod deploys, edge runtime + parity suite | Second pilot; case study; ROI calculator; seed materials |
| Q4 | 5, 6, 7 | Drift loop, promotion gates, compliance evidence, demo kit, onboarding | 2–3 paid pilots, reference logo, renewal motion, seed raise |

Parallelisation that works: Phases 2/3 (platform) alongside 4 (edge) alongside
7 (GTM) — they touch different boundaries. Phase 1 is the only hard dependency
for everything.

**Team shape (minimum viable startup, 4 people):** 1 platform/infra engineer,
1 ML/physics engineer (owns the validation story), 1 product-minded full-stack
engineer (GCS + reports + demo kit), 1 founder doing GTM and design partners
part-time on engineering. Add a part-time safety/compliance advisor before the
first defense-adjacent pilot.

---

## 8. Risks and mitigations

| Risk | Why it bites here | Mitigation |
|---|---|---|
| "It's a hackathon demo" perception | Simulated federated learning, doctored SWaP numbers, scripted demo mode | Label simulations in-product; replace with measured results (Phase 4/5); publish eval cards |
| Simulator-shaped product | The system may only work for `mission_sim.py` physics and synthetic degradation | Validate on real run-to-failure data (even public C-MAPSS first, then customer recordings); maintain a real-data acceptance gate |
| Model fragility | `.h5` + pickle artifacts behind a loosening TensorFlow pin (now `<2.23` alongside a numpy 2.x range) | ONNX/safetensors, model manifests, hash checks, dual-runtime parity tests |
| Monolith globals | `latest_state` shared across threads invites nondeterministic bugs | Phase 1 purity extraction; single writer per state slice; envelope immutability |
| Shared-token auth shipped to pilots | One leaked token = full command authority | Phase 3 identity work **before** any pilot on a shared network; interim: bind loopback only, rotate tokens per session |
| Certification trap | Chasing airborne credit consumes years without revenue | Stay advisory/ground-side; process credibility + HIL evidence first |
| Demo regression during refactor | The demo is the sales asset | Golden-file suite runs in CI on every commit that touches `twin-core` |

---

## 9. Anti-goals (explicitly not doing, so scope stays honest)

- No airborne software certification, no autopilot/flight-control integration
  in the first 12 months. Decision support only, with a hard wall between
  "advise" and "command".
- No custom MQTT broker or message bus of your own making — use standard,
  swappable infrastructure.
- No microservice explosion: 4–5 services maximum until ingest load demands more.
- No rewriting the reasoning modules "for cleanliness" — refactor only what the
  contracts and purity rules require.
- No new UI feature surface until onboarding, auth, and history exist. New
  dashboard tabs do not create enterprise value on their own.

---

## 10. Immediate next 10 working days (start here)

1. Create `.github/workflows/ci.yml` running `pytest` + frontend typecheck/lint; get it green on the current tree.
2. Record 3 deterministic simulator scenarios into `packages/sim-models/scenarios/` with captured golden outputs (seed both simulator and fault injection).
3. Draft **Decision Envelope v1** and diff it against `frontend/lib/telemetry/types.ts`; list every field that only exists in one place.
4. Add a top-level `envelope_version` to the WS payload and assert it in a single integration test (small change, large future payoff).
5. Replace `pkill -9`/`fuser -k` with PID-file lifecycle + SIGTERM handling in [run.sh](run.sh).
6. Write `PROJECT_CONTEXT.md` and `AI_MODELS_SPEC.md` (README already links them).
7. Add structured logging with aircraft/flight/cycle correlation IDs on the ingest and decision paths.
8. Write the onboarding one-pager for a customer's own MQTT topic → target < 10 minutes to first insight.
9. Book 5 discovery calls with the three candidate wedges in §1; capture alert-precision pain, AOG cost, and data ownership constraints.
10. Decide the ONNX migration spike: export the LSTM + scaler, measure float32 vs INT8 drift on the golden suite, publish the delta.
