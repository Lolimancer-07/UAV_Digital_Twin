# UAV Digital Twin — Project Context & System Specifications

## 1. Executive Summary & Operational Scope

This document defines the system engineering context, aerospace certification baseline, propulsion unit physics parameters, and avionics communication architecture for the **Autonomous UAV Engine Digital Twin Platform (v2.0)**.

The platform monitors, predicts, explains, and optimizes the performance of Medium-Altitude Long-Endurance (MALE) Unmanned Aerial Vehicles powered by four-stroke turbocharged aero-piston engines.

---

## 2. Target Propulsion System: Rotax 914 F Series

The Digital Twin is calibrated to the aerodynamic, thermodynamic, and mechanical characteristics of the **Rotax 914 F3/F4** series aircraft engine, widely deployed in defense and civilian UAV platforms (e.g. MQ-1 Predator class, Heron UAVs, and tactical ISR platforms).

### 2.1 Engine Baseline Technical Specifications

| Parameter | Specification / Certified Limit |
|---|---|
| **Architecture** | 4-cylinder, 4-stroke horizontally opposed boxer engine |
| **Displacement** | $1,211 \text{ cm}^3$ ($73.9 \text{ in}^3$) |
| **Bore × Stroke** | $79.5 \text{ mm} \times 61.0 \text{ mm}$ ($3.13 \text{ in} \times 2.40 \text{ in}$) |
| **Compression Ratio** | $9.0 : 1$ |
| **Takeoff Power (5 min)** | $84.5 \text{ kW}$ ($115 \text{ HP}$) @ $5,800 \text{ engine RPM}$ ($2,387 \text{ prop RPM}$) |
| **Max Continuous Power** | $73.5 \text{ kW}$ ($100 \text{ HP}$) @ $5,500 \text{ engine RPM}$ ($2,263 \text{ prop RPM}$) |
| **Induction** | Turbocharger with automatic wastegate controller (TCU) |
| **Cooling** | Liquid-cooled cylinder heads / Ram air-cooled cylinders |
| **Lubrication System** | Dry sump with trochoid pump, separate oil tank ($3.0 \text{ L}$) |
| **Fuel System** | Dual constant depression carburettors / electronic EFI option |
| **Gear Reduction Ratio** | $i = 2.43 : 1$ (Integrated mechanical gearbox with overload clutch) |

### 2.2 Operational Flight Envelopes & Certified Limits

| Parameter | Minimum | Continuous Normal | Caution / High | Maximum / Redline |
|---|---|---|---|---|
| **Engine Speed (Prop RPM)** | $800 \text{ RPM}$ | $1,400 - 2,260 \text{ RPM}$ | $2,260 - 2,387 \text{ RPM}$ | $2,420 \text{ RPM}$ |
| **Cylinder Head Temp (CHT)** | $120^\circ\text{F}$ | $300 - 390^\circ\text{F}$ | $390 - 430^\circ\text{F}$ | $435^\circ\text{F}$ ($224^\circ\text{C}$) |
| **Exhaust Gas Temp (EGT)** | $1,100^\circ\text{F}$ | $1,400 - 1,620^\circ\text{F}$ | $1,620 - 1,680^\circ\text{F}$ | $1,750^\circ\text{F}$ ($954^\circ\text{C}$) |
| **Oil Pressure** | $12 \text{ PSI}$ (idle) | $40 - 75 \text{ PSI}$ | $75 - 95 \text{ PSI}$ | $100 \text{ PSI}$ ($7.0 \text{ bar}$) |
| **Oil Temperature** | $120^\circ\text{F}$ | $170 - 230^\circ\text{F}$ | $230 - 265^\circ\text{F}$ | $284^\circ\text{F}$ ($140^\circ\text{C}$) |
| **Fuel Rail Pressure** | $2.5 \text{ bar}$ | $2.8 - 3.2 \text{ bar}$ | $3.2 - 4.0 \text{ bar}$ | $4.8 \text{ bar}$ |
| **Engine Vibration RMS** | $0.2 \text{ g}$ | $0.5 - 1.8 \text{ g}$ | $1.8 - 2.8 \text{ g}$ | $3.5 \text{ g}$ |
| **Vibration Kurtosis ($K_4$)** | $2.5$ | $2.8 - 3.4$ | $3.5 - 5.0$ | $> 6.5$ (Spalling) |
| **Main 28V DC Bus** | $24.0 \text{ V}$ | $27.6 - 28.5 \text{ V}$ | $23.0 - 24.0 \text{ V}$ | $< 22.0 \text{ V}$ |

