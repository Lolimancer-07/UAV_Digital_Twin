# Implementation Plan: Professional Aerospace Ground Control Station (GCS) & Advanced Digital Twin Features

Transform the existing interface from a casual neon/retro aesthetic into an authentic, defense-grade aerospace Ground Control Station (GCS) interface suitable for high-stakes hackathon judging, while adding high-impact features (Tactical Voice Alerts, Component Inspection Drawer, Physics Residual Tracking, Multi-Cylinder Thermal Balance, and Tabbed Console Architecture).

---

## User Review Required

> [!IMPORTANT]
> **Design Transition**: We are eliminating all game-like elements (retro scanlines, fluorescent neon glows, arcade fonts like Orbitron) in favor of a modern **MIL-STD / DO-178 Defense Console** aesthetic using `Inter` / `Plus Jakarta Sans` and `JetBrains Mono`, clean glassmorphic tactical slate surfaces (`#0b0f19`, `#111827`), precision micro-gauges, and structured aerospace data density.

> [!TIP]
> **New Hackathon-Winning Features**:
> 1. **Tactical Master Caution Audio System**: Synthesized voice alerts for critical engine events (e.g. *"Warning: Oil pressure below minimum"*, toggleable on/off).
> 2. **Interactive Component Inspection Drawer**: Click any engine component (Cylinders 1-4, Oil Gallery, Fuel Rail, Alternator) to inspect live sub-telemetry.
> 3. **Physics Residual & Sensor Drift Engine**: Real-time comparison of theoretical physics expected values vs measured sensor values.
> 4. **Multi-Cylinder Thermal Balance Gauge**: Visualizing thermal spread across all 4 cylinders.
> 5. **Tabbed Multi-Deck Architecture**: 5 dedicated views (Overview, AI Prognostics, Thermodynamics, CAN FDR, ATA Maintenance).

---

## Proposed Changes

Grouped by component layer:

### 1. Frontend Redesign (`frontend/index.html`)

#### [MODIFY] [index.html](file:///home/rishi/UAV_Digital_Twin/frontend/index.html)
- **Design System & Aesthetics**:
  - Replace fonts with Google Fonts: `Inter` (UI typography) and `JetBrains Mono` (telemetry data).
  - Adopt high-contrast tactical color palette: Slate Navy `#0b0f19`, Surface `#111827`, Crisp Borders `rgba(255,255,255,0.08)`, Cyan `#0ea5e9`, Emerald `#10b981`, Amber `#f59e0b`, Red `#ef4444`, Indigo `#8b5cf6`.
  - Remove scanlines and pulsating neon filters.
- **Top Mission Bar**:
  - Zulu Time (UTC) clock + Mission Elapsed Time (MET).
  - Tactical Master Caution / Warning Annunciator panel.
  - UAV Tail Identifier (`UAV-MALE-07`) and Flight Phase indicator (`TAKEOFF`, `CLIMB`, `ISR LOITER`, `DESCENT`).
  - Audio Master Mute/Unmute toggle.
- **5-Tab Console Views**:
  1. **🛰️ Overview & Synoptic**: Clean CAD-style 2D vector engine diagram with clickable components, 14-channel sensor cards with sparklines, cylinder thermal balance, and health summary.
  2. **🧠 AI Prognostics & XAI**: Deep LSTM RUL curve with upper/lower confidence bands, Isolation Forest anomaly timeline, and feature attribution waterfall chart.
  3. **⚙️ Thermodynamic Performance**: Dynamic P-V Indicator loop, BSFC fuel map, Brake Power (BHP) vs RPM, and Physics Residual monitor ($\Delta = \text{Sensor} - \text{Expected}$).
  4. **📡 CAN Bus / Flight Recorder**: Real-time SAE J1939 CAN frame inspector with filter/search, hex packet viewer, and CSV exporter.
  5. **🛠️ ATA Maintenance & Dossier**: ATA Chapters (72, 73, 75, 77, 79, 80) work-orders, airworthiness status, and printable Technical Mission Dossier.
- **Bottom Command Deck**:
  - Mission Flight Profiles (`Normal ISR`, `High Altitude 18k FT`, `Hot Desert 45°C`, `Max Endurance`, `Rapid Throttle`).
  - Interactive Fault Injection testbed (`Misfire`, `Injector Clog`, `Cooling Degradation`, `Oil Leak`, `Sensor Drift`, `Bearing Wear`, `Combustion Instability`).
  - Simulation Speed & Playback Controller (`1X`, `2X`, `5X`, `10X`, `PAUSE/RESUME`, `STEP`).

---

### 2. Backend & Simulator Integration

#### [MODIFY] [inference.py](file:///home/rishi/UAV_Digital_Twin/backend/inference.py)
- Ensure all telemetry packets include complete multi-cylinder data, physics residuals, flight phases, and component states for seamless synchronization with the new tabbed views.

#### [MODIFY] [physics_engine.py](file:///home/rishi/UAV_Digital_Twin/backend/physics_engine.py)
- Refine theoretical baseline calculations for all 4 cylinders and provide residual delta arrays ($\Delta \text{CHT}, \Delta \text{EGT}, \Delta \text{OilP}, \Delta \text{BSFC}$).

---

## Verification Plan

### Automated & Unit Checks
- Verify Python syntax across all backend modules:
  ```bash
  /home/rishi/anaconda3/bin/python -m py_compile backend/inference.py backend/physics_engine.py
  ```

### System Verification & Live Test
1. Launch full digital twin system:
   ```bash
   ./run.sh
   ```
2. Verify:
   - WebSocket connection on `ws://localhost:8765` connects within 2 seconds.
   - All 5 console tabs switch smoothly without re-rendering delays.
   - Interactive component click opens the sub-telemetry inspection drawer.
   - Injecting faults (e.g. `Ignition Misfire`, `Oil Leak`) triggers the Master Caution indicator, updates XAI attribution, and generates ATA work orders.
   - Switching mission profiles (`High Altitude`, `Hot Weather`) updates environmental altitude, density, and thermodynamic P-V loop in real-time.
   - Audio alert triggers when critical faults occur (when unmuted).
   - "Download Dossier" generates a clean, professional print-ready report.
