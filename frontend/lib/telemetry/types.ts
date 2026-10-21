export type ConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "disconnected"

export type SystemAlert = "nominal" | "warning" | "critical"

export type SensorStatus = "norm" | "warn" | "crit"

export type DashboardTheme = "stealth" | "ice" | "emerald" | "amber"

export type MissionProfile =
  | "NORMAL"
  | "HIGH_ALTITUDE"
  | "HOT_WEATHER"
  | "ENDURANCE"
  | "RAPID_THROTTLE"

export type FaultType =
  | "misfire"
  | "injector_clog"
  | "cooling_degradation"
  | "oil_leak"
  | "sensor_drift"
  | "bearing_wear"
  | "combustion_instability"

export type ReplaySpeed = 1 | 2 | 5

export type MaintenancePriority = "OK" | "WARNING" | "CRITICAL" | string

export interface HealthSubScores {
  thermal?: number
  lubrication?: number
  mechanical?: number
  electrical?: number
}

export interface HealthState {
  health_index?: number
  condition?: "NOMINAL" | "WARNING" | "CRITICAL" | string
  sub_scores?: HealthSubScores
}

export interface PvPoint {
  stroke?: string
  crank_angle_deg?: number
  volume_cc?: number
  pressure_bar?: number
}

export interface PhysicsBaselines {
  egt?: number
  cht?: number
  oil_p?: number
  fuel_flow?: number
}

export interface PhysicsResiduals {
  delta_egt?: number
  delta_cht?: number
  delta_oil_p?: number
  delta_fuel?: number
  expected_egt?: number
  expected_cht?: number
  expected_oil_p?: number
  expected_fuel?: number
}

export interface PhysicsState {
  brake_power_kw?: number
  brake_power_hp?: number
  imep_bar?: number
  bmep_bar?: number
  bsfc_g_kwh?: number
  thermal_efficiency?: number
  volumetric_eff?: number
  volumetric_efficiency?: number
  air_fuel_ratio?: number
  ideal_otto_eff?: number
  thermal_ratio?: number
  pv_diagram?: PvPoint[]
  expected_baselines?: PhysicsBaselines
  residuals?: PhysicsResiduals
}

export interface FaultEvent {
  name?: string
  severity?: "WARNING" | "CRITICAL" | string
  subsystem?: string
  parameter?: string
  value?: number
  threshold?: number
  recommendation?: string
}

export interface XaiAttribution {
  feature?: string
  label?: string
  subsystem?: string
  value?: number
  nominal?: number
  unit?: string
  z_score?: number
  delta?: number
  attribution?: number
}

export interface XaiState {
  is_anomaly?: boolean
  anomaly_score?: number
  top_driver?: string
  narrative?: string
  attributions?: XaiAttribution[]
  subsystem_impact?: Record<string, number>
}

export interface CanSpnField {
  spn: number
  name: string
  raw?: number
  val: string
  unit: string
  bits: string
  res: string
}

export interface CanFrame {
  timestamp?: number | string
  cycle?: number
  can_id?: string
  pgn?: number | string
  name?: string
  dlc?: number
  hex?: string
  decoded?: string
  spns?: CanSpnField[]
  bus?: "CAN-A" | "CAN-B" | "CAN-C" | string
  frameIndex?: number
}

export interface MaintenanceAdvisory {
  task_id?: string
  ata_chapter?: string
  priority?: MaintenancePriority
  urgency_hours?: number
  title?: string
  action?: string
  steps?: string[]
  priority_rank?: number
  priority_rationale?: string
  source_fault?: string
}

export interface PrescriptiveRecommendation {
  severity: "INFO" | "WARNING" | "CRITICAL" | "EMERGENCY" | string
  action: string
  operational?: string
  maintenance?: string
  expected_benefit?: string
  source?: string
}

export interface MissionCommandPosition {
  latitude: number
  longitude: number
  mission_progress_pct: number
  heading_deg: number
  ground_speed_kts: number
}

export interface MissionCommandWaypoint {
  id: string
  name: string
  latitude: number
  longitude: number
}

export interface MissionCommandRecoverySite extends MissionCommandWaypoint {
  terrain: string
  distance_nm: number
  suitability_score: number
  within_powerplant_safe_radius: boolean
}

export interface MissionCommandPlan {
  decision: string
  action: string
  requires_operator_approval: boolean
  execution_mode: "SIMULATION_ONLY" | string
  rationale: string
  evidence: string[]
  parameters: {
    current_rpm: number
    target_rpm: number
    current_altitude_ft: number
    target_altitude_ft: number
  }
}

