#!/usr/bin/env python3
"""
simulator/mission_sim.py
--------------------------
Advanced Multi-Channel UAV Aero Piston Engine Mission & Physics Simulator.

Features:
  1. Full 14-Channel Telemetry Suite with Multi-Cylinder (Cyl 1..4) CHT & EGT Arrays
  2. Real-Time Environmental Flight Physics (ISA Altitude, Density Ratio, Hot Day, Endurance)
  3. Interactive Live Fault Injection System (Misfire, Injector, Cooling, Oil Leak, Sensor Drift)
  4. Real-Time SAE J1939 / SocketCAN Frame Encoding
  5. Playback Speed Control (1x, 2x, 5x, 10x, Pause/Resume, Cycle Scrub)
"""

import paho.mqtt.client as mqtt
import json, os, sys, time, math
import numpy as np
import pandas as pd

from can_bridge import AeroCANBridge

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH     = os.path.join(ROOT, 'data', 'telemetry_ready.csv')
CONTROL_FILE = os.path.join(ROOT, 'simulator', 'current_profile.json')

MAX_RUL  = 260.0
ADDRESS  = "tcp://localhost:1883"
TOPIC    = "uav/engine/telemetry"

# ── Mission Environmental Profiles ───────────────────────────────────────────
PROFILES = {
    "NORMAL": dict(
        altitude_ft=3000, oat_c=15.0, rpm_factor=1.00, cht_offset=0.0,
        egt_factor=1.00, oil_factor=1.00, fuel_factor=1.00, vib_factor=1.00,
        map_kpa=96.0, base_hz=10, description="Standard ISR patrol at 3,000 ft MSL"
    ),
    "HIGH_ALTITUDE": dict(
        altitude_ft=18000, oat_c=-20.0, rpm_factor=0.92, cht_offset=-18.0,
        egt_factor=1.12, oil_factor=0.92, fuel_factor=1.16, vib_factor=1.08,
        map_kpa=52.0, base_hz=10, description="High Altitude Loiter at 18,000 ft (Thin air, high EGT, derated MAP)"
    ),
    "HOT_WEATHER": dict(
        altitude_ft=1500, oat_c=45.0, rpm_factor=0.97, cht_offset=48.0,
        egt_factor=1.06, oil_factor=0.86, fuel_factor=1.08, vib_factor=1.06,
        map_kpa=98.0, base_hz=10, description="Desert / Hot Weather Ops (45°C ambient, elevated CHT & oil temp)"
    ),
    "ENDURANCE": dict(
        altitude_ft=8000, oat_c=0.0, rpm_factor=0.82, cht_offset=-12.0,
        egt_factor=0.96, oil_factor=1.04, fuel_factor=0.78, vib_factor=0.88,
        map_kpa=75.0, base_hz=5, description="Max-Endurance Loiter (Lean of peak, fuel conservation, reduced RPM)"
    ),
    "RAPID_THROTTLE": dict(
        altitude_ft=4000, oat_c=12.0, rpm_factor=1.00, cht_offset=22.0,
        egt_factor=1.08, oil_factor=0.90, fuel_factor=1.20, vib_factor=1.50,
        map_kpa=102.0, base_hz=10, description="Tactical Evasive Maneuvers (Dynamic throttle surges, high mechanical stress)"
    ),
}

# ── Global Simulation State ───────────────────────────────────────────────────
sim_state = {
    "profile": "NORMAL",
    "speed": 1.0,
    "paused": False,
    "injected_faults": set(),
    "current_cycle": 1
}


def read_control():
    """Reads profile, speed, pause state, and injected faults from shared JSON."""
    global sim_state
    try:
        if os.path.exists(CONTROL_FILE):
            with open(CONTROL_FILE, 'r') as f:
                d = json.load(f)
            sim_state["profile"] = d.get("mode", sim_state["profile"])
            sim_state["speed"] = max(0.2, min(10.0, float(d.get("speed", sim_state["speed"]))))
            sim_state["paused"] = bool(d.get("paused", sim_state["paused"]))
            sim_state["injected_faults"] = set(d.get("injected_faults", []))
    except Exception:
        pass


def clamp(val, lo, hi):
    return max(lo, min(hi, val))


