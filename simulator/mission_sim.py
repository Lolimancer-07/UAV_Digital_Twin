#!/usr/bin/env python3
"""
simulator/mission_sim.py

The main mission simulator — reads the telemetry dataset and streams it
to the MQTT broker at 10 Hz, simulating a live UAV propulsion system.

Key features:
  - 14-channel telemetry with per-cylinder CHT and EGT arrays (4 cylinders each)
  - Environmental profiles: Normal, High Altitude, Hot Weather, Endurance, Rapid Throttle
  - Live fault injection: misfire, injector clog, cooling degradation, oil leak, etc.
  - Playback speed control (1x–10x) and pause/resume via shared JSON file
  - SAE J1939 CAN frame generation via can_bridge.py

The control file (current_profile.json) is how the GCS talks to the simulator —
the inference engine writes commands to it and we pick them up each loop.
"""

import paho.mqtt.client as mqtt
import json, os, sys, time, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import pandas as pd

from can_bridge import AeroCANBridge

# figure out the project root from our own path
ROOT         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH     = os.path.join(ROOT, 'data', 'telemetry_ready.csv')
CONTROL_FILE = os.path.join(ROOT, 'simulator', 'current_profile.json')

MAX_RUL  = 260.0
ADDRESS  = "tcp://localhost:1883"
TOPIC    = "uav/engine/telemetry"

# five mission environments — each tweaks sensor values to reflect real ops conditions
PROFILES = {
    "NORMAL": dict(
        altitude_ft=3000, oat_c=15.0, rpm_factor=1.00, cht_offset=0.0,
        egt_factor=1.00, oil_factor=1.00, fuel_factor=1.00, vib_factor=1.00,
        map_kpa=96.0, base_hz=1.0, description="Standard ISR patrol at 3,000 ft MSL"
    ),
    "HIGH_ALTITUDE": dict(
        altitude_ft=18000, oat_c=-20.0, rpm_factor=0.92, cht_offset=-18.0,
        egt_factor=1.12, oil_factor=0.92, fuel_factor=1.16, vib_factor=1.08,
        map_kpa=52.0, base_hz=1.0, description="High Altitude Loiter at 18,000 ft (Thin air, high EGT, derated MAP)"
    ),
    "HOT_WEATHER": dict(
        altitude_ft=1500, oat_c=45.0, rpm_factor=0.97, cht_offset=48.0,
        egt_factor=1.06, oil_factor=0.86, fuel_factor=1.08, vib_factor=1.06,
        map_kpa=98.0, base_hz=1.0, description="Desert / Hot Weather Ops (45°C ambient, elevated CHT & oil temp)"
    ),
    "ENDURANCE": dict(
        altitude_ft=8000, oat_c=0.0, rpm_factor=0.82, cht_offset=-12.0,
        egt_factor=0.96, oil_factor=1.04, fuel_factor=0.78, vib_factor=0.88,
        map_kpa=75.0, base_hz=0.8, description="Max-Endurance Loiter (Lean of peak, fuel conservation, reduced RPM)"
    ),
    "RAPID_THROTTLE": dict(
        altitude_ft=4000, oat_c=12.0, rpm_factor=1.00, cht_offset=22.0,
        egt_factor=1.08, oil_factor=0.90, fuel_factor=1.20, vib_factor=1.50,
        map_kpa=102.0, base_hz=1.2, description="Tactical Evasive Maneuvers (Dynamic throttle surges, high mechanical stress)"
    ),
}

# global simulation state — updated by read_control() each loop
sim_state = {
    "profile": "NORMAL",
    "speed": 1.0,
    "paused": False,
    "injected_faults": set(),
    "current_cycle": 1,
    "engine_id": 1,
    "uav_id": "UAV-01",
}


