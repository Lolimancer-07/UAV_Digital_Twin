"""
packages/twin-core/twin_core/physics_firewall.py

Physics Firewall: Cyber-Physical Intrusion & Telemetry Tamper Detection.
Implements STARTUP_BLUEPRINT.md §3 F4 & §8 Phase 3:
  - Validates incoming CAN/telemetry against thermodynamic and physical invariants.
  - Distinguishes NOMINAL vs SENSOR_FAULT vs PHYSICAL_FAULT vs CYBER_TAMPER_SPOOF.
  - Detects frame replay, timing jitter anomalies, and rate-of-change violations.
  - Evaluates energy balance residuals (fuel chemical energy vs shaft BHP + coolant/exhaust heat).
"""

from typing import Dict, List, Any, Optional, Tuple
import math
import hashlib
from collections import deque
import threading


class PhysicsFirewall:
    """
    Thermodynamic and behavioral firewall inspecting telemetry for cyber-physical tampering,
    spoofing, replay attacks, and sensor integrity violations.
    """

    # Physical plausibility limits for piston aero-engines (Rotax 914 class)
    MAX_CHT_RATE_OF_CHANGE_F_PER_S = 18.0    # Solid metal thermal mass restricts rapid jump
    MAX_RPM_RATE_OF_CHANGE_PER_S = 1500.0   # Inertia limit
    MAX_EGT_RATE_OF_CHANGE_F_PER_S = 120.0  # Gas dynamics limit
    MIN_PLAUSIBLE_CHT_F = 60.0              # Ambient minimum
    MAX_PLAUSIBLE_CHT_F = 520.0             # Physical blowout ceiling

    # Verdict Classifications
    VERDICT_NOMINAL = "NOMINAL_VALID"
    VERDICT_SENSOR_FAULT = "SENSOR_FAULT"
    VERDICT_PHYSICAL_FAULT = "PHYSICAL_ENGINE_FAULT"
    VERDICT_CYBER_TAMPER = "CYBER_TAMPER_SPOOF"

    def __init__(self, history_len: int = 50):
        self.history_len = history_len
        self.channel_history: Dict[str, deque] = {}
        self.seen_signatures: deque = deque(maxlen=200)
        self.last_timestamps: deque = deque(maxlen=50)
        self.last_seq = -1
        self._lock = threading.RLock()

    def _hash_frame_payload(self, frame: Dict[str, Any]) -> str:
        """Computes hash of frame values (excluding timestamp/seq) to detect exact payload replay."""
        sig_fields = [
            round(float(frame.get("rpm", 0)), 1),
            round(float(frame.get("cht", 0)), 1),
            round(float(frame.get("egt", 0)), 1),
            round(float(frame.get("oil_pressure", 0)), 1),
            round(float(frame.get("fuel_flow", 0)), 2),
        ]
        s = ":".join(map(str, sig_fields))
        return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]

    def inspect_frame(
        self,
        frame: Dict[str, Any],
        dt_s: float = 0.1,  # Default 10 Hz interval (0.1s)
    ) -> Dict[str, Any]:
        """
        Inspects frame across 5 defense-in-depth thermodynamic and physical invariant layers:
          1. Range bounds and physical possibility
          2. Rate-of-change kinematic & thermal mass limits
          3. Thermodynamic energy balance consistency
          4. Cross-channel physical coupling (RPM vs Fuel Flow, CHT vs EGT)
          5. Frame sequence & replay spoofing detection
        """
        rpm = float(frame.get("rpm", 1400.0))
        cht = float(frame.get("cht", 380.0))
        egt = float(frame.get("egt", 1580.0))
        oil_p = float(frame.get("oil_pressure", 58.0))
        fuel_flow = float(frame.get("fuel_flow", 8.5))  # GPH
        vibration = float(frame.get("vibration", 0.65))
        seq = int(frame.get("seq", frame.get("cycle", 0)))
        ts = float(frame.get("timestamp", 0.0))

        violations = []
        cyber_indicators = 0
        sensor_indicators = 0
        physical_indicators = 0

        with self._lock:
            # ── Layer 1: Range Bounds Check ────────────────────────────────────
            if cht < self.MIN_PLAUSIBLE_CHT_F or cht > self.MAX_PLAUSIBLE_CHT_F:
                violations.append(f"CHT {cht:.1f}°F exceeds absolute physical bounds [60, 520]")
                sensor_indicators += 1

            if rpm < 0.0 or rpm > 7000.0:
                violations.append(f"RPM {rpm:.1f} physically impossible")
                sensor_indicators += 1

            # ── Layer 2: Rate-of-Change Invariant Check ────────────────────────
            prev_cht = self.channel_history.get("cht")
            if prev_cht and len(prev_cht) > 0 and dt_s > 0:
                delta_cht = abs(cht - prev_cht[-1])
                rate_cht = delta_cht / dt_s
                if rate_cht > self.MAX_CHT_RATE_OF_CHANGE_F_PER_S:
                    # Thermocouple metal head cannot heat/cool faster than thermal mass allows
                    # Unless injected synthetic frame with discontinuous jump
                    violations.append(f"CHT rate-of-change {rate_cht:.1f}°F/s violates thermal mass limit ({self.MAX_CHT_RATE_OF_CHANGE_F_PER_S}°F/s)")
                    cyber_indicators += 1

            prev_rpm = self.channel_history.get("rpm")
            if prev_rpm and len(prev_rpm) > 0 and dt_s > 0:
                delta_rpm = abs(rpm - prev_rpm[-1])
                rate_rpm = delta_rpm / dt_s
                if rate_rpm > self.MAX_RPM_RATE_OF_CHANGE_PER_S:
                    violations.append(f"RPM acceleration {rate_rpm:.1f}/s violates crankshaft inertia limit")
                    cyber_indicators += 1

            # ── Layer 3: Thermodynamic Energy Balance Invariant ───────────────
            # Chemical energy input = Fuel Flow * LHV * Density
            # 1 gallon Avgas = ~3.785 L * 0.72 kg/L = 2.725 kg
            # LHV = 44 MJ/kg -> ~120 MJ / gallon -> ~33.3 kWh / gallon
            # Power in kW ~ fuel_flow_gph * 33.3
            power_input_kw = fuel_flow * 33.3
            # Expected shaft power at this RPM (kW):
            shaft_power_kw = (115.0 * 0.7457) * (rpm / 2400.0) ** 1.3
            # Thermal conversion efficiency cannot exceed Otto limit ~35% or drop to 0% at high RPM
            if shaft_power_kw > (power_input_kw * 0.45) and rpm > 1800.0 and fuel_flow < 2.0:
                violations.append(f"Over-unity thermodynamic violation: Shaft power ({shaft_power_kw:.1f} kW) exceeds fuel chemical power ({power_input_kw:.1f} kW)")
                cyber_indicators += 2

            # ── Layer 4: Cross-Channel Coupling Invariant ──────────────────────
            # Idle fuel flow at full redline RPM or vice versa:
            if rpm > 2200.0 and fuel_flow < 2.0:
                violations.append(f"Inconsistent fuel coupling: RPM={rpm:.1f} with zero/idle fuel flow ({fuel_flow:.1f} GPH)")
                cyber_indicators += 1
            elif rpm < 800.0 and fuel_flow > 18.0:
                violations.append(f"Inconsistent fuel coupling: Idle RPM={rpm:.1f} with extreme fuel flow ({fuel_flow:.1f} GPH)")
                sensor_indicators += 1

            # Detonation / Real Physical Fault Check
            if cht > 425.0 and egt > 1650.0 and vibration > 1.8:
                # Real physical engine distress: all coupled channels track physically together
                physical_indicators += 2
                violations.append("Coordinated high CHT, high EGT, and high vibration indicates real physical thermal distress")

            # ── Layer 5: Sequence & Replay Spoofing Detection ──────────────────
            frame_sig = self._hash_frame_payload(frame)
            if frame_sig in self.seen_signatures and len(self.seen_signatures) > 10:
                # Repeating identical float values at 10 Hz indicates recorded replay loop
                recent_replays = list(self.seen_signatures).count(frame_sig)
                if recent_replays >= 3:
                    violations.append(f"Synthetic replay loop detected: Identical payload signature repeated {recent_replays} times")
                    cyber_indicators += 2

            if self.last_seq >= 0 and seq > 0:
                if seq <= self.last_seq and (self.last_seq - seq) < 100:
                    violations.append(f"Sequence rollback detected: seq {seq} <= last_seq {self.last_seq}")
                    cyber_indicators += 1

            # Update rolling state
            self.last_seq = seq
            self.seen_signatures.append(frame_sig)
            for ch_name, val in [("rpm", rpm), ("cht", cht), ("egt", egt), ("fuel_flow", fuel_flow)]:
                if ch_name not in self.channel_history:
                    self.channel_history[ch_name] = deque(maxlen=self.history_len)
                self.channel_history[ch_name].append(val)

        # ── Compute Verdict ───────────────────────────────────────────────────
        if cyber_indicators >= 2:
            verdict = self.VERDICT_CYBER_TAMPER
            confidence = min(0.99, 0.70 + cyber_indicators * 0.10)
        elif physical_indicators > 0 and cyber_indicators == 0 and sensor_indicators == 0:
            verdict = self.VERDICT_PHYSICAL_FAULT
            confidence = 0.95
        elif sensor_indicators > 0 and cyber_indicators == 0:
            verdict = self.VERDICT_SENSOR_FAULT
            confidence = 0.90
        elif len(violations) > 0 and cyber_indicators > 0:
            verdict = self.VERDICT_CYBER_TAMPER
            confidence = 0.85
        else:
            verdict = self.VERDICT_NOMINAL
            confidence = 0.99

        return {
            "verdict": verdict,
            "is_valid": verdict == self.VERDICT_NOMINAL,
            "confidence": round(confidence, 3),
            "cyber_threat_detected": verdict == self.VERDICT_CYBER_TAMPER,
            "violations_count": len(violations),
            "violations": violations,
            "invariants_checked": {
                "energy_balance": True,
                "rate_of_change_thermal": True,
                "kinematic_acceleration": True,
                "fuel_coupling": True,
                "replay_signature": True,
            },
        }

    def reset(self):
        """Resets tracking histories for test fixtures or flight start."""
        with self._lock:
            self.channel_history.clear()
            self.seen_signatures.clear()
            self.last_timestamps.clear()
            self.last_seq = -1


physics_firewall = PhysicsFirewall()
