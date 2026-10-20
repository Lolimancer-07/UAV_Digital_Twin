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
from twin_core.drift_detector import (                  # noqa: F401
    DriftReviewTicket,
    TelemetryDriftDetector,
    drift_detector,
)
from twin_core.model_governance import (                # noqa: F401
    ModelEvalCard,
    ShadowModeRunner,
    ModelPromotionGate,
    model_promotion_gate,
)
from twin_core.federated_aggregator import (            # noqa: F401
    DifferentialPrivacyFederatedCoordinator,
    dp_federated_average,
    clip_gradients,
    dp_federated_coordinator,
)

from twin_core.safety_assurance import (              # noqa: F401
    AdvisorySafetyEnvelope,
    SAFETY_ENVELOPE_LIMITS,
    RequirementsTraceabilityRegistry,
    HAZARDS_REGISTER,
    TwoPersonApprovalGate,
    two_person_approval_gate,
)
from twin_core.hil_testbed import (                     # noqa: F401
    HILScenarioReplayRunner,
    HILPassFailEvaluator,
    FAULT_INJECTION_CATALOG,
    BENCH_HARDWARE_SPECS,
)
from twin_core.security_compliance import (             # noqa: F401
    SBOMGenerator,
    ArtifactSignatureVerifier,
    KeyRotationManager,
    DataResidencyEnforcer,
)
from twin_core.demo_kit import (                        # noqa: F401
    DEMO_VALUE_STORY_STEPS,
    ValueStoryDemoController,
)
from twin_core.data_connectors import (                 # noqa: F401
    CustomerLogBackfillParser,
    J1939CANMessageDecoder,
)
from twin_core.roi_calculator import (                  # noqa: F401
    COMMERCIAL_TIERS,
    EngineHealthROICalculator,
)
from twin_core.platform_profiles import (               # noqa: F401
    PLATFORM_PROFILES_DATA,
    PlatformProfileRegistry,
    platform_registry,
)
from twin_core.scale_ingest import (                    # noqa: F401
    AircraftIngestPartition,
    BackpressureController,
    PartitionedIngestRouter,
)
from twin_core.cost_tracker import (                    # noqa: F401
    DEFAULT_CLOUD_UNIT_COSTS,
    CloudCostTracker,
    cost_tracker,
)
from twin_core.chaos_engine import (                    # noqa: F401
    ChaosEngineDrillRunner,
    chaos_runner,
)
from twin_core.life_burn import (                       # noqa: F401
    LifeBurnCalculator,
    RainflowCycleCounter,
    life_burn_calc,
    rainflow_counter,
)
from twin_core.mission_planner import (                 # noqa: F401
    MissionSegment,
    LifeAwareMissionPlanner,
    mission_planner,
)
from twin_core.contingency_footprint import (           # noqa: F401
    DEFAULT_RECOVERY_SITES,
    haversine_distance_nmi,
    calculate_bearing_deg,
    ContingencyFootprintCalculator,
    contingency_engine,
)
from twin_core.physics_firewall import (                # noqa: F401
    PhysicsFirewall,
    physics_firewall,
)
from twin_core.virtual_sensors import (                 # noqa: F401
    VirtualSensorReconstructor,
    virtual_sensors_engine,
)
from twin_core.reliability_passport import (            # noqa: F401
    PassportBlock,
    EngineReliabilityPassport,
    engine_passport,
)
from twin_core.causal_root_cause import (               # noqa: F401
    PROPULSION_CAUSAL_GRAPH,
    CausalRootCauseEngine,
    causal_engine,
)
from twin_core.conformal_prognostics import (           # noqa: F401
    ConformalPrognosticsEngine,
    conformal_prognostics,
)
from twin_core.self_calibration import (                # noqa: F401
    PerAirframeSelfCalibrator,
    per_airframe_calibrator,
)
from twin_core.abstention_alerting import (             # noqa: F401
    AbstentionAlertManager,
    abstention_alert_manager,
)
from twin_core.twin_trust import (                      # noqa: F401
    TwinTrustScoreAuditor,
    twin_trust_auditor,
)
from twin_core.profile_loader import (                  # noqa: F401
    EngineProfileLoader,
    EngineProfileValidationError,
    profile_loader,
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
    "DriftReviewTicket",
    "TelemetryDriftDetector",
    "drift_detector",
    "ModelEvalCard",
    "ShadowModeRunner",
    "ModelPromotionGate",
    "model_promotion_gate",
    "DifferentialPrivacyFederatedCoordinator",
    "dp_federated_average",
    "clip_gradients",
    "dp_federated_coordinator",
    "AdvisorySafetyEnvelope",
    "SAFETY_ENVELOPE_LIMITS",
    "RequirementsTraceabilityRegistry",
    "HAZARDS_REGISTER",
    "TwoPersonApprovalGate",
    "two_person_approval_gate",
    "HILScenarioReplayRunner",
    "HILPassFailEvaluator",
    "FAULT_INJECTION_CATALOG",
    "BENCH_HARDWARE_SPECS",
    "SBOMGenerator",
    "ArtifactSignatureVerifier",
    "KeyRotationManager",
    "DataResidencyEnforcer",
    "DEMO_VALUE_STORY_STEPS",
    "ValueStoryDemoController",
    "CustomerLogBackfillParser",
    "J1939CANMessageDecoder",
    "COMMERCIAL_TIERS",
    "EngineHealthROICalculator",
    "PLATFORM_PROFILES_DATA",
    "PlatformProfileRegistry",
    "platform_registry",
    "AircraftIngestPartition",
    "BackpressureController",
    "PartitionedIngestRouter",
    "DEFAULT_CLOUD_UNIT_COSTS",
    "CloudCostTracker",
    "cost_tracker",
    "ChaosEngineDrillRunner",
    "chaos_runner",
    "LifeBurnCalculator",
    "RainflowCycleCounter",
    "life_burn_calc",
    "rainflow_counter",
    "MissionSegment",
    "LifeAwareMissionPlanner",
    "mission_planner",
    "DEFAULT_RECOVERY_SITES",
    "haversine_distance_nmi",
    "calculate_bearing_deg",
    "ContingencyFootprintCalculator",
    "contingency_engine",
    "PhysicsFirewall",
    "physics_firewall",
    "VirtualSensorReconstructor",
    "virtual_sensors_engine",
    "PassportBlock",
    "EngineReliabilityPassport",
    "engine_passport",
    "PROPULSION_CAUSAL_GRAPH",
    "CausalRootCauseEngine",
    "causal_engine",
    "ConformalPrognosticsEngine",
    "conformal_prognostics",
    "PerAirframeSelfCalibrator",
    "per_airframe_calibrator",
    "AbstentionAlertManager",
    "abstention_alert_manager",
    "TwinTrustScoreAuditor",
    "twin_trust_auditor",
    "EngineProfileLoader",
    "EngineProfileValidationError",
    "profile_loader",
    "__version__",
]