export interface MissionCommandSimulation {
  plan_action: string
  baseline_completion_probability: number
  projected_completion_probability: number
  probability_delta: number
  baseline_rul: number
  projected_rul: number
  rul_delta: number
  thermal_relief_f: number
  target_rpm: number | null
  status: "SIMULATED" | string
}

export interface MissionCommandAuditEvent {
  id: string
  cycle: number
  type: string
  severity: "INFO" | "WARNING" | "CRITICAL" | string
  message: string
}

export interface MissionCommandFleetCandidate {
  uav_id: string
  call_sign?: string
  mission?: string
  health?: number
  rul?: number
  mission_probability?: number
  readiness_score: number
}

export interface MissionCommandState {
  schema_version: string
  mode: "SIMULATED_TRAINING_CORRIDOR" | string
  mission: {
    completion_probability: number
    risk_level: string
    risk_color: "ok" | "warn" | "crit" | string
    safe_operating_time_h: number
    narrative: string
  }
  environment: {
    label: string
    score: number
    oat_c: number
    altitude_ft: number
    factors: string[]
    source: string
  }
  route: {
    label: string
    is_simulated: boolean
    position: MissionCommandPosition
    waypoints: MissionCommandWaypoint[]
    safe_radius_nm: number
    recovery_sites: MissionCommandRecoverySite[]
  }
  trust: {
    confidence: number
    label: string
    twin_score: number
    sensor_score: number
    telemetry_score: number
    evidence: Array<{ source: string; state: string }>
  }
  fleet_reassignment: {
    required: boolean
    candidate: MissionCommandFleetCandidate | null
    alternates: MissionCommandFleetCandidate[]
    recommendation: string
  }
  action: {
    action_id: string
    status: "READY" | "SIMULATED" | "APPROVED_AND_LOGGED" | "SIMULATION_ERROR" | string
    execution_mode: "SIMULATION_ONLY" | string
    plan: MissionCommandPlan
    simulation?: MissionCommandSimulation | null
    approved_cycle?: number | null
  }
  timeline: MissionCommandAuditEvent[]
  disclaimer: string
}

export interface WhatIfOperatingState {
  rpm: number
  cht: number
  egt: number
  health: number
  rul: number
  oil_pressure?: number
  vibration?: number
  fuel_flow?: number
  thermal_load?: number
  brake_power_hp?: number
  bsfc_g_kwh?: number
}

export interface WhatIfDelta {
  rul?: number
  health?: number
  cht?: number
  egt?: number
  fuel_pct?: number
}

export interface WhatIfResult {
  current?: WhatIfOperatingState
  counterfactual?: WhatIfOperatingState
  delta?: WhatIfDelta
  deltas?: WhatIfDelta
  baseline?: Partial<WhatIfOperatingState>
  overrides?: Record<string, number>
  outcome?: string
  outcome_color?: string
  thermal_alpha?: number
  method?: string
  narrative?: string
  rul_impact?: number
}

export interface TelemetryPayload {
  /** Decision Envelope contract version — "1.0". Consumers must reject unknown major versions. */
  envelope_version?: string
  /** ISO-8601 UTC timestamp of when this envelope was emitted by the inference engine. */
  emitted_at?: string
  cycle?: number
  engine_id?: number
  uav_id?: string
  mission_mode?: string
  paused?: boolean
  alert?: "NOMINAL" | "WARNING" | "CRITICAL" | string
  health?: HealthState
  predicted_rul?: number
  true_rul?: number
  rul_ci_lower?: number
  rul_ci_upper?: number
  rul_mc_std?: number
  failure_probability?: number
  physics?: PhysicsState
  rpm?: number
  cht?: number
  egt?: number
  oil_pressure?: number
  oil_temp?: number
  fuel_flow?: number
  fuel_rail_pressure_bar?: number
  vibration?: number
  vibration_kurtosis?: number
  battery_v?: number
  bus_current_a?: number
  inj_timing?: number
  altitude_ft?: number
  oat_c?: number
  map_kpa?: number
  latitude?: number
  longitude?: number
  heading_deg?: number
  ground_speed_kts?: number
  mission_progress_pct?: number
  anomaly_score?: number
  buffer_pct?: number
  is_anomaly?: boolean
  cht_cyl?: number[]
  egt_cyl?: number[]
  fault_events?: FaultEvent[]
  active_faults?: string[]
  injected_faults?: string[]
  xai?: XaiState
  can_frames?: CanFrame[]
  advisories?: MaintenanceAdvisory[]
  prescriptive?: PrescriptiveRecommendation[]
  twin_consistency?: {
    consistency_score?: number
    case?: string
    case_label?: string
    narrative?: string
    ai_agreement?: number
    physics_agreement?: number
    sensor_integrity?: number
  }
  sensor_integrity?: {
    integrity_score?: number
    per_channel?: Record<string, { confidence: number; status: string; issues: string[] }>
  }
  telemetry_integrity?: {
    integrity_score?: number
    packet_loss_rate?: number
    total_packets?: number
    duplicate_packets?: number
  }
  mission_risk?: {
    mission_completion_probability?: number
    abort_probability?: number
    critical_failure_probability?: number
    safe_operating_time_h?: number
    risk_level?: string
    risk_narrative?: string
    components?: {
      engine_reliability?: number
      thermal_margin?: number
      rul_time_margin?: number
      environmental?: number
      fault_penalty?: number
    }
  }
  fleet_status?: Array<{
    uav_id: string
    health_index: number
    rul: number
    alert: string
    active_faults?: string[]
  }>
  cooling_degradation_active?: boolean
  misfire_active?: boolean
  demo_state?: {
    active?: boolean
    step?: number
    title?: string
    description?: string
  }
  whatif_result?: WhatIfResult
  optimize_result?: {
    optimal_rpm?: number
    optimal_alt?: number
    projected_power_hp?: number
    projected_bsfc?: number
    risk_reduction_pct?: number
    fuel_savings_pct?: number
    recommendations?: string[]
  }
  ai_engineer_response?: {
    question?: string
    answer?: string
    timestamp?: number
    category?: string
    confidence?: number
    follow_ups?: string[]
  }
  mission_command?: MissionCommandState
  federated_round?: FederatedRoundState
  edge_profile?: EdgeProfileState
  security_status?: SecurityStatusState
  /** Provenance metadata — which core version and runtime produced this envelope. */
  provenance?: {
    core_version?: string
    runtime?: "gcs_float32" | "edge_int8" | string
  }
}

