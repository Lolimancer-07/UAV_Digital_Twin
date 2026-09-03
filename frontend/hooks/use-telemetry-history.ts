"use client"

import * as React from "react"

import {
  appendCanFrames,
  appendRulHistory,
  appendSparklineHistory,
  appendTelemetryLog,
  createEmptySparklineHistory,
} from "@/lib/telemetry/utils"
import type {
  CanFrame,
  RulHistoryPoint,
  SparklineHistory,
  TelemetryPayload,
} from "@/lib/telemetry/types"

interface TelemetryHistoryState {
  telemetryLog: TelemetryPayload[]
  canLog: CanFrame[]
  sparklineHistory: SparklineHistory
  rulHistory: RulHistoryPoint[]
}

type TelemetryHistoryAction = {
  type: "ingest"
  payload: TelemetryPayload
}

const initialHistoryState: TelemetryHistoryState = {
  telemetryLog: [],
  canLog: [],
  sparklineHistory: createEmptySparklineHistory(),
  rulHistory: [],
}

function historyReducer(
  state: TelemetryHistoryState,
  action: TelemetryHistoryAction
): TelemetryHistoryState {
  if (action.type !== "ingest") {
    return state
  }

  return {
    telemetryLog: appendTelemetryLog(state.telemetryLog, action.payload),
    canLog: appendCanFrames(state.canLog, action.payload),
    sparklineHistory: appendSparklineHistory(
      state.sparklineHistory,
      action.payload
    ),
    rulHistory: appendRulHistory(state.rulHistory, action.payload),
  }
}

export function useTelemetryHistory() {
  const [state, dispatch] = React.useReducer(
    historyReducer,
    initialHistoryState
  )

  const ingestTelemetry = React.useCallback((payload: TelemetryPayload) => {
    dispatch({ type: "ingest", payload })
  }, [])

  return {
    ...state,
    ingestTelemetry,
  }
}
