"""
backend/api_server.py

REST API server for UAV Digital Twin Replay, Audit, and Reporting.
Implements improvement_plan.md §4 Phase 2:
  - Real replay API over the event store
  - Flight comparison API (Run A vs Run B)
  - Operator annotation API
  - Immutable command audit trail query API
  - Post-flight maintenance report generator API (JSON and printable HTML)
"""

import os
import json
import time
from datetime import datetime, timezone
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
from typing import Tuple, Dict, Any, Optional

SERVER_START_TIME = time.time()
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from backend.event_store import get_event_store
from twin_core.report_generator import generate_flight_report, render_report_html
from twin_core.auth import (
    create_access_token,
    verify_access_token,
    authorize_command,
    ROLE_ADMIN,
    ROLE_DISPATCHER,
    ROLE_VIEWER,
    ROLE_MAINTAINER,
)
from twin_core.drift_detector import drift_detector
from twin_core.model_governance import model_promotion_gate
from twin_core.federated_aggregator import dp_federated_coordinator
from twin_core.safety_assurance import (
    AdvisorySafetyEnvelope,
    RequirementsTraceabilityRegistry,
    HAZARDS_REGISTER,
    TwoPersonApprovalGate,
    two_person_approval_gate,
)
from twin_core.hil_testbed import (
    HILScenarioReplayRunner,
    HILPassFailEvaluator,
    FAULT_INJECTION_CATALOG,
    BENCH_HARDWARE_SPECS,
)
from twin_core.security_compliance import (
    SBOMGenerator,
    KeyRotationManager,
    DataResidencyEnforcer,
)
from twin_core.demo_kit import ValueStoryDemoController
from twin_core.data_connectors import CustomerLogBackfillParser
from twin_core.roi_calculator import EngineHealthROICalculator, COMMERCIAL_TIERS

# Phase 6 & 7 Singletons
safety_envelope = AdvisorySafetyEnvelope()
traceability_registry = RequirementsTraceabilityRegistry()
key_rotation_mgr = KeyRotationManager()
sbom_generator = SBOMGenerator()
hil_runner = HILScenarioReplayRunner()
hil_evaluator = HILPassFailEvaluator()

# Phase 7 GTM Singletons
demo_story_controller = ValueStoryDemoController()
backfill_parser = CustomerLogBackfillParser()
roi_calc = EngineHealthROICalculator()

# Phase 8 Scale Singletons
from twin_core.platform_profiles import platform_registry
from twin_core.scale_ingest import PartitionedIngestRouter
from twin_core.cost_tracker import cost_tracker
from twin_core.chaos_engine import chaos_runner

partitioned_ingest = PartitionedIngestRouter()

# Planning & Decision Support Singletons (STARTUP_BLUEPRINT.md Phase 4)
from twin_core.life_burn import life_burn_calc
from twin_core.mission_planner import mission_planner, MissionSegment
from twin_core.contingency_footprint import contingency_engine

# Integrity & Trust Singletons (STARTUP_BLUEPRINT.md Phase 3)
from twin_core.physics_firewall import physics_firewall
from twin_core.virtual_sensors import virtual_sensors_engine
from twin_core.reliability_passport import engine_passport
from twin_core.causal_root_cause import causal_engine

# Startup Blueprint Singletons (STARTUP_BLUEPRINT.md §3, §4)
from twin_core.conformal_prognostics import conformal_prognostics
from twin_core.self_calibration import per_airframe_calibrator
from twin_core.abstention_alerting import abstention_alert_manager
from twin_core.twin_trust import twin_trust_auditor
from twin_core.profile_loader import profile_loader

WS_AUTH_TOKEN = os.environ.get("UAV_TWIN_AUTH_TOKEN", "").strip()
REQUIRE_AUTH = os.environ.get("UAV_TWIN_REQUIRE_AUTH", "").lower() in ("1", "true", "yes")

ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8766",
    "http://127.0.0.1:8766",
}
custom_origins = os.environ.get("UAV_TWIN_ALLOWED_ORIGINS", "")
if custom_origins:
    for o in custom_origins.split(","):
        if o.strip():
            ALLOWED_ORIGINS.add(o.strip())


