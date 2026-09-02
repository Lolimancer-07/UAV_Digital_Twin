# UAV Digital Twin — Aero Piston Engine Health Monitoring

A digital twin system for MALE UAV piston engines. It simulates a live engine, watches its telemetry with a mix of physics equations and machine learning, catches problems before they become failures, and shows all of it on a dashboard — basically a virtual copy of the engine that runs alongside the real (or in this case, simulated) one.

Built for Smart India Hackathon, based on the problem statement around predictive maintenance for MALE UAV propulsion systems.

## Why this exists

Most engine monitoring on UAVs today is threshold-based — a light turns red *after* something already went wrong. There's no way to predict how much life a component has left, no way to explain *why* an alert fired, and no easy way to replay a mission afterward to figure out what happened. This project tries to fix that by combining:

- **Physics-based modeling** (actual thermodynamics, not just "if temp > X, alarm")
- **Machine learning** for anomaly detection and remaining life prediction
- **Explainability**, so an engineer isn't just told "fault detected" with no reasoning
- **A live dashboard** an operator can actually use

## What it does

- Streams simulated engine telemetry in real time (RPM, CHT, EGT, oil pressure/temp, fuel flow, vibration, battery/alternator health, injection timing)
- Compares live sensor data against a physics model of the engine to catch things that don't add up
- Runs an Isolation Forest model to flag anomalies without needing labeled failure data
- Predicts Remaining Useful Life (RUL) using an LSTM trained on engine degradation data
- Explains *why* a fault was flagged (which sensors contributed, and how much)
- Generates maintenance recommendations in a format similar to real aviation maintenance manuals (ATA-100 style)
- Talks over CAN bus using the actual SAE J1939 protocol format, so it behaves like it's wired to real aviation hardware
- Displays everything on a dashboard with live charts, a CAN traffic viewer, and voice alerts

## How it's put together

```
Engine Simulator (fakes/generates sensor data)
        │  MQTT
        ▼
AI + Physics Backend (analyzes it live)
        │  WebSocket
        ▼
Dashboard (what a human looks at)
```

The simulator pretends to be a real engine and broadcasts data over MQTT. The backend listens, runs it through the physics model + ML models, and streams the results to the browser dashboard over WebSocket. Nothing here needs an internet connection — it's all local.

## Tech stack

| Layer | Tools |
|---|---|
| Simulation | Python, C (for the ECU simulator) |
| Messaging | MQTT (Mosquitto broker) |
| Backend / AI | Python, TensorFlow/Keras (LSTM), Scikit-learn (Isolation Forest), NumPy, Pandas |
| Live updates | WebSocket |
| Vehicle protocol | SAE J1939 over CAN bus |
| Dashboard | HTML/JS |
| Training data | NASA C-MAPSS (adapted) |

## Project structure

```
UAV_Digital_Twin/
├── simulator/
│   ├── mission_sim.py       # generates live fake sensor data + flight scenarios
│   ├── ecu_sim.c             # C-based engine computer simulator
│   └── can_bridge.py         # converts data to real CAN/J1939 message format
├── backend/
│   ├── inference.py           # main loop, ties everything together
│   ├── physics_engine.py      # thermodynamic engine model
│   ├── anomaly_detector.py    # Isolation Forest model
│   ├── uav_rul_model.h5       # trained LSTM for RUL prediction
│   ├── xai_engine.py          # explains model decisions
│   ├── health_index.py        # rolls everything into a 0–100 health score
│   ├── maintenance_advisor.py # generates maintenance recommendations
│   ├── scaler.pkl
│   └── anomaly_model.pkl
├── frontend/
│   └── index.html              # dashboard
├── data/
│   └── telemetry_ready.csv     # training dataset
├── train_models.py
├── stage1_prep.py
├── stage3_train_model.py
└── run.sh                      # starts everything (Linux/Mac)
```

## Setup

You'll need Python 3.9+ and a C compiler either way. Pick the section for your OS below.

### Linux / macOS

