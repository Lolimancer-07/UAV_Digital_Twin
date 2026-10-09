"""
packages/twin-core/twin_core/__init__.py

twin-core — the pure, importable reasoning library for UAV Digital Twin.

Design contracts (from improvement_plan.md Phase 1):
  - Zero network calls at import time.
  - Zero TensorFlow at import time (LSTM model is loaded lazily via ModelRegistry).
  - No module-level globals that carry state across calls.
  - All reasoning functions are pure: (data, config, models) → result.

This package re-exports the backend reasoning modules under a stable public API.
As Phase 1 progresses, the backend modules will be refactored into this package
directly. Until then, we bridge by adding the backend directory to sys.path
inside the package — keeping inference.py and the tests unbroken.

Public API:
  from twin_core import run_pipeline, ModelRegistry
  from twin_core.pipeline import run_pipeline
  from twin_core.model_registry import ModelRegistry
"""

__version__ = "1.0.0"

from twin_core.model_registry import ModelRegistry  # noqa: F401
from twin_core.pipeline import run_pipeline          # noqa: F401
from twin_core.event_store import EventStore        # noqa: F401
from twin_core.report_generator import (             # noqa: F401
    generate_flight_report,
    render_report_html,
    export_report_bundle,
)
from twin_core.auth import (                         # noqa: F401
    create_access_token,
    verify_access_token,
    authorize_command,
    authorize_aircraft_access,
    filter_payload_for_subscriber,
    RateLimiter,
    ReplayGuard,
    ROLE_VIEWER,
    ROLE_DISPATCHER,
    ROLE_MAINTAINER,
    ROLE_ADMIN,
)
from twin_core.feature_flags import (                   # noqa: F401
    is_feature_enabled,
    set_feature_override,
    clear_feature_override,
    list_feature_flags,
)
from twin_core.edge_runtime import (                    # noqa: F401
    EdgePrognosticsRuntime,
    EdgeAnomalyDetector,
    EdgeFaultHysteresisFilter,
)
from twin_core.store_and_forward import (               # noqa: F401
    StoreAndForwardQueue,
)
from twin_core.ota_manager import (                     # noqa: F401
    ModelBundleManager,
    create_model_bundle,
    verify_model_bundle,
)
from twin_core.onnx_export import (                     # noqa: F401
    export_lstm_to_onnx,
    export_int8_quantized_model,
    export_scaler_params,
    build_full_edge_bundle,
)

__all__ = [
    "ModelRegistry",
    "run_pipeline",
    "EventStore",
    "generate_flight_report",
    "render_report_html",
    "export_report_bundle",
    "create_access_token",
    "verify_access_token",
    "authorize_command",
    "authorize_aircraft_access",
    "filter_payload_for_subscriber",
    "RateLimiter",
    "ReplayGuard",
    "ROLE_VIEWER",
    "ROLE_DISPATCHER",
    "ROLE_MAINTAINER",
    "ROLE_ADMIN",
    "is_feature_enabled",
    "set_feature_override",
    "clear_feature_override",
    "list_feature_flags",
    "EdgePrognosticsRuntime",
    "EdgeAnomalyDetector",
    "EdgeFaultHysteresisFilter",
    "StoreAndForwardQueue",
    "ModelBundleManager",
    "create_model_bundle",
    "verify_model_bundle",
    "export_lstm_to_onnx",
    "export_int8_quantized_model",
    "export_scaler_params",
    "build_full_edge_bundle",
    "__version__",
]