def read_control():
    """Reads profile, speed, pause state, engine_id, and injected faults from the shared JSON control file."""
    global sim_state
    try:
        if os.path.exists(CONTROL_FILE):
            with open(CONTROL_FILE, 'r') as f:
                d = json.load(f)
            sim_state["profile"] = d.get("mode", sim_state["profile"])
            sim_state["speed"] = max(0.2, min(10.0, float(d.get("speed", sim_state["speed"]))))
            sim_state["paused"] = bool(d.get("paused", sim_state["paused"]))
            sim_state["injected_faults"] = set(d.get("injected_faults", []))
            if "engine_id" in d:
                sim_state["engine_id"] = int(d["engine_id"])
            if "uav_id" in d:
                sim_state["uav_id"] = str(d["uav_id"])
    except Exception:
        pass


def clamp(val, lo, hi):
    return max(lo, min(hi, val))


SIMULATED_NAV_ROUTE = [
    (26.706, 78.026),  # Home Base
    (26.755, 78.118),  # Alpha Ridge
    (26.812, 78.208),  # Bravo Survey
    (26.858, 78.120),  # Charlie Loiter
    (26.706, 78.026),  # Return to Home Base
]


def simulated_navigation(cycle_idx: int) -> dict:
    """Generate a deterministic training-corridor track for the GCS map.

    These values are explicitly simulated—not a replacement for an onboard
    GNSS receiver—and are additive to the existing propulsion telemetry.
    """
    progress = ((cycle_idx - 1) % 320) / 319.0
    segment_position = progress * (len(SIMULATED_NAV_ROUTE) - 1)
    segment = min(len(SIMULATED_NAV_ROUTE) - 2, int(segment_position))
    local_progress = segment_position - segment
    lat_a, lon_a = SIMULATED_NAV_ROUTE[segment]
    lat_b, lon_b = SIMULATED_NAV_ROUTE[segment + 1]
    latitude = lat_a + (lat_b - lat_a) * local_progress
    longitude = lon_a + (lon_b - lon_a) * local_progress
    heading_deg = (math.degrees(math.atan2(lon_b - lon_a, lat_b - lat_a)) + 360.0) % 360.0
    ground_speed_kts = 58.0 + math.sin(cycle_idx * 0.08) * 3.0
    return {
        "latitude": round(latitude, 5),
        "longitude": round(longitude, 5),
        "heading_deg": round(heading_deg, 0),
        "ground_speed_kts": round(ground_speed_kts, 1),
        "mission_progress_pct": round(progress * 100.0, 1),
    }


