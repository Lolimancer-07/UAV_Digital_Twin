"""
backend/event_store.py

Convenience accessor for the append-only EventStore in the backend runtime.
Exposes a shared event store instance initialized at data/event_store.db,
or in-memory if running in ephemeral test mode.

Also re-exports the EventStore class directly so tests and other modules can use:
    from backend.event_store import EventStore
"""

import os
import sys

# Ensure twin-core package is on the path
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TWIN_CORE = os.path.join(_REPO_ROOT, "packages", "twin-core")
if _TWIN_CORE not in sys.path:
    sys.path.insert(0, _TWIN_CORE)

from twin_core.event_store import EventStore  # noqa: F401  (re-exported for direct import)

ROOT = _REPO_ROOT
DEFAULT_DB_PATH = os.environ.get(
    "UAV_TWIN_EVENT_STORE_PATH",
    os.path.join(ROOT, "data", "event_store.db")
)

_global_store: EventStore = None


def get_event_store(db_path: str = None) -> EventStore:
    """Retrieve or create the process-level EventStore singleton."""
    global _global_store
    path = db_path or DEFAULT_DB_PATH
    if _global_store is None or getattr(_global_store, "_closed", False):
        _global_store = EventStore(path)
    return _global_store


def reset_event_store(db_path: str = ":memory:") -> EventStore:
    """Reset the global event store instance (primarily for testing)."""
    global _global_store
    if _global_store is not None:
        _global_store.close()
    _global_store = EventStore(db_path)
    return _global_store

