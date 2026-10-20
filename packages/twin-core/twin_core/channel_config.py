"""
twin_core.channel_config
------------------------
Unified telemetry channel specification loader and ChannelScalerBundle.
Implements Tasks B1 and B2:
  - Single config for channels from config/channels.yaml
  - Fit scalers on all model input channels
  - Store channel list and scaler together; load both at inference
  - Strictly fail if any input channel is missing or reordered
"""

import os
import yaml
import pickle
import json
import hashlib
from typing import List, Dict, Any, Optional, Union
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler


def find_repo_root() -> str:
    """Find repository root by walking upward until config/channels.yaml is found."""
    current = os.path.dirname(os.path.abspath(__file__))
    while current and current != os.path.dirname(current):
        if os.path.exists(os.path.join(current, "config", "channels.yaml")):
            return current
        current = os.path.dirname(current)
    # Fallback to current working directory or default
    return os.getcwd()


REPO_ROOT = find_repo_root()
CHANNELS_CONFIG_PATH = os.path.join(REPO_ROOT, "config", "channels.yaml")


class ChannelConfig:
    """Encapsulates telemetry channel metadata and constraints."""

    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or CHANNELS_CONFIG_PATH
        if not os.path.exists(self.config_path):
            # Fallback path if running from subdirectories
            alt = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config", "channels.yaml")
            if os.path.exists(alt):
                self.config_path = alt

        with open(self.config_path, "r") as f:
            self.raw_data = yaml.safe_load(f)

        self.version = self.raw_data.get("version", "1.0.0")
        self.airframe = self.raw_data.get("airframe", "Rotax 914 F")
        self.canonical_rate_hz = float(self.raw_data.get("canonical_rate_hz", 10.0))
        self.channels_meta: List[Dict[str, Any]] = self.raw_data.get("channels", [])

        # Canonical channel ordering
        self.channel_names: List[str] = [c["name"] for c in self.channels_meta]
        self._by_name: Dict[str, Dict[str, Any]] = {c["name"]: c for c in self.channels_meta}

    def get_channel_names(self) -> List[str]:
        return list(self.channel_names)

    def get_channel_meta(self, name: str) -> Dict[str, Any]:
        if name not in self._by_name:
            raise KeyError(f"Channel '{name}' not found in channels configuration")
        return dict(self._by_name[name])

    def get_bounds(self) -> Dict[str, tuple]:
        return {c["name"]: (float(c["min_valid"]), float(c["max_valid"])) for c in self.channels_meta}

    def get_normal_ranges(self) -> Dict[str, tuple]:
        return {c["name"]: (float(c["normal_min"]), float(c["normal_max"])) for c in self.channels_meta}

    def get_noise_sigmas(self) -> Dict[str, float]:
        return {c["name"]: float(c.get("noise_sigma", 0.1)) for c in self.channels_meta}


# Global singleton
_CHANNEL_CONFIG_INSTANCE: Optional[ChannelConfig] = None


def get_channel_config(config_path: Optional[str] = None) -> ChannelConfig:
    global _CHANNEL_CONFIG_INSTANCE
    if _CHANNEL_CONFIG_INSTANCE is None or config_path is not None:
        _CHANNEL_CONFIG_INSTANCE = ChannelConfig(config_path)
    return _CHANNEL_CONFIG_INSTANCE


