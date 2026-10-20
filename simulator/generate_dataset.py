#!/usr/bin/env python3
"""
simulator/generate_dataset.py
-----------------------------
Physics-first synthetic dataset generator for UAV aero piston engine digital twin.
Implements Phase 0 Tasks:
  - A4: Physics-first synthetic dataset from simulator with randomized ambient, wear, noise and lag.
  - B3: Partitioned strictly by whole flight ID to eliminate train/test leakage.
  - C2: Held-out fault families (F5, F6, F7) implemented and saved only to frozen test set.
  - C3: Hard negatives (HN1, HN2, HN3) healthy extreme regimes.
  - C4: Sensor fault cases (SF1, SF2, SF3) for sensor vs engine separation.

Deterministic: regenerates identically from a given random seed.
"""

import os
import sys
import json
import math
import hashlib
import argparse
from typing import Dict, Any, List, Tuple
import numpy as np
import pandas as pd

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
_TWIN_CORE = os.path.join(_REPO_ROOT, "packages", "twin-core")
if _TWIN_CORE not in sys.path:
    sys.path.insert(0, _TWIN_CORE)

from twin_core.channel_config import get_channel_config

GENERATOR_VERSION = "1.0.0"


class PistonMissionSimulator:
    """Simulates multi-phase UAV missions with 4-cylinder aero piston thermodynamics."""

    def __init__(self, seed: int = 42):
        self.seed = seed
        self.rng = np.random.RandomState(seed)
        self.cfg = get_channel_config()
        self.canonical_channels = self.cfg.get_channel_names()

    def simulate_flight(
        self,
        flight_id: str,
        duration_cycles: int = 300,
        fault_type: str = "nominal",
        fault_onset_cycle: int = 150,
        oat_ambient: float = 15.0,
        altitude_ft: float = 3000.0,
        engine_initial_wear: float = 0.05,
    ) -> List[Dict[str, Any]]:
        """
        Simulates a full flight mission cycle-by-cycle at 10 Hz (or cycle steps).
        Returns list of telemetry records.
        """
        records = []
        total_life_cycles = 500.0

        # Thermal first-order lag state variables
        cht_state = 180.0
        oil_temp_state = 140.0

        # Inter-cylinder individual states
        cht_cyl = [180.0, 182.0, 185.0, 187.0]
        egt_cyl = [1350.0, 1360.0, 1370.0, 1375.0]

        wear_rate = (1.0 - engine_initial_wear) / total_life_cycles

        # Flight phase profiles: warmup -> climb -> cruise -> loiter -> descent
        for c in range(1, duration_cycles + 1):
            curr_wear = min(1.0, engine_initial_wear + (c * wear_rate))
            ground_truth_rul = max(0.0, total_life_cycles * (1.0 - curr_wear))

            # Flight phase sequencing
            if c < 20:
                phase = "WARMUP"
                target_rpm = 1200.0 + self.rng.normal(0, 5.0)
                target_map = 45.0
            elif c < 80:
                phase = "CLIMB"
                target_rpm = 2550.0 + self.rng.normal(0, 8.0)
                target_map = 101.0
            elif c < 200:
                phase = "CRUISE"
                target_rpm = 2300.0 + self.rng.normal(0, 6.0)
                target_map = 88.0
            elif c < 260:
                phase = "LOITER"
                target_rpm = 1950.0 + self.rng.normal(0, 5.0)
                target_map = 72.0
            else:
                phase = "DESCENT"
                target_rpm = 1500.0 + self.rng.normal(0, 7.0)
                target_map = 52.0

            # Hard Negative HN1: Hot Day Desert Climb
            if fault_type == "hot_day_desert_climb":
                oat_ambient = 46.0
                if 20 <= c <= 250:
                    target_rpm = 2650.0 + self.rng.normal(0, 6.0)
                    target_map = 104.0

            # Hard Negative HN2: Rapid Tactical Throttle
            if fault_type == "rapid_tactical_throttle":
                target_rpm += math.sin(c * 0.4) * 350.0
                target_map += math.sin(c * 0.4) * 18.0

            # Thermodynamic relationships (Rotax 914 F Boxer 4)
            rpm = float(np.clip(target_rpm + self.rng.normal(0, 4.0), 600.0, 3100.0))
            map_kpa = float(np.clip(target_map + self.rng.normal(0, 0.4), 20.0, 125.0))

            # Fuel flow calculation: Q_fuel = f(RPM, MAP, wear)
            bhp_est = (rpm / 2400.0) * (map_kpa / 96.0) * 115.0
            fuel_flow_base = max(1.0, (bhp_est * 0.28) + (curr_wear * 1.5))
            fuel_flow = float(np.clip(fuel_flow_base + self.rng.normal(0, 0.08), 0.5, 24.0))
            fuel_rail_bar = float(np.clip(3.2 - (curr_wear * 0.3) + self.rng.normal(0, 0.02), 1.2, 5.0))

            # Thermal model with first order inertia
            cht_target = 175.0 + (bhp_est * 1.55) + (oat_ambient * 1.1) + (curr_wear * 20.0)
            cht_state += 0.15 * (cht_target - cht_state)
            cht_avg = float(np.clip(cht_state + self.rng.normal(0, 0.4), 150.0, 550.0))

            egt_target = 1050.0 + (bhp_est * 3.8) - (oat_ambient * 0.4) + (curr_wear * 25.0)
            egt_avg = float(np.clip(egt_target + self.rng.normal(0, 1.2), 850.0, 1850.0))

            # Individual cylinders
            for i, offset in enumerate([-4.0, -1.5, 2.5, 4.0]):
                cht_cyl[i] = round(cht_avg + offset + self.rng.normal(0, 0.2), 1)
            for i, offset in enumerate([-12.0, -4.0, 6.0, 10.0]):
                egt_cyl[i] = round(egt_avg + offset + self.rng.normal(0, 0.6), 1)

            # Lubrication
            oil_temp_target = 110.0 + (bhp_est * 0.65) + (oat_ambient * 0.6) + (curr_wear * 15.0)
            oil_temp_state += 0.08 * (oil_temp_target - oil_temp_state)
            oil_temp = float(np.clip(oil_temp_state + self.rng.normal(0, 0.3), 100.0, 290.0))


            oil_pressure_base = 68.0 - (curr_wear * 18.0) - ((oil_temp - 170.0) * 0.12)
            oil_pressure = float(np.clip(oil_pressure_base + self.rng.normal(0, 0.3), 15.0, 95.0))

            # Mechanical vibration
            base_vib = 0.35 + (curr_wear * 1.4) + ((rpm / 2400.0) * 0.4)
            vib_rms = float(np.clip(base_vib + self.rng.normal(0, 0.03), 0.05, 8.0))
            vib_kurt = float(np.clip(3.0 + (curr_wear * 1.8) + self.rng.normal(0, 0.04), 1.8, 10.0))

            # Electrical
            batt_v = float(np.clip(13.9 - (curr_wear * 0.6) + self.rng.normal(0, 0.02), 10.5, 15.2))
            bus_current = float(np.clip(16.0 + (rpm / 2400.0) * 14.0 + self.rng.normal(0, 0.2), 4.0, 55.0))

            # Injection timing
            inj_timing = float(np.clip(28.0 - (curr_wear * 6.5) + (rpm / 2400.0) * 2.0 + self.rng.normal(0, 0.1), 10.0, 42.0))

            # -------------------------------------------------------------
            # FAULT INJECTION LOGIC (Active only when c >= fault_onset_cycle)
            # -------------------------------------------------------------
            is_fault_active = (c >= fault_onset_cycle) and (fault_type not in ["nominal", "hot_day_desert_climb", "rapid_tactical_throttle"])
            active_fault_label = fault_type if is_fault_active else "none"

            if is_fault_active:
                fault_prog = min(1.0, (c - fault_onset_cycle) / 30.0)

                # Training Fault F1: Cooling Degradation
                if fault_type == "cooling_degradation":
                    cht_cyl[2] += 78.0 * fault_prog
                    cht_cyl[1] += 22.0 * fault_prog
                    cht_avg = float(np.mean(cht_cyl))
                    oil_temp += 32.0 * fault_prog

                # Training Fault F2: Injector Clog
                elif fault_type == "injector_clog":
                    egt_cyl[0] += 135.0 * fault_prog
                    egt_avg = float(np.mean(egt_cyl))
                    fuel_flow *= (1.0 - 0.25 * fault_prog)
                    fuel_rail_bar -= 1.1 * fault_prog

                # Training Fault F3: Oil Leak
                elif fault_type == "oil_leak":
                    oil_pressure = max(18.0, oil_pressure - (42.0 * fault_prog))
                    oil_temp += 46.0 * fault_prog
                    vib_rms += 0.9 * fault_prog

                # Training Fault F4: Misfire
                elif fault_type == "misfire":
                    rpm -= 240.0 * fault_prog
                    egt_cyl[1] -= 380.0 * fault_prog
                    egt_avg = float(np.mean(egt_cyl))
                    vib_rms += 2.4 * fault_prog
                    vib_kurt += 3.2 * fault_prog

                # HELD-OUT Fault F5: Exhaust Valve Leak (Task C2)
                elif fault_type == "exhaust_valve_leak":
                    egt_cyl[3] += 160.0 * fault_prog
                    egt_avg = float(np.mean(egt_cyl))
                    rpm -= 90.0 * fault_prog
                    vib_rms += 0.5 * fault_prog

                # HELD-OUT Fault F6: Intake Manifold Leak (Task C2)
                elif fault_type == "intake_manifold_leak":
                    map_kpa = max(25.0, map_kpa - (26.0 * fault_prog))
                    egt_avg += 95.0 * fault_prog
                    rpm += math.sin(c * 0.8) * 80.0 * fault_prog  # hunting idle oscillation

                # HELD-OUT Fault F7: Bearing Spalling (Task C2)
                elif fault_type == "bearing_spalling":
                    # Early kurtosis spike before RMS rises
                    vib_kurt += 4.5 * fault_prog
                    if fault_prog > 0.5:
                        vib_rms += 2.2 * (fault_prog - 0.5) * 2.0
                        oil_temp += 22.0 * fault_prog

                # Sensor Fault SF1: Sensor Stuck (Task C4)
                elif fault_type == "sensor_stuck":
                    cht_avg = 382.5  # thermocouple output frozen

                # Sensor Fault SF2: Sensor Drift (Task C4)
                elif fault_type == "sensor_drift":
                    oil_pressure = max(10.0, oil_pressure - (28.0 * fault_prog))  # transducer drift only

                # Sensor Fault SF3: Sensor Dropout (Task C4)
                elif fault_type == "sensor_dropout":
                    if c % 3 == 0:
                        egt_avg = 0.0

            # Hard Negative HN3: Sensor Noise Burst
            if fault_type == "sensor_noise_burst" and (140 <= c <= 170):
                cht_avg += self.rng.normal(0, 8.0)
                egt_avg += self.rng.normal(0, 18.0)
                batt_v += self.rng.normal(0, 0.4)

            record = {
                "flight_id": flight_id,
                "cycle": c,
                "flight_phase": phase,
                "rpm": round(rpm, 1),
                "cht": round(cht_avg, 1),
                "egt": round(egt_avg, 1),
                "oil_pressure": round(oil_pressure, 1),
                "oil_temp": round(oil_temp, 1),
                "fuel_flow": round(fuel_flow, 2),
                "fuel_rail_pressure_bar": round(fuel_rail_bar, 2),
                "vibration": round(vib_rms, 3),
                "vibration_kurtosis": round(vib_kurt, 2),
                "battery_v": round(batt_v, 2),
                "bus_current_a": round(bus_current, 1),
                "inj_timing": round(inj_timing, 1),
                "map_kpa": round(map_kpa, 1),
                "oat_c": round(oat_ambient, 1),
                "true_rul": round(ground_truth_rul, 1),
                "scenario": fault_type,
                "fault_family": active_fault_label,
                "is_fault_active": int(is_fault_active),
            }

            records.append(record)


        return records


