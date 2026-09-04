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

export interface CanFrame {
  timestamp?: number | string
  cycle?: number
  can_id?: string
  pgn?: number | string
  name?: string
  dlc?: number
  hex?: string
  decoded?: string
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
  anomaly_score?: number
  buffer_pct?: number
  is_anomaly?: boolean
  cht_cyl?: number[]
  egt_cyl?: number[]
  fault_events?: FaultEvent[]
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
  demo_state?: {
    active: boolean
    step: number
    title: string
    description: string
  }
  whatif_result?: {
    baseline?: Record<string, number>
    counterfactual?: Record<string, number>
    deltas?: Record<string, number>
    narrative?: string
    rul_impact?: number
  }
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
  constraints?: Record<string, any>
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
