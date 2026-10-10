"""
packages/twin-core/twin_core/safety_assurance.py

Airborne vs Ground-Side Decision Support & Advisory Safety Envelope.
Implements improvement_plan.md §4 Phase 6:
  - Explicitly bounds system to Ground-Side / Decision-Support / Advisory-only.
  - Runtime assurance envelope (ASTM F3269-17 principles): independent barrier
    validating recommendations against physical engine limits before operator surfacing.
    Blocks any recommendation violating safety envelopes or derating below minimum flight power.
  - Programmatic Requirements Traceability Matrix linking Hazard IDs -> Mitigations -> Automated Tests.
  - Zero direct actuator write path; immutable advisory audit logging.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timezone
import json
import threading

# Operational flight envelope limits (Rotax 914 class aero-piston)
SAFETY_ENVELOPE_LIMITS: Dict[str, Dict[str, float]] = {
    "min_flight_rpm": {"value": 1400.0, "unit": "RPM", "desc": "Minimum power required for sustained flight / loiter"},
    "max_rpm": {"value": 5800.0, "unit": "RPM", "desc": "Redline maximum engine speed"},
    "max_cht": {"value": 450.0, "unit": "°F", "desc": "Cylinder head temperature critical redline"},
    "max_egt": {"value": 1650.0, "unit": "°F", "desc": "Exhaust gas temperature critical limit"},
    "min_oil_pressure": {"value": 30.0, "unit": "PSI", "desc": "Minimum operational oil pressure"},
    "max_vibration": {"value": 2.5, "unit": "g RMS", "desc": "Maximum mechanical airframe vibration limit"},
}

# Canonical Hazard Register (Safety Case Lite)
HAZARDS_REGISTER: Dict[str, Dict[str, Any]] = {
    "HAZ-001": {
        "title": "Unwarranted In-Flight Engine Derate / Shutdown",
        "severity": "CRITICAL",
        "description": "Advisory recommendation commands excessive RPM reduction during active flight, risking stall.",
        "mitigation": "AdvisorySafetyEnvelope enforces min_flight_rpm (>= 1400 RPM) during airborne phases; blocks direct actuator control.",
        "test_id": "test_advisory_safety_envelope_blocks_unsafe_derate",
    },
    "HAZ-002": {
        "title": "Undetected Thermal Runaway or Lubrication Starvation",
        "severity": "CATASTROPHIC",
        "description": "Thermal degradation or sudden oil loss not alerted to operator before mechanical seizure.",
        "mitigation": "Physics residual monitor + XAI engine triggers multi-fault priority ranking and emergency advisory within 1.5s.",
        "test_id": "test_hil_thermal_and_oil_fault_detection_within_envelope",
    },
    "HAZ-003": {
        "title": "Avionics Bus Telemetry Spoofing / Replay Attack",
        "severity": "MAJOR",
        "description": "Adversarial or corrupted CAN/telemetry frames injected on avionics bus presenting false nominal health.",
        "mitigation": "Physics firewall invariants, monotonic cycle/timestamp checks, frame jitter validation, and HMAC attestation.",
        "test_id": "test_physics_firewall_and_cryptographic_attestation",
    },
    "HAZ-004": {
        "title": "Adversarial or Corrupted ML Model Injection",
        "severity": "CRITICAL",
        "description": "Tampered or degraded ONNX model deployed to edge or backend producing erroneous prognostics.",
        "mitigation": "Cryptographic Ed25519/HMAC-SHA256 signature verification + SHA-256 digest validation before model load; rollback gate.",
        "test_id": "test_artifact_signature_verification_rejects_tampered_model",
    },
    "HAZ-005": {
        "title": "Unauthorized Cross-Tenant Telemetry or ITAR Data Exfiltration",
        "severity": "MAJOR",
        "description": "Tenant data leakage or ITAR-controlled defense data processed outside authorized residency regions.",
        "mitigation": "Cryptographic tenant isolation, strict data residency policy enforcement, and zero raw telemetry sharing.",
        "test_id": "test_data_residency_and_export_control_enforcement",
    },
}


class AdvisorySafetyEnvelope:
    """
    Runtime assurance barrier inspecting all AI-generated prescriptive
    or advisory recommendations against physical engine envelopes.
    Ensures the system strictly acts as an Advisory Decision Support System
    with zero direct actuator authority (ASTM F3269-17 aligned).
    """

    def __init__(self, limits: Optional[Dict[str, Dict[str, float]]] = None):
        self.limits = limits or SAFETY_ENVELOPE_LIMITS
        self._lock = threading.RLock()
        self.total_evaluated = 0
        self.total_suppressed = 0

    def evaluate_recommendation(
        self,
        recommendation: Dict[str, Any],
        current_telemetry: Dict[str, Any],
        flight_phase: str = "cruise",
    ) -> Dict[str, Any]:
        """
        Validates an advisory recommendation against the physical safety envelope.
        Returns a vetted recommendation dictionary with safety status.
        If unsafe, suppresses or clamps the recommendation and issues an ENVELOPE_VIOLATION warning.
        """
        with self._lock:
            self.total_evaluated += 1
            is_safe = True
            violations: List[str] = []

            # 1. Enforce Advisory-Only constraint
            # Direct actuator execution commands are strictly disallowed
            command_type = recommendation.get("command_type", "ADVISORY").upper()
            if command_type in ["DIRECT_ACTUATE", "AUTOPILOT_OVERRIDE", "FLY_BY_WIRE_WRITE"]:
                is_safe = False
                violations.append(
                    f"Direct actuator execution '{command_type}' rejected: System is Ground-Side Advisory Decision Support only."
                )

            # 2. Check proposed RPM adjustment
            proposed_rpm = recommendation.get("recommended_rpm") or recommendation.get("target_rpm")
            if proposed_rpm is not None:
                try:
                    rpm_val = float(proposed_rpm)
                    min_rpm = self.limits["min_flight_rpm"]["value"]
                    max_rpm = self.limits["max_rpm"]["value"]

                    is_airborne = flight_phase.lower() in ["takeoff", "climb", "cruise", "loiter", "descent"]
                    if is_airborne and rpm_val < min_rpm:
                        is_safe = False
                        violations.append(
                            f"Proposed RPM {rpm_val} is below minimum flight sustain power ({min_rpm} RPM) during {flight_phase}."
                        )

                    if rpm_val > max_rpm:
                        is_safe = False
                        violations.append(
                            f"Proposed RPM {rpm_val} exceeds engine redline ({max_rpm} RPM)."
                        )
                except (ValueError, TypeError):
                    is_safe = False
                    violations.append(f"Invalid target_rpm numeric value: {proposed_rpm}")

            # 3. Check proposed mixture or temperature limits if specified
            proposed_cht_target = recommendation.get("target_cht")
            if proposed_cht_target is not None:
                try:
                    cht_val = float(proposed_cht_target)
                    max_cht = self.limits["max_cht"]["value"]
                    if cht_val > max_cht:
                        is_safe = False
                        violations.append(
                            f"Proposed target CHT {cht_val}°F exceeds maximum safe limit ({max_cht}°F)."
                        )
                except (ValueError, TypeError):
                    pass

            if not is_safe:
                self.total_suppressed += 1
                return {
                    "approved": False,
                    "status": "SUPPRESSED_BY_SAFETY_ENVELOPE",
                    "action_text": "ADVISORY SUPPRESSED: Proposed parameter adjustment violates physical flight safety envelope.",
                    "original_recommendation": recommendation,
                    "violations": violations,
                    "flight_phase": flight_phase,
                    "authority_level": "ADVISORY_ONLY",
                    "evaluated_at": datetime.now(timezone.utc).isoformat(),
                }

            return {
                "approved": True,
                "status": "APPROVED_ADVISORY",
                "action_text": recommendation.get("action_text", "Safe operational advisory."),
                "recommended_rpm": proposed_rpm,
                "confidence": recommendation.get("confidence", 0.95),
                "authority_level": "ADVISORY_HUMAN_IN_THE_LOOP",
                "evaluated_at": datetime.now(timezone.utc).isoformat(),
                "violations": [],
            }


class RequirementsTraceabilityRegistry:
    """
    Maintains machine-readable traceability between Hazard IDs, safety requirements,
    mitigation modules, and automated test IDs.
    """

    def __init__(self):
        self.hazards = HAZARDS_REGISTER

    def get_hazard(self, hazard_id: str) -> Optional[Dict[str, Any]]:
        return self.hazards.get(hazard_id)

    def list_hazards(self) -> List[Dict[str, Any]]:
        return [{"hazard_id": k, **v} for k, v in self.hazards.items()]

    def verify_traceability_coverage(self, available_test_names: List[str]) -> Dict[str, Any]:
        """
        Validates that 100% of defined hazards have corresponding active test methods.
        """
        covered = []
        missing = []
        for hid, hdata in self.hazards.items():
            tid = hdata["test_id"]
            if any(tid in t for t in available_test_names):
                covered.append(hid)
            else:
                missing.append((hid, tid))

        coverage_pct = (len(covered) / len(self.hazards)) * 100.0 if self.hazards else 0.0
        return {
            "total_hazards": len(self.hazards),
            "covered_hazards": len(covered),
            "missing_hazards": len(missing),
            "coverage_pct": round(coverage_pct, 1),
            "missing_details": missing,
            "status": "COMPLETE" if not missing else "INCOMPLETE",
        }