```bash
git clone https://github.com/Lolimancer-07/UAV_Digital_Twin.git
cd UAV_Digital_Twin

# install Mosquitto (the MQTT broker)
sudo apt install mosquitto mosquitto-clients   # Debian/Ubuntu
# or: brew install mosquitto                   # macOS

# python deps
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# run everything
chmod +x run.sh
./run.sh
```

Then open `frontend/index.html` in a browser.

### Windows

`run.sh` won't run natively on Windows since it's a bash script, so you've got two options — pick whichever's less painful for you.

**Option A: WSL (recommended, easiest)**

If you have WSL (Windows Subsystem for Linux) installed, just run the exact same Linux steps above, inside your WSL terminal (Ubuntu). This avoids basically every Windows-specific headache with compiling C and installing MQTT.

```bash
wsl
# then follow the Linux/macOS steps above
```

If you don't have WSL yet: open PowerShell as Administrator and run `wsl --install`, restart, and you're set.

**Option B: Native Windows**

1. **Install Python 3.9+** from [python.org](https://python.org) — make sure to check "Add Python to PATH" during install.

2. **Install a C compiler.** The simplest route is MSYS2:
   - Download and install from [msys2.org](https://www.msys2.org)
   - Open the MSYS2 terminal and run:
     ```
     pacman -S mingw-w64-ucrt-x86_64-gcc
     ```
   - Add `C:\msys64\ucrt64\bin` to your Windows PATH

3. **Install Mosquitto** (MQTT broker):
   - Download the Windows installer from [mosquitto.org/download](https://mosquitto.org/download)
   - During install, make sure the service starts automatically, or start it manually afterward:
     ```
     net start mosquitto
     ```

4. **Set up the Python environment** (in PowerShell or Command Prompt, from the project folder):
   ```powershell
   git clone https://github.com/Lolimancer-07/UAV_Digital_Twin.git
   cd UAV_Digital_Twin
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

5. **Compile the C simulator manually** (since `run.sh` won't do it for you):
   ```powershell
   gcc simulator\ecu_sim.c -o simulator\ecu_sim.exe -lpaho-mqtt3c
   ```
   (You may need to install the Paho MQTT C library separately for MSYS2 — grab it via `pacman -S mingw-w64-ucrt-x86_64-paho-mqtt-c` if the above fails to link.)

6. **Run each component manually**, since there's no Windows equivalent of `run.sh` yet — open separate terminal windows for each:
   ```powershell
   # terminal 1
   venv\Scripts\activate
   python backend\inference.py

   # terminal 2
   venv\Scripts\activate
   python simulator\mission_sim.py

   # terminal 3
   simulator\ecu_sim.exe
   ```

7. Open `frontend\index.html` in your browser.

If this feels like a lot — it is — that's basically why Option A (WSL) exists. Save yourself the trouble unless you specifically need this running natively on Windows.

## Model performance (from training)

- LSTM RUL prediction: ~14.8 cycles average error (RMSE), inference under 2.5ms
- Isolation Forest: near-100% catch rate on failing engine data in testing, under ~3% false alarms on healthy data

(Worth double-checking whether these numbers came from a proper held-out test split before quoting them to judges.)

## What's missing / possible next steps

- A dedicated "replay saved mission" mode, separate from the live simulation
- Actual edge deployment story (Raspberry Pi / Jetson) — right now this assumes a full desktop-class stack
- TLS on the MQTT/WebSocket layer for a "secure telemetry" story
- Validation of the physics model against real published engine curves, not just internal consistency
- A native Windows `run.bat` / PowerShell equivalent of `run.sh`

## Dataset note

Training data is adapted from NASA's C-MAPSS turbofan degradation dataset, restructured to represent piston-engine-style parameters. Worth being upfront about this if asked — it's not real piston-engine field data, it's a NASA dataset repurposed for this use case.

## Acknowledgments

Built for Smart India Hackathon. Uses the NASA C-MAPSS dataset for model training.