def build_telemetry_packet(row, cycle_idx: int, prof: dict, faults: set) -> dict:
    """
    Synthesizes a full 14-channel telemetry packet with realistic physics
    interactions, degradation trends, and any active fault injections.
    """
    rng = np.random
    rul = float(row.get('rul', 150))
    deg = clamp(1.0 - (rul / MAX_RUL), 0.0, 1.0)  # 0.0 = new, 1.0 = end of life

    # RPM — with sinusoidal throttle variation in RAPID_THROTTLE mode
    base_rpm = float(row['rpm']) * prof['rpm_factor']
    if "RAPID_THROTTLE" == sim_state["profile"]:
        base_rpm += math.sin(cycle_idx * 0.45) * 160.0
    rpm = clamp(base_rpm + rng.normal(0, 0.6), 600.0, 2800.0)

    # per-cylinder CHT — rear cylinders naturally run a bit hotter
    base_cht = float(row['cht']) * 0.60 + prof['cht_offset']  # scale raw data into aero piston range
    cht_avg = clamp(base_cht + (deg * 35.0) + rng.normal(0, 0.25), 150.0, 520.0)
    cht_cyl = [
        round(cht_avg - 4.5 + rng.normal(0, 0.15), 1),
        round(cht_avg - 2.0 + rng.normal(0, 0.15), 1),
        round(cht_avg + 3.0 + rng.normal(0, 0.15), 1),
        round(cht_avg + 5.5 + rng.normal(0, 0.15), 1),
    ]

    # per-cylinder EGT — same pattern, slight inter-cylinder variation
    base_egt = float(row['egt']) * prof['egt_factor']
    egt_avg = clamp(base_egt + (deg * 25.0) + rng.normal(0, 0.6), 800.0, 1750.0)
    egt_cyl = [
        round(egt_avg - 8.0 + rng.normal(0, 0.4), 1),
        round(egt_avg - 3.0 + rng.normal(0, 0.4), 1),
        round(egt_avg + 4.0 + rng.normal(0, 0.4), 1),
        round(egt_avg + 7.0 + rng.normal(0, 0.4), 1),
    ]

    # oil system
    oil_press = clamp((62.0 - deg * 26.0) * prof['oil_factor'] + rng.normal(0, 0.2), 10.0, 85.0)
    oil_temp = clamp((175.0 + deg * 35.0 + (prof['cht_offset'] * 0.4)) + rng.normal(0, 0.2), 100.0, 260.0)

    # fuel system
    fuel_flow = clamp((rpm / 1400.0) * 8.5 * prof['fuel_factor'] + (deg * 1.5) + rng.normal(0, 0.02), 0.5, 20.0)
    fuel_rail_bar = clamp(3.0 - (deg * 0.4) + rng.normal(0, 0.01), 1.0, 5.0)

    # vibration — kurtosis rises before RMS does when bearing wear starts
    vib_rms = clamp((0.40 + deg * 2.8) * prof['vib_factor'] + rng.normal(0, 0.01), 0.1, 8.0)
    vib_kurt = clamp(3.0 + (deg * 2.0) + rng.normal(0, 0.02), 2.5, 8.0)

    # electrical
    batt_v = clamp(13.8 - (deg * 0.7) + rng.normal(0, 0.01), 10.5, 15.0)
    bus_current = clamp(18.0 + (rpm / 2000.0) * 8.0 + rng.normal(0, 0.1), 5.0, 45.0)

    # ignition timing retards as wear accumulates
    inj_timing = clamp(28.0 - (deg * 7.5) + rng.normal(0, 0.05), 12.0, 36.0)
    map_kpa = clamp(prof['map_kpa'] + rng.normal(0, 0.15), 30.0, 120.0)

    # apply interactive fault injections — these simulate real failure modes
    misfire_flag = False
    cooling_flag = False

    if "misfire" in faults:
        rpm -= 240.0
        egt_avg += 95.0
        egt_cyl[1] -= 350.0  # cylinder 2 goes cold — dead cylinder signature
        vib_rms += 2.2
        vib_kurt += 3.0
        misfire_flag = True

    if "injector_clog" in faults:
        fuel_flow *= 0.45
        fuel_rail_bar = 1.8
        egt_cyl[0] += 120.0  # cylinder 1 runs lean and hot

    if "cooling_degradation" in faults:
        # Cylinder 3 cooling efficiency degradation -> severe thermal imbalance
        cht_cyl[2] += 78.0  # Cylinder 3 overheats (>420°F)
        egt_cyl[2] += 65.0  # EGT rises on cylinder 3
        cht_cyl[1] += 20.0  # Collateral rise
        cht_avg = float(sum(cht_cyl) / len(cht_cyl))
        egt_avg = float(sum(egt_cyl) / len(egt_cyl))
        oil_temp += 36.0
        cooling_flag = True

    if "oil_leak" in faults:
        oil_press = 24.5  # catastrophic drop
        oil_temp += 45.0
        vib_rms += 0.8

    if "sensor_drift" in faults:
        egt_avg = 950.0  # thermocouple cold short — reads implausibly low
        cht_avg = 480.0

    if "bearing_wear" in faults:
        vib_rms += 3.5
        vib_kurt = 6.8
        oil_press -= 12.0

    if "combustion_instability" in faults:
        inj_timing = 14.0  # heavily retarded timing
        vib_rms += 1.6
        egt_avg += 80.0

    active_engine_id = sim_state.get("engine_id", int(row.get('engine_id', 1)))
    active_uav_id = sim_state.get("uav_id", f"UAV-0{active_engine_id}")
    navigation = simulated_navigation(cycle_idx)

    # assemble the full telemetry packet
    packet = {
        "engine_id":              active_engine_id,
        "uav_id":                 active_uav_id,
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
        # Simulated GNSS-like track used only by the Mission Command Center map.
        **navigation,
        "active_faults":          list(faults),
        "misfire_active":         misfire_flag,
        "cooling_degradation_active": cooling_flag,
    }

    # attach CAN frames for the bus monitor panel
    packet["can_frames"] = AeroCANBridge.generate_packet_burst(packet)

    return packet


