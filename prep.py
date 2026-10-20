# prep.py
# Stage 1: External Algorithm Benchmark Adapter (NASA C-MAPSS Turbofan FD001)
# NOTE: This script adapts NASA C-MAPSS turbofan run-to-failure data purely as an
# external algorithmic benchmark for testing RUL regression architectures.
# This is NOT piston engine telemetry and must not be presented as piston thermodynamics.
# For physics-first piston simulation datasets, use simulator/generate_dataset.py.

import pandas as pd
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'train_FD001(1).txt')
OUTPUT_FILE = os.path.join(DATA_DIR, 'telemetry_ready.csv')

# CMAPSS dataset has 26 columns: Engine ID, Cycle, 3 op settings, 21 sensors
columns = ['engine_id', 'cycle', 'op_set_1', 'op_set_2', 'op_set_3'] + [f'sensor_{i}' for i in range(1, 22)]

print("Loading NASA C-MAPSS turbofan algorithmic benchmark dataset...")
df = pd.read_csv(INPUT_FILE, sep=r'\s+', header=None, names=columns)

print("Calculating ground-truth Remaining Useful Life (RUL)...")
max_cycles = df.groupby('engine_id')['cycle'].max()
df['rul'] = df.apply(lambda row: max_cycles[row['engine_id']] - row['cycle'], axis=1)

print("Extracting 3 benchmark channels for baseline algorithm comparison...")
# Legacy proxy mapping: s4 -> rpm, s2 -> cht, s3 -> egt (benchmark channels only)
benchmark_df = df[['engine_id', 'cycle', 'sensor_4', 'sensor_2', 'sensor_3', 'rul']].copy()
benchmark_df.rename(columns={
    'sensor_4': 'rpm',
    'sensor_2': 'cht',
    'sensor_3': 'egt'
}, inplace=True)

# Add provenance metadata column
benchmark_df['provenance'] = 'public-benchmark-turbofan'

benchmark_df.to_csv(OUTPUT_FILE, index=False)
print(f"Benchmark prep complete: '{OUTPUT_FILE}' generated (Domain: Turbofan Benchmark).")