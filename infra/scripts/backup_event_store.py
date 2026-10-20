#!/usr/bin/env python3
"""
infra/scripts/backup_event_store.py

Zero-Downtime Live SQLite Backup Runner for UAV Digital Twin.
Creates an atomic, transactionally consistent backup of the EventStore
database using SQLite's online backup API. Computes cryptographic SHA-256
digests and metadata manifests for airworthiness audit compliance.
"""

import os
import sys
import json
import sqlite3
import hashlib
import argparse
from datetime import datetime, timezone

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(_REPO_ROOT, "packages", "twin-core"))
sys.path.insert(0, os.path.join(_REPO_ROOT, "backend"))


def compute_sha256(filepath: str) -> str:
    """Compute cryptographic SHA-256 digest of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def backup_database(
    source_db_path: str,
    output_dir: str,
    verify: bool = True,
) -> dict:
    """
    Perform transactional online backup from source SQLite database to timestamped destination file.
    Returns metadata dictionary including path, size, sha256 digest, and verification status.
    """
    if not os.path.exists(source_db_path):
        raise FileNotFoundError(f"Source database does not exist: {source_db_path}")

    os.makedirs(output_dir, exist_ok=True)
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_filename = f"event_store_backup_{timestamp_str}.db"
    dest_path = os.path.join(output_dir, backup_filename)
    meta_path = os.path.join(output_dir, f"event_store_backup_{timestamp_str}.meta.json")

    # Connect to source and destination
    src_conn = sqlite3.connect(source_db_path, timeout=30.0)
    dest_conn = sqlite3.connect(dest_path, timeout=30.0)

    try:
        # SQLite online backup API ensures clean atomic snapshot under WAL journal mode
        src_conn.backup(dest_conn, pages=-1)
    finally:
        dest_conn.close()
        src_conn.close()

    # Integrity verification
    is_valid = False
    integrity_result = "UNVERIFIED"
    if verify:
        v_conn = sqlite3.connect(dest_path)
        try:
            cur = v_conn.execute("PRAGMA integrity_check;")
            rows = [r[0] for r in cur.fetchall()]
            integrity_result = rows[0] if rows else "EMPTY"
            is_valid = integrity_result.lower() == "ok"
        finally:
            v_conn.close()

    file_size = os.path.getsize(dest_path)
    sha256_digest = compute_sha256(dest_path)

    metadata = {
        "status": "COMPLETED",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source_db": os.path.abspath(source_db_path),
        "backup_db": os.path.abspath(dest_path),
        "backup_filename": backup_filename,
        "size_bytes": file_size,
        "sha256": sha256_digest,
        "integrity_check": integrity_result,
        "verified": is_valid if verify else None,
    }

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return metadata


def main():
    parser = argparse.ArgumentParser(description="UAV Digital Twin EventStore Backup Runner")
    parser.add_argument("--db-path", default=None, help="Path to SQLite event store database file")
    parser.add_argument("--out-dir", default=None, help="Directory to store backup files")
    parser.add_argument("--no-verify", action="store_true", help="Skip integrity verification check")
    parser.add_argument("--json", action="store_true", help="Output result as JSON only")
    args = parser.parse_args()

    source_path = args.db_path or os.path.join(_REPO_ROOT, "data", "event_store.db")
    out_dir = args.out_dir or os.path.join(_REPO_ROOT, "data", "backups")

    if not os.path.exists(source_path):
        # Create directory and empty db if running in clean environment
        os.makedirs(os.path.dirname(source_path), exist_ok=True)
        from twin_core.event_store import EventStore
        _ = EventStore(db_path=source_path)

    try:
        meta = backup_database(
            source_db_path=source_path,
            output_dir=out_dir,
            verify=not args.no_verify,
        )
    except Exception as e:
        if args.json:
            print(json.dumps({"status": "ERROR", "error": str(e)}))
        else:
            print(f"[ERROR] Backup failed: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(meta, indent=2))
    else:
        print("══════════════════════════════════════════════════════════════════════")
        print(" UAV Digital Twin — EventStore Database Backup")
        print("══════════════════════════════════════════════════════════════════════")
        print(f" Source:    {meta['source_db']}")
        print(f" Backup:    {meta['backup_db']}")
        print(f" Size:      {meta['size_bytes']} bytes")
        print(f" SHA-256:   {meta['sha256']}")
        print(f" Integrity: {meta['integrity_check']} (Verified: {meta['verified']})")
        print(" Backup completed successfully.")


if __name__ == "__main__":
    main()