def build_telemetry_packet(row, cycle_idx: int, prof: dict, faults: set) -> dict:
    """
    Synthesizes full 14-channel aero engine state with physics interactions and fault injections.
    """
    rng = np.random
    rul = float(row.get('rul', 150))
    deg = clamp(1.0 - (rul / MAX_RUL), 0.0, 1.0)

    # 1. Base RPM
    base_rpm = float(row['rpm']) * prof['rpm_factor']
    if "RAPID_THROTTLE" == sim_state["profile"]:
        base_rpm += math.sin(cycle_idx * 0.45) * 160.0
    rpm = clamp(base_rpm + rng.normal(0, 4.0), 600.0, 2800.0)

    # 2. Multi-Cylinder CHT (°F) (Cylinders 1, 2, 3, 4)
    base_cht = float(row['cht']) * 0.60 + prof['cht_offset']  # Scale to aero piston ~360-420°F
    cht_avg = clamp(base_cht + (deg * 35.0) + rng.normal(0, 1.5), 150.0, 520.0)
    # Cylinders have minor realistic thermal gradients (rear cylinders run hotter)
    cht_cyl = [
        round(cht_avg - 4.5 + rng.normal(0, 0.8), 1),
        round(cht_avg - 2.0 + rng.normal(0, 0.8), 1),
        round(cht_avg + 3.0 + rng.normal(0, 0.8), 1),
        round(cht_avg + 5.5 + rng.normal(0, 0.8), 1),
    ]

    # 3. Multi-Cylinder EGT (°F) (Cylinders 1, 2, 3, 4)
    base_egt = float(row['egt']) * prof['egt_factor']
    egt_avg = clamp(base_egt + (deg * 25.0) + rng.normal(0, 4.0), 800.0, 1750.0)
    egt_cyl = [
        round(egt_avg - 8.0 + rng.normal(0, 2.0), 1),
        round(egt_avg - 3.0 + rng.normal(0, 2.0), 1),
        round(egt_avg + 4.0 + rng.normal(0, 2.0), 1),
        round(egt_avg + 7.0 + rng.normal(0, 2.0), 1),
    ]

    # 4. Oil Pressure & Oil Temperature
    oil_press = clamp((62.0 - deg * 26.0) * prof['oil_factor'] + rng.normal(0, 1.2), 10.0, 85.0)
    oil_temp = clamp((175.0 + deg * 35.0 + (prof['cht_offset'] * 0.4)) + rng.normal(0, 1.0), 100.0, 260.0)

    # 5. Fuel Flow & Rail Pressure
    fuel_flow = clamp((rpm / 1400.0) * 8.5 * prof['fuel_factor'] + (deg * 1.5) + rng.normal(0, 0.12), 0.5, 20.0)
    fuel_rail_bar = clamp(3.0 - (deg * 0.4) + rng.normal(0, 0.05), 1.0, 5.0)

    # 6. Vibration Signatures (RMS & Kurtosis)
    vib_rms = clamp((0.40 + deg * 2.8) * prof['vib_factor'] + rng.normal(0, 0.05), 0.1, 8.0)
    vib_kurt = clamp(3.0 + (deg * 2.0) + rng.normal(0, 0.1), 2.5, 8.0)

    # 7. Electrical Subsystem (Voltage & Bus Current)
    batt_v = clamp(13.8 - (deg * 0.7) + rng.normal(0, 0.04), 10.5, 15.0)
    bus_current = clamp(18.0 + (rpm / 2000.0) * 8.0 + rng.normal(0, 0.5), 5.0, 45.0)

    # 8. Ignition & Control
    inj_timing = clamp(28.0 - (deg * 7.5) + rng.normal(0, 0.25), 12.0, 36.0)
    map_kpa = clamp(prof['map_kpa'] + rng.normal(0, 0.8), 30.0, 120.0)

    # ── Apply Interactive Fault Injections (On-Demand Demo Capabilities) ──────
    misfire_flag = False
    cooling_flag = False

    if "misfire" in faults:
        rpm -= 240.0
        egt_avg += 95.0
        egt_cyl[1] -= 350.0  # Dead cylinder #2
        vib_rms += 2.2
        vib_kurt += 3.0
        misfire_flag = True

    if "injector_clog" in faults:
        fuel_flow *= 0.45
        fuel_rail_bar = 1.8
        egt_cyl[0] += 120.0  # Lean cylinder #1 spike

    if "cooling_degradation" in faults:
        cht_avg += 65.0
        cht_cyl = [c + 65.0 for c in cht_cyl]
        oil_temp += 38.0
        cooling_flag = True

    if "oil_leak" in faults:
        oil_press = 24.5  # Critical drop
        oil_temp += 45.0
        vib_rms += 0.8

    if "sensor_drift" in faults:
        egt_avg = 950.0  # Thermocouple cold short
        cht_avg = 480.0

    if "bearing_wear" in faults:
        vib_rms += 3.5
        vib_kurt = 6.8
        oil_press -= 12.0

    if "combustion_instability" in faults:
        inj_timing = 14.0  # Retarded timing
        vib_rms += 1.6
        egt_avg += 80.0

    # Build primary telemetry dictionary
    packet = {
        "engine_id":              int(row.get('engine_id', 1)),
        "cycle":                  int(row.get('cycle', cycle_idx)),
        "rpm":                    round(float(rpm), 2),
        "cht":                    round(float(cht_avg), 2),
        "cht_cyl":                cht_cyl,
        "egt":                    round(float(egt_avg), 2),
        "egt_cyl":                egt_cyl,
        "oil_pressure":           round(float(oil_press), 2),
        "oil_temp":               round(float(oil_temp), 2),
        "fuel_flow":              round(float(fuel_flow), 3),
        "fuel_rail_pressure_bar": round(float(fuel_rail_bar), 2),
        "vibration":              round(float(vib_rms), 4),
        "vibration_kurtosis":     round(float(vib_kurt), 2),
        "battery_v":              round(float(batt_v), 2),
        "bus_current_a":          round(float(bus_current), 2),
        "inj_timing":             round(float(inj_timing), 2),
        "map_kpa":                round(float(map_kpa), 2),
        "true_rul":               rul,
        "altitude_ft":            prof.get("altitude_ft", 3000),
        "oat_c":                  prof.get("oat_c", 15.0),
        "mission_mode":           sim_state["profile"],
        "active_faults":          list(faults),
        "misfire_active":         misfire_flag,
        "cooling_degradation_active": cooling_flag,
    }

    # Generate matching CAN bus frames
    packet["can_frames"] = AeroCANBridge.generate_packet_burst(packet)

    return packet


