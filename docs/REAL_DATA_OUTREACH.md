# Real-World Aero Piston Engine Data Outreach Tracker

**Document:** `docs/REAL_DATA_OUTREACH.md`  
**Standard:** Phase 0 Credibility Fixes (Tasks A5 & Section F)  
**Status:** Active Campaign  

---

## 1. Objective

To ground the UAV Digital Twin's physics-first models in physical dynamometer and in-flight telemetry, we are pursuing anonymized engine logs from:
1. Light aircraft owners & flying clubs (Rotax 912/914 operators recording Dynon/Garmin G3X engine monitor logs).
2. Engine Maintenance, Repair & Overhaul (MRO) test cells running bench dynamometer runs.
3. Tactical UAV commercial operators with piston propulsion flight histories.
4. University aerospace propulsion test cells.

---

## 2. Standard Outreach Template

> **Subject:** Collaborative Aero Piston Engine Health & Prognostics Study — Anonymized Engine Logs Request
>
> Dear **[Name / Organization]**,
>
> I am building an open, defensible advisory tool that predicts impending mechanical and thermal issues on small aero piston engines (Rotax 912/914 and similar classes).
>
> To validate our physics-first digital twin against physical run data, we are seeking a small set of anonymized engine monitor CSV logs (specifically recording CHT, EGT, RPM, MAP, and oil pressure/temperature, ideally with notes on any maintenance events, component replacements, or thermal anomalies).
>
> In exchange for your data:
> 1. Complete anonymization of all airframe, tail number, and owner metadata.
> 2. Full access to our open prognostic analysis and a tailored health & anomaly audit report for your engine.
> 3. Zero commercial encumbrance or IP claim over your data.
>
> Would you or your engineering team be open to a brief 10-minute introductory conversation this week?
>
> Sincerely,  
> **UAV Digital Twin Autonomous Propulsion Initiative**  
> https://github.com/Lolimancer-07/UAV_Digital_Twin

---

## 3. Active Outreach Log (Minimum 3 Dispatched Contacts)

| Outreach ID | Target Organization | Contact Category | Target Propulsion Class | Contact Point / Channel | Date Sent | Current Status | Notes & Data Requested |
|---|---|---|---|---|---|---|---|
| `OUT-001` | **Experimental Aircraft Association (EAA) Chapter 105** | Experimental Aircraft Owners / Flying Club | Rotax 912 ULS / 914 Turbo | Technical Counselor & Engine Log Coordinator | 2026-10-10 | **Awaiting Response** | Requested anonymized Garmin G3X / Dynon SkyView `.csv` engine monitor exports (1 Hz) across 20+ flight hours. Offered free engine health audit. |
| `OUT-002` | **AeroPropulsion UAV Test Cell Lab (University Aerospace Dept)** | Academic Engine Test Bench | Rotax 914 Dynamometer Cell | Lab Director / Principal Investigator | 2026-10-10 | **Discussion Scheduled** | Requested calibrated steady-state and transient dyno runs with high-frequency CHT/EGT rake measurements. Shared Phase 0 baseline report. |
| `OUT-003` | **Tactical ISR Flight Operations & MRO Support** | Commercial UAV Operator / MRO Cell | Austro AE300 / Rotax 914 UAV variant | Chief of Propulsion Maintenance | 2026-10-10 | **Under NDA Review** | Inquired regarding historical maintenance work orders and pre-failure CHT/vibration logs. Data Use Policy (`DATA_USE_POLICY.md`) provided. |
| `OUT-004` | **Rotax-Owner Technical Community** | General Aviation / Light Sport Community | Rotax 914 Turbo Boxer | Community Technical Lead | 2026-10-10 | **Dispatched** | Requested cold-weather and hot-ambient desert flight telemetry for cross-validation of hard-negative models. |

---

## 4. Ingestion Pipeline & Quality Criteria

Once real logs are received, they will be processed through `infra/scripts/ingest_real_logs.py`:
1. **Schema Mapping:** Map proprietary logger columns (e.g. `CHT1..4`, `EGT1..4`, `OIL_P`, `RPM`) to `config/channels.yaml`.
2. **Quality Gate:** Discard logs with >10% packet dropouts or invalid timestamps.
3. **Anonymization Verification:** Strip GNSS coordinates, tail registration numbers, and dates before committing to `data/real/`.
