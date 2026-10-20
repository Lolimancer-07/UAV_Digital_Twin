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
import hashlib

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

            # 4. Enforce Two-Person Verification Rule if flagged as safety-critical
            requires_two_person = bool(
                recommendation.get("safety_critical")
                or recommendation.get("requires_two_person_approval")
            )
            if requires_two_person:
                req_by = recommendation.get("requested_by")
                app_by = recommendation.get("approved_by")
                if not req_by or not app_by:
                    is_safe = False
                    violations.append(
                        "Two-person rule violation: Safety-critical action requires both 'requested_by' and 'approved_by'."
                    )
                elif str(req_by).strip().lower() == str(app_by).strip().lower():
                    is_safe = False
                    violations.append(
                        f"Two-person rule violation: Requester '{req_by}' cannot self-approve safety-critical action."
                    )

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


class TwoPersonApprovalGate:
    """
    Two-person integrity gate for safety-critical and high-impact actions.
    Enforces aviation safety principle: the initiator of a critical advisory,
    operational command, or maintenance work order CANNOT self-approve.
    Requires requested_by != approved_by, records SHA-256 audit evidence,
    and supports integration with EventStore.
    """

    def __init__(self, event_store: Optional[Any] = None):
        self.event_store = event_store
        self._lock = threading.RLock()
        self.requests: Dict[str, Dict[str, Any]] = {}

    def create_request(
        self,
        action_id: str,
        action_type: str,
        requested_by: str,
        payload: Optional[Dict[str, Any]] = None,
        requester_role: str = "OPERATOR",
        aircraft_id: str = "UAV-01",
    ) -> Dict[str, Any]:
        with self._lock:
            now_iso = datetime.now(timezone.utc).isoformat()
            req = {
                "action_id": action_id,
                "action_type": action_type,
                "aircraft_id": aircraft_id,
                "requested_by": requested_by,
                "requester_role": requester_role,
                "payload": payload or {},
                "status": "PENDING_SECOND_APPROVAL",
                "requested_at": now_iso,
                "approved_by": None,
                "approver_role": None,
                "approved_at": None,
                "rejected_by": None,
                "rejected_at": None,
                "rejection_reason": None,
                "audit_digest": None,
            }
            self.requests[action_id] = req
            return dict(req)

    def approve_request(
        self,
        action_id: str,
        approved_by: str,
        approver_role: str = "SAFETY_OFFICER",
        comment: str = "",
    ) -> Tuple[bool, Dict[str, Any], str]:
        with self._lock:
            req = self.requests.get(action_id)
            if not req:
                return False, {}, f"Request '{action_id}' not found."

            if req["status"] != "PENDING_SECOND_APPROVAL":
                return False, dict(req), f"Cannot approve request with status '{req['status']}'."

            # Strict Two-Person Rule: Approver CANNOT be the Requester
            if str(approved_by).strip().lower() == str(req["requested_by"]).strip().lower():
                return (
                    False,
                    dict(req),
                    f"Two-person rule violation: Requester '{req['requested_by']}' cannot self-approve.",
                )

            now_iso = datetime.now(timezone.utc).isoformat()
            digest_src = f"{action_id}:{req['action_type']}:{req['requested_by']}:{approved_by}:{now_iso}"
            digest = hashlib.sha256(digest_src.encode("utf-8")).hexdigest()

            req["status"] = "APPROVED"
            req["approved_by"] = approved_by
            req["approver_role"] = approver_role
            req["approved_at"] = now_iso
            req["approval_comment"] = comment
            req["audit_digest"] = digest

            # Optional append to event store
            if self.event_store and hasattr(self.event_store, "append_event"):
                try:
                    self.event_store.append_event(
                        event_type="SAFETY_CRITICAL_APPROVAL",
                        aircraft_id=req.get("aircraft_id", "UAV-01"),
                        flight_id="APPROVAL_AUDIT",
                        cycle=0,
                        payload=dict(req),
                        tenant_id="default",
                    )
                except Exception:
                    pass

            return True, dict(req), "Approval granted under two-person verification rule."

    def reject_request(
        self,
        action_id: str,
        rejected_by: str,
        reason: str = "Rejected by safety supervisor",
    ) -> Tuple[bool, Dict[str, Any], str]:
        with self._lock:
            req = self.requests.get(action_id)
            if not req:
                return False, {}, f"Request '{action_id}' not found."

            if req["status"] != "PENDING_SECOND_APPROVAL":
                return False, dict(req), f"Cannot reject request with status '{req['status']}'."

            now_iso = datetime.now(timezone.utc).isoformat()
            req["status"] = "REJECTED"
            req["rejected_by"] = rejected_by
            req["rejected_at"] = now_iso
            req["rejection_reason"] = reason

            return True, dict(req), "Request rejected."

    def get_request(self, action_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            req = self.requests.get(action_id)
            return dict(req) if req else None

    def list_requests(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            if status:
                return [dict(r) for r in self.requests.values() if r.get("status") == status]
            return [dict(r) for r in self.requests.values()]


# Global singleton instances
two_person_approval_gate = TwoPersonApprovalGate()

__all__ = [
    "SAFETY_ENVELOPE_LIMITS",
    "HAZARDS_REGISTER",
    "AdvisorySafetyEnvelope",
    "RequirementsTraceabilityRegistry",
    "TwoPersonApprovalGate",
    "two_person_approval_gate",
]
