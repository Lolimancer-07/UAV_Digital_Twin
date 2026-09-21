"use client"

import * as React from "react"

import { DEFAULT_WS_ENDPOINT } from "@/lib/telemetry/constants"
import type {
  ConnectionStatus,
  TelemetryCommand,
  TelemetryPayload,
} from "@/lib/telemetry/types"
import { parseTelemetryMessage } from "@/lib/telemetry/utils"
import { useTelemetryHistory } from "./use-telemetry-history"

export function useTelemetrySocket(endpoint = DEFAULT_WS_ENDPOINT) {
  const socketRef = React.useRef<WebSocket | null>(null)
  const reconnectRef = React.useRef<number | null>(null)
  const manualCloseRef = React.useRef(false)
  const [latestTelemetry, setLatestTelemetry] =
    React.useState<TelemetryPayload>()
  const [connectionStatus, setConnectionStatus] =
    React.useState<ConnectionStatus>("connecting")
  const history = useTelemetryHistory()

  // ── CRITICAL FIX ─────────────────────────────────────────────────────────
  // Keep ingestTelemetry in a stable ref so it never appears in the connect()
  // useCallback dependency array. Previously, `history` was listed as a dep,
  // which caused React to recreate `connect` on every incoming packet (because
  // ingestTelemetry dispatches to the reducer, which creates a new `history`
  // object reference). That triggered the useEffect cleanup, which closed the
  // WebSocket after the very first received message.
  const ingestRef = React.useRef(history.ingestTelemetry)
  React.useLayoutEffect(() => {
    ingestRef.current = history.ingestTelemetry
  })

  const clearReconnect = React.useCallback(() => {
    if (reconnectRef.current != null) {
      window.clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
  }, [])

  const lastUiUpdateRef = React.useRef(0)
  const lastFaultCountRef = React.useRef(0)
  const lastAlertRef = React.useRef<string | undefined>(undefined)
  const lastAnomalyRef = React.useRef<boolean | undefined>(undefined)
  const attemptRef = React.useRef(0)

  const resolveTargetEndpoint = React.useCallback(() => {
    if (process.env.NEXT_PUBLIC_TELEMETRY_WS_URL) {
      return process.env.NEXT_PUBLIC_TELEMETRY_WS_URL
    }
    if (typeof window !== "undefined") {
      const browserHost = window.location.hostname || "127.0.0.1"
      // If alternate retry attempts occur, flip between hostname and 127.0.0.1/localhost
      if (attemptRef.current % 2 === 1) {
        const altHost = browserHost === "localhost" ? "127.0.0.1" : "localhost"
        return `ws://${altHost}:8765`
      }
      return `ws://${browserHost}:8765`
    }
    return endpoint
  }, [endpoint])

  const connect = React.useCallback(() => {
    clearReconnect()
    manualCloseRef.current = false
    setConnectionStatus((current) =>
      current === "disconnected" ? "reconnecting" : "connecting"
    )

    if (socketRef.current) {
      try {
        socketRef.current.close()
      } catch {
        socketRef.current = null
      }
    }

    const targetUrl = resolveTargetEndpoint()

    try {
      const socket = new WebSocket(targetUrl)
      socketRef.current = socket

      socket.onopen = () => {
        attemptRef.current = 0
        setConnectionStatus("live")
      }

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return
        }

        const payload = parseTelemetryMessage(event.data)
        if (!payload) {
          try {
            const raw = JSON.parse(event.data)
            if (raw && (raw.status === "INITIALIZING" || raw.cycle != null)) {
              setConnectionStatus("live")
            }
          } catch {}
          return
        }

        setConnectionStatus("live")
        // Always ingest into rolling history and logs
        ingestRef.current(payload)

        // Calm, readable UI update rate (at most once every 400ms),
        // but immediately push updates on urgent state transitions or tool responses!
        const now = Date.now()
        const faultCount = (payload.fault_events?.length ?? 0) + (payload.active_faults?.length ?? 0)
        const faultTransition = faultCount !== lastFaultCountRef.current
        lastFaultCountRef.current = faultCount

        const alertTransition = payload.alert !== lastAlertRef.current
        lastAlertRef.current = payload.alert

        const anomalyTransition = Boolean(payload.is_anomaly) !== Boolean(lastAnomalyRef.current)
        lastAnomalyRef.current = payload.is_anomaly

        const isUrgent =
          faultTransition ||
          alertTransition ||
          anomalyTransition ||
          payload.whatif_result != null ||
          payload.optimize_result != null ||
          payload.ai_engineer_response != null

        if (now - lastUiUpdateRef.current >= 400 || isUrgent) {
          lastUiUpdateRef.current = now
          setLatestTelemetry(payload)
        }
      }

      socket.onclose = () => {
        socketRef.current = null
        if (manualCloseRef.current) {
          setConnectionStatus("disconnected")
          return
        }
        attemptRef.current += 1
        setConnectionStatus("reconnecting")
        reconnectRef.current = window.setTimeout(connect, 1500)
      }

      socket.onerror = () => {
        attemptRef.current += 1
        setConnectionStatus("reconnecting")
      }
    } catch {
      attemptRef.current += 1
      setConnectionStatus("reconnecting")
      reconnectRef.current = window.setTimeout(connect, 1500)
    }
    // NOTE: `history` is intentionally excluded from deps — we use ingestRef
  }, [clearReconnect, resolveTargetEndpoint])

  React.useEffect(() => {
    connect()

    const watchdog = window.setInterval(() => {
      const socket = socketRef.current
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        connect()
      }
    }, 3000)

    return () => {
      manualCloseRef.current = true
      window.clearInterval(watchdog)
      clearReconnect()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [clearReconnect, connect])

  const reconnect = React.useCallback(() => {
    connect()
  }, [connect])

  const sendCommand = React.useCallback((command: TelemetryCommand) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    const token = process.env.NEXT_PUBLIC_UAV_TWIN_AUTH_TOKEN
    const message = token ? { ...command, token } : command
    socket.send(JSON.stringify(message))
    return true
  }, [])

  return {
    endpoint,
    connectionStatus,
    latestTelemetry,
    reconnect,
    sendCommand,
    telemetryLog: history.telemetryLog,
    canLog: history.canLog,
    sparklineHistory: history.sparklineHistory,
    rulHistory: history.rulHistory,
  }
}
