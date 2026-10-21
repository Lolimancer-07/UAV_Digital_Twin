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
import {
  getActiveSession,
  fetchSessionToken,
  subscribeToSessionChanges,
} from "@/lib/telemetry/auth"

export function useTelemetrySocket(endpoint = DEFAULT_WS_ENDPOINT) {
  const socketRef = React.useRef<WebSocket | null>(null)
  const reconnectRef = React.useRef<number | null>(null)
  const manualCloseRef = React.useRef(false)
  const [latestTelemetry, setLatestTelemetry] =
    React.useState<TelemetryPayload>()
  const [connectionStatus, setConnectionStatus] =
    React.useState<ConnectionStatus>("connecting")
  const connectionStatusRef = React.useRef<ConnectionStatus>("connecting")
  const [dataFreshnessSeconds, setDataFreshnessSeconds] = React.useState<number>(0)
  const [isStale, setIsStale] = React.useState<boolean>(true)
  const lastPacketTimeRef = React.useRef<number>(0)

  const updateConnectionStatus = React.useCallback((status: ConnectionStatus) => {
    if (connectionStatusRef.current !== status) {
      connectionStatusRef.current = status
      setConnectionStatus(status)
      if (status !== "live") {
        setIsStale(true)
      }
    }
  }, [])

  const history = useTelemetryHistory()

  // ── CRITICAL FIX ─────────────────────────────────────────────────────────
  // Keep ingestTelemetry in a stable ref so it never appears in the connect()
  // useCallback dependency array.
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
    let base = endpoint
    if (process.env.NEXT_PUBLIC_TELEMETRY_WS_URL) {
      base = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL
    } else if (typeof window !== "undefined") {
      const browserHost = window.location.hostname || "127.0.0.1"
      // If alternate retry attempts occur, flip between hostname and 127.0.0.1/localhost
      if (attemptRef.current % 2 === 1) {
        const altHost = browserHost === "localhost" ? "127.0.0.1" : "localhost"
        base = `ws://${altHost}:8765`
      } else {
        base = `ws://${browserHost}:8765`
      }
    }

    const session = getActiveSession()
    if (session.token) {
      const separator = base.includes("?") ? "&" : "?"
      return `${base}${separator}token=${encodeURIComponent(session.token)}`
    }
    return base
  }, [endpoint])

  const connect = React.useCallback(() => {
    clearReconnect()
    manualCloseRef.current = false
    updateConnectionStatus(
      connectionStatusRef.current === "disconnected" ? "reconnecting" : "connecting"
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
        updateConnectionStatus("live")

        // Subscribe using Subscription Contract v1.0
        const session = getActiveSession()
        const subMsg = {
          command: "subscribe",
          subscription_version: "1.0",
          tenant_id: session.tenant_id,
          aircraft_ids: session.aircraft_ids.length > 0 ? session.aircraft_ids : ["*"],
          field_groups: [
            "telemetry",
            "physics",
            "prognostics",
            "anomaly",
            "health",
            "xai",
            "risk",
            "prescriptive",
            "fleet",
            "mission_command",
            "interactive",
          ],
          min_interval_ms: 100,
        }
        try {
          socket.send(JSON.stringify(subMsg))
        } catch {}
      }

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return
        }

        const payload = parseTelemetryMessage(event.data)
        if (!payload) {
          try {
            const raw = JSON.parse(event.data)
            if (raw && (raw.status === "INITIALIZING" || raw.cycle != null || raw.status === "SUBSCRIBED" || raw.status === "ACK")) {
              updateConnectionStatus("live")
            }
          } catch {}
          return
        }

        if (connectionStatusRef.current !== "live") {
          updateConnectionStatus("live")
        }

        lastPacketTimeRef.current = Date.now()
        setIsStale(false)

        // Calm, readable UI update rate (at most once every 250ms = 4 Hz),
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

        if (now - lastUiUpdateRef.current >= 250 || isUrgent) {
          lastUiUpdateRef.current = now
          ingestRef.current(payload)
          setLatestTelemetry(payload)
        }
      }

      socket.onclose = () => {
        socketRef.current = null
        if (manualCloseRef.current) {
          updateConnectionStatus("disconnected")
          return
        }
        attemptRef.current += 1
        updateConnectionStatus("reconnecting")
        reconnectRef.current = window.setTimeout(() => connectRef.current(), 1500)
      }

      socket.onerror = () => {
        attemptRef.current += 1
        updateConnectionStatus("reconnecting")
      }
    } catch {
      attemptRef.current += 1
      updateConnectionStatus("reconnecting")
      reconnectRef.current = window.setTimeout(() => connectRef.current(), 1500)
    }
  }, [clearReconnect, resolveTargetEndpoint, updateConnectionStatus])

  const connectRef = React.useRef(connect)
  React.useEffect(() => {
    connectRef.current = connect
  }, [connect])

  React.useEffect(() => {
    connectRef.current()

    const watchdog = window.setInterval(() => {
      const socket = socketRef.current
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        connectRef.current()
      }
    }, 3000)

    // Listen for tenant or role switching
    const unsubscribeAuth = subscribeToSessionChanges((newSession) => {
      const socket = socketRef.current
      if (socket && socket.readyState === WebSocket.OPEN) {
        // Send in-flight subscription & auth update directly — avoids socket tear-down and screen reset
        const subMsg = {
          command: "subscribe",
          action: "subscribe",
          auth_token: newSession.token,
          token: newSession.token,
          subscription_version: "1.0",
          tenant_id: newSession.tenant_id,
          aircraft_ids: newSession.aircraft_ids.length > 0 ? newSession.aircraft_ids : ["*"],
          field_groups: [
            "telemetry",
            "physics",
            "prognostics",
            "anomaly",
            "health",
            "xai",
            "risk",
            "prescriptive",
            "fleet",
            "mission_command",
            "interactive",
          ],
          min_interval_ms: 100,
        }
        try {
          socket.send(JSON.stringify(subMsg))
        } catch {
          connectRef.current()
        }
      } else {
        connectRef.current()
      }
    })

    return () => {
      manualCloseRef.current = true
      window.clearInterval(watchdog)
      clearReconnect()
      unsubscribeAuth()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [endpoint, clearReconnect])

  // Telemetry freshness & staleness monitoring watchdog
  React.useEffect(() => {
    const freshnessTimer = window.setInterval(() => {
      if (lastPacketTimeRef.current > 0) {
        const elapsedSec = Math.max(0, (Date.now() - lastPacketTimeRef.current) / 1000)
        setDataFreshnessSeconds(Math.round(elapsedSec * 10) / 10)
        setIsStale(elapsedSec > 3.0 || connectionStatusRef.current !== "live")
      } else {
        setIsStale(true)
      }
    }, 500)

    return () => window.clearInterval(freshnessTimer)
  }, [])

  // Simulated fallback generator when offline / demo mode
  React.useEffect(() => {
    let cycle = 120
    const simTimer = window.setInterval(() => {
      // Only generate simulated telemetry if no live WebSocket packets have arrived
      if (connectionStatusRef.current === "live" && Date.now() - lastPacketTimeRef.current < 4000) {
        return
      }
      cycle += 1
      const rpm = 2400 + Math.sin(cycle * 0.1) * 35
      const cht = 382 + Math.sin(cycle * 0.05) * 4
      const egt = 1465 + Math.cos(cycle * 0.08) * 15
      const oilP = 48.5 + Math.sin(cycle * 0.12) * 1.2
      const rul = Math.max(20, 142 - Math.floor((cycle - 120) * 0.1))

      const simPayload: TelemetryPayload = {
        cycle,
        engine_id: 1,
        uav_id: "UAV-01",
        rpm: Math.round(rpm * 10) / 10,
        cht: Math.round(cht * 10) / 10,
        cht_cyl: [Math.round(cht - 4), Math.round(cht - 1), Math.round(cht + 2), Math.round(cht + 5)],
        egt: Math.round(egt * 10) / 10,
        egt_cyl: [Math.round(egt - 8), Math.round(egt - 2), Math.round(egt + 5), Math.round(egt + 10)],
        oil_pressure: Math.round(oilP * 10) / 10,
        oil_temp: 92.4,
        fuel_flow: 22.8,
        fuel_rail_pressure_bar: 3.2,
        vibration: 1.45 + (cycle % 7 === 0 ? 0.08 : 0),
        vibration_kurtosis: 3.1,
        battery_v: 28.2,
        bus_current_a: 14.6,
        inj_timing: 18.0,
        map_kpa: 96.0,
        altitude_ft: 3000,
        oat_c: 15.0,
        mission_mode: "NORMAL",
        paused: false,
        alert: "NOMINAL",
        true_rul: rul,
        predicted_rul: rul,
        rul_ci_lower: Math.round(rul * 0.88),
        rul_ci_upper: Math.round(rul * 1.12),
        rul_mc_std: 4.1,
        buffer_pct: 100,
        is_anomaly: false,
        anomaly_score: 0.082,
        failure_probability: 0.04,
        fault_events: [],
        active_faults: [],
        injected_faults: [],
        latitude: 26.756 + Math.sin(cycle * 0.02) * 0.01,
        longitude: 78.118 + Math.cos(cycle * 0.02) * 0.01,
        heading_deg: Math.round((64 + Math.sin(cycle * 0.03) * 10 + 360) % 360),
        ground_speed_kts: 58,
        mission_progress_pct: Math.min(100, Math.round(31 + (cycle - 120) * 0.1)),
        health: {
          health_index: 94,
          condition: "NOMINAL",
          sub_scores: { thermal: 96, lubrication: 94, mechanical: 92, electrical: 95 },
        },
        physics: {
          brake_power_hp: 94.5,
          thermal_efficiency: 0.32,
          volumetric_eff: 0.88,
          air_fuel_ratio: 14.7,
          expected_baselines: { egt: 1465, cht: 382, oil_p: 48, fuel_flow: 23 },
          residuals: { delta_egt: 0, delta_cht: 0, delta_oil_p: 0, delta_fuel: 0 },
        },
        sensor_integrity: { integrity_score: 1.0 },
        twin_consistency: { case: "A", consistency_score: 0.96, narrative: "Physics and sensor models consistent" },
        mission_risk: { risk_level: "LOW", mission_completion_probability: 94 },
      }

      ingestRef.current(simPayload)
      setLatestTelemetry((prev) => (connectionStatusRef.current === "live" ? prev : simPayload))
    }, 1000)

    return () => window.clearInterval(simTimer)
  }, [])

  const reconnect = React.useCallback(() => {
    connect()
  }, [connect])

  const sendCommand = React.useCallback((command: TelemetryCommand) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    const session = getActiveSession()
    const message = {
      ...command,
      issued_at: new Date().toISOString(),
      tenant_id: session.tenant_id,
      token: session.token || undefined,
    }
    socket.send(JSON.stringify(message))
    return true
  }, [])

  return {
    endpoint,
    connectionStatus,
    latestTelemetry,
    reconnect,
    sendCommand,
    dataFreshnessSeconds,
    isStale,
    telemetryLog: history.telemetryLog,
    canLog: history.canLog,
    sparklineHistory: history.sparklineHistory,
    rulHistory: history.rulHistory,
  }
}
