#!/usr/bin/env python3
"""
infra/scripts/restore_event_store.py

Atomic, Cryptographically-Verified SQLite Restore Runner for UAV Digital Twin.
Restores an EventStore SQLite database from a backup archive.
Validates SHA-256 digests and SQLite integrity checks before atomic swap.
Cleans up stale WAL/SHM artifacts to guarantee database integrity.
"""

import os
import sys
import json
import sqlite3
import hashlib
import shutil
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


def verify_backup_integrity(backup_path: str) -> tuple[bool, str]:
    """Verify SQLite database integrity via PRAGMA integrity_check."""
    if not os.path.exists(backup_path):
        return False, f"File does not exist: {backup_path}"

    try:
        conn = sqlite3.connect(backup_path)
        cur = conn.execute("PRAGMA integrity_check;")
        rows = [r[0] for r in cur.fetchall()]
        conn.close()
        res = rows[0] if rows else "EMPTY"
        if res.lower() == "ok":
            return True, "OK"
        return False, f"Integrity check failed: {res}"
    except Exception as e:
        return False, f"SQLite error: {e}"


def restore_database(
    backup_path: str,
    target_db_path: str,
    verify_metadata: bool = True,
) -> dict:
    """
    Atomically restore database from backup file into target destination.
    """
    if not os.path.exists(backup_path):
        raise FileNotFoundError(f"Backup file not found: {backup_path}")

    # Check for metadata manifest file
    meta_path = backup_path.replace(".db", ".meta.json")
    if verify_metadata and os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        expected_sha = meta.get("sha256")
        if expected_sha:
            actual_sha = compute_sha256(backup_path)
            if actual_sha.lower() != expected_sha.lower():
                raise ValueError(
                    f"Cryptographic hash mismatch: expected {expected_sha}, got {actual_sha}"
                )

    # Verify SQLite structure
    is_valid, msg = verify_backup_integrity(backup_path)
    if not is_valid:
        raise ValueError(f"Backup integrity verification failed: {msg}")

    # Prepare target directory
    target_dir = os.path.dirname(os.path.abspath(target_db_path))
    os.makedirs(target_dir, exist_ok=True)

    # Write to temporary staging file in same filesystem for atomic rename
    temp_stage = os.path.join(target_dir, f".restore_staging_{os.getpid()}.tmp")
    shutil.copyfile(backup_path, temp_stage)

    # Perform atomic replace
    os.replace(temp_stage, target_db_path)

    # Clean up stale WAL / SHM files if target DB was previously running in WAL mode
    for ext in ("-wal", "-shm"):
        wal_file = target_db_path + ext
        if os.path.exists(wal_file):
            try:
                os.remove(wal_file)
            except OSError:
                pass

    return {
        "status": "RESTORED",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "backup_source": os.path.abspath(backup_path),
        "target_db": os.path.abspath(target_db_path),
        "size_bytes": os.path.getsize(target_db_path),
        "sha256": compute_sha256(target_db_path),
        "verified": True,
    }


def main():
    parser = argparse.ArgumentParser(description="UAV Digital Twin EventStore Database Restore Runner")
    parser.add_argument("--backup-path", required=True, help="Path to backup .db file to restore from")
    parser.add_argument("--target-db", default=None, help="Target path for restored database")
    parser.add_argument("--verify-only", action="store_true", help="Verify backup integrity without restoring")
    parser.add_argument("--json", action="store_true", help="Output result as JSON only")
    args = parser.parse_args()

    target_path = args.target_db or os.path.join(_REPO_ROOT, "data", "event_store.db")

    if args.verify_only:
        is_ok, msg = verify_backup_integrity(args.backup_path)
        sha = compute_sha256(args.backup_path) if os.path.exists(args.backup_path) else "N/A"
        res = {
            "status": "VERIFIED" if is_ok else "CORRUPT",
            "backup_path": args.backup_path,
            "integrity": msg,
            "sha256": sha,
        }
        if args.json:
            print(json.dumps(res, indent=2))
        else:
            print(f"Backup verification: {res['status']} ({msg}) | SHA-256: {sha}")
        sys.exit(0 if is_ok else 1)

    try:
        report = restore_database(args.backup_path, target_path)
    except Exception as e:
        if args.json:
            print(json.dumps({"status": "ERROR", "error": str(e)}))
        else:
            print(f"[ERROR] Restore failed: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("══════════════════════════════════════════════════════════════════════")
        print(" UAV Digital Twin — EventStore Database Restore")
        print("══════════════════════════════════════════════════════════════════════")
        print(f" Source:    {report['backup_source']}")
        print(f" Target:    {report['target_db']}")
        print(f" Size:      {report['size_bytes']} bytes")
        print(f" SHA-256:   {report['sha256']}")
        print(" Database restored atomically and verified.")


if __name__ == "__main__":
    main()
