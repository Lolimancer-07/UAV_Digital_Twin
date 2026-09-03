import {
  MISSION_PROFILE_OPTIONS,
  THEME_OPTIONS,
} from "@/lib/telemetry/constants"
import type {
  DashboardTheme,
  MissionProfile,
  SystemAlert,
  TelemetryPayload,
} from "@/lib/telemetry/types"

export function formatNumber(
  value: number | null | undefined,
  decimals: number,
  fallback = "--"
) {
  if (value == null || !Number.isFinite(value)) {
    return fallback
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatInteger(value: number | null | undefined, fallback = "--") {
  if (value == null || !Number.isFinite(value)) {
    return fallback
  }

  return Math.round(value).toLocaleString("en-US")
}

export function formatSigned(
  value: number | null | undefined,
  decimals: number,
  fallback = "--"
) {
  if (value == null || !Number.isFinite(value)) {
    return fallback
  }

  const prefix = value >= 0 ? "+" : ""
  return `${prefix}${formatNumber(value, decimals)}`
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
  fallback = "--"
) {
  if (value == null || !Number.isFinite(value)) {
    return fallback
  }

  return `${formatNumber(value, decimals)}%`
}

export function formatCycle(cycle: number | null | undefined) {
  if (cycle == null || !Number.isFinite(cycle)) {
    return "----"
  }

  return String(Math.round(cycle)).padStart(4, "0")
}

export function formatMet(elapsedSeconds: number) {
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":")
}

export function normalizeAlert(input: TelemetryPayload["alert"]): SystemAlert {
  if (input === "CRITICAL") {
    return "critical"
  }
  if (input === "WARNING") {
    return "warning"
  }
  return "nominal"
}

export function alertLabel(payload?: TelemetryPayload) {
  const alert = normalizeAlert(payload?.alert)
  const faultName =
    payload?.fault_events?.[0]?.name?.replace(/_/g, " ").toUpperCase() ??
    (alert === "critical" ? "PARAMETER ANOMALY" : "PARAMETER CAUTION")

  if (alert === "critical") {
    return `ALERT: ${faultName}`
  }
  if (alert === "warning") {
    return `CAUTION: ${faultName}`
  }
  return "NOMINAL STATUS"
}

export function missionLabel(
  mode: string | undefined,
  selectedProfile?: MissionProfile
) {
  const key = (mode ?? selectedProfile ?? "NORMAL") as MissionProfile
  const known = MISSION_PROFILE_OPTIONS.find((item) => item.value === key)

  if (known) {
    return known.shortLabel
  }

  return key.replace(/_/g, " ")
}

export function themeLabel(theme: DashboardTheme) {
  return THEME_OPTIONS.find((item) => item.value === theme)?.label ?? theme
}

export function statusText(status: SystemAlert) {
  if (status === "critical") {
    return "CRITICAL"
  }
  if (status === "warning") {
    return "WARNING"
  }
  return "NOMINAL"
}

export function displayTime(timestamp: number | string | undefined) {
  if (timestamp == null) {
    return new Date().toLocaleTimeString()
  }

  if (typeof timestamp === "number") {
    const millis = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000
    return new Date(millis).toLocaleTimeString()
  }

  const numeric = Number(timestamp)
  if (Number.isFinite(numeric)) {
    return displayTime(numeric)
  }

  const parsed = Date.parse(timestamp)
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toLocaleTimeString()
  }

  return timestamp
}
