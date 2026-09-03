import type {
  SensorKey,
  SensorStatus,
  TelemetryPayload,
} from "@/lib/telemetry/types"

export interface SensorDefinition {
  index: string
  key: SensorKey
  label: string
  unit: string
  warn: number
  crit: number
  inverse?: boolean
  decimals: number
  getValue: (payload?: TelemetryPayload) => number | undefined
}

export const SENSOR_DEFINITIONS: SensorDefinition[] = [
  {
    index: "01",
    key: "rpm",
    label: "ENGINE SPEED",
    unit: "RPM",
    warn: 2600,
    crit: 2750,
    decimals: 0,
    getValue: (payload) => payload?.rpm,
  },
  {
    index: "02",
    key: "cht",
    label: "CYL HEAD TEMP (AVG)",
    unit: "°F",
    warn: 410,
    crit: 435,
    decimals: 1,
    getValue: (payload) => payload?.cht,
  },
  {
    index: "03",
    key: "egt",
    label: "EXHAUST GAS TEMP",
    unit: "°F",
    warn: 1630,
    crit: 1670,
    decimals: 1,
    getValue: (payload) => payload?.egt,
  },
  {
    index: "04",
    key: "oil_pressure",
    label: "OIL GALLERY PRESSURE",
    unit: "PSI",
    warn: 42,
    crit: 35,
    inverse: true,
    decimals: 1,
    getValue: (payload) => payload?.oil_pressure,
  },
  {
    index: "05",
    key: "oil_temp",
    label: "OIL SUMP TEMP",
    unit: "°F",
    warn: 215,
    crit: 240,
    decimals: 1,
    getValue: (payload) => payload?.oil_temp,
  },
  {
    index: "06",
    key: "fuel_flow",
    label: "FUEL MASS FLOW",
    unit: "L/HR",
    warn: 14,
    crit: 18,
    decimals: 2,
    getValue: (payload) => payload?.fuel_flow,
  },
  {
    index: "07",
    key: "fuel_rail_pressure_bar",
    label: "FUEL RAIL PRESSURE",
    unit: "BAR",
    warn: 2.3,
    crit: 1.9,
    inverse: true,
    decimals: 2,
    getValue: (payload) => payload?.fuel_rail_pressure_bar,
  },
  {
    index: "08",
    key: "vibration",
    label: "OVERALL VIBRATION RMS",
    unit: "g",
    warn: 1.8,
    crit: 2.8,
    decimals: 3,
    getValue: (payload) => payload?.vibration,
  },
  {
    index: "09",
    key: "vibration_kurtosis",
    label: "VIBRATION KURTOSIS",
    unit: "K4",
    warn: 4.2,
    crit: 5.5,
    decimals: 2,
    getValue: (payload) => payload?.vibration_kurtosis,
  },
  {
    index: "10",
    key: "battery_v",
    label: "28V ELECTRICAL BUS",
    unit: "VDC",
    warn: 12.6,
    crit: 12,
    inverse: true,
    decimals: 2,
    getValue: (payload) => payload?.battery_v,
  },
  {
    index: "11",
    key: "bus_current_a",
    label: "ALTERNATOR CURRENT LOAD",
    unit: "A",
    warn: 35,
    crit: 42,
    decimals: 1,
    getValue: (payload) => payload?.bus_current_a,
  },
  {
    index: "12",
    key: "inj_timing",
    label: "INJECTION TIMING",
    unit: "°BTDC",
    warn: 16,
    crit: 12,
    inverse: true,
    decimals: 1,
    getValue: (payload) => payload?.inj_timing,
  },
]

export function getSensorStatus(
  value: number | undefined,
  definition: SensorDefinition
): SensorStatus {
  if (value == null || !Number.isFinite(value)) {
    return "norm"
  }

  if (definition.inverse) {
    if (value < definition.crit) {
      return "crit"
    }
    if (value < definition.warn) {
      return "warn"
    }
    return "norm"
  }

  if (value > definition.crit) {
    return "crit"
  }
  if (value > definition.warn) {
    return "warn"
  }
  return "norm"
}

export function subsystemStatus(value: number | undefined): SensorStatus {
  if (value == null || !Number.isFinite(value)) {
    return "norm"
  }
  if (value < 40) {
    return "crit"
  }
  if (value < 65) {
    return "warn"
  }
  return "norm"
}
