"use client"

import * as React from "react"

import {
  MISSION_PROFILE_OPTIONS,
  REPLAY_SPEED_OPTIONS,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
} from "@/lib/telemetry/constants"
import type {
  DashboardTheme,
  FaultType,
  MissionProfile,
  ReplaySpeed,
} from "@/lib/telemetry/types"

export type DashboardTab =
  | "telemetry"
  | "prognostics"
  | "thermodynamics"
  | "can"
  | "maintenance"

function isTheme(value: string | null): value is DashboardTheme {
  return THEME_OPTIONS.some((theme) => theme.value === value)
}

export function useDashboardControls() {
  const [selectedTheme, setSelectedThemeState] =
    React.useState<DashboardTheme>("stealth")
  const [selectedMissionProfile, setSelectedMissionProfile] =
    React.useState<MissionProfile>(MISSION_PROFILE_OPTIONS[0].value)
  const [selectedFault, setSelectedFault] =
    React.useState<FaultType>("misfire")
  const [selectedReplaySpeed, setSelectedReplaySpeed] =
    React.useState<ReplaySpeed>(REPLAY_SPEED_OPTIONS[0].value)
  const [audioEnabled, setAudioEnabled] = React.useState(true)
  const [isPaused, setIsPaused] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<DashboardTab>("telemetry")
  const [missionStart, setMissionStart] = React.useState<number | null>(null)
  const [metSeconds, setMetSeconds] = React.useState(0)

  React.useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(stored)) {
      setSelectedThemeState(stored)
    }
  }, [])

  React.useEffect(() => {
    document.documentElement.dataset.uavTheme = selectedTheme
    window.localStorage.setItem(THEME_STORAGE_KEY, selectedTheme)
  }, [selectedTheme])

  React.useEffect(() => {
    if (missionStart == null) {
      return
    }

    const timer = window.setInterval(() => {
      setMetSeconds(Math.floor((Date.now() - missionStart) / 1000))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [missionStart])

  const markMissionLive = React.useCallback(() => {
    setMissionStart((current) => current ?? Date.now())
  }, [])

  const setSelectedTheme = React.useCallback((theme: DashboardTheme) => {
    setSelectedThemeState(theme)
  }, [])

  const toggleAudio = React.useCallback(() => {
    setAudioEnabled((current) => !current)
  }, [])

  const setPaused = React.useCallback((paused: boolean) => {
    setIsPaused(paused)
  }, [])

  return {
    selectedTheme,
    setSelectedTheme,
    selectedMissionProfile,
    setSelectedMissionProfile,
    selectedFault,
    setSelectedFault,
    selectedReplaySpeed,
    setSelectedReplaySpeed,
    audioEnabled,
    toggleAudio,
    isPaused,
    setPaused,
    activeTab,
    setActiveTab,
    metSeconds,
    markMissionLive,
  }
}
