"use client"

import * as React from "react"

import type {
  CanFrame,
  ConnectionStatus,
  RulHistoryPoint,
  SparklineHistory,
  TelemetryCommand,
  TelemetryPayload,
} from "@/lib/telemetry/types"
import { useTelemetrySocket } from "@/hooks/use-telemetry-socket"

// ─── Context shape ────────────────────────────────────────────────────────────

interface TelemetryContextValue {
  /** Most recent parsed telemetry payload from the WebSocket. */
  latestTelemetry: TelemetryPayload | undefined
  /** Rolling log of the last N telemetry payloads (used for table views). */
  telemetryLog: TelemetryPayload[]
  /** Rolling CAN bus frame log. */
  canLog: CanFrame[]
  /** Per-sensor rolling sparkline history (last 40 points per channel). */
  sparklineHistory: SparklineHistory
  /** RUL prediction history with CI bands. */
  rulHistory: RulHistoryPoint[]
  /** WebSocket connection status. */
  connectionStatus: ConnectionStatus
  /** Send a GCS command to the backend (profile, fault, speed, pause, etc.). */
  sendCommand: (command: TelemetryCommand) => boolean
  /** Force a manual WebSocket reconnect. */
  reconnect: () => void
  /** Mission elapsed time in seconds (starts on first live packet). */
  metSeconds: number
}

const TelemetryContext = React.createContext<TelemetryContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const {
    latestTelemetry,
    telemetryLog,
    canLog,
    sparklineHistory,
    rulHistory,
    connectionStatus,
    sendCommand,
    reconnect,
  } = useTelemetrySocket()

  // Mission Elapsed Time — starts ticking on the first live telemetry packet
  const missionStartRef = React.useRef<number | null>(null)
  const [metSeconds, setMetSeconds] = React.useState(0)

  React.useEffect(() => {
    if (!latestTelemetry) return
    if (missionStartRef.current == null) {
      missionStartRef.current = Date.now()
    }
  }, [latestTelemetry])

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (missionStartRef.current != null) {
        setMetSeconds(Math.floor((Date.now() - missionStartRef.current) / 1000))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const value = React.useMemo<TelemetryContextValue>(
    () => ({
      latestTelemetry,
      telemetryLog,
      canLog,
      sparklineHistory,
      rulHistory,
      connectionStatus,
      sendCommand,
      reconnect,
      metSeconds,
    }),
    [
      latestTelemetry,
      telemetryLog,
      canLog,
      sparklineHistory,
      rulHistory,
      connectionStatus,
      sendCommand,
      reconnect,
      metSeconds,
    ]
  )

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  )
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useTelemetry(): TelemetryContextValue {
  const ctx = React.useContext(TelemetryContext)
  if (!ctx) {
    throw new Error("useTelemetry must be used within a <TelemetryProvider>")
  }
  return ctx
}
