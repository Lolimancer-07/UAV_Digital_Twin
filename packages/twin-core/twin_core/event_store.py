"""
packages/twin-core/twin_core/event_store.py

Append-only event store and immutable audit trail for the UAV Digital Twin.
Implements improvement_plan.md §4 Phase 2:
  - Append-only event store backed by SQLite with WAL mode (pragmatic single-node)
  - Decision envelopes persisted alongside raw inputs
  - Multi-tenant partition keys (tenant_id, aircraft_id, flight_id)
  - Command Envelope v1 validation, idempotency (intent_id), and immutable audit trail
  - Frame-accurate replay over stored events
  - Operator cycle annotations
  - Flight run comparison (Run A vs Run B)
  - Retention pruning and JSONL export migration path
"""

import os
import json
import sqlite3
import hashlib
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple


class EventStore:
    """
    Append-only SQLite event store with WAL journal mode and immutable audit log.
    Thread-safe through a re-entrant lock and connection-per-thread or guarded connection.
    """

    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self._lock = threading.RLock()
        self._local = threading.local()
        self._shared_conn: Optional[sqlite3.Connection] = None

        if db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Get or create an SQLite connection with WAL enabled."""
        if self.db_path == ":memory:":
            if self._shared_conn is None:
                conn = sqlite3.connect(
                    ":memory:",
                    timeout=30.0,
                    check_same_thread=False,
                    isolation_level=None
                )
                conn.row_factory = sqlite3.Row
                self._shared_conn = conn
            return self._shared_conn

        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(
                self.db_path,
                timeout=30.0,
                check_same_thread=False,
                isolation_level=None  # autocommit mode; we manage explicit transactions
            )
            conn.row_factory = sqlite3.Row
            with conn:
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("PRAGMA synchronous = NORMAL;")
                conn.execute("PRAGMA foreign_keys = ON;")
                conn.execute("PRAGMA busy_timeout = 10000;")
            self._local.conn = conn
        return self._local.conn


    def _init_db(self) -> None:
        """Initialize database schema with all required tables and indexes."""
        with self._lock:
            conn = self._get_connection()
            with conn:
                # 1. Events Table (Append-Only)
                conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id TEXT NOT NULL DEFAULT 'default',
                    aircraft_id TEXT NOT NULL,
                    flight_id TEXT NOT NULL,
                    cycle INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    emitted_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    raw_input_json TEXT,
                    signature TEXT,
                    created_at TEXT NOT NULL
                );
                """)

                # 2. Immutable Command Audit Trail
                conn.execute("""
                CREATE TABLE IF NOT EXISTS commands (
                    intent_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'default',
                    command_version TEXT NOT NULL DEFAULT '1.0',
                    command TEXT NOT NULL,
                    aircraft_id TEXT NOT NULL,
                    issued_by TEXT NOT NULL,
                    issued_at TEXT NOT NULL,
                    params_json TEXT,
                    status TEXT NOT NULL,
                    effect_json TEXT,
                    signature TEXT,
                    recorded_at TEXT NOT NULL
                );
                """)

                # 3. Operator Replay Annotations
                conn.execute("""
                CREATE TABLE IF NOT EXISTS annotations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id TEXT NOT NULL DEFAULT 'default',
                    aircraft_id TEXT NOT NULL,
                    flight_id TEXT NOT NULL,
                    cycle INTEGER NOT NULL,
                    author TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'OBSERVATION',
                    note TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """)

                # 4. Flight Summaries Index
                conn.execute("""
                CREATE TABLE IF NOT EXISTS flights (
                    flight_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'default',
                    aircraft_id TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    start_cycle INTEGER NOT NULL DEFAULT 0,
                    end_cycle INTEGER NOT NULL DEFAULT 0,
                    total_cycles INTEGER NOT NULL DEFAULT 0,
                    critical_count INTEGER NOT NULL DEFAULT 0,
                    warning_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'ACTIVE'
                );
                """)

                # 5. Schema Migrations Table (Phase 3 Deploy & Evolution)
                conn.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );
                """)

                # Record baseline migrations idempotently
                now_iso = datetime.now(timezone.utc).isoformat()
                for v in ["001_initial_tables", "002_tenant_partition_keys", "003_audit_signatures"]:
                    conn.execute("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?);", (v, now_iso))

                # Performance and partition indexes
                conn.execute("CREATE INDEX IF NOT EXISTS idx_events_lookup ON events (tenant_id, aircraft_id, flight_id, cycle);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_events_flight ON events (flight_id, cycle);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_commands_aircraft ON commands (aircraft_id, recorded_at);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_annotations_flight ON annotations (flight_id, cycle);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_flights_tenant_uav ON flights (tenant_id, aircraft_id);")

    def get_applied_migrations(self) -> List[Dict[str, Any]]:
        """Fetch all applied database schema migration versions."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.execute("SELECT version, applied_at FROM schema_migrations ORDER BY version ASC")
            return [
                {
                    "version": row["version"],
                    "migration_id": row["version"],
                    "applied_at": row["applied_at"],
                }
                for row in cursor.fetchall()
            ]


    # ── Events API ─────────────────────────────────────────────────────────────

    def append_event(
        self,
        event_type: str,
        aircraft_id: str,
        flight_id: str,
        cycle: int,
        payload: Dict[str, Any],
        raw_input: Optional[Dict[str, Any]] = None,
        emitted_at: Optional[str] = None,
        tenant_id: str = "default",
    ) -> int:
        """
        Append an immutable event and update flight summary metadata.
        Returns the inserted event ID.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        emitted_iso = emitted_at or payload.get("emitted_at") or now_iso

        payload_str = json.dumps(payload, sort_keys=True)
        raw_str = json.dumps(raw_input, sort_keys=True) if raw_input is not None else None
        signature = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        with self._lock:
            conn = self._get_connection()
            with conn:
                cursor = conn.execute(
                    """
                    INSERT INTO events (
                        tenant_id, aircraft_id, flight_id, cycle, event_type,
                        emitted_at, payload_json, raw_input_json, signature, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (tenant_id, aircraft_id, flight_id, int(cycle), event_type,
                     emitted_iso, payload_str, raw_str, signature, now_iso),
                )
                event_id = cursor.lastrowid

                # Upsert flight summary
                alert = payload.get("alert", "NOMINAL")
                is_crit = 1 if alert == "CRITICAL" else 0
                is_warn = 1 if alert == "WARNING" else 0

                conn.execute(
                    """
                    INSERT INTO flights (
                        flight_id, tenant_id, aircraft_id, start_time, end_time,
                        start_cycle, end_cycle, total_cycles, critical_count, warning_count, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'ACTIVE')
                    ON CONFLICT(flight_id) DO UPDATE SET
                        end_time = excluded.end_time,
                        end_cycle = MAX(flights.end_cycle, excluded.end_cycle),
                        total_cycles = flights.total_cycles + 1,
                        critical_count = flights.critical_count + excluded.critical_count,
                        warning_count = flights.warning_count + excluded.warning_count;
                    """,
                    (flight_id, tenant_id, aircraft_id, emitted_iso, emitted_iso,
                     int(cycle), int(cycle), is_crit, is_warn),
                )

            return event_id

    def append_decision(
        self,
        aircraft_id: str,
        flight_id: str,
        cycle: int,
        envelope: Dict[str, Any],
        raw_inputs: Optional[Dict[str, Any]] = None,
        tenant_id: str = "default",
    ) -> int:
        """Convenience method for persisting a Decision Envelope alongside raw inputs."""
        return self.append_event(
            event_type="decision",
            aircraft_id=aircraft_id,
            flight_id=flight_id,
            cycle=cycle,
            payload=envelope,
            raw_input=raw_inputs,
            emitted_at=envelope.get("emitted_at"),
            tenant_id=tenant_id,
        )

    # ── Command Envelope & Audit Trail API ──────────────────────────────────────

    def record_command(
        self,
        command_envelope: Dict[str, Any],
        status: str = "EXECUTED",
        effect: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Record a command in the immutable audit log with idempotency enforcement.
        If intent_id is already present, returns (False, existing_record).
        If new, records and returns (True, new_record).
        """
        intent_id = str(command_envelope.get("intent_id", "")).strip()
        if not intent_id:
            raise ValueError("Command envelope must contain a non-empty 'intent_id' (idempotency key)")

        tenant_id = command_envelope.get("tenant_id", "default")
        cmd_ver = command_envelope.get("command_version", "1.0")
        command = command_envelope.get("command", "")
        aircraft_id = command_envelope.get("aircraft_id", "UAV-01")
        issued_by = command_envelope.get("issued_by", "anonymous")
        issued_at = command_envelope.get("issued_at") or datetime.now(timezone.utc).isoformat()
        params = command_envelope.get("params", {})
        signature = command_envelope.get("signature") or ""

        now_iso = datetime.now(timezone.utc).isoformat()
        params_str = json.dumps(params, sort_keys=True)
        effect_str = json.dumps(effect, sort_keys=True) if effect is not None else None

        with self._lock:
            conn = self._get_connection()
            # Check existing intent_id
            cursor = conn.execute("SELECT * FROM commands WHERE intent_id = ?", (intent_id,))
            row = cursor.fetchone()
            if row:
                existing = dict(row)
                existing["params"] = json.loads(existing["params_json"] or "{}")
                existing["effect"] = json.loads(existing["effect_json"]) if existing["effect_json"] else None
                return False, existing

            # Insert new command
            with conn:
                conn.execute(
                    """
                    INSERT INTO commands (
                        intent_id, tenant_id, command_version, command, aircraft_id,
                        issued_by, issued_at, params_json, status, effect_json, signature, recorded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (intent_id, tenant_id, cmd_ver, command, aircraft_id,
                     issued_by, issued_at, params_str, status, effect_str, signature, now_iso),
                )

            recorded = {
                "intent_id": intent_id,
                "tenant_id": tenant_id,
                "command_version": cmd_ver,
                "command": command,
                "aircraft_id": aircraft_id,
                "issued_by": issued_by,
                "issued_at": issued_at,
                "params": params,
                "status": status,
                "effect": effect,
                "signature": signature,
                "recorded_at": now_iso,
            }
            return True, recorded

    def get_command(self, intent_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a recorded command by its idempotency intent_id."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.execute("SELECT * FROM commands WHERE intent_id = ?", (intent_id,))
            row = cursor.fetchone()
            if not row:
                return None
            res = dict(row)
            res["params"] = json.loads(res["params_json"] or "{}")
            res["effect"] = json.loads(res["effect_json"]) if res["effect_json"] else None
            return res

    def list_commands(
        self,
        aircraft_id: Optional[str] = None,
        tenant_id: str = "default",
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """List operator commands from the immutable audit trail."""
        with self._lock:
            conn = self._get_connection()
            if aircraft_id:
                cursor = conn.execute(
                    """
                    SELECT * FROM commands
                    WHERE tenant_id = ? AND (aircraft_id = ? OR aircraft_id = '*')
                    ORDER BY recorded_at DESC LIMIT ?
                    """,
                    (tenant_id, aircraft_id, limit),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT * FROM commands
                    WHERE tenant_id = ?
                    ORDER BY recorded_at DESC LIMIT ?
                    """,
                    (tenant_id, limit),
                )

            results = []
            for row in cursor.fetchall():
                d = dict(row)
                d["params"] = json.loads(d["params_json"] or "{}")
                d["effect"] = json.loads(d["effect_json"]) if d["effect_json"] else None
                results.append(d)
            return results

    # ── Replay & Flight Queries ────────────────────────────────────────────────

    def list_flights(
        self,
        tenant_id: str = "default",
        aircraft_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List all indexed flights with summary metrics."""
        with self._lock:
            conn = self._get_connection()
            if aircraft_id:
                cursor = conn.execute(
                    """
                    SELECT * FROM flights
                    WHERE tenant_id = ? AND aircraft_id = ?
                    ORDER BY start_time DESC
                    """,
                    (tenant_id, aircraft_id),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT * FROM flights
                    WHERE tenant_id = ?
                    ORDER BY start_time DESC
                    """,
                    (tenant_id,),
                )
            return [dict(r) for r in cursor.fetchall()]

    def get_flight(self, flight_id: str) -> Optional[Dict[str, Any]]:
        """Get flight metadata by flight_id."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.execute("SELECT * FROM flights WHERE flight_id = ?", (flight_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_replay_events(
        self,
        flight_id: str,
        start_cycle: Optional[int] = None,
        end_cycle: Optional[int] = None,
        event_type: str = "decision",
    ) -> List[Dict[str, Any]]:
        """
        Fetch frame-accurate replay events for a flight ordered by cycle.
        Returns parsed decision envelopes with raw inputs attached if present.
        """
        with self._lock:
            conn = self._get_connection()
            query = "SELECT * FROM events WHERE flight_id = ?"
            params: list = [flight_id]

            if event_type:
                query += " AND event_type = ?"
                params.append(event_type)
            if start_cycle is not None:
                query += " AND cycle >= ?"
                params.append(int(start_cycle))
            if end_cycle is not None:
                query += " AND cycle <= ?"
                params.append(int(end_cycle))

            query += " ORDER BY cycle ASC, id ASC"

            cursor = conn.execute(query, params)
            events = []
            for row in cursor.fetchall():
                payload = json.loads(row["payload_json"])
                if row["raw_input_json"]:
                    payload["_raw_input"] = json.loads(row["raw_input_json"])
                events.append(payload)
            return events

    # ── Annotations API ────────────────────────────────────────────────────────

    def add_annotation(
        self,
        flight_id: str,
        aircraft_id: str,
        cycle: int,
        author: str,
        note: str,
        category: str = "OBSERVATION",
        tenant_id: str = "default",
    ) -> int:
        """Add an operator forensic annotation linked to a specific flight cycle."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._lock:
            conn = self._get_connection()
            with conn:
                cursor = conn.execute(
                    """
                    INSERT INTO annotations (
                        tenant_id, aircraft_id, flight_id, cycle, author, category, note, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (tenant_id, aircraft_id, flight_id, int(cycle), author, category, note, now_iso),
                )
                return cursor.lastrowid

    def get_annotations(
        self,
        flight_id: str,
        cycle: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Get annotations for a flight, optionally filtered by cycle."""
        with self._lock:
            conn = self._get_connection()
            if cycle is not None:
                cursor = conn.execute(
                    "SELECT * FROM annotations WHERE flight_id = ? AND cycle = ? ORDER BY id ASC",
                    (flight_id, int(cycle)),
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM annotations WHERE flight_id = ? ORDER BY cycle ASC, id ASC",
                    (flight_id,),
                )
            return [dict(r) for r in cursor.fetchall()]

    # ── Flight Comparison (Run A vs Run B) ──────────────────────────────────────

    def compare_flights(self, flight_id_a: str, flight_id_b: str) -> Dict[str, Any]:
        """
        Compare two flight runs (e.g. baseline vs degraded run, or modified parameters).
        Calculates metric deltas, RUL degradation rates, and forensic differences.
        """
        fl_a = self.get_flight(flight_id_a)
        fl_b = self.get_flight(flight_id_b)
        if not fl_a or not fl_b:
            raise ValueError(f"One or both flights not found: '{flight_id_a}', '{flight_id_b}'")

        events_a = self.get_replay_events(flight_id_a)
        events_b = self.get_replay_events(flight_id_b)

        def _stats(events):
            if not events:
                return {"ruls": [0], "healths": [100], "chts": [350], "egts": [1300], "rpms": [2400]}
            return {
                "ruls": [e.get("predicted_rul", 0) for e in events],
                "healths": [e.get("health", {}).get("health_index", 100) for e in events],
                "chts": [e.get("cht", 0) for e in events],
                "egts": [e.get("egt", 0) for e in events],
                "rpms": [e.get("rpm", 0) for e in events],
            }

        st_a = _stats(events_a)
        st_b = _stats(events_b)

        rul_burn_a = (st_a["ruls"][0] - st_a["ruls"][-1]) if len(st_a["ruls"]) > 1 else 0
        rul_burn_b = (st_b["ruls"][0] - st_b["ruls"][-1]) if len(st_b["ruls"]) > 1 else 0

        rate_a = (rul_burn_a / max(1, fl_a["total_cycles"]))
        rate_b = (rul_burn_b / max(1, fl_b["total_cycles"]))

        metrics = [
            {
                "metric": "Total Flight Cycles",
                "unit": "cycles",
                "run_a": fl_a["total_cycles"],
                "run_b": fl_b["total_cycles"],
                "delta": fl_b["total_cycles"] - fl_a["total_cycles"],
                "percent_change": round(((fl_b["total_cycles"] - fl_a["total_cycles"]) / max(1, fl_a["total_cycles"])) * 100, 1),
            },
            {
                "metric": "Final Predicted RUL",
                "unit": "cycles",
                "run_a": round(st_a["ruls"][-1], 1),
                "run_b": round(st_b["ruls"][-1], 1),
                "delta": round(st_b["ruls"][-1] - st_a["ruls"][-1], 1),
                "percent_change": round(((st_b["ruls"][-1] - st_a["ruls"][-1]) / max(0.1, st_a["ruls"][-1])) * 100, 1),
            },
            {
                "metric": "Final Health Index",
                "unit": "%",
                "run_a": round(st_a["healths"][-1], 1),
                "run_b": round(st_b["healths"][-1], 1),
                "delta": round(st_b["healths"][-1] - st_a["healths"][-1], 1),
                "percent_change": round(((st_b["healths"][-1] - st_a["healths"][-1]) / max(0.1, st_a["healths"][-1])) * 100, 1),
            },
            {
                "metric": "RUL Burn Rate",
                "unit": "cyc/cyc",
                "run_a": round(rate_a, 3),
                "run_b": round(rate_b, 3),
                "delta": round(rate_b - rate_a, 3),
                "percent_change": round(((rate_b - rate_a) / max(0.001, rate_a)) * 100, 1) if rate_a > 0 else 0,
            },
            {
                "metric": "Peak CHT",
                "unit": "°F",
                "run_a": round(max(st_a["chts"]), 1),
                "run_b": round(max(st_b["chts"]), 1),
                "delta": round(max(st_b["chts"]) - max(st_a["chts"]), 1),
                "percent_change": round(((max(st_b["chts"]) - max(st_a["chts"])) / max(1.0, max(st_a["chts"]))) * 100, 1),
            },
            {
                "metric": "Critical Alerts",
                "unit": "count",
                "run_a": fl_a["critical_count"],
                "run_b": fl_b["critical_count"],
                "delta": fl_b["critical_count"] - fl_a["critical_count"],
                "percent_change": round(((fl_b["critical_count"] - fl_a["critical_count"]) / max(1, fl_a["critical_count"])) * 100, 1) if fl_a["critical_count"] else 0,
            },
        ]

        return {
            "flight_a": fl_a,
            "flight_b": fl_b,
            "metrics": metrics,
            "rul_delta_cycles": round(st_b["ruls"][-1] - st_a["ruls"][-1], 1),
            "health_delta_pct": round(st_b["healths"][-1] - st_a["healths"][-1], 1),
            "burn_rate_ratio": round(rate_b / max(0.0001, rate_a), 2) if rate_a > 0 else 1.0,
            "summary": (
                f"Flight comparison between {flight_id_a} ({fl_a['aircraft_id']}) and {flight_id_b} ({fl_b['aircraft_id']}): "
                f"Run B ended with {round(st_b['ruls'][-1], 1)} cycles RUL vs Run A {round(st_a['ruls'][-1], 1)} cycles. "
                f"Critical events: {fl_b['critical_count']} vs {fl_a['critical_count']}."
            ),
        }

    # ── Retention & JSONL Export Migration ─────────────────────────────────────

    def apply_retention_policy(
        self,
        retention_days: int = 30,
        max_events_per_flight: Optional[int] = None,
    ) -> int:
        """
        Prunes old events beyond retention_days, keeping flight summaries intact.
        Returns the number of pruned event rows.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
        with self._lock:
            conn = self._get_connection()
            with conn:
                cursor = conn.execute("DELETE FROM events WHERE created_at < ?", (cutoff,))
                pruned = cursor.rowcount

                if max_events_per_flight is not None:
                    # Keep only latest N events per flight
                    sub_cursor = conn.execute(
                        """
                        DELETE FROM events WHERE id NOT IN (
                            SELECT id FROM (
                                SELECT id, ROW_NUMBER() OVER (PARTITION BY flight_id ORDER BY cycle DESC) as rn
                                FROM events
                            ) WHERE rn <= ?
                        )
                        """,
                        (max_events_per_flight,),
                    )
                    pruned += sub_cursor.rowcount

            return pruned

    def export_jsonl(self, flight_id: str, output_path: str) -> str:
        """
        Export all events for a flight to an append-only JSONL file.
        Provides a seamless migration path to ClickHouse, Timescale, or Parquet batch ingest.
        """
        events = self.get_replay_events(flight_id)
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for ev in events:
                f.write(json.dumps(ev) + "\n")
        return output_path

    def close(self) -> None:
        """Close database connections."""
        if self._shared_conn is not None:
            try:
                self._shared_conn.close()
            except Exception:
                pass
            self._shared_conn = None
        if hasattr(self._local, "conn") and self._local.conn is not None:
            try:
                self._local.conn.close()
            except Exception:
                pass
            self._local.conn = None

