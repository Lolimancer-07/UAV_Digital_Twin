#!/usr/bin/env python3
"""
infra/scripts/prune_event_store.py

Retention Policy and Pruning Utility for UAV Digital Twin EventStore.
Safely purges historical events older than N days while preserving flight
summaries, command audit trails, and schema metadata.
Supports dry-run simulation and post-prune vacuum compaction.
"""

import os
import sys
import json
import sqlite3
import argparse
from datetime import datetime, timezone, timedelta

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(_REPO_ROOT, "packages", "twin-core"))
sys.path.insert(0, os.path.join(_REPO_ROOT, "backend"))

from twin_core.event_store import EventStore


def prune_event_store(
    db_path: str,
    retention_days: int = 30,
    max_events_per_flight: int = None,
    dry_run: bool = False,
    vacuum: bool = False,
) -> dict:
    """
    Apply retention policy to EventStore database.
    """
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found: {db_path}")

    size_before = os.path.getsize(db_path)
    cutoff_time = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()

    conn = sqlite3.connect(db_path, timeout=30.0)
    try:
        # Get total count before
        cur = conn.execute("SELECT count(*) FROM events;")
        total_before = cur.fetchone()[0]

        # Count events eligible for pruning
        cur = conn.execute("SELECT count(*) FROM events WHERE created_at < ?;", (cutoff_time,))
        eligible_for_deletion = cur.fetchone()[0]

        pruned_count = 0
        if not dry_run:
            store = EventStore(db_path=db_path)
            pruned_count = store.apply_retention_policy(
                retention_days=retention_days,
                max_events_per_flight=max_events_per_flight,
            )

            if vacuum:
                with conn:
                    conn.execute("VACUUM;")

        cur = conn.execute("SELECT count(*) FROM events;")
        total_after = cur.fetchone()[0]
    finally:
        conn.close()

    size_after = os.path.getsize(db_path)

    return {
        "status": "DRY_RUN_COMPLETED" if dry_run else "PRUNED",
        "database": os.path.abspath(db_path),
        "retention_days": retention_days,
        "cutoff_timestamp": cutoff_time,
        "dry_run": dry_run,
        "eligible_for_deletion": eligible_for_deletion,
        "rows_pruned": pruned_count if not dry_run else 0,
        "total_events_before": total_before,
        "total_events_after": total_after,
        "size_before_bytes": size_before,
        "size_after_bytes": size_after,
        "bytes_reclaimed": max(0, size_before - size_after),
        "vacuum_executed": bool(vacuum and not dry_run),
    }


def main():
    parser = argparse.ArgumentParser(description="UAV Digital Twin EventStore Retention Pruner")
    parser.add_argument("--db-path", default=None, help="Path to SQLite event store database")
    parser.add_argument("--days", type=int, default=30, help="Retention period in days (default: 30)")
    parser.add_argument("--max-per-flight", type=int, default=None, help="Max events to retain per flight")
    parser.add_argument("--dry-run", action="store_true", help="Simulate pruning without modifying database")
    parser.add_argument("--vacuum", action="store_true", help="Execute VACUUM after pruning to reclaim disk space")
    parser.add_argument("--json", action="store_true", help="Output result as JSON only")
    args = parser.parse_args()

    db_path = args.db_path or os.path.join(_REPO_ROOT, "data", "event_store.db")

    if not os.path.exists(db_path):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        from twin_core.event_store import EventStore
        _ = EventStore(db_path=db_path)

    try:
        report = prune_event_store(
            db_path=db_path,
            retention_days=args.days,
            max_events_per_flight=args.max_per_flight,
            dry_run=args.dry_run,
            vacuum=args.vacuum,
        )
    except Exception as e:
        if args.json:
            print(json.dumps({"status": "ERROR", "error": str(e)}))
        else:
            print(f"[ERROR] Pruning failed: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("══════════════════════════════════════════════════════════════════════")
        print(f" UAV Digital Twin — EventStore Pruning ({'DRY RUN' if report['dry_run'] else 'ACTIVE'})")
        print("══════════════════════════════════════════════════════════════════════")
        print(f" Database:       {report['database']}")
        print(f" Retention:      {report['retention_days']} days (Cutoff: {report['cutoff_timestamp']})")
        print(f" Eligible Rows:  {report['eligible_for_deletion']}")
        if not report['dry_run']:
            print(f" Rows Pruned:    {report['rows_pruned']}")
            print(f" Remaining Rows: {report['total_events_after']}")
            print(f" Disk Reclaimed: {report['bytes_reclaimed']} bytes (Vacuum: {report['vacuum_executed']})")
        print(" Pruning completed successfully.")


if __name__ == "__main__":
    main()
