"""
backend/sensor_integrity.py
----------------------------
Per-Channel Sensor Integrity & Confidence Monitoring System.

Independently evaluates the trustworthiness of each telemetry channel
to distinguish genuine engine faults from sensor anomalies.

Detection methods per channel:
  1. Stuck-value detection (value frozen > N consecutive readings)
  2. Physically impossible value detection (hard bounds)
  3. Sudden discontinuity (inter-sample delta threshold)
  4. Excessive noise (rolling variance vs expected noise floor)
  5. Cross-sensor thermodynamic contradiction
  6. Physics model inconsistency (measured vs expected residual outlier)
"""

import math
import statistics
from collections import deque
from typing import Dict, Any, List, Tuple

# ── Per-Channel Physical Bounds (Absolute Impossible-Value Limits) ─────────────
CHANNEL_BOUNDS = {
    "rpm":            (0.0,    3200.0),
    "cht":            (50.0,   600.0),
    "egt":            (200.0,  2000.0),
    "oil_pressure":   (0.0,    120.0),
    "oil_temp":       (40.0,   320.0),
    "fuel_flow":      (0.0,    25.0),
    "fuel_rail_pressure_bar": (0.5, 8.0),
    "vibration":      (0.0,    15.0),
    "vibration_kurtosis": (1.5, 12.0),
    "battery_v":      (9.0,    17.0),
    "bus_current_a":  (0.0,    60.0),
    "inj_timing":     (5.0,    45.0),
    "map_kpa":        (10.0,   130.0),
}

# ── Normal Operating Bounds (Warning-level, within-envelope) ──────────────────
CHANNEL_NORMAL = {
    "rpm":            (600.0,   2800.0),
    "cht":            (150.0,   435.0),
    "egt":            (900.0,   1680.0),
    "oil_pressure":   (30.0,    85.0),
    "oil_temp":       (130.0,   245.0),
    "fuel_flow":      (0.5,     18.0),
    "fuel_rail_pressure_bar": (1.8, 4.5),
    "vibration":      (0.05,    5.0),
    "vibration_kurtosis": (1.8, 8.0),
    "battery_v":      (11.5,    15.5),
    "bus_current_a":  (3.0,     50.0),
    "inj_timing":     (10.0,    40.0),
    "map_kpa":        (25.0,    108.0),
}

# ── Expected noise floor (1σ) for each channel ────────────────────────────────
CHANNEL_NOISE_FLOOR = {
    "rpm": 8.0, "cht": 2.5, "egt": 5.0,
    "oil_pressure": 1.5, "oil_temp": 1.2, "fuel_flow": 0.2,
    "fuel_rail_pressure_bar": 0.08, "vibration": 0.06,
    "vibration_kurtosis": 0.12, "battery_v": 0.06,
    "bus_current_a": 0.6, "inj_timing": 0.3, "map_kpa": 1.0,
}

# ── Max allowed inter-sample delta (discontinuity) ───────────────────────────
CHANNEL_MAX_DELTA = {
    "rpm": 350.0, "cht": 18.0, "egt": 40.0,
    "oil_pressure": 12.0, "oil_temp": 6.0, "fuel_flow": 1.8,
    "fuel_rail_pressure_bar": 0.5, "vibration": 1.5,
    "vibration_kurtosis": 1.5, "battery_v": 0.3,
    "bus_current_a": 5.0, "inj_timing": 4.0, "map_kpa": 8.0,
}

STUCK_WINDOW = 8
NOISE_WINDOW = 20


