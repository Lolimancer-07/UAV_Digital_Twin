import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
import os

# 1. Load the prepped dataset
print("Loading telemetry data...")
df = pd.read_csv('data/telemetry_ready.csv')

# 2. Normalize the data
features = ['rpm', 'cht', 'egt']
scaler = MinMaxScaler()

# Ensure we keep it as a DataFrame so the feature names ('rpm', 'cht', 'egt') are saved inside the scaler
df[features] = scaler.fit_transform(df[features])

# 3. Create the Time Windows (50 cycles per window)
sequence_length = 50

def create_sequences(data, seq_length):
    X, y = [], []
    # Group by engine so we don't mix engine 1's data with engine 2's data
    for engine_id, group in data.groupby('engine_id'):
        group_matrix = group[features].values
        rul_array = group['rul'].values
        
        # Slide a 50-cycle window across the engine's lifespan
        for i in range(len(group) - seq_length):
            X.append(group_matrix[i:i + seq_length])
            # The target (y) is the RUL at the END of the 50-cycle window
            y.append(rul_array[i + seq_length])
            
    return np.array(X), np.array(y)

print(f"Structuring time-series data (Window: {sequence_length} cycles)...")
X, y = create_sequences(df, sequence_length)

print(f"Training data shape: {X.shape}") # Should be (Num_Samples, 50, 3)

# 4. Build a slightly deeper LSTM Architecture
print("Building LSTM Neural Network...")
model = Sequential([
    LSTM(128, input_shape=(sequence_length, len(features)), return_sequences=True), # Increased to 128
    Dropout(0.2),
    LSTM(64), # Increased to 64
    Dropout(0.2),
    Dense(32, activation='relu'),
    Dense(1)
])

# Use a smaller learning rate to help it find the pattern
from tensorflow.keras.optimizers import Adam
optimizer = Adam(learning_rate=0.001)
model.compile(optimizer=optimizer, loss='mean_squared_error')

# 5. Train for more epochs
print("Training model...")
# Increased epochs from 10 to 30
model.fit(X, y, epochs=30, batch_size=64, validation_split=0.2)
# 6. Save the trained model and the scaler
os.makedirs('backend', exist_ok=True)
model.save('backend/uav_rul_model.h5')

# Save the scaler weights so we can normalize live data later
import pickle
with open('backend/scaler.pkl', 'wb') as f:
    pickle.dump(scaler, f)

print("Stage 3 Complete: AI Model trained and saved to 'backend/uav_rul_model.h5'")