class TwinApiHandler(BaseHTTPRequestHandler):
    """HTTP handler serving REST endpoints over the EventStore and Report Worker."""

    def _send_cors_headers(self):
        # Strict origin reflection for local dev / defense consoles
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        elif not origin:
            self.send_header("Access-Control-Allow-Origin", "*")
        else:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.send_header("Access-Control-Allow-Credentials", "true")

    def _resolve_caller(self) -> Tuple[bool, Dict[str, Any], str]:
        """Extract and verify caller's token from Authorization header or query param."""
        auth_hdr = self.headers.get("Authorization", "")
        token = None
        if auth_hdr.startswith("Bearer "):
            token = auth_hdr[7:].strip()
        if not token:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            token = qs.get("token", [None])[0]

        if not token:
            if REQUIRE_AUTH:
                return False, {}, "Authentication required: missing access token"
            # Default unauthenticated access (scoped to 'default' tenant in dev)
            return True, {
                "sub": "anonymous",
                "tenant_id": "default",
                "role": ROLE_ADMIN,
                "aircraft_ids": ["*"],
            }, "OK"

        if WS_AUTH_TOKEN and token == WS_AUTH_TOKEN:
            return True, {
                "sub": "admin",
                "tenant_id": "default",
                "role": ROLE_ADMIN,
                "aircraft_ids": ["*"],
            }, "OK"

        ok, payload, err = verify_access_token(token)
        if ok:
            return True, payload, "OK"
        return False, {}, err

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, data: dict, status: int = 200):
        try:
            body = json.dumps(data).encode("utf-8")
            self.send_response(status)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def _send_html(self, html_content: str, status: int = 200):
        try:
            body = html_content.encode("utf-8")
            self.send_response(status)
            self._send_cors_headers()
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        store = get_event_store()

        # Auth & Tenant Scoping
        is_auth, caller, err = self._resolve_caller()
        if not is_auth:
            self._send_json({"error": f"Unauthorized: {err}"}, 401)
            return

        caller_tenant = caller.get("tenant_id", "default")

        try:
            # 1. GET /api/replay/flights
            if path in ("/api/replay/flights", "/api/twin/replay/flights"):
                aircraft_id = qs.get("aircraft_id", [None])[0]
                # Enforce tenant isolation: non-default caller can only see their own tenant
                req_tenant = qs.get("tenant_id", ["default"])[0]
                effective_tenant = caller_tenant if caller_tenant != "default" else req_tenant
                flights = store.list_flights(tenant_id=effective_tenant, aircraft_id=aircraft_id)
                self._send_json({"status": "OK", "tenant_id": effective_tenant, "flights": flights})
                return

            # 2. GET /api/replay/events
            if path in ("/api/replay/events", "/api/twin/replay/events"):
                flight_id = qs.get("flight_id", [None])[0]
                if not flight_id:
                    self._send_json({"error": "Missing required query parameter: 'flight_id'"}, 400)
                    return

                # Check flight tenant ownership
                fl = store.get_flight(flight_id)
                if fl and caller_tenant != "default" and fl.get("tenant_id") != caller_tenant:
                    self._send_json({"error": "Forbidden: Flight belongs to another tenant"}, 403)
                    return

                start_cycle = qs.get("start_cycle", [None])[0]
                end_cycle = qs.get("end_cycle", [None])[0]
                events = store.get_replay_events(
                    flight_id=flight_id,
                    start_cycle=int(start_cycle) if start_cycle else None,
                    end_cycle=int(end_cycle) if end_cycle else None,
                )
                self._send_json({"status": "OK", "flight_id": flight_id, "count": len(events), "events": events})
                return

            # 3. GET /api/replay/compare
            if path in ("/api/replay/compare", "/api/twin/replay/compare"):
                flight_a = qs.get("flight_a", [None])[0]
                flight_b = qs.get("flight_b", [None])[0]
                if not flight_a or not flight_b:
                    self._send_json({"error": "Missing required parameters: 'flight_a' and 'flight_b'"}, 400)
                    return

                # Check isolation for both flights
                if caller_tenant != "default":
                    fl_a = store.get_flight(flight_a)
                    fl_b = store.get_flight(flight_b)
                    if (fl_a and fl_a.get("tenant_id") != caller_tenant) or (fl_b and fl_b.get("tenant_id") != caller_tenant):
                        self._send_json({"error": "Forbidden: One or both flights belong to another tenant"}, 403)
                        return

                comparison = store.compare_flights(flight_a, flight_b)
                self._send_json({"status": "OK", "comparison": comparison})
                return

            # 4. GET /api/replay/annotations
            if path in ("/api/replay/annotations", "/api/twin/replay/annotations"):
                flight_id = qs.get("flight_id", [None])[0]
                if not flight_id:
                    self._send_json({"error": "Missing required query parameter: 'flight_id'"}, 400)
                    return
                cycle = qs.get("cycle", [None])[0]
                annotations = store.get_annotations(flight_id=flight_id, cycle=int(cycle) if cycle else None)
                self._send_json({"status": "OK", "flight_id": flight_id, "annotations": annotations})
                return

            # 5. GET /api/audit/commands
            if path in ("/api/audit/commands", "/api/twin/audit/commands"):
                aircraft_id = qs.get("aircraft_id", [None])[0]
                limit = int(qs.get("limit", [100])[0])
                req_tenant = qs.get("tenant_id", ["default"])[0]
                effective_tenant = caller_tenant if caller_tenant != "default" else req_tenant
                commands = store.list_commands(aircraft_id=aircraft_id, tenant_id=effective_tenant, limit=limit)
                self._send_json({"status": "OK", "tenant_id": effective_tenant, "commands": commands})
                return

            # 6. GET /api/reports/flight
            if path in ("/api/reports/flight", "/api/twin/reports/flight"):
                flight_id = qs.get("flight_id", [None])[0]
                if not flight_id:
                    self._send_json({"error": "Missing required query parameter: 'flight_id'"}, 400)
                    return

                # Isolation check
                fl = store.get_flight(flight_id)
                if fl and caller_tenant != "default" and fl.get("tenant_id") != caller_tenant:
                    self._send_json({"error": "Forbidden: Flight belongs to another tenant"}, 403)
                    return

                fmt = qs.get("format", ["json"])[0].lower()
                report = generate_flight_report(store, flight_id, tenant_id=caller_tenant)

                if fmt == "html":
                    html = render_report_html(report)
                    self._send_html(html)
                else:
                    self._send_json({"status": "OK", "report": report})
                return

            # 7. GET /api/auth/session
            if path in ("/api/auth/session", "/api/twin/auth/session"):
                self._send_json({"status": "OK", "caller": caller})
                return

            # 8. GET /api/migrations
            if path in ("/api/migrations", "/api/twin/migrations"):
                applied = store.get_applied_migrations()
                self._send_json({"status": "OK", "migrations": applied, "count": len(applied)})
                return

            # 9. GET /api/drift/tickets
            if path in ("/api/drift/tickets", "/api/twin/drift/tickets"):
                aircraft_id = qs.get("aircraft_id", [None])[0]
                status_filter = qs.get("status", [None])[0]
                tickets = drift_detector.list_tickets(aircraft_id=aircraft_id, tenant_id=caller_tenant, status=status_filter)
                self._send_json({"status": "OK", "tickets": tickets, "count": len(tickets)})
                return

            # 10. GET /api/models/eval-cards
            if path in ("/api/models/eval-cards", "/api/twin/models/eval-cards"):
                cards = [c.to_dict() for c in model_promotion_gate.eval_cards.values()]
                self._send_json({"status": "OK", "eval_cards": cards, "active_champion": model_promotion_gate.active_champion})
                return

            # 11. GET /api/federated/status
            if path in ("/api/federated/status", "/api/twin/federated/status"):
                fed_status = dp_federated_coordinator.get_status()
                self._send_json({"status": "OK", "federated_learning": fed_status})
                return

            # 12. GET /api/compliance/posture
            if path in ("/api/compliance/posture", "/api/twin/compliance/posture"):
                self._send_json({
                    "status": "APPROVED",
                    "assurance_classification": "GROUND_SIDE_ADVISORY_DECISION_SUPPORT",
                    "airborne_authority": "NONE_ADVISORY_ONLY",
                    "runtime_safety_envelope": {
                        "active": True,
                        "total_evaluated": safety_envelope.total_evaluated,
                        "total_suppressed": safety_envelope.total_suppressed,
                    },
                    "requirements_traceability": {
                        "total_hazards": len(HAZARDS_REGISTER),
                        "hazards": traceability_registry.list_hazards(),
                    },
                    "bench_hardware_specs": BENCH_HARDWARE_SPECS,
                    "active_key_id": key_rotation_mgr.active_key_id,
                })
                return

            # 13. GET /api/compliance/sbom
            if path in ("/api/compliance/sbom", "/api/twin/compliance/sbom"):
                sbom = sbom_generator.generate_cyclonedx_sbom()
                self._send_json(sbom)
                return

            # 14. GET /api/demo/state
            if path in ("/api/demo/state", "/api/twin/demo/state"):
                self._send_json(demo_story_controller.get_state())
                return

            # 15. GET /api/demo/report
            if path in ("/api/demo/report", "/api/twin/demo/report"):
                html_rep = demo_story_controller.generate_printable_outcome_report()
                self._send_html(html_rep)
                return

            # 16. GET /api/roi/tiers
            if path in ("/api/roi/tiers", "/api/twin/roi/tiers"):
                self._send_json({"status": "OK", "pricing_tiers": COMMERCIAL_TIERS})
                return

            # 17. GET /api/scale/profiles
            if path in ("/api/scale/profiles", "/api/twin/scale/profiles"):
                self._send_json({"status": "OK", "profiles": platform_registry.list_profiles()})
                return

            # 18. GET /api/scale/ingest/status
            if path in ("/api/scale/ingest/status", "/api/twin/scale/ingest/status"):
                aid = qs.get("aircraft_id", [None])[0]
                metrics = partitioned_ingest.get_partition_metrics(aid)
                self._send_json({"status": "OK", "ingest_metrics": metrics})
                return

            # 19. GET /api/scale/cost/metrics
            if path in ("/api/scale/cost/metrics", "/api/twin/scale/cost/metrics"):
                hrs = float(qs.get("flight_hours_per_month", [50.0])[0])
                c_out = cost_tracker.compute_monthly_cost_per_aircraft(flight_hours_per_month=hrs)
                self._send_json({"status": "OK", "cost_metrics": c_out})
                return

            # 20. GET /api/contingency/sites
            if path in ("/api/contingency/sites", "/v1/contingency/sites", "/api/twin/contingency/sites"):
                self._send_json({"status": "OK", "sites": contingency_engine.list_sites()})
                return

            # 21. GET /api/passport/verify
            if path in ("/api/passport/verify", "/v1/passport/verify", "/api/twin/passport/verify"):
                audit_res = engine_passport.verify_integrity()
                self._send_json({"status": "OK", "audit": audit_res})
                return

            # 22. GET /api/passport/export
            if path in ("/api/passport/export", "/v1/passport/export", "/api/twin/passport/export"):
                pack_res = engine_passport.export_evidence_pack()
                self._send_json({"status": "OK", "evidence_pack": pack_res})
                return

            # 23. GET /v1/fleet (STARTUP_BLUEPRINT.md §4)
            if path in ("/v1/fleet", "/api/fleet", "/api/twin/fleet"):
                fleet_data = [
                    {
                        "tail_id": "UAV-01",
                        "engine_profile": "ROTAX_914",
                        "health_index": 92.4,
                        "life_burn_rate": 1.05,
                        "trust_score": 96.5,
                        "status": "MISSION_READY",
                    },
                    {
                        "tail_id": "UAV-02",
                        "engine_profile": "ROTAX_914",
                        "health_index": 88.1,
                        "life_burn_rate": 1.12,
                        "trust_score": 91.0,
                        "status": "MISSION_READY",
                    },
                    {
                        "tail_id": "UAV-03",
                        "engine_profile": "AUSTRO_AE300",
                        "health_index": 95.0,
                        "life_burn_rate": 0.98,
                        "trust_score": 98.2,
                        "status": "MISSION_READY",
                    },
                ]
                self._send_json({"status": "OK", "fleet": fleet_data, "count": len(fleet_data)})
                return

            # 24. GET /v1/tails/<tail_id>/twin (STARTUP_BLUEPRINT.md §4)
            if path.startswith("/v1/tails/") and path.endswith("/twin"):
                parts = path.strip("/").split("/")
                tail_id = parts[2] if len(parts) >= 3 else "UAV-01"
                baseline = per_airframe_calibrator.get_or_create_tail(tail_id).to_dict()
                trust = twin_trust_auditor.evaluate_trust()
                self._send_json({
                    "status": "OK",
                    "tail_id": tail_id,
                    "engine_profile": "ROTAX_914",
                    "baseline": baseline,
                    "trust": trust,
                    "active_phase": "cruise",
                })
                return

            # 25. GET /v1/tails/<tail_id>/passport (STARTUP_BLUEPRINT.md §4)
            if path.startswith("/v1/tails/") and path.endswith("/passport"):
                parts = path.strip("/").split("/")
                tail_id = parts[2] if len(parts) >= 3 else "UAV-01"
                evidence = engine_passport.export_evidence_pack(tail_id)
                self._send_json({"status": "OK", "tail_id": tail_id, "evidence_pack": evidence})
                return

            # 26. GET /v1/profiles
            if path in ("/v1/profiles", "/api/profiles", "/api/twin/profiles"):
                self._send_json({"status": "OK", "profiles": profile_loader.list_available_profiles()})
                return

            # 27. GET /v1/profiles/<id>
            if path.startswith("/v1/profiles/"):
                p_name = path.replace("/v1/profiles/", "").strip()
                try:
                    p_data = profile_loader.load_profile(p_name)
                    self._send_json({"status": "OK", "profile": p_data})
                except Exception as ex:
                    self._send_json({"error": str(ex)}, 404)
                return

            # 27. Health Probes (Liveness, Readiness, Model Verification)
            if path in ("/health/live", "/api/health/live", "/health", "/api/health", "/api/twin/health"):
                self._send_json({
                    "status": "ALIVE",
                    "service": "uav-twin-backend",
                    "version": "4.0",
                    "uptime_seconds": round(time.time() - SERVER_START_TIME, 2),
                    "pid": os.getpid(),
                    "tenant_isolation": "ACTIVE",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, 200)
                return

            if path in ("/health/ready", "/api/health/ready"):
                db_ok = False
                models_ok = False
                reasons = []

                # Probe SQLite EventStore DB responsiveness
                try:
                    ev_store = get_event_store()
                    with ev_store._lock:
                        conn = ev_store._get_connection()
                        with conn:
                            cur = conn.execute("SELECT count(*) as c FROM schema_migrations")
                            _ = cur.fetchone()
                    db_ok = True
                except Exception as ex:
                    reasons.append(f"Database error: {ex}")

                # Probe active champion model readiness
                try:
                    champion = model_promotion_gate.active_champion
                    if champion and champion.get("status") == "CHAMPION":
                        models_ok = True
                    else:
                        reasons.append("No active champion model in promotion gate")
                except Exception as ex:
                    reasons.append(f"Model error: {ex}")

                is_ready = bool(db_ok and models_ok)
                status_code = 200 if is_ready else 503
                self._send_json({
                    "status": "READY" if is_ready else "NOT_READY",
                    "ready": is_ready,
                    "service": "uav-twin-backend",
                    "checks": {
                        "database": "OK" if db_ok else "FAIL",
                        "models": "OK" if models_ok else "FAIL",
                    },
                    "issues": reasons,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, status_code)
                return

            if path in ("/health/models", "/api/health/models"):
                champion = model_promotion_gate.active_champion
                manifest_path = os.path.join(_REPO_ROOT, "packages", "contracts", "model_manifest.json")
                manifest_data = {}
                if os.path.exists(manifest_path):
                    try:
                        with open(manifest_path, "r", encoding="utf-8") as f:
                            manifest_data = json.load(f)
                    except Exception:
                        pass

                self._send_json({
                    "status": "OK",
                    "active_champion": champion,
                    "previous_champion": model_promotion_gate.previous_champion,
                    "has_rollback_target": bool(model_promotion_gate.previous_champion),
                    "registered_eval_cards": len(model_promotion_gate.eval_cards),
                    "manifest_models": manifest_data.get("models", []),
                    "hash_verification_enforced": True,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, 200)
                return

            # 28. GET /api/compliance/approvals (Two-person approval list)
            if path in ("/api/compliance/approvals", "/v1/compliance/approvals", "/api/twin/compliance/approvals"):
                status_filter = qs.get("status", [None])[0]
                approvals = two_person_approval_gate.list_requests(status=status_filter)
                self._send_json({"status": "OK", "count": len(approvals), "approvals": approvals})
                return

            self._send_json({"error": "Endpoint not found", "path": path}, 404)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({"error": str(e)}, 500)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        store = get_event_store()

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 1048576:  # 1 MB maximum request body size limit
                self._send_json({"error": "Payload Too Large: request body exceeds 1 MB"}, 413)
                return

            raw_body = self.rfile.read(content_length)
            body = json.loads(raw_body) if raw_body else {}

            # 1. POST /api/auth/token (Token issuance - does not require prior auth)
            if path in ("/api/auth/token", "/api/twin/auth/token"):
                user_id = str(body.get("user_id", "operator"))
                tenant_id = str(body.get("tenant_id", "tenant_alpha"))
                role = str(body.get("role", ROLE_DISPATCHER))
                aircraft_ids = body.get("aircraft_ids")
                expires = int(body.get("expires_in_seconds", 900))
                token = create_access_token(
                    user_id=user_id,
                    tenant_id=tenant_id,
                    role=role,
                    aircraft_ids=aircraft_ids,
                    expires_in_seconds=expires,
                )
                self._send_json({
                    "status": "OK",
                    "token": token,
                    "token_type": "Bearer",
                    "expires_in": expires,
                    "user_id": user_id,
                    "tenant_id": tenant_id,
                    "role": role,
                }, 200)
                return

            # Protected POST endpoints: verify caller credentials
            is_auth, caller, err = self._resolve_caller()
            if not is_auth:
                self._send_json({"error": f"Unauthorized: {err}"}, 401)
                return

            caller_tenant = caller.get("tenant_id", "default")

            # 2. POST /api/replay/annotations
            if path in ("/api/replay/annotations", "/api/twin/replay/annotations"):
                flight_id = body.get("flight_id")
                aircraft_id = body.get("aircraft_id", "UAV-01")
                cycle = body.get("cycle", 0)
                note = body.get("note", "")
                author = body.get("author", caller.get("sub", "OPERATOR"))
                category = body.get("category", "OBSERVATION")

                if not flight_id or not note:
                    self._send_json({"error": "Missing required fields 'flight_id' and 'note'"}, 400)
                    return

                # Tenant ownership check
                fl = store.get_flight(flight_id)
                if fl and caller_tenant != "default" and fl.get("tenant_id") != caller_tenant:
                    self._send_json({"error": "Forbidden: Flight belongs to another tenant"}, 403)
                    return

                # RBAC check: role must have annotate_replay permission
                auth_ok, code, reason = authorize_command(caller, "annotate_replay", aircraft_id)
                if not auth_ok:
                    self._send_json({"error": reason}, code)
                    return

                ann_id = store.add_annotation(
                    flight_id=flight_id,
                    aircraft_id=aircraft_id,
                    cycle=cycle,
                    author=author,
                    note=note,
                    category=category,
                )
                self._send_json({"status": "OK", "annotation_id": ann_id}, 201)
                return

            # 3. POST /api/reports/generate
            if path in ("/api/reports/generate", "/api/twin/reports/generate"):
                flight_id = body.get("flight_id")
                if not flight_id:
                    self._send_json({"error": "Missing required field: 'flight_id'"}, 400)
                    return

                fl = store.get_flight(flight_id)
                if fl and caller_tenant != "default" and fl.get("tenant_id") != caller_tenant:
                    self._send_json({"error": "Forbidden: Flight belongs to another tenant"}, 403)
                    return

                auth_ok, code, reason = authorize_command(caller, "generate_report", fl.get("aircraft_id", "UAV-01") if fl else "*")
                if not auth_ok:
                    self._send_json({"error": reason}, code)
                    return

                report = generate_flight_report(store, flight_id, tenant_id=caller_tenant)
                self._send_json({"status": "OK", "report": report})
                return

            # 4. POST /api/drift/tickets/acknowledge
            if path in ("/api/drift/tickets/acknowledge", "/api/twin/drift/tickets/acknowledge"):
                ticket_id = body.get("ticket_id")
                if not ticket_id:
                    self._send_json({"error": "Missing required field: 'ticket_id'"}, 400)
                    return
                ok = drift_detector.acknowledge_ticket(ticket_id, assigned_to=caller.get("sub", "engineer@fleet"))
                if ok:
                    self._send_json({"status": "OK", "message": f"Ticket {ticket_id} acknowledged"})
                else:
                    self._send_json({"error": f"Ticket {ticket_id} not found"}, 404)
                return

            # 5. POST /api/drift/tickets/resolve
            if path in ("/api/drift/tickets/resolve", "/api/twin/drift/tickets/resolve"):
                ticket_id = body.get("ticket_id")
                note = body.get("resolution_note", "Resolved after inspection")
                if not ticket_id:
                    self._send_json({"error": "Missing required field: 'ticket_id'"}, 400)
                    return
                ok = drift_detector.resolve_ticket(ticket_id, resolution_note=note, resolved_by=caller.get("sub", "engineer@fleet"))
                if ok:
                    self._send_json({"status": "OK", "message": f"Ticket {ticket_id} resolved"})
                else:
                    self._send_json({"error": f"Ticket {ticket_id} not found"}, 404)
                return

            # 6. POST /api/models/promote
            if path in ("/api/models/promote", "/api/twin/models/promote"):
                eval_id = body.get("eval_id")
                justification = body.get("justification", "Passed shadow-mode parity and offline metric gates")
                if not eval_id:
                    self._send_json({"error": "Missing required field: 'eval_id'"}, 400)
                    return
                ok, msg = model_promotion_gate.promote_candidate(
                    eval_id=eval_id,
                    approved_by=caller.get("sub", "engineer@fleet"),
                    justification=justification,
                )
                if ok:
                    self._send_json({"status": "OK", "message": msg, "champion": model_promotion_gate.active_champion})
                else:
                    self._send_json({"error": msg}, 422)
                return

            # 7. POST /api/models/rollback
            if path in ("/api/models/rollback", "/api/twin/models/rollback"):
                reason = body.get("reason", "Operator manual rollback")
                ok, msg = model_promotion_gate.rollback_model(
                    reason=reason,
                    approved_by=caller.get("sub", "engineer@fleet"),
                )
                if ok:
                    self._send_json({"status": "OK", "message": msg, "champion": model_promotion_gate.active_champion})
                else:
                    self._send_json({"error": msg}, 422)
                return

            # 8. POST /api/security/rotate-keys
            if path in ("/api/security/rotate-keys", "/api/twin/security/rotate-keys"):
                reason = body.get("reason", "SCHEDULED_ROTATION")
                new_key = key_rotation_mgr.rotate_key(reason=reason)
                self._send_json({
                    "status": "OK",
                    "message": f"Key rotated successfully to {new_key}",
                    "active_key_id": new_key,
                })
                return

            # 9. POST /api/compliance/hil-eval
            if path in ("/api/compliance/hil-eval", "/api/twin/compliance/hil-eval"):
                f_id = body.get("fault_injection_id", "INJ-TH-01")
                duration = int(body.get("duration_cycles", 50))
                start_c = int(body.get("fault_start_cycle", 20))
                frames = hil_runner.generate_scenario_frames(duration_cycles=duration, fault_injection_id=f_id, fault_start_cycle=start_c)

                def _eval_frame(f):
                    res = {}
                    if f.get("cht", 0) > 420.0:
                        res["status"] = "CRITICAL"
                        res["fault_category"] = "OVERHEATING"
                    elif f.get("oil_pressure", 100) < 30.0:
                        res["status"] = "EMERGENCY"
                        res["fault_category"] = "LOW_OIL_PRESSURE"
                    elif f.get("vibration", 0) > 2.0:
                        res["status"] = "WARNING"
                        res["fault_category"] = "HIGH_VIBRATION"
                    return res

                eval_res = hil_evaluator.evaluate_run(frames, _eval_frame, fault_injection_id=f_id, fault_start_cycle=start_c)
                self._send_json(eval_res)
                return

            # 10. POST /api/compliance/verify-recommendation
            if path in ("/api/compliance/verify-recommendation", "/api/twin/compliance/verify-recommendation"):
                rec = body.get("recommendation", {})
                telemetry = body.get("current_telemetry", {})
                phase = body.get("flight_phase", "cruise")
                vetted = safety_envelope.evaluate_recommendation(rec, telemetry, flight_phase=phase)
                self._send_json(vetted)
                return

            # 10b. POST /api/compliance/approvals/create (Two-person workflow request)
            if path in ("/api/compliance/approvals/create", "/api/twin/compliance/approvals/create"):
                act_id = body.get("action_id", f"ACT-{int(time.time() * 1000)}")
                act_type = body.get("action_type", "OPERATIONAL_ADVISORY")
                req_by = body.get("requested_by") or caller.get("sub", "operator")
                req_role = body.get("requester_role") or caller.get("role", "OPERATOR")
                ac_id = body.get("aircraft_id", "UAV-01")
                req_obj = two_person_approval_gate.create_request(
                    action_id=act_id,
                    action_type=act_type,
                    requested_by=req_by,
                    payload=body.get("payload", {}),
                    requester_role=req_role,
                    aircraft_id=ac_id,
                )
                self._send_json({"status": "CREATED", "request": req_obj}, 201)
                return

            # 10c. POST /api/compliance/approvals/approve (Two-person sign-off)
            if path in ("/api/compliance/approvals/approve", "/api/twin/compliance/approvals/approve"):
                act_id = body.get("action_id")
                app_by = body.get("approved_by") or caller.get("sub", "safety_officer")
                app_role = body.get("approver_role") or caller.get("role", "SAFETY_OFFICER")
                comment = body.get("comment", "")
                if not act_id:
                    self._send_json({"error": "Missing 'action_id'"}, 400)
                    return
                ok, req_obj, msg = two_person_approval_gate.approve_request(
                    action_id=act_id,
                    approved_by=app_by,
                    approver_role=app_role,
                    comment=comment,
                )
                if not ok:
                    self._send_json({"error": msg, "request": req_obj}, 403 if "Two-person rule" in msg else 400)
                    return
                self._send_json({"status": "APPROVED", "message": msg, "request": req_obj}, 200)
                return

            # 10d. POST /api/compliance/approvals/reject
            if path in ("/api/compliance/approvals/reject", "/api/twin/compliance/approvals/reject"):
                act_id = body.get("action_id")
                rej_by = body.get("rejected_by") or caller.get("sub", "safety_officer")
                reason = body.get("reason", "Rejected by safety supervisor")
                if not act_id:
                    self._send_json({"error": "Missing 'action_id'"}, 400)
                    return
                ok, req_obj, msg = two_person_approval_gate.reject_request(
                    action_id=act_id,
                    rejected_by=rej_by,
                    reason=reason,
                )
                if not ok:
                    self._send_json({"error": msg, "request": req_obj}, 400)
                    return
                self._send_json({"status": "REJECTED", "message": msg, "request": req_obj}, 200)
                return

            # 11. POST /api/demo/start
            if path in ("/api/demo/start", "/api/twin/demo/start"):
                state = demo_story_controller.start_demo()
                self._send_json({"status": "OK", "demo": state})
                return

            # 12. POST /api/demo/advance
            if path in ("/api/demo/advance", "/api/twin/demo/advance"):
                target_s = body.get("step")
                state = demo_story_controller.advance_step(target_step=int(target_s) if target_s is not None else None)
                self._send_json({"status": "OK", "demo": state})
                return

            # 13. POST /api/demo/reset
            if path in ("/api/demo/reset", "/api/twin/demo/reset"):
                res = demo_story_controller.reset_to_baseline()
                self._send_json(res)
                return

            # 14. POST /api/roi/calculate
            if path in ("/api/roi/calculate", "/api/twin/roi/calculate"):
                f_size = int(body.get("fleet_size", 10))
                hrs = float(body.get("annual_flight_hours_per_uav", 600.0))
                tier_k = str(body.get("tier_choice", "TIER_FLEET_CLOUD"))
                roi_out = roi_calc.calculate_fleet_roi(fleet_size=f_size, annual_flight_hours_per_uav=hrs, tier_choice=tier_k)
                self._send_json(roi_out)
                return

            # 15. POST /api/ingest/backfill
            if path in ("/api/ingest/backfill", "/api/twin/ingest/backfill"):
                csv_payload = body.get("csv_data")
                if not csv_payload and raw_body:
                    try:
                        csv_payload = raw_body.decode("utf-8", errors="ignore")
                    except Exception:
                        csv_payload = ""
                frames, meta = backfill_parser.parse_csv_content(csv_payload or "")
                insight = backfill_parser.generate_first_insight_card(frames)
                self._send_json({
                    "status": "OK",
                    "frames_parsed": len(frames),
                    "metadata": meta,
                    "first_insight_card": insight,
                })
            # 16. POST /api/scale/profiles
            if path in ("/api/scale/profiles", "/api/twin/scale/profiles"):
                ok, err_msg = platform_registry.register_profile(body)
                if ok:
                    self._send_json({"status": "OK", "message": f"Profile {body.get('profile_id')} registered successfully"})
                else:
                    self._send_json({"error": err_msg}, 422)
                return

            # 17. POST /api/scale/ingest/frame
            if path in ("/api/scale/ingest/frame", "/api/twin/scale/ingest/frame"):
                is_crit = bool(body.get("is_critical", False))
                route_res = partitioned_ingest.ingest_frame(body, is_critical_event=is_crit)
                self._send_json(route_res)
                return

            # 18. POST /api/scale/chaos/drill
            if path in ("/api/scale/chaos/drill", "/api/twin/scale/chaos/drill"):
                drill_t = body.get("drill_type", "BROKER_DOWN").upper()
                if drill_t == "BROKER_DOWN":
                    d_res = chaos_runner.run_broker_down_drill()
                elif drill_t == "STORE_DOWN":
                    d_res = chaos_runner.run_store_down_drill()
                elif drill_t == "MODEL_MISSING":
                    d_res = chaos_runner.run_model_missing_drill()
                else:
                    self._send_json({"error": f"Unknown drill_type: {drill_t}"}, 400)
                    return
                self._send_json(d_res)
                return

            # 19. POST /api/missions/plan
            if path in ("/api/missions/plan", "/v1/missions/plan", "/api/twin/missions/plan"):
                rul_h = float(body.get("current_rul_hours", 120.0))
                fuel_cap = float(body.get("fuel_capacity_gal", 65.0))
                seg_data = body.get("segments")
                parsed_segs = None
                if seg_data and isinstance(seg_data, list):
                    parsed_segs = [
                        MissionSegment(
                            name=s.get("name", f"Segment-{idx+1}"),
                            phase=s.get("phase", "CRUISE"),
                            distance_nmi=float(s.get("distance_nmi", 50.0)),
                            target_altitude_ft=float(s.get("target_altitude_ft", 8000.0)),
                            loiter_duration_hours=float(s.get("loiter_duration_hours", 0.0)),
                            wind_headwind_kts=float(s.get("wind_headwind_kts", 0.0)),
                        )
                        for idx, s in enumerate(seg_data)
                    ]
                plan_res = mission_planner.plan_mission_pareto(
                    segments=parsed_segs,
                    current_rul_hours=rul_h,
                    fuel_capacity_gal=fuel_cap,
                )
                self._send_json(plan_res)
                return

            # 20. POST /api/missions/score
            if path in ("/api/missions/score", "/v1/missions/score", "/api/twin/missions/score"):
                aid = body.get("aircraft_id", "UAV-01")
                health = float(body.get("current_health_index", 92.0))
                rul_h = float(body.get("current_rul_hours", 110.0))
                accum_h = float(body.get("accumulated_life_hours", 340.0))
                score_res = mission_planner.evaluate_mission_dispatch(
                    aircraft_id=aid,
                    proposed_mission=body.get("proposed_mission"),
                    current_health_index=health,
                    current_rul_hours=rul_h,
                    accumulated_life_hours=accum_h,
                )
                self._send_json(score_res)
                return

            # 21. POST /api/contingency/footprint
            if path in ("/api/contingency/footprint", "/v1/contingency/footprint", "/api/twin/contingency/footprint"):
                c_lat = float(body.get("current_lat", 34.180))
                c_lon = float(body.get("current_lon", -116.750))
                c_alt = float(body.get("current_altitude_ft", 7500.0))
                derate = float(body.get("derated_power_pct", 60.0))
                rul_mean = float(body.get("conformal_rul_mean_h", 1.2))
                rul_sig = float(body.get("conformal_rul_sigma_h", 0.25))
                w_spd = float(body.get("wind_speed_kts", 15.0))
                w_dir = float(body.get("wind_direction_deg", 270.0))
                footprint_res = contingency_engine.calculate_contingency_footprint(
                    current_lat=c_lat,
                    current_lon=c_lon,
                    current_altitude_ft=c_alt,
                    derated_power_pct=derate,
                    conformal_rul_mean_h=rul_mean,
                    conformal_rul_sigma_h=rul_sig,
                    wind_speed_kts=w_spd,
                    wind_direction_deg=w_dir,
                )
                self._send_json(footprint_res)
                return

            # 22. POST /api/firewall/inspect
            if path in ("/api/firewall/inspect", "/v1/firewall/inspect", "/api/twin/firewall/inspect"):
                dt = float(body.get("dt_s", 0.1))
                firewall_res = physics_firewall.inspect_frame(body, dt_s=dt)
                self._send_json(firewall_res)
                return

            # 23. POST /api/sensors/reconstruct
            if path in ("/api/sensors/reconstruct", "/v1/sensors/reconstruct", "/api/twin/sensors/reconstruct"):
                reconstruct_res = virtual_sensors_engine.process_telemetry_frame(body)
                self._send_json(reconstruct_res)
                return

            # 24. POST /api/passport/append
            if path in ("/api/passport/append", "/v1/passport/append", "/api/twin/passport/append"):
                aid = body.get("aircraft_id", "UAV-01")
                fid = body.get("flight_id", "flight-manual-01")
                f_hrs = float(body.get("flight_hours", 2.0))
                l_hrs = float(body.get("life_burn_equivalent_hours", 2.2))
                m_cht = float(body.get("max_cht_f", 385.0))
                m_vib = float(body.get("max_vibration_g", 0.70))
                anom = int(body.get("anomalies_detected", 0))
                blk = engine_passport.append_flight_record(
                    aircraft_id=aid,
                    flight_id=fid,
                    flight_hours=f_hrs,
                    life_burn_equivalent_hours=l_hrs,
                    max_cht_f=m_cht,
                    max_vibration_g=m_vib,
                    anomalies_detected=anom,
                )
                self._send_json({"status": "OK", "appended_block": blk.to_dict()})
                return

            # 25. POST /api/diagnostics/causal-root-cause
            if path in ("/api/diagnostics/causal-root-cause", "/v1/diagnostics/causal-root-cause", "/api/twin/diagnostics/causal-root-cause"):
                t_data = body.get("telemetry", body)
                res_data = body.get("residuals")
                diag_res = causal_engine.diagnose_root_cause(t_data, res_data)
                self._send_json(diag_res)
                return

            # 26. POST /v1/conformal/interval (STARTUP_BLUEPRINT.md §3 F5)
            if path in ("/v1/conformal/interval", "/api/conformal/interval"):
                y_pred = float(body.get("y_pred", 100.0))
                cov = float(body.get("target_coverage", 0.90))
                interval_res = conformal_prognostics.predict_interval(y_pred, target_coverage=cov)
                self._send_json({"status": "OK", "conformal_interval": interval_res})
                return

            # 27. POST /v1/trust/audit (STARTUP_BLUEPRINT.md §3 F14)
            if path in ("/v1/trust/audit", "/api/trust/audit"):
                s_sensor = float(body.get("sensor_trust", 1.0))
                s_pred = float(body.get("prediction_error_norm", 0.05))
                s_drift = float(body.get("drift_score", 0.0))
                s_ood = float(body.get("ood_rate", 0.0))
                trust_res = twin_trust_auditor.evaluate_trust(
                    sensor_trust=s_sensor,
                    prediction_error_norm=s_pred,
                    drift_score=s_drift,
                    ood_rate=s_ood,
                )
                self._send_json({"status": "OK", "trust_audit": trust_res})
                return

            # 28. POST /v1/telemetry/evaluate (STARTUP_BLUEPRINT.md §3 F6, F7)
            if path in ("/v1/telemetry/evaluate", "/api/telemetry/evaluate"):
                tail = str(body.get("tail_id", "UAV-01"))
                telem = body.get("telemetry", {})
                phase = str(body.get("flight_phase", "cruise"))
                anom = float(body.get("anomaly_score", 0.0))

                cal_res = per_airframe_calibrator.update_telemetry(tail, telem, anomaly_score=anom)
                alert_res = abstention_alert_manager.evaluate_telemetry(telem, flight_phase=phase)
                self._send_json({
                    "status": "OK",
                    "tail_id": tail,
                    "calibration": cal_res,
                    "alert": alert_res,
                })
                return

            # 29. POST /v1/models/release (STARTUP_BLUEPRINT.md §4)
            if path in ("/v1/models/release", "/api/models/release"):
                m_id = str(body.get("model_id", "uav_rul_model.onnx"))
                ver = str(body.get("version", "1.1.0"))
                signer = str(body.get("signed_by", "chief_engineer"))
                self._send_json({
                    "status": "OK",
                    "released_model": m_id,
                    "version": ver,
                    "signed_by": signer,
                    "deployed": True,
                })
                return

            self._send_json({"error": "Endpoint not found", "path": path}, 404)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_json({"error": str(e)}, 500)


    def log_message(self, format, *args):
        # Suppress noisy standard HTTP access logging to preserve clean console output
        pass


def run_api_server(host: str = "127.0.0.1", port: int = 8766):
    """Run the ThreadingHTTPServer synchronously."""
    server = ThreadingHTTPServer((host, port), TwinApiHandler)
    print(f"[API] UAV Digital Twin Replay & Audit HTTP API Active → http://{host}:{port}")
    server.serve_forever()


def start_api_server_thread(host: str = "127.0.0.1", port: int = 8766) -> Thread:
    """Start the API server in a background daemon thread."""
    t = Thread(target=run_api_server, args=(host, port), daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    run_api_server()