class SensorIntegrityMonitor:
    def __init__(self):
        self.history = {ch: deque(maxlen=max(STUCK_WINDOW, NOISE_WINDOW)) for ch in CHANNEL_BOUNDS}

    def _confidence_impossible(self, ch, val):
        lo, hi = CHANNEL_BOUNDS[ch]
        if val < lo or val > hi:
            return 0.0, f"IMPOSSIBLE_VALUE ({val:.2f} outside [{lo},{hi}])"
        return 1.0, ""

    def _confidence_normal(self, ch, val):
        lo, hi = CHANNEL_NORMAL[ch]
        if lo <= val <= hi:
            return 1.0, ""
        bounds_range = hi - lo
        overshoot = (lo - val) / max(1e-6, bounds_range) if val < lo else (val - hi) / max(1e-6, bounds_range)
        return max(0.0, 1.0 - overshoot * 1.5), f"OUT_OF_NORMAL_RANGE ({val:.2f})"

    def _confidence_stuck(self, ch):
        hist = list(self.history[ch])
        if len(hist) < STUCK_WINDOW:
            return 1.0, ""
        spread = max(hist[-STUCK_WINDOW:]) - min(hist[-STUCK_WINDOW:])
        noise = CHANNEL_NOISE_FLOOR.get(ch, 1.0)
        if spread < noise * 0.05:
            return 0.1, f"STUCK_VALUE (spread={spread:.4f})"
        return 1.0, ""

    def _confidence_discontinuity(self, ch, val):
        hist = list(self.history[ch])
        if not hist:
            return 1.0, ""
        delta = abs(val - hist[-1])
        max_delta = CHANNEL_MAX_DELTA.get(ch, 999.0)
        if delta > max_delta:
            c = max(0.0, 1.0 - (delta - max_delta) / max(1e-6, max_delta))
            return c, f"DISCONTINUITY (Δ={delta:.2f} > {max_delta:.2f})"
        return 1.0, ""

    def _confidence_noise(self, ch):
        hist = list(self.history[ch])
        if len(hist) < 10:
            return 1.0, ""
        try:
            std = statistics.stdev(hist[-10:])
        except Exception:
            return 1.0, ""
        expected = CHANNEL_NOISE_FLOOR.get(ch, 1.0)
        ratio = std / max(1e-9, expected)
        if ratio > 5.0:
            return max(0.0, 1.0 - (ratio - 5.0) / 10.0), f"EXCESSIVE_NOISE (σ={std:.3f}, ratio={ratio:.1f}x)"
        return 1.0, ""

    def _cross_sensor_check(self, data):
        issues = {}
        cht = data.get("cht", 0)
        egt = data.get("egt", 0)
        rpm = data.get("rpm", 0)
        if cht > 150 and egt > 0:
            ratio = egt / cht
            if ratio < 1.8:
                issues["egt"] = (0.4, f"EGT/CHT RATIO LOW ({ratio:.2f} < 1.8)")
            elif ratio > 5.5:
                issues["cht"] = (0.4, f"EGT/CHT RATIO HIGH ({ratio:.2f} > 5.5)")
        if rpm > 800 and egt < 900:
            issues["egt"] = (0.15, f"EGT IMPLAUSIBLY LOW ({egt:.0f}°F) at RPM={rpm:.0f}")
        ff = data.get("fuel_flow", 0)
        if rpm > 1200 and ff < 0.8:
            issues["fuel_flow"] = (0.3, f"FUEL FLOW IMPLAUSIBLY LOW ({ff:.2f} L/h) at RPM={rpm:.0f}")
        return issues

    def evaluate(self, data, physics_residuals=None):
        per_channel = {}
        cross_issues = self._cross_sensor_check(data)
        for ch in CHANNEL_BOUNDS:
            val = data.get(ch)
            if val is None:
                per_channel[ch] = {"confidence": 0.0, "status": "MISSING", "issues": ["DATA_ABSENT"], "value": None}
                continue
            val = float(val)
            issues = []
            confidence = 1.0
            for test_fn, args in [
                (self._confidence_impossible, (ch, val)),
                (self._confidence_normal, (ch, val)),
                (self._confidence_stuck, (ch,)),
                (self._confidence_discontinuity, (ch, val)),
                (self._confidence_noise, (ch,)),
            ]:
                c, msg = test_fn(*args)
                if c < 1.0:
                    confidence = min(confidence, c)
                    if msg:
                        issues.append(msg)
            if ch in cross_issues:
                c, msg = cross_issues[ch]
                confidence = min(confidence, c)
                issues.append(msg)
            if physics_residuals and ch in ("egt", "cht", "oil_pressure"):
                key_map = {"egt": "delta_egt", "cht": "delta_cht", "oil_pressure": "delta_oil_p"}
                dk = key_map.get(ch)
                if dk and dk in physics_residuals:
                    delta = abs(physics_residuals[dk])
                    threshold = {"delta_egt": 80.0, "delta_cht": 40.0, "delta_oil_p": 15.0}.get(dk, 50.0)
                    if delta > threshold * 2.5:
                        c = max(0.2, 1.0 - (delta - threshold * 2.5) / (threshold * 5.0))
                        confidence = min(confidence, c)
                        issues.append(f"PHYSICS_RESIDUAL_OUTLIER (Δ={delta:.1f})")
            self.history[ch].append(val)
            if confidence >= 0.90:
                status = "HEALTHY"
            elif confidence >= 0.70:
                status = "DEGRADED"
            elif confidence >= 0.40:
                status = "SUSPECT"
            else:
                status = "FAULT"
            per_channel[ch] = {"confidence": round(confidence * 100.0, 1), "status": status, "issues": issues, "value": round(val, 3)}

        confidences = [v["confidence"] for v in per_channel.values() if v["value"] is not None]
        integrity_score = sum(confidences) / len(confidences) if confidences else 0.0
        sorted_ch = sorted(per_channel.items(), key=lambda x: x[1]["confidence"])
        suspect_channels = [
            {"channel": ch, "confidence": info["confidence"], "issues": info["issues"]}
            for ch, info in sorted_ch if info["confidence"] < 80.0
        ]
        return {
            "per_channel": per_channel,
            "integrity_score": round(integrity_score, 1),
            "suspect_channels": suspect_channels[:5],
            "has_sensor_fault": any(info["confidence"] < 50.0 for info in per_channel.values()),
        }

sensor_integrity_monitor = SensorIntegrityMonitor()
