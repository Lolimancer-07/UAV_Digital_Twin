import {
  CAN_HISTORY_LIMIT,
  RUL_HISTORY_LIMIT,
  SPARKLINE_HISTORY_LIMIT,
  TELEMETRY_HISTORY_LIMIT,
} from "@/lib/telemetry/constants"
import { SENSOR_DEFINITIONS, getSensorStatus } from "@/lib/telemetry/thresholds"
import type {
  CanFrame,
  ClearFaultsCommand,
  FaultType,
  InjectFaultCommand,
  MaintenanceAdvisory,
  MissionProfile,
  ReplaySpeed,
  RulHistoryPoint,
  SensorKey,
  SetPausedCommand,
  SetProfileCommand,
  SetSpeedCommand,
  SparklineHistory,
  TelemetryPayload,
} from "@/lib/telemetry/types"

export function boundedAppend<T>(current: T[], next: T | T[], limit: number) {
  const nextItems = Array.isArray(next) ? next : [next]
  const merged = [...current, ...nextItems]
  return merged.length > limit ? merged.slice(merged.length - limit) : merged
}

export function createEmptySparklineHistory(): SparklineHistory {
  return SENSOR_DEFINITIONS.reduce((accumulator, definition) => {
    accumulator[definition.key] = []
    return accumulator
  }, {} as SparklineHistory)
}

export function appendSparklineHistory(
  current: SparklineHistory,
  payload: TelemetryPayload
): SparklineHistory {
  const cycle = payload.cycle ?? 0
  const next: SparklineHistory = { ...current }

  for (const definition of SENSOR_DEFINITIONS) {
    const value = definition.getValue(payload)

    if (value == null || !Number.isFinite(value)) {
      next[definition.key] = current[definition.key]
      continue
    }

    next[definition.key] = boundedAppend(
      current[definition.key],
      { cycle, value },
      SPARKLINE_HISTORY_LIMIT
    )
  }

  return next
}

export function appendRulHistory(
  current: RulHistoryPoint[],
  payload: TelemetryPayload
) {
  if (
    payload.cycle == null ||
    payload.predicted_rul == null ||
    payload.predicted_rul <= 0
  ) {
    return current
  }

  return boundedAppend(
    current,
    {
      cycle: payload.cycle,
      predicted_rul: payload.predicted_rul,
      true_rul: payload.true_rul,
      rul_ci_lower: payload.rul_ci_lower,
      rul_ci_upper: payload.rul_ci_upper,
    },
    RUL_HISTORY_LIMIT
  )
}

export function appendCanFrames(
  current: CanFrame[],
  payload: TelemetryPayload
) {
  const frames =
    payload.can_frames?.map((frame) => ({
      ...frame,
      cycle: frame.cycle ?? payload.cycle,
    })) ?? []

  return frames.length ? boundedAppend(current, frames, CAN_HISTORY_LIMIT) : current
}

export function appendTelemetryLog(
  current: TelemetryPayload[],
  payload: TelemetryPayload
) {
  return boundedAppend(current, payload, TELEMETRY_HISTORY_LIMIT)
}

export function parseTelemetryMessage(raw: string): TelemetryPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)

    if (!parsed || typeof parsed !== "object") {
      return null
    }

    const payload = parsed as TelemetryPayload

    if (payload.cycle == null) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function cylinderBalance(payload?: TelemetryPayload) {
  const cht =
    payload?.cht_cyl && payload.cht_cyl.length >= 4
      ? payload.cht_cyl.slice(0, 4)
      : [payload?.cht, payload?.cht, payload?.cht, payload?.cht]
  const egt =
    payload?.egt_cyl && payload.egt_cyl.length >= 4
      ? payload.egt_cyl.slice(0, 4)
      : [payload?.egt, payload?.egt, payload?.egt, payload?.egt]

  const validCht = cht.filter(
    (value): value is number => value != null && Number.isFinite(value)
  )

  const average =
    validCht.length > 0
      ? validCht.reduce((sum, value) => sum + value, 0) / validCht.length
      : undefined

  const spread =
    validCht.length > 0
      ? Math.max(...validCht) - Math.min(...validCht)
      : undefined

  const rows = [0, 1, 2, 3].map((index) => {
    const chtValue = cht[index]
    const egtValue = egt[index]
    const delta =
      average != null && chtValue != null && Number.isFinite(chtValue)
        ? chtValue - average
        : undefined
    let status: "NORMAL" | "HIGH" | "LOW" = "NORMAL"

    if (
      (chtValue != null && chtValue > 420) ||
      (egtValue != null && egtValue > 1650)
    ) {
      status = "HIGH"
    } else if (chtValue != null && chtValue < 300) {
      status = "LOW"
    }

    return {
      cylinder: `Cylinder #${index + 1}`,
      cht: chtValue,
      egt: egtValue,
      delta,
      status,
    }
  })

  return {
    average,
    spread,
    state: spread != null && spread > 35 ? "UNBALANCED" : "BALANCED",
    rows,
  }
}

export function worstSensorAlert(payload?: TelemetryPayload) {
  let hasWarning = false

  for (const definition of SENSOR_DEFINITIONS) {
    const status = getSensorStatus(definition.getValue(payload), definition)
    if (status === "crit") {
      return "critical"
    }
    if (status === "warn") {
      hasWarning = true
    }
  }

  return hasWarning ? "warning" : "nominal"
}

export function buildSetProfileCommand(profile: MissionProfile): SetProfileCommand {
  return { command: "set_profile", profile }
}

export function buildSetSpeedCommand(speed: ReplaySpeed): SetSpeedCommand {
  return { command: "set_speed", speed }
}

export function buildSetPausedCommand(paused: boolean): SetPausedCommand {
  return { command: "set_paused", paused }
}

export function buildInjectFaultCommand(fault: FaultType): InjectFaultCommand {
  return { command: "inject_fault", fault }
}

export function buildClearFaultsCommand(): ClearFaultsCommand {
  return { command: "clear_faults" }
}

export function activeAdvisories(
  payload?: TelemetryPayload,
  fallback?: MaintenanceAdvisory
) {
  if (payload?.advisories?.length) {
    return payload.advisories
  }

  return fallback ? [fallback] : []
}
