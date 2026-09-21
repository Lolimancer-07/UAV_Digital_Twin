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
}

export interface MaintenanceAdvisory {
  task_id?: string
  ata_chapter?: string
  priority?: MaintenancePriority
  urgency_hours?: number
  title?: string
  action?: string
  steps?: string[]
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
  cycle?: number
  engine_id?: number
  uav_id?: string
  mission_mode?: string
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
