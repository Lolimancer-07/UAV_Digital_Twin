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

  const clearReconnect = React.useCallback(() => {
    if (reconnectRef.current != null) {
      window.clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
  }, [])

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

    try {
      const socket = new WebSocket(endpoint)
      socketRef.current = socket

      socket.onopen = () => {
        setConnectionStatus("live")
      }

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return
        }

        const payload = parseTelemetryMessage(event.data)
        if (!payload) {
          return
        }

        setConnectionStatus("live")
        setLatestTelemetry(payload)
        history.ingestTelemetry(payload)
      }

      socket.onclose = () => {
        socketRef.current = null
        if (manualCloseRef.current) {
          setConnectionStatus("disconnected")
          return
        }
        setConnectionStatus("reconnecting")
        reconnectRef.current = window.setTimeout(connect, 1000)
      }

      socket.onerror = () => {
        setConnectionStatus("reconnecting")
      }
    } catch {
      setConnectionStatus("reconnecting")
      reconnectRef.current = window.setTimeout(connect, 1000)
    }
  }, [clearReconnect, endpoint, history])

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

    socket.send(JSON.stringify(command))
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