---

## 3. Defense & Airworthiness Compliance Framework

The Digital Twin software architecture aligns with critical civil and military aerospace airworthiness standards:

### 3.1 DO-178C Level B (Software Considerations in Airborne Systems)
- **Safety Criticality**: Level B — Failure condition is categorized as *Hazardous/Severe-Major*.
- **Deterministic Bounds**: All runtime inference models execute within deterministic execution bounds ($<10 \text{ ms}$ latency budget per 10 Hz telemetry epoch).
- **Graceful Fallback**: If deep learning prognostics models encounter corrupted input, the system seamlessly falls back to the deterministic thermodynamic physics model without pipeline interruption.

### 3.2 ATA-100 Specification Alignment
Diagnostics and prescriptive maintenance advisories map directly to standard Air Transport Association (ATA) chapter classifications:
- **ATA Chapter 72**: Engine (Reciprocating, Cylinders, Bearings, Crankshaft)
- **ATA Chapter 73**: Engine Fuel & Control (Fuel pumps, Injectors, Regulators, Rail)
- **ATA Chapter 74**: Ignition (Spark plugs, Magnetos, Coils, Ignition harness)
- **ATA Chapter 75**: Air (Cooling baffles, Radiator, Intercooler, Turbo ducts)
- **ATA Chapter 77**: Engine Indicating (Thermistors, Thermocouples, Pressure transducers)
- **ATA Chapter 79**: Engine Oil (Oil tank, Sump pump, Oil cooler, Filters)
- **ATA Chapter 80**: Starting (Starter motor, Battery bus, Alternator)

---

## 4. Avionics Bus & Telemetry Interface Architecture

### 4.1 SAE J1939 CAN Bus Profile
The engine telemetry bridges onto a simulated $250 \text{ kbps}$ Controller Area Network (CAN) bus conforming to SAE J1939:

| Parameter Group Number (PGN) | CAN ID (29-bit) | Transmission Rate | Parameters Encoded |
|---|---|---|---|
| **PGN 65262 (0xFEEE)** | `0x18FEEE00` | $10 \text{ Hz}$ | Engine Coolant Temp, Oil Temp, Fuel Temp |
| **PGN 65271 (0xFEF7)** | `0x18FEF700` | $10 \text{ Hz}$ | Electrical Bus Voltage, Alternator Current |
| **PGN 65272 (0xFEF8)** | `0x18FEF800` | $20 \text{ Hz}$ | Transmission Oil Pressure, Engine Oil Pressure |
| **PGN 61444 (0xF004)** | `0x0CF00400` | $50 \text{ Hz}$ | Actual Engine Percent Torque, Engine Speed (RPM) |
| **Proprietary PGN 65520** | `0x18FF0000` | $10 \text{ Hz}$ | 4-Cylinder Individual CHT/EGT Array & Kurtosis |

### 4.2 MQTT Telemetry Serialization
Payloads broadcast on topic `uav/engine/telemetry` use JSON structures with synchronized timestamps and sequence counters to facilitate replay detection and packet loss analysis.

---

## 5. Multi-UAV Fleet Operational Profiles

The Digital Twin platform manages multi-aircraft operations through four operational profiles:
1. **NORMAL (ISR Cruise)**: Standard loiter at $3,000 \text{ ft}$ MSL, $15^\circ\text{C}$ OAT, $55\%$ MCP.
2. **HIGH_ALTITUDE (Stand-off Reconnaissance)**: Loiter at $18,000 - 25,000 \text{ ft}$ MSL, $-20^\circ\text{C}$ OAT, high MAP, advanced timing.
3. **HOT_WEATHER (Desert Forward Operations)**: Low-level loiter at $45^\circ\text{C}$ ambient, reduced cooling delta, high radiator fouling risk.
4. **ENDURANCE (Lean-of-Peak Range Extension)**: Maximized fuel economy at lean mixture, monitored for combustion roughness.
5. **RAPID_THROTTLE (Dynamic Combat Maneuvering)**: High thermal cycling, rapid RPM ramps, monitored for bearing wear and thermal fatigue.
