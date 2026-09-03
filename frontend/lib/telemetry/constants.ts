import type {
  DashboardTheme,
  FaultType,
  MissionProfile,
  ReplaySpeed,
} from "@/lib/telemetry/types"

export const DEFAULT_WS_ENDPOINT =
  process.env.NEXT_PUBLIC_TELEMETRY_WS_URL ?? "ws://127.0.0.1:8765"

export const THEME_STORAGE_KEY = "uav_stealth_theme"

export const TELEMETRY_HISTORY_LIMIT = 500
export const CAN_HISTORY_LIMIT = 200
export const SPARKLINE_HISTORY_LIMIT = 40
export const RUL_HISTORY_LIMIT = 80

export const THEME_OPTIONS: Array<{
  value: DashboardTheme
  label: string
}> = [
  { value: "stealth", label: "Stealth Titanium (OLED Black)" },
  { value: "ice", label: "Deep Space Ice-Blue" },
  { value: "emerald", label: "Emerald HUD" },
  { value: "amber", label: "Amber Flight Deck" },
]

export const MISSION_PROFILE_OPTIONS: Array<{
  value: MissionProfile
  label: string
  shortLabel: string
}> = [
  {
    value: "NORMAL",
    label: "Normal ISR Cruise (3,000 ft MSL)",
    shortLabel: "NORMAL ISR",
  },
  {
    value: "HIGH_ALTITUDE",
    label: "High Altitude Loiter (18,000 ft MSL)",
    shortLabel: "HIGH ALTITUDE",
  },
  {
    value: "HOT_WEATHER",
    label: "Hot Desert Operation (45°C ISA+25)",
    shortLabel: "HOT DESERT",
  },
  {
    value: "ENDURANCE",
    label: "Maximum Endurance (Lean of Peak)",
    shortLabel: "ENDURANCE",
  },
  {
    value: "RAPID_THROTTLE",
    label: "Dynamic Agility / Rapid Throttle",
    shortLabel: "DYNAMIC AGILITY",
  },
]

export const FAULT_OPTIONS: Array<{
  value: FaultType
  label: string
}> = [
  { value: "misfire", label: "Ignition Misfire (Dead Cyl #2)" },
  { value: "injector_clog", label: "Fuel Injector Clog & Lean Spike" },
  { value: "cooling_degradation", label: "Cooling Radiator Matrix Fouling" },
  { value: "oil_leak", label: "Lubrication Pressure Loss & Leak" },
  { value: "sensor_drift", label: "Thermocouple Sensor Drift" },
  { value: "bearing_wear", label: "Crankshaft Bearing Spalling" },
  { value: "combustion_instability", label: "Combustion Flame Instability" },
]

export const REPLAY_SPEED_OPTIONS: Array<{
  value: ReplaySpeed
  label: string
}> = [
  { value: 1, label: "1.0× (Real-Time 10 Hz)" },
  { value: 2, label: "2.0× (Accelerated 20 Hz)" },
  { value: 5, label: "5.0× (Fast Forward 50 Hz)" },
]

export const AIRWORTHINESS_SUMMARY = [
  {
    label: "PROPULSION UNIT:",
    value: "ROTAX 914 F 4-STROKE AERO PISTON ENGINE",
  },
  {
    label: "MAX RATING:",
    value: "84.5 kW @ 5,800 RPM (5-MIN TAKEOFF), 73.5 kW CONTINUOUS",
  },
  {
    label: "COOLING TYPE:",
    value: "LIQUID COOLED HEADS / RAM-AIR COOLED CYLINDERS",
  },
  {
    label: "LUBRICATION:",
    value: "DRY SUMP WITH TROCHOID PUMP & OIL THERMOSTAT",
  },
  {
    label: "TIME SINCE OVERHAUL (TSO):",
    value: "428.4 FLIGHT HOURS / 852 CYCLES",
  },
  {
    label: "NEXT SCHEDULED DEPOT INSPECTION:",
    value: "AT 1,000 FLIGHT HOURS",
  },
  {
    label: "AIRWORTHINESS DIRECTIVES (AD):",
    value: "100% COMPLIANT",
  },
  {
    label: "CERTIFICATION:",
    value: "MIL-STD-1553 · SAE AS9100D · EASA 21.J",
  },
]

export const DEFAULT_XAI_NARRATIVE =
  "Multivariate statistical evaluation indicates that all propulsion channels remain securely within the certified 3-sigma learned normal operational envelope."

export const DEFAULT_MAINTENANCE_ACTION = {
  task_id: "ATA 05-00-00",
  ata_chapter: "05 (General)",
  priority: "OK",
  urgency_hours: 100,
  title: "Propulsion System Operational for Flight Dispatch",
  action:
    "All monitored parameters and structural degradation indices remain within certified operating limits. Proceed with standard pre-flight runup.",
  steps: ["Routine pre-flight walkaround & engine runup."],
} as const
