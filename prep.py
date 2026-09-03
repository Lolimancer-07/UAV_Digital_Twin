import pandas as pd
import os

# Resolve paths relative to this script's location so it works from any CWD
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
INPUT_FILE = os.path.join(DATA_DIR, 'train_FD001(1).txt')
OUTPUT_FILE = os.path.join(DATA_DIR, 'telemetry_ready.csv')

# CMAPSS dataset has 26 columns: Engine ID, Cycle, 3 op settings, 21 sensors
columns = ['engine_id', 'cycle', 'op_set_1', 'op_set_2', 'op_set_3'] + [f'sensor_{i}' for i in range(1, 22)]

print("Loading raw NASA dataset...")
# sep='\s+' handles the messy space-separated text format
df = pd.read_csv(INPUT_FILE, sep=r'\s+', header=None, names=columns)

print("Calculating Remaining Useful Life (RUL)...")
# Find the exact cycle where each specific engine died (the max cycle)
max_cycles = df.groupby('engine_id')['cycle'].max()

# RUL = (Failure Cycle) - (Current Cycle)
df['rul'] = df.apply(lambda row: max_cycles[row['engine_id']] - row['cycle'], axis=1)

print("Mapping turbofan parameters to UAV Piston thermodynamics...")
# Isolate only what we need for the Digital Twin to keep the edge pipeline fast
# We map Sensor 4 to RPM, Sensor 2 to CHT, and Sensor 3 to EGT
uav_df = df[['engine_id', 'cycle', 'sensor_4', 'sensor_2', 'sensor_3', 'rul']].copy()
uav_df.rename(columns={
    'sensor_4': 'rpm',
    'sensor_2': 'cht',
    'sensor_3': 'egt'
}, inplace=True)

# Save the finalized dataset
uav_df.to_csv(OUTPUT_FILE, index=False)
print(f"Stage 1 Complete: '{OUTPUT_FILE}' generated and labeled.")