class ChannelScalerBundle:
    """
    Stores scaler and channel schema together.
    Guarantees strict channel validation at inference time (Task B1).
    Fails if any input channel is missing or reordered.
    """

    def __init__(self, channels: List[str], scaler: Optional[MinMaxScaler] = None, meta: Optional[Dict[str, Any]] = None):
        self.channels = list(channels)
        self.scaler = scaler or MinMaxScaler()
        self.meta = meta or {}
        self.meta.setdefault("channels", self.channels)
        self.meta.setdefault("feature_count", len(self.channels))

    def fit(self, df: pd.DataFrame) -> "ChannelScalerBundle":
        self.validate_dataframe_columns(df, strict_order=True)
        self.scaler.fit(df[self.channels].values)
        self.meta["fitted"] = True
        self.meta["data_min"] = [float(x) for x in self.scaler.data_min_]
        self.meta["data_max"] = [float(x) for x in self.scaler.data_max_]
        return self

    def fit_transform(self, df: pd.DataFrame) -> np.ndarray:
        self.fit(df)
        return self.transform(df)

    def validate_dataframe_columns(self, df: pd.DataFrame, strict_order: bool = True):
        cols = list(df.columns)
        missing = [c for c in self.channels if c not in cols]
        if missing:
            raise ValueError(f"Input DataFrame is missing required channels: {missing}")

        if strict_order:
            # Check order of the expected channels as they appear in df
            filtered_cols = [c for c in cols if c in self.channels]
            if filtered_cols != self.channels:
                raise ValueError(
                    f"Channels in DataFrame are reordered or misaligned.\n"
                    f"Expected: {self.channels}\nFound:    {filtered_cols}"
                )

    def validate_dict(self, data: Dict[str, Any]):
        missing = [c for c in self.channels if c not in data]
        if missing:
            raise ValueError(f"Input dictionary is missing required channels: {missing}")

    def transform_dict(self, data: Dict[str, Any], clip: bool = True) -> np.ndarray:
        """Transforms a single telemetry dictionary row in exact canonical order."""
        self.validate_dict(data)
        row = np.array([[float(data[c]) for c in self.channels]], dtype=np.float32)
        norm = self.scaler.transform(row)
        if clip:
            norm = np.clip(norm, 0.0, 1.0)
        return norm[0]

    def transform(self, data: Union[pd.DataFrame, np.ndarray, Dict[str, Any]], clip: bool = True) -> np.ndarray:
        if isinstance(data, dict):
            return self.transform_dict(data, clip=clip)
        elif isinstance(data, pd.DataFrame):
            self.validate_dataframe_columns(data, strict_order=True)
            mat = data[self.channels].values
            norm = self.scaler.transform(mat)
            if clip:
                norm = np.clip(norm, 0.0, 1.0)
            return norm
        elif isinstance(data, np.ndarray):
            if data.ndim == 2 and data.shape[1] != len(self.channels):
                raise ValueError(
                    f"Expected 2D numpy array with {len(self.channels)} features, got shape {data.shape}"
                )
            norm = self.scaler.transform(data)
            if clip:
                norm = np.clip(norm, 0.0, 1.0)
            return norm
        else:
            raise TypeError(f"Unsupported data type for transform: {type(data)}")

    def inverse_transform(self, scaled: np.ndarray) -> np.ndarray:
        return self.scaler.inverse_transform(scaled)

    def save(self, filepath: str):
        """Saves the bundle to a pickle file and writes a sha256 checksum sidecar."""
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        data = {
            "channels": self.channels,
            "scaler": self.scaler,
            "meta": self.meta,
        }
        with open(filepath, "wb") as f:
            pickle.dump(data, f, protocol=4)

        # Compute and write SHA-256
        with open(filepath, "rb") as f:
            content = f.read()
            sha256 = hashlib.sha256(content).hexdigest()

        with open(f"{filepath}.sha256", "w") as f:
            f.write(f"{sha256}  {os.path.basename(filepath)}\n")

    @classmethod
    def load(cls, filepath: str) -> "ChannelScalerBundle":
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Scaler bundle not found at {filepath}")
        with open(filepath, "rb") as f:
            bundle = pickle.load(f)

        if isinstance(bundle, dict) and "scaler" in bundle and "channels" in bundle:
            return cls(channels=bundle["channels"], scaler=bundle["scaler"], meta=bundle.get("meta", {}))
        elif isinstance(bundle, MinMaxScaler):
            # Legacy fallback: load with default channels config
            cfg = get_channel_config()
            return cls(channels=cfg.get_channel_names()[: getattr(bundle, "n_features_in_", 3)], scaler=bundle)
        else:
            raise ValueError(f"Unrecognized scaler bundle structure in {filepath}")