# set up MQTT
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

# load the dataset and start streaming
print(f"[SIM] Loading dataset: {CSV_PATH}")
df = pd.read_csv(CSV_PATH)

current_engine_id = sim_state.get("engine_id", 1)
mission_df = df[df['engine_id'] == current_engine_id].reset_index(drop=True)
if len(mission_df) == 0:
    mission_df = df.iloc[:192].reset_index(drop=True)

print(f"[SIM] Initialized UAV-0{current_engine_id} propulsion lifecycle ({len(mission_df)} flight cycles).")
print(f"[SIM] Real-time 10 Hz telemetry active. Ingesting environmental & fault commands...\n")

while True:
    cycle_counter = 1
    for idx, row in mission_df.iterrows():
        read_control()

        # Check if active engine was switched by GCS command
        if sim_state["engine_id"] != current_engine_id:
            current_engine_id = sim_state["engine_id"]
            mission_df = df[df['engine_id'] == current_engine_id].reset_index(drop=True)
            if len(mission_df) == 0:
                mission_df = df.iloc[:192].reset_index(drop=True)
            print(f"\n[SIM] Engine switch triggered -> Active UAV-0{current_engine_id} ({len(mission_df)} flight cycles).\n")
            break

        # pause loop — just keep checking until unpaused
        prev_paused_faults = set(sim_state["injected_faults"])
        while sim_state["paused"]:
            time.sleep(0.2)
            read_control()
            if sim_state["injected_faults"] != prev_paused_faults:
                prev_paused_faults = set(sim_state["injected_faults"])
                p_name = sim_state["profile"]
                p_prof = PROFILES.get(p_name, PROFILES["NORMAL"])
                p_payload = build_telemetry_packet(row, cycle_counter, p_prof, prev_paused_faults)
                client.publish(TOPIC, json.dumps(p_payload), qos=0)

        prof_name = sim_state["profile"]
        prof = PROFILES.get(prof_name, PROFILES["NORMAL"])
        faults = sim_state["injected_faults"]

        payload = build_telemetry_packet(row, cycle_counter, prof, faults)
        msg = json.dumps(payload)
        client.publish(TOPIC, msg, qos=0)

        fault_str = f" [FAULTS: {','.join(faults)}]" if faults else ""
        print(f"Tx [{payload['uav_id']} C{cycle_counter:04d}] "
              f"RUL={payload['true_rul']:3.0f} | "
              f"RPM={payload['rpm']:6.1f} CHT={payload['cht']:5.1f}°F "
              f"EGT={payload['egt']:6.1f}°F OIL={payload['oil_pressure']:4.1f}PSI "
              f"VIB={payload['vibration']:.2f}g [{prof_name}]{fault_str}")

        cycle_counter += 1

        # sleep to hit the target Hz — divide by speed multiplier
        sleep_dur = (1.0 / prof["base_hz"]) / max(0.2, sim_state["speed"])
        time.sleep(sleep_dur)

    print(f"\n[SIM] UAV-0{current_engine_id} flight cycle completed. Resetting loop...\n")
    time.sleep(1.0)
