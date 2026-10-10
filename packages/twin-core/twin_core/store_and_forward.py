"""
packages/twin-core/twin_core/store_and_forward.py

Airborne Store-and-Forward Engine with Offline Alarms & Deduplicated Reconciliation.
Implements improvement_plan.md §4 Phase 4:
  - High-frequency local ring buffer (fast in-memory cache)
  - Durable on-disk queue (SQLite WAL) surviving 30+ days of communications blackout
  - Autonomous offline alarms that evaluate and fire locally during link loss
  - Reconnect reconciliation with idempotent deduplication keys (zero loss, zero duplicates)
"""

import os
import json
import sqlite3
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEFAULT_SPOOL_PATH = os.path.join(_REPO_ROOT, "data", "edge_spool.db")


class StoreAndForwardQueue:
    """
    Airborne telemetry spooler for discontinuous communications.
    Safeguards continuous monitoring during satellite/datalink outages.
    """

    def __init__(
        self,
        db_path: str = DEFAULT_SPOOL_PATH,
        ring_buffer_capacity: int = 1000,
    ):
        self.db_path = db_path
        self.ring_buffer_capacity = ring_buffer_capacity
        self.ring_buffer: deque = deque(maxlen=ring_buffer_capacity)
        self._total_synced = 0
        self._lock = threading.RLock()

        if db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            self.db_path,
            timeout=30.0,
            check_same_thread=False,
            isolation_level=None,
        )
        conn.row_factory = sqlite3.Row
        if self.db_path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self):
        with self._lock:
            conn = self._get_connection()
            with conn:
                conn.execute("""
                CREATE TABLE IF NOT EXISTS edge_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dedupe_key TEXT UNIQUE NOT NULL,
                    tenant_id TEXT NOT NULL,
                    aircraft_id TEXT NOT NULL,
                    flight_id TEXT NOT NULL,
                    cycle INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    emitted_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    is_alarm INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    created_at TEXT NOT NULL
                );
                """)
                conn.execute("CREATE INDEX IF NOT EXISTS idx_edge_queue_status ON edge_queue (status, id ASC);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_edge_queue_dedupe ON edge_queue (dedupe_key);")
            conn.close()

    def build_dedupe_key(self, tenant_id: str, aircraft_id: str, flight_id: str, cycle: int, event_type: str) -> str:
        """Construct deterministic deduplication key for idempotent reconciliation."""
        return f"{tenant_id}:{aircraft_id}:{flight_id}:{cycle}:{event_type}"

    def _insert_record(
        self,
        event_type: str,
        aircraft_id: str,
        flight_id: str,
        cycle: int,
        payload: Dict[str, Any],
        tenant_id: str = "default",
        emitted_at: Optional[str] = None,
        is_alarm: bool = False,
    ) -> bool:
        now_iso = datetime.now(timezone.utc).isoformat()
        emitted_iso = emitted_at or payload.get("emitted_at") or now_iso
        dedupe_key = self.build_dedupe_key(tenant_id, aircraft_id, flight_id, cycle, event_type)
        payload_str = json.dumps(payload, sort_keys=True)

        record = {
            "dedupe_key": dedupe_key,
            "tenant_id": tenant_id,
            "aircraft_id": aircraft_id,
            "flight_id": flight_id,
            "cycle": cycle,
            "event_type": event_type,
            "emitted_at": emitted_iso,
            "payload": payload,
            "is_alarm": is_alarm,
        }

        with self._lock:
            # 1. Update in-memory ring buffer
            self.ring_buffer.append(record)

            # 2. Insert into durable queue
            conn = self._get_connection()
            try:
                with conn:
                    cursor = conn.execute(
                        """
                        INSERT OR IGNORE INTO edge_queue (
                            dedupe_key, tenant_id, aircraft_id, flight_id, cycle,
                            event_type, emitted_at, payload_json, is_alarm, status, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
                        """,
                        (dedupe_key, tenant_id, aircraft_id, flight_id, cycle,
                         event_type, emitted_iso, payload_str, 1 if is_alarm else 0, now_iso),
                    )
                    inserted = cursor.rowcount > 0
                return inserted
            finally:
                conn.close()

    def enqueue(
        self,
        event_type_or_frame: Any = "TELEMETRY",
        aircraft_id: Optional[str] = None,
        flight_id: Optional[str] = None,
        cycle: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
        tenant_id: str = "default",
        emitted_at: Optional[str] = None,
        is_alarm: bool = False,
    ) -> Any:
        """
        Durable enqueue into on-disk storage and memory ring buffer.
        Accepts either explicit arguments:
            enqueue(event_type, aircraft_id, flight_id, cycle, payload, ...)
        or a telemetry frame dictionary:
            enqueue(frame_dict) -> automatically evaluates offline alarms and returns fired alarms.
        """
        if isinstance(event_type_or_frame, dict):
            p = dict(event_type_or_frame)
            ev_type = p.get("event_type", "TELEMETRY")
            a_id = aircraft_id or p.get("aircraft_id", "UAV-01")
            f_id = flight_id or p.get("flight_id", "flight-01")
            c = cycle if cycle is not None else int(p.get("cycle", 0))
            t_id = tenant_id if tenant_id != "default" else p.get("tenant_id", "default")
            alarm_flag = is_alarm or p.get("is_alarm", False)
            emitted = emitted_at or p.get("emitted_at")
            self._insert_record(ev_type, a_id, f_id, c, p, t_id, emitted, alarm_flag)
            alarms = self.evaluate_offline_alarms(p, aircraft_id=a_id, flight_id=f_id, cycle=c, tenant_id=t_id)
            return alarms
        else:
            ev_type = str(event_type_or_frame)
            a_id = aircraft_id or "UAV-01"
            f_id = flight_id or "flight-01"
            c = cycle if cycle is not None else 0
            p = payload or {}
            t_id = tenant_id
            alarm_flag = is_alarm
            emitted = emitted_at or p.get("emitted_at")
            return self._insert_record(ev_type, a_id, f_id, c, p, t_id, emitted, alarm_flag)

    def evaluate_offline_alarms(
        self,
        telemetry: Dict[str, Any],
        aircraft_id: str = "UAV-01",
        flight_id: str = "offline_flight",
        cycle: int = 0,
        tenant_id: str = "default",
    ) -> List[Dict[str, Any]]:
        """
        Offline Alarms Engine: Evaluates critical flight safety limits locally on edge.
        If comms with GCS are completely dead, alarms are queued durably on-disk.
        """
        cht = float(telemetry.get("cht", 400.0))
        egt = float(telemetry.get("egt", 1580.0))
        oil_p = float(telemetry.get("oil_pressure", 50.0))
        vib = float(telemetry.get("vibration", 0.8))

        alarms_fired = []

        if cht > 440.0 or egt > 1700.0:
            alarms_fired.append({
                "alarm_id": f"ALARM-OVERTEMP-{cycle}",
                "type": "CHT_CRITICAL_OVERHEAT",
                "severity": "CRITICAL",
                "message": f"Critical overtemperature at cycle {cycle}: CHT={cht:.1f}°F, EGT={egt:.1f}°F",
            })

        if oil_p < 35.0:
            alarms_fired.append({
                "alarm_id": f"ALARM-OIL-P-{cycle}",
                "type": "OIL_PRESSURE_CRITICAL_LOW",
                "severity": "CRITICAL",
                "message": f"Critical low oil pressure at cycle {cycle}: {oil_p:.1f} PSI",
            })

        if vib > 2.5:
            alarms_fired.append({
                "alarm_id": f"ALARM-VIB-{cycle}",
                "type": "VIBRATION_CRITICAL_EXCESS",
                "severity": "CRITICAL",
                "message": f"Excessive vibration redline at cycle {cycle}: {vib:.2f}g",
            })

        for alarm in alarms_fired:
            self._insert_record(
                event_type="OFFLINE_ALARM",
                aircraft_id=aircraft_id,
                flight_id=flight_id,
                cycle=cycle,
                payload=alarm,
                tenant_id=tenant_id,
                is_alarm=True,
            )

        return alarms_fired

    def get_pending_count(self) -> int:
        """Count how many records are currently pending transmission to GCS."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute("SELECT COUNT(*) as count FROM edge_queue WHERE status = 'PENDING'")
                row = cursor.fetchone()
                return int(row["count"]) if row else 0
            finally:
                conn.close()

    def get_pending_batch(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch oldest pending batch in chronological order for transmission."""
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.execute(
                    """
                    SELECT id, dedupe_key, tenant_id, aircraft_id, flight_id, cycle,
                           event_type, emitted_at, payload_json, is_alarm
                    FROM edge_queue
                    WHERE status = 'PENDING'
                    ORDER BY id ASC
                    LIMIT ?
                    """,
                    (limit,),
                )
                results = []
                for row in cursor.fetchall():
                    results.append({
                        "id": row["id"],
                        "dedupe_key": row["dedupe_key"],
                        "tenant_id": row["tenant_id"],
                        "aircraft_id": row["aircraft_id"],
                        "flight_id": row["flight_id"],
                        "cycle": row["cycle"],
                        "event_type": row["event_type"],
                        "emitted_at": row["emitted_at"],
                        "payload": json.loads(row["payload_json"]),
                        "is_alarm": bool(row["is_alarm"]),
                    })
                return results
            finally:
                conn.close()

    def acknowledge_batch(self, record_ids: List[int], delete_acked: bool = True):
        """Acknowledge transmitted records from GCS receipt."""
        if not record_ids:
            return
        with self._lock:
            self._total_synced += len(record_ids)
            conn = self._get_connection()
            try:
                placeholders = ",".join("?" for _ in record_ids)
                with conn:
                    if delete_acked:
                        conn.execute(f"DELETE FROM edge_queue WHERE id IN ({placeholders})", record_ids)
                    else:
                        conn.execute(f"UPDATE edge_queue SET status = 'ACKNOWLEDGED' WHERE id IN ({placeholders})", record_ids)
            finally:
                conn.close()

    def get_stats(self) -> Dict[str, Any]:
        """Return runtime statistics for monitoring and testing."""
        with self._lock:
            conn = self._get_connection()
            try:
                c1 = conn.execute("SELECT COUNT(*) as count FROM edge_queue").fetchone()["count"]
                c2 = conn.execute("SELECT COUNT(*) as count FROM edge_queue WHERE status = 'PENDING'").fetchone()["count"]
                c3 = conn.execute("SELECT COUNT(*) as count FROM edge_queue WHERE status = 'ACKNOWLEDGED'").fetchone()["count"]
                return {
                    "total_enqueued": int(c1 + self._total_synced),
                    "pending_sync": int(c2),
                    "synced_count": int(c3 + self._total_synced),
                    "ring_buffer_size": len(self.ring_buffer),
                }
            finally:
                conn.close()

    def reconcile_with_gcs(
        self,
        event_store,
        batch_size: int = 500,
    ) -> Dict[str, Any]:
        """
        Reconnection Reconciliation: Streams stored offline queue into GCS EventStore.
        Guarantees zero duplicates and zero gaps via idempotent dedupe keys.
        """
        total_reconciled = 0
        total_duplicates = 0
        alarms_transferred = 0

        while True:
            batch = self.get_pending_batch(limit=batch_size)
            if not batch:
                break

            acked_ids = []
            for item in batch:
                # Check if already present in EventStore (idempotency check)
                existing = event_store.query_events(
                    aircraft_id=item["aircraft_id"],
                    flight_id=item["flight_id"],
                    event_type=item["event_type"],
                    limit=1000,
                )
                matching = [e for e in existing if e.get("cycle") == item["cycle"]
                            or e.get("_cycle") == item["cycle"]]

                if matching:
                    total_duplicates += 1
                else:
                    event_store.append_event(
                        event_type=item["event_type"],
                        aircraft_id=item["aircraft_id"],
                        flight_id=item["flight_id"],
                        cycle=item["cycle"],
                        payload=item["payload"],
                        emitted_at=item["emitted_at"],
                        tenant_id=item["tenant_id"],
                    )
                    total_reconciled += 1
                    if item["is_alarm"]:
                        alarms_transferred += 1

                acked_ids.append(item["id"])

            self.acknowledge_batch(acked_ids, delete_acked=True)


        return {
            "status": "RECONCILED",
            "total_reconciled": total_reconciled,
            "reconciled_count": total_reconciled,
            "total_duplicates_handled": total_duplicates,
            "alarms_transferred": alarms_transferred,
            "remaining_pending": self.get_pending_count(),
            "errors_count": 0,
        }

    def clear(self):
        """Purge all queue records (testing utility)."""
        with self._lock:
            self._total_synced = 0
            self.ring_buffer.clear()
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("DELETE FROM edge_queue;")
            finally:
                conn.close()
