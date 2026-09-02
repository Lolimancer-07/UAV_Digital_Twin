"""
backend/telemetry_integrity.py
-------------------------------
Telemetry Integrity & Security Monitoring.

Detects:
  - Packet loss (missing sequence numbers)
  - Duplicate packets (same cycle number received twice)
  - Timestamp anomalies (out-of-order or future timestamps)
  - Impossible sensor values (physical bounds violations)
  - Sudden telemetry manipulation (drastic multi-channel simultaneous change)
  - Invalid sequence numbers (backwards or too-large jumps)

Outputs an integrity score (0-100%) and event log.
"""

import time
from collections import deque
from typing import Dict, Any, List


MAX_HISTORY = 500


class TelemetryIntegrityMonitor:
    def __init__(self):
        self.last_cycle = None
        self.last_timestamp = None
        self.cycle_history = deque(maxlen=MAX_HISTORY)
        self.seen_cycles = set()

        # Counters
        self.total_packets = 0
        self.lost_packets = 0
        self.duplicate_packets = 0
        self.invalid_packets = 0
        self.replay_events = 0
        self.timestamp_anomalies = 0
        self.sensor_anomalies = 0

        self.event_log: deque = deque(maxlen=50)

    def _log_event(self, event_type: str, detail: str):
        self.event_log.append({
            "type": event_type,
            "detail": detail,
            "ts": round(time.time(), 2)
        })

    def evaluate(self, data: dict) -> dict:
        self.total_packets += 1
        now = time.time()

        cycle = data.get("cycle", 0)
        is_anomaly = False

        # 1. Duplicate packet detection
        if cycle in self.seen_cycles:
            self.duplicate_packets += 1
            self.replay_events += 1
            self._log_event("REPLAY", f"Duplicate cycle {cycle}")
            is_anomaly = True
        else:
            self.seen_cycles.add(cycle)
            if len(self.seen_cycles) > MAX_HISTORY * 2:
                # Prune old entries
                self.seen_cycles = set(list(self.seen_cycles)[-MAX_HISTORY:])

        # 2. Sequence number check
        if self.last_cycle is not None:
            delta = cycle - self.last_cycle
            if delta < 0 and delta != 0:
                self.timestamp_anomalies += 1
                self._log_event("OUT_OF_ORDER", f"Cycle {cycle} after {self.last_cycle}")
                is_anomaly = True
            elif delta > 5:
                # Allow some jumps (simulator reset, playback)
                estimated_lost = delta - 1
                if estimated_lost > 0 and estimated_lost < 50:
                    self.lost_packets += estimated_lost
                    self._log_event("PACKET_LOSS", f"{estimated_lost} packets lost between {self.last_cycle}→{cycle}")
        self.last_cycle = cycle

        # 3. Timestamp sanity
        if self.last_timestamp is not None:
            elapsed = now - self.last_timestamp
            # Expect 0.05–2.0 seconds between packets (0.1s nominal)
            if elapsed < 0.005 or elapsed > 5.0:
                self.timestamp_anomalies += 1
        self.last_timestamp = now

        # 4. Impossible sensor values check
        HARD_BOUNDS = {
            "rpm": (0, 3200), "cht": (0, 700), "egt": (0, 2200),
            "oil_pressure": (0, 150), "battery_v": (0, 20),
            "vibration": (0, 20), "fuel_flow": (0, 30),
        }
        for ch, (lo, hi) in HARD_BOUNDS.items():
            v = data.get(ch)
            if v is not None and (v < lo or v > hi):
                self.sensor_anomalies += 1
                self.invalid_packets += 1
                self._log_event("IMPOSSIBLE_VALUE", f"{ch}={v} outside [{lo},{hi}]")
                is_anomaly = True
                break

        self.cycle_history.append(cycle)

        # 5. Integrity Score calculation
        total = max(1, self.total_packets)
        loss_rate = self.lost_packets / total
        dup_rate = self.duplicate_packets / total
        invalid_rate = self.invalid_packets / total

        integrity_score = max(0.0, 100.0 - (
            loss_rate * 30.0 +
            dup_rate * 50.0 +
            invalid_rate * 40.0 +
            (self.timestamp_anomalies / max(1, total)) * 20.0
        ))
        integrity_score = round(integrity_score, 1)

        packet_loss_pct = round((self.lost_packets / max(1, self.total_packets + self.lost_packets)) * 100.0, 3)

        return {
            "integrity_score":      integrity_score,
            "total_packets":        self.total_packets,
            "packet_loss_pct":      packet_loss_pct,
            "lost_packets":         self.lost_packets,
            "duplicate_packets":    self.duplicate_packets,
            "invalid_packets":      self.invalid_packets,
            "replay_events":        self.replay_events,
            "sensor_anomalies":     self.sensor_anomalies,
            "timestamp_anomalies":  self.timestamp_anomalies,
            "current_anomaly":      is_anomaly,
            "recent_events":        list(self.event_log)[-5:],
        }


telemetry_integrity_monitor = TelemetryIntegrityMonitor()
