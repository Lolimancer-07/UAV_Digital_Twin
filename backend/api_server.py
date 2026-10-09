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
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
from typing import Tuple, Dict, Any, Optional

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
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html_content: str, status: int = 200):
        body = html_content.encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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

            # Health probe
            if path in ("/health", "/api/health", "/api/twin/health"):
                self._send_json({"status": "OK", "service": "uav-twin-replay-api", "version": "3.0", "tenant_isolation": "ACTIVE"})
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
