"""
backend/event_store.py

Convenience accessor for the append-only EventStore in the backend runtime.
Exposes a shared event store instance initialized at data/event_store.db,
or in-memory if running in ephemeral test mode.
"""

import os
from twin_core.event_store import EventStore

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.environ.get(
    "UAV_TWIN_EVENT_STORE_PATH",
    os.path.join(ROOT, "data", "event_store.db")
)

_global_store: EventStore = None


def get_event_store(db_path: str = None) -> EventStore:
    """Retrieve or create the process-level EventStore singleton."""
    global _global_store
    path = db_path or DEFAULT_DB_PATH
    if _global_store is None:
        _global_store = EventStore(path)
    return _global_store


def reset_event_store(db_path: str = ":memory:") -> EventStore:
    """Reset the global event store instance (primarily for testing)."""
    global _global_store
    if _global_store is not None:
        _global_store.close()
    _global_store = EventStore(db_path)
    return _global_store