# ── MQTT Client Setup ─────────────────────────────────────────────────────────
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

def on_connect(c, userdata, flags, rc, props):
    if rc == 0:
        print("[SIM] Connected to MQTT broker at localhost:1883")
    else:
        print(f"[SIM] MQTT connection failed (rc={rc})")
        sys.exit(1)

client.on_connect = on_connect
client.connect("localhost", 1883, 60)
client.loop_start()

# ── Main Telemetry Loop ───────────────────────────────────────────────────────
print(f"[SIM] Loading dataset: {CSV_PATH}")
df = pd.read_csv(CSV_PATH)
print(f"[SIM] {len(df):,} cycles loaded. Starting advanced UAV propulsion simulation...\n")

cycle_counter = 1
while True:
    for idx, row in df.iterrows():
        read_control()

        # Handle pause
        while sim_state["paused"]:
            time.sleep(0.2)
            read_control()

        prof_name = sim_state["profile"]
        prof = PROFILES.get(prof_name, PROFILES["NORMAL"])
        faults = sim_state["injected_faults"]

        payload = build_telemetry_packet(row, cycle_counter, prof, faults)
        msg = json.dumps(payload)
        client.publish(TOPIC, msg, qos=0)

        fault_str = f" [FAULTS: {','.join(faults)}]" if faults else ""
        print(f"Tx [E{payload['engine_id']:02d} C{payload['cycle']:04d}] "
              f"RUL={payload['true_rul']:3.0f} | "
              f"RPM={payload['rpm']:6.1f} CHT={payload['cht']:5.1f}°F "
              f"EGT={payload['egt']:6.1f}°F OIL={payload['oil_pressure']:4.1f}PSI "
              f"VIB={payload['vibration']:.2f}g [{prof_name}]{fault_str}")

        cycle_counter += 1

        # Rate control
        sleep_dur = (1.0 / prof["base_hz"]) / max(0.2, sim_state["speed"])
        time.sleep(sleep_dur)

    print("\n[SIM] Mission complete. Looping dataset...\n")
