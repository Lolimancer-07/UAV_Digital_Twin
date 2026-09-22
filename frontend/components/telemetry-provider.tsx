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
import { audioAnnunciator } from "@/lib/audio-annunciator"

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
  /** Whether simulation telemetry playback is currently paused. */
  isPaused: boolean
  /** Toggle pause/resume state across all UI controls and pause/resume audio. */
  togglePause: () => void
  /** Explicitly set paused state. */
  setPaused: (paused: boolean) => void
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
  const [isPaused, setIsPausedState] = React.useState<boolean>(false)
  const isPausedRef = React.useRef<boolean>(false)

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

  // Synchronize incoming telemetry paused flag
  React.useEffect(() => {
    if (latestTelemetry?.paused !== undefined) {
      const p = Boolean(latestTelemetry.paused)
      isPausedRef.current = p
      setIsPausedState(p)
      audioAnnunciator.setPaused(p)
    }
  }, [latestTelemetry?.paused])

  const togglePause = React.useCallback(() => {
    const next = !isPausedRef.current
    isPausedRef.current = next
    setIsPausedState(next)
    sendCommand({ command: "set_paused", paused: next } as any)
    audioAnnunciator.setPaused(next)
  }, [sendCommand])

  const setPaused = React.useCallback(
    (paused: boolean) => {
      isPausedRef.current = paused
      setIsPausedState(paused)
      sendCommand({ command: "set_paused", paused } as any)
      audioAnnunciator.setPaused(paused)
    },
    [sendCommand]
  )

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
      isPaused,
      togglePause,
      setPaused,
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
      isPaused,
      togglePause,
      setPaused,
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
