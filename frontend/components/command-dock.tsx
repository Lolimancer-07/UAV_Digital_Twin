"use client"

import * as React from "react"
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  FastForwardIcon,
  FlameIcon,
  PauseIcon,
  PlayIcon,
  Radio,
  RotateCcwIcon,
  StepForwardIcon,
  XCircleIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTelemetry } from "@/components/telemetry-provider"
import { WhatIfDialog } from "@/components/what-if-dialog"
import { OptimizeDialog } from "@/components/optimize-dialog"
import { EdgeSwapDialog } from "@/components/edge-swap-dialog"
import { MISSION_PROFILE_OPTIONS } from "@/lib/telemetry/constants"
import type { MissionProfile } from "@/lib/telemetry/types"

const FAULT_OPTIONS = [
  { value: "misfire", label: "Ignition Misfire (Cyl 2)" },
  { value: "injector_clog", label: "Injector Clog (Cyl 3)" },
  { value: "cooling_degradation", label: "Cooling Degradation (+48°F)" },
  { value: "oil_leak", label: "Oil Pressure Loss (-18 PSI)" },
  { value: "bearing_wear", label: "Bearing Wear (High Kurtosis)" },
  { value: "sensor_drift", label: "Sensor Drift (Bias)" },
]

export function CommandDock() {
  const { latestTelemetry, sendCommand, connectionStatus, reconnect, isPaused, togglePause } = useTelemetry()
  const isLive = connectionStatus === "live"

  const [selectedProfile, setSelectedProfile] = React.useState<string>("NORMAL")
  const [selectedFault, setSelectedFault] = React.useState<string>("misfire")
  const [speed, setSpeed] = React.useState<string>("2.0")
  const [demoStep, setDemoStep] = React.useState<number>(1)
  const [isDemoActive, setIsDemoActive] = React.useState<boolean>(false)

  // Sync profile from live telemetry if changed externally
  const missionMode = latestTelemetry?.mission_mode
  const demoActive = latestTelemetry?.demo_state?.active
  const demoStepVal = latestTelemetry?.demo_state?.step

  React.useEffect(() => {
    if (missionMode) {
      setSelectedProfile(missionMode)
    }
    if (demoActive != null) {
      setIsDemoActive(Boolean(demoActive))
    }
    if (demoStepVal != null) {
      setDemoStep(demoStepVal)
    }
  }, [missionMode, demoActive, demoStepVal])

  const handleProfileChange = (val: string) => {
    setSelectedProfile(val)
    sendCommand({
      command: "set_profile",
      profile: val as MissionProfile,
    })
  }

  const handleSpeedChange = (val: string) => {
    setSpeed(val)
    sendCommand({
      command: "set_speed",
      speed: parseFloat(val),
    })
  }

  const handleTogglePause = () => {
    togglePause()
  }

  const [justCleared, setJustCleared] = React.useState<boolean>(false)

  const handleInjectFault = () => {
    if (!selectedFault) return
    setJustCleared(false)
    sendCommand({
      command: "inject_fault",
      fault: selectedFault,
    })
  }

  const handleClearFaults = () => {
    sendCommand({
      command: "clear_faults",
    })
    setJustCleared(true)
    setTimeout(() => setJustCleared(false), 2500)
  }

  const handleStartDemo = () => {
    setIsDemoActive(true)
    setDemoStep(1)
    sendCommand({ command: "demo_start" })
  }

  const handleNextDemoStep = () => {
    const next = demoStep + 1
    setDemoStep(next)
    sendCommand({ command: "demo_step", step: next })
  }

  const handleStopDemo = () => {
    setIsDemoActive(false)
    sendCommand({ command: "demo_stop" })
  }

  const activeFaults = justCleared ? [] : (latestTelemetry?.fault_events ?? [])

  return (
    <>
      {/* ── Demo Mode Stage Banner ─────────────────────────────────────── */}
      {isDemoActive && (
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-2 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground font-bold">DEMO MODE</Badge>
            <span className="font-semibold text-foreground">
              Step {demoStep}/9: {latestTelemetry?.demo_state?.title || "AI + Physics Fault Showcase"}
            </span>
            <span className="hidden text-muted-foreground md:inline">
              — {latestTelemetry?.demo_state?.description || "Simulating progressive propulsion degradation."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="default" onClick={handleNextDemoStep} className="h-7 gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
              <span>NEXT</span>
              <StepForwardIcon className="size-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleStopDemo} className="h-7 text-xs border-border bg-background hover:bg-muted">
              <XCircleIcon className="size-3.5 mr-1 text-destructive" />
              EXIT
            </Button>
          </div>
        </div>
      )}

      {/* ── Persistent Bottom Command Dock ─────────────────────────────── */}
      <footer className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-2.5 shadow-lg">
        {/* Offline indicator strip */}
        {!isLive && (
          <div className="w-full flex items-center gap-2 rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950 px-3 py-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-1">
            <Radio className="size-3.5 animate-pulse text-amber-600 dark:text-amber-400" />
            <span>Backend not connected — commands are disabled until the Digital Twin Core is live.</span>
            <button onClick={reconnect} className="ml-auto underline underline-offset-2 hover:opacity-80">Retry</button>
          </div>
        )}
        <div className={`flex w-full flex-wrap items-center justify-between gap-3 ${!isLive ? "pointer-events-none opacity-40" : ""}`}>
        {/* Group 1: Mission Profile */}
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground lg:inline">
            PROFILE:
          </span>
          <Select value={selectedProfile} onValueChange={(v) => { if (v) handleProfileChange(v) }}>
            <SelectTrigger className="h-8 w-44 text-xs font-medium bg-background border-border text-foreground hover:bg-muted">
              <SelectValue placeholder="Mission Profile" />
            </SelectTrigger>
            <SelectContent className="bg-card dark:bg-zinc-900 border border-border shadow-2xl">
              {MISSION_PROFILE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.shortLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Group 2: Fault Injection & Active Badges */}
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:inline">
            FAULT:
          </span>
          <Select value={selectedFault} onValueChange={(v) => { if (v) setSelectedFault(v) }}>
            <SelectTrigger className="h-8 w-48 text-xs font-medium bg-background border-border text-foreground hover:bg-muted">
              <SelectValue placeholder="Select Fault" />
            </SelectTrigger>
            <SelectContent className="bg-card dark:bg-zinc-900 border border-border shadow-2xl">
              {FAULT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleInjectFault}
            className="h-8 gap-1 border-amber-500 bg-background text-xs text-amber-600 dark:text-amber-400 font-semibold hover:bg-amber-500 hover:text-white dark:hover:bg-amber-600 dark:hover:text-white"
          >
            <FlameIcon className="size-3.5" />
            <span>INJECT</span>
          </Button>
          <Button
            size="sm"
            variant={justCleared ? "default" : "outline"}
            onClick={handleClearFaults}
            className={`h-8 gap-1 text-xs font-medium transition-all ${
              justCleared
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-border bg-background hover:bg-muted text-foreground"
            }`}
          >
            {justCleared ? (
              <>
                <CheckCircle2Icon className="size-3.5 text-white" />
                <span>CLEARED</span>
              </>
            ) : (
              <>
                <RotateCcwIcon className="size-3.5" />
                <span>CLEAR</span>
              </>
            )}
          </Button>

          {activeFaults.length > 0 && (
            <Badge variant="destructive" className="ml-1 text-[10px] font-bold bg-destructive text-destructive-foreground animate-pulse">
              {activeFaults.length} FAULT{activeFaults.length > 1 ? "S" : ""}
            </Badge>
          )}

          {justCleared && (
            <Badge variant="outline" className="ml-1 text-[10px] font-bold border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              FAULTS CLEARED
            </Badge>
          )}
        </div>

        {/* Group 3: Sim Speed & Playback */}
        <div className="flex items-center gap-1.5">
          <span className="hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground xl:inline">
            SPEED:
          </span>
          <Select value={speed} onValueChange={(v) => { if (v) handleSpeedChange(v) }}>
            <SelectTrigger className="h-8 w-24 text-xs font-medium bg-background border-border text-foreground hover:bg-muted">
              <SelectValue placeholder="Speed" />
            </SelectTrigger>
            <SelectContent className="bg-card dark:bg-zinc-900 border border-border shadow-2xl">
              <SelectItem value="1.0" className="text-xs">1.0× Real</SelectItem>
              <SelectItem value="2.0" className="text-xs">2.0× Fast</SelectItem>
              <SelectItem value="5.0" className="text-xs">5.0× Ultra</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant={isPaused ? "destructive" : "outline"}
            onClick={handleTogglePause}
            className="h-8 w-20 text-xs font-medium bg-background border-border hover:bg-muted"
          >
            {isPaused ? (
              <>
                <PlayIcon className="size-3.5 mr-1" />
                RESUME
              </>
            ) : (
              <>
                <PauseIcon className="size-3.5 mr-1" />
                PAUSE
              </>
            )}
          </Button>
        </div>

        {/* Group 4: Advanced Tools & Demo */}
        <div className="flex items-center gap-1.5 ml-auto">
          {!isDemoActive && (
            <Button
              size="sm"
              variant="default"
              onClick={handleStartDemo}
              className="h-8 gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <PlayIcon className="size-3.5" />
              <span>DEMO</span>
            </Button>
          )}
          <WhatIfDialog />
          <OptimizeDialog />
          <EdgeSwapDialog />
        </div>
        </div>
      </footer>
    </>
  )
}