export interface SensorHistoryPoint {
  cycle: number
  value: number
}

export interface RulHistoryPoint {
  cycle: number
  predicted_rul: number
  true_rul?: number
  rul_ci_lower?: number
  rul_ci_upper?: number
}

export type SensorKey =
  | "rpm"
  | "cht"
  | "egt"
  | "oil_pressure"
  | "oil_temp"
  | "fuel_flow"
  | "fuel_rail_pressure_bar"
  | "vibration"
  | "vibration_kurtosis"
  | "battery_v"
  | "bus_current_a"
  | "inj_timing"

export type SparklineHistory = Record<SensorKey, SensorHistoryPoint[]>

export interface SetProfileCommand {
  command: "set_profile"
  profile: MissionProfile
}

export interface SetSpeedCommand {
  command: "set_speed"
  speed: ReplaySpeed | number
}

export interface SetPausedCommand {
  command: "set_paused"
  paused: boolean
}

export interface InjectFaultCommand {
  command: "inject_fault"
  fault: FaultType | string
}

export interface ClearFaultsCommand {
  command: "clear_faults"
}

export interface WhatIfCommand {
  command: "whatif"
  params: Record<string, number>
}

export interface OptimizeCommand {
  command: "optimize"
  constraints?: Record<string, string | number | boolean>
}

export interface AIEngineerCommand {
  command: "ai_engineer_query"
  question: string
}

export interface SelectUAVCommand {
  command: "select_uav"
  uav_id: string
}

export interface DemoStartCommand {
  command: "demo_start"
}

export interface DemoStepCommand {
  command: "demo_step"
  step?: number
}

export interface DemoStopCommand {
  command: "demo_stop"
}

export interface MissionCommandSimulateCommand {
  command: "mission_command_simulate"
}

export interface MissionCommandApproveCommand {
  command: "mission_command_approve"
}

export interface FederatedRoundState {
  round: number
  global_model_version: string
  participating_uavs: string[]
  sample_counts: Record<string, number>
  delta_norms: Record<string, number>
  aggregate_delta_norm: number
  fleet_loss: number
  status: string
  privacy_guarantee: string
  global_weights?: Record<string, number>
  rounds_completed?: number
  timestamp_cycles?: number
}

export interface EdgeProfileState {
  mode_id: "GCS_FLOAT32" | "EDGE_INT8" | string
  name: string
  hardware_target: string
  precision: string
  inference_latency_ms: number
  memory_footprint_mb: number
  model_size_mb: number
  power_tdp_w: number
  rul_mae_cycles: number
  accuracy_retention_pct: number
  swap_score: string
  quantization_active: boolean
  description: string
}

export interface SecurityStatusState {
  ws_host: string
  ws_port: number
  auth_required: boolean
  is_localhost_only: boolean
  transport: string
  replay_guard: string
  can_checksum: string
}

export interface TriggerFederatedRoundCommand {
  command: "trigger_federated_round"
  participating_uavs?: string[]
}

