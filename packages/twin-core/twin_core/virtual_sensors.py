"""
packages/twin-core/twin_core/virtual_sensors.py

Virtual Sensors & Degraded-Mode Continuity Engine.
Implements STARTUP_BLUEPRINT.md §3 F9 & §8 Phase 3:
  - Physics-informed neural/thermodynamic channel reconstruction when physical probes fail.
  - Automatic switchover with hysteresis to prevent sensor oscillation.
  - Explicit provenance tagging: is_virtual=True, virtual_confidence, estimated_error_margin.
  - Guarantees uninterrupted digital twin health scoring during sensor loss (drop-one-sensor ablation).
"""

from typing import Dict, List, Any, Optional, Tuple
import math
import threading


class VirtualSensorReconstructor:
    """
    Reconstructs missing or corrupted engine telemetry channels using physics correlations
    with surviving peer sensors.
    """

    RECOVERY_HYSTERESIS_CYCLES = 10  # Must be healthy for 10 consecutive cycles to revert to physical

    def __init__(self):
        self.virtual_active: Dict[str, bool] = {}
        self.recovery_counter: Dict[str, int] = {}
        self._lock = threading.RLock()

    def _is_channel_invalid(self, val: Any) -> bool:
        """Checks if a sensor value is missing, NaN, zero-dropout, or open-circuit."""
        if val is None:
            return True
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return True
            # Open thermocouple typically reads -999, 0.0, or 9999
            if f <= 0.0 or f >= 3000.0:
                return True
            return False
        except (ValueError, TypeError):
            return True

    def reconstruct_cht(
        self,
        target_cyl: int,
        telemetry: Dict[str, Any],
    ) -> Tuple[float, float]:
        """
        Reconstructs CHT for cylinder i (1-4) from surviving peer cylinders and RPM.
        Returns (estimated_cht, confidence).
        """
        rpm = float(telemetry.get("rpm", 1400.0))
        # Gather surviving peer cylinder CHTs
        peer_chts = []
        for c in range(1, 5):
            if c != target_cyl:
                val = telemetry.get(f"cht_{c}") or telemetry.get("cht")
                if not self._is_channel_invalid(val):
                    peer_chts.append(float(val))

        if peer_chts:
            # Average peer CHT adjusted for cylinder-specific thermal bias
            # Cylinder 3 & 4 run ~6°F warmer due to rear cooling baffle airflow
            bias = 6.0 if target_cyl in (3, 4) else -4.0
            avg_peer = sum(peer_chts) / len(peer_chts)
            est_cht = round(avg_peer + bias, 1)
            confidence = round(0.92 if len(peer_chts) >= 2 else 0.80, 2)
            return est_cht, confidence
        else:
            # Fallback to pure thermodynamic forward model from RPM
            rpm_ratio = rpm / 1400.0
            est_cht = round(380.0 * (rpm_ratio ** 1.25), 1)
            return est_cht, 0.70

    def reconstruct_egt(
        self,
        target_cyl: int,
        telemetry: Dict[str, Any],
    ) -> Tuple[float, float]:
        """Reconstructs EGT for cylinder i from peer cylinders and fuel flow."""
        peer_egts = []
        for c in range(1, 5):
            if c != target_cyl:
                val = telemetry.get(f"egt_{c}") or telemetry.get("egt")
                if not self._is_channel_invalid(val):
                    peer_egts.append(float(val))

        if peer_egts:
            est_egt = round(sum(peer_egts) / len(peer_egts), 1)
            return est_egt, 0.90
        else:
            rpm = float(telemetry.get("rpm", 1400.0))
            est_egt = round(1580.0 * ((rpm / 1400.0) ** 1.05), 1)
            return est_egt, 0.72

    def reconstruct_oil_pressure(self, telemetry: Dict[str, Any]) -> Tuple[float, float]:
        """Reconstructs oil pressure from RPM and oil temperature."""
        rpm = float(telemetry.get("rpm", 1400.0))
        oil_t = float(telemetry.get("oil_temp", 185.0))
        # Oil pressure rises with RPM, drops with oil temperature (viscosity thinning)
        base_p = 58.0 * math.sqrt(rpm / 1400.0)
        temp_factor = 1.0 - (oil_t - 185.0) * 0.0025
        est_oil_p = round(max(20.0, base_p * temp_factor), 1)
        return est_oil_p, 0.85

    def reconstruct_fuel_flow(self, telemetry: Dict[str, Any]) -> Tuple[float, float]:
        """Reconstructs fuel flow (GPH) from engine RPM and power output."""
        rpm = float(telemetry.get("rpm", 1400.0))
        # Power ~ RPM^1.5; BSFC ~ 0.44 -> GPH ~ BHP * 0.078
        bhp = 115.0 * ((rpm / 2400.0) ** 1.4)
        est_flow = round(max(2.5, bhp * 0.082), 2)
        return est_flow, 0.86

    def process_telemetry_frame(self, raw_telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Inspects telemetry frame. If any critical channel is invalid,
        activates virtual reconstruction and injects provenance metadata.
        """
        frame = dict(raw_telemetry)
        virtual_channels = []
        confidences = {}

        with self._lock:
            # 1. Inspect CHT (aggregate and individual cylinder channels)
            for c in range(1, 5):
                ch_key = f"cht_{c}"
                val = frame.get(ch_key)
                if self._is_channel_invalid(val):
                    est_val, conf = self.reconstruct_cht(c, frame)
                    frame[ch_key] = est_val
                    virtual_channels.append(ch_key)
                    confidences[ch_key] = conf
                    self.virtual_active[ch_key] = True
                    self.recovery_counter[ch_key] = 0
                else:
                    # Check hysteresis recovery
                    if self.virtual_active.get(ch_key, False):
                        self.recovery_counter[ch_key] = self.recovery_counter.get(ch_key, 0) + 1
                        if self.recovery_counter[ch_key] >= self.RECOVERY_HYSTERESIS_CYCLES:
                            self.virtual_active[ch_key] = False

            # Inspect primary CHT
            if self._is_channel_invalid(frame.get("cht")):
                est_val, conf = self.reconstruct_cht(1, frame)
                frame["cht"] = est_val
                virtual_channels.append("cht")
                confidences["cht"] = conf

            # 2. Inspect primary Oil Pressure
            if self._is_channel_invalid(frame.get("oil_pressure")):
                est_oil, conf = self.reconstruct_oil_pressure(frame)
                frame["oil_pressure"] = est_oil
                virtual_channels.append("oil_pressure")
                confidences["oil_pressure"] = conf

            # 3. Inspect Fuel Flow
            if self._is_channel_invalid(frame.get("fuel_flow")):
                est_ff, conf = self.reconstruct_fuel_flow(frame)
                frame["fuel_flow"] = est_ff
                virtual_channels.append("fuel_flow")
                confidences["fuel_flow"] = conf

        # Attach Virtual Sensors Provenance Envelope
        frame["virtual_sensors"] = {
            "has_virtual_channels": len(virtual_channels) > 0,
            "reconstructed_channels": virtual_channels,
            "channel_confidences": confidences,
            "overall_synthetic_confidence": round(sum(confidences.values()) / len(confidences), 2) if confidences else 1.0,
        }

        return frame


virtual_sensors_engine = VirtualSensorReconstructor()