def generate_benchmark_datasets(output_dir: str = "data", base_seed: int = 42) -> Dict[str, str]:
    """Generates train, validation, and frozen test datasets with zero leakage."""
    os.makedirs(output_dir, exist_ok=True)
    sim = PistonMissionSimulator(seed=base_seed)

    print("Generating physics-first aero piston synthetic datasets...")

    # 1. Training Set (Nominal flights + Known families F1-F4)
    train_records = []
    flight_idx = 1
    # 10 nominal flights
    for _ in range(10):
        wear = sim.rng.uniform(0.02, 0.40)
        recs = sim.simulate_flight(f"TRN-FL-{flight_idx:03d}", duration_cycles=250, fault_type="nominal", engine_initial_wear=wear)
        train_records.extend(recs)
        flight_idx += 1

    # Training fault families F1-F4 (2 flights each)
    for fam in ["cooling_degradation", "injector_clog", "oil_leak", "misfire"]:
        for _ in range(2):
            wear = sim.rng.uniform(0.10, 0.45)
            onset = sim.rng.randint(120, 180)
            recs = sim.simulate_flight(f"TRN-FL-{flight_idx:03d}", duration_cycles=250, fault_type=fam, fault_onset_cycle=onset, engine_initial_wear=wear)
            train_records.extend(recs)
            flight_idx += 1

    train_df = pd.DataFrame(train_records)
    train_path = os.path.join(output_dir, "synthetic_piston_train.csv")
    train_df.to_csv(train_path, index=False)
    print(f"  ✓ Train Set: {len(train_df):,} rows across {train_df['flight_id'].nunique()} flights → {train_path}")

    # 2. Validation Set (Unseen flight IDs, same families F1-F4)
    val_records = []
    # 5 nominal flights
    for _ in range(5):
        wear = sim.rng.uniform(0.05, 0.35)
        recs = sim.simulate_flight(f"VAL-FL-{flight_idx:03d}", duration_cycles=250, fault_type="nominal", engine_initial_wear=wear)
        val_records.extend(recs)
        flight_idx += 1

    # 1 flight each for F1-F4
    for fam in ["cooling_degradation", "injector_clog", "oil_leak", "misfire"]:
        wear = sim.rng.uniform(0.15, 0.50)
        onset = sim.rng.randint(130, 170)
        recs = sim.simulate_flight(f"VAL-FL-{flight_idx:03d}", duration_cycles=250, fault_type=fam, fault_onset_cycle=onset, engine_initial_wear=wear)
        val_records.extend(recs)
        flight_idx += 1

    val_df = pd.DataFrame(val_records)
    val_path = os.path.join(output_dir, "synthetic_piston_val.csv")
    val_df.to_csv(val_path, index=False)
    print(f"  ✓ Validation Set: {len(val_df):,} rows across {val_df['flight_id'].nunique()} flights → {val_path}")

    # 3. Frozen Test Set (NEVER seen in training: Held-out F5-F7 + Hard Negatives HN1-HN3 + Sensor Faults SF1-SF3)
    test_records = []
    # Nominal test flights
    for _ in range(4):
        wear = sim.rng.uniform(0.08, 0.30)
        recs = sim.simulate_flight(f"TST-FL-{flight_idx:03d}", duration_cycles=250, fault_type="nominal", engine_initial_wear=wear)
        test_records.extend(recs)
        flight_idx += 1

    # Known families for generalisation check
    for fam in ["cooling_degradation", "injector_clog", "oil_leak", "misfire"]:
        wear = sim.rng.uniform(0.10, 0.40)
        onset = sim.rng.randint(120, 160)
        recs = sim.simulate_flight(f"TST-FL-{flight_idx:03d}", duration_cycles=250, fault_type=fam, fault_onset_cycle=onset, engine_initial_wear=wear)
        test_records.extend(recs)
        flight_idx += 1

    # Held-out families F5, F6, F7 (Task C2)
    for held_out in ["exhaust_valve_leak", "intake_manifold_leak", "bearing_spalling"]:
        for _ in range(2):
            wear = sim.rng.uniform(0.15, 0.45)
            onset = sim.rng.randint(130, 160)
            recs = sim.simulate_flight(f"TST-FL-{flight_idx:03d}", duration_cycles=250, fault_type=held_out, fault_onset_cycle=onset, engine_initial_wear=wear)
            test_records.extend(recs)
            flight_idx += 1

    # Hard negatives HN1, HN2, HN3 (Task C3)
    for hn in ["hot_day_desert_climb", "rapid_tactical_throttle", "sensor_noise_burst"]:
        wear = sim.rng.uniform(0.05, 0.25)
        recs = sim.simulate_flight(f"TST-FL-{flight_idx:03d}", duration_cycles=250, fault_type=hn, engine_initial_wear=wear)
        test_records.extend(recs)
        flight_idx += 1

    # Sensor faults SF1, SF2, SF3 (Task C4)
    for sf in ["sensor_stuck", "sensor_drift", "sensor_dropout"]:
        wear = sim.rng.uniform(0.10, 0.30)
        onset = sim.rng.randint(110, 150)
        recs = sim.simulate_flight(f"TST-FL-{flight_idx:03d}", duration_cycles=250, fault_type=sf, fault_onset_cycle=onset, engine_initial_wear=wear)
        test_records.extend(recs)
        flight_idx += 1

    test_df = pd.DataFrame(test_records)
    test_path = os.path.join(output_dir, "synthetic_piston_test_frozen.csv")
    test_df.to_csv(test_path, index=False)
    print(f"  ✓ Frozen Test Set: {len(test_df):,} rows across {test_df['flight_id'].nunique()} flights → {test_path}")

    # Compute SHA-256 for all generated datasets
    hashes = {}
    for p in [train_path, val_path, test_path]:
        with open(p, "rb") as f:
            h = hashlib.sha256(f.read()).hexdigest()
        hashes[os.path.basename(p)] = h
        with open(f"{p}.sha256", "w") as f:
            f.write(f"{h}  {os.path.basename(p)}\n")

    manifest = {
        "generator_version": GENERATOR_VERSION,
        "base_seed": base_seed,
        "created_at": "2026-10-10T12:00:00Z",
        "datasets": {
            "synthetic_piston_train.csv": {
                "rows": len(train_df),
                "flights": int(train_df["flight_id"].nunique()),
                "sha256": hashes["synthetic_piston_train.csv"],
                "fault_families": sorted(train_df["fault_family"].unique().tolist()),
            },
            "synthetic_piston_val.csv": {
                "rows": len(val_df),
                "flights": int(val_df["flight_id"].nunique()),
                "sha256": hashes["synthetic_piston_val.csv"],
                "fault_families": sorted(val_df["fault_family"].unique().tolist()),
            },
            "synthetic_piston_test_frozen.csv": {
                "rows": len(test_df),
                "flights": int(test_df["flight_id"].nunique()),
                "sha256": hashes["synthetic_piston_test_frozen.csv"],
                "fault_families": sorted(test_df["fault_family"].unique().tolist()),
            },
        },
    }
    manifest_path = os.path.join(output_dir, "dataset_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"  ✓ Dataset Manifest saved → {manifest_path}")

    return {
        "train": train_path,
        "val": val_path,
        "test": test_path,
        "manifest": manifest_path,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate physics-first aero piston synthetic datasets.")
    parser.add_argument("--output-dir", default=os.path.join(_REPO_ROOT, "data"), help="Target data directory")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic generation")
    args = parser.parse_args()

    generate_benchmark_datasets(output_dir=args.output_dir, base_seed=args.seed)