export interface SetEdgeModeCommand {
  command: "set_edge_mode"
  mode: "GCS_FLOAT32" | "EDGE_INT8"
}

export interface AnnotateReplayCommand {
  command: "annotate_replay"
  flight_id: string
  cycle: number
  note: string
  category?: "OBSERVATION" | "FAULT_CONFIRMATION" | "FALSE_ALARM" | "MAINTENANCE_NOTE"
  author?: string
}

export interface GenerateReportCommand {
  command: "generate_report"
  flight_id: string
}

export type TelemetryCommand =
  | SetProfileCommand
  | SetSpeedCommand
  | SetPausedCommand
  | InjectFaultCommand
  | ClearFaultsCommand
  | WhatIfCommand
  | OptimizeCommand
  | AIEngineerCommand
  | SelectUAVCommand
  | DemoStartCommand
  | DemoStepCommand
  | DemoStopCommand
  | MissionCommandSimulateCommand
  | MissionCommandApproveCommand
  | TriggerFederatedRoundCommand
  | SetEdgeModeCommand
  | AnnotateReplayCommand
  | GenerateReportCommand

// ─── Phase 2: Command Envelope v1 & Audit Contract ──────────────────────────

export interface CommandEnvelopeV1 {
  command_version: "1.0" | string
  command: string
  aircraft_id: string
  intent_id: string
  issued_by: string
  issued_at: string
  params?: Record<string, any>
  signature?: string
  tenant_id?: string
}

export interface CommandAuditRecord {
  intent_id: string
  tenant_id: string
  command_version: string
  command: string
  aircraft_id: string
  issued_by: string
  issued_at: string
  params: Record<string, any>
  status: "ACCEPTED" | "EXECUTED" | "REJECTED" | "DUPLICATE" | string
  effect: Record<string, any> | null
  signature?: string
  recorded_at: string
}

export interface FlightRecord {
  flight_id: string
  tenant_id: string
  aircraft_id: string
  start_time: string
  end_time: string
  start_cycle: number
  end_cycle: number
  total_cycles: number
  critical_count: number
  warning_count: number
  status: "ACTIVE" | "COMPLETED" | "ABORTED" | string
}

export interface ReplayAnnotation {
  id?: number
  tenant_id?: string
  aircraft_id: string
  flight_id: string
  cycle: number
  author: string
  category: "OBSERVATION" | "FAULT_CONFIRMATION" | "FALSE_ALARM" | "MAINTENANCE_NOTE" | string
  note: string
  created_at: string
}

export interface FlightComparisonMetric {
  metric: string
  unit: string
  run_a: number
  run_b: number
  delta: number
  percent_change: number
}

export interface FlightComparison {
  flight_a: FlightRecord
  flight_b: FlightRecord
  metrics: FlightComparisonMetric[]
  rul_delta_cycles: number
  health_delta_pct: number
  burn_rate_ratio: number
  summary: string
}

export interface PostFlightReport {
  report_id: string
  generated_at: string
  tenant_id: string
  aircraft_id: string
  flight_id: string
  flight_summary: {
    start_time: string
    end_time: string
    duration_s: number
    start_cycle: number
    end_cycle: number
    total_cycles: number
    data_points: number
    packet_loss_pct: number
  }
  operational_envelope: {
    rpm_peak: number
    rpm_mean: number
    cht_peak_f: number
    cht_mean_f: number
    egt_peak_f: number
    egt_mean_f: number
    oil_pressure_min_psi: number
    oil_pressure_mean_psi: number
    vibration_peak_g: number
    vibration_mean_g: number
  }
  anomaly_summary: {
    total_anomalies: number
    alert_breakdown: {
      nominal_cycles: number
      warning_cycles: number
      critical_cycles: number
    }
    twin_consistency_cases: {
      case_a_nominal: number
      case_b_real_fault: number
      case_c_sensor_fault: number
      case_d_false_positive: number
    }
    fault_events_detected: Array<{
      cycle: number
      name: string
      severity: string
      description: string
    }>
  }
  prognostics_trajectory: {
    initial_rul: number
    final_rul: number
    rul_burn_cycles: number
    burn_rate_per_cycle: number
    initial_health: number
    final_health: number
  }
  audit_trail: CommandAuditRecord[]
  prescriptive_work_orders: Array<{
    ata_chapter: string
    subsystem: string
    action: string
    urgency: "ROUTINE" | "URGENT" | "CRITICAL" | string
    justification: string
    sign_off_status: "PENDING" | "APPROVED" | string
  }>
  provenance: {
    core_version: string
    models_verified: boolean
    reproducible_from_events: boolean
  }
}

