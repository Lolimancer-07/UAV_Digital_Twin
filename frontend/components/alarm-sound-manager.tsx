"use client"

import * as React from "react"
import { useTelemetry } from "@/components/telemetry-provider"
import { audioAnnunciator } from "@/lib/audio-annunciator"

/**
 * Global Alarm Sound Manager
 * Mounts at the root level inside TelemetryProvider.
 * Continually synchronizes real-time telemetry fault events and alert levels
 * with the AudioAnnunciator synthesizer to provide continuous alarm sounding.
 */
export function AlarmSoundManager() {
  const { latestTelemetry } = useTelemetry()

  React.useEffect(() => {
    if (!latestTelemetry) {
      audioAnnunciator.updateAlarms([], "NOMINAL", false)
      return
    }

    const faultEvents = latestTelemetry.fault_events ?? []
    const alertLevel = latestTelemetry.alert ?? "NOMINAL"
    const isAnomaly = Boolean(latestTelemetry.is_anomaly)

    audioAnnunciator.updateAlarms(faultEvents, alertLevel, isAnomaly)
  }, [latestTelemetry])

  return null
}
