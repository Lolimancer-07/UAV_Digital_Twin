"use client"

import * as React from "react"
import Link from "next/link"
import { useTelemetry } from "@/components/telemetry-provider"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  Shield,
  Satellite,
  Cpu,
  Wind,
  FastForward,
  Play,
  Pause,
  ChevronRight,
  ShieldAlert,
  Sliders,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { audioAnnunciator } from "@/lib/audio-annunciator"

function metHms(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function LiveClock() {
  const [time, setTime] = React.useState<string>("")
  React.useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(
        now.toUTCString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1") + " UTC"
      )
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="font-mono tabular-nums">{time || "—"}</span>
}

export function GcsMissionStatusBar() {
  const { latestTelemetry: t, connectionStatus, metSeconds, sendCommand, isPaused, togglePause } = useTelemetry()

  const uavId = t?.uav_id ?? "UAV-01"
  const alertLevel = t?.alert ?? "NOMINAL"
  const healthIndex = Math.round(t?.health?.health_index ?? 94)
  const rpm = Math.round(t?.rpm ?? 0)
  const currentMode = t?.mission_mode ?? "NORMAL"
  const missionMode = currentMode.replace(/_/g, " ")
  const isAnomaly = t?.is_anomaly ?? false

  const isLive = connectionStatus === "live"
  const isCritical = alertLevel === "CRITICAL" || healthIndex < 40
  const isWarning = alertLevel === "WARNING" || isAnomaly
  const isNominal = !isCritical && !isWarning

  // Status color
  const statusColor = isCritical
    ? "bg-red-500"
    : isWarning
    ? "bg-amber-500"
    : "bg-emerald-500"

  const statusText = isCritical
    ? "CRITICAL FAULT"
    : isWarning
    ? "ANOMALY DETECTED"
    : "SYSTEM NOMINAL"

  const statusBg = isCritical
    ? "bg-red-50 border-red-600 dark:bg-red-950 dark:border-red-800"
    : isWarning
    ? "bg-amber-50 border-amber-600 dark:bg-amber-950 dark:border-amber-800"
    : "bg-card border-border"

  // Audio annunciator live state subscription
  const [audioState, setAudioState] = React.useState(() => audioAnnunciator.getState())
  React.useEffect(() => {
    setAudioState(audioAnnunciator.getState())
    const unsubscribe = audioAnnunciator.subscribe(() => {
      setAudioState(audioAnnunciator.getState())
    })
    return unsubscribe
  }, [])

  // Mission profile handler
  const handleSelectProfile = (profile: string) => {
    sendCommand({ command: "set_profile", profile } as any)
  }

  // Speed multiplier handler
  const [currentSpeed, setCurrentSpeed] = React.useState<number>(1.0)

  const handleSetSpeed = (speed: number) => {
    setCurrentSpeed(speed)
    sendCommand({ command: "set_speed", speed } as any)
  }

  const handleTogglePause = () => {
    togglePause()
  }

  return (
    <div
      className={`mx-4 mb-1 mt-0 rounded-xl border px-5 py-3 lg:mx-6 ${statusBg} shadow-sm transition-colors duration-500 flex flex-col gap-3`}
    >
      {/* ── Main Hero Status Row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: UAV ID + status */}
        <div className="flex items-center gap-3">
          {/* Status indicator dot */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-40 ${statusColor}`}
            />
            <span className={`relative inline-flex h-3 w-3 rounded-full ${statusColor}`} />
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
              ACTIVE AIRFRAME
            </span>
            <span className="font-heading text-lg font-bold tracking-tight text-foreground">
              {uavId}
            </span>
          </div>
          <div className="hidden h-8 w-px bg-border sm:block" />
          <div className="hidden flex-col leading-none sm:flex">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
              TWIN STATUS
            </span>
            <span
              className={`text-sm font-bold ${
                isCritical
                  ? "text-red-600 dark:text-red-400"
                  : isWarning
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {statusText}
            </span>
          </div>

          {/* Live Continuous Alarm Annunciator Pill */}
          {audioState.isSounding && (
            <button
              onClick={() => audioAnnunciator.silenceAlarm()}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-destructive text-destructive-foreground animate-pulse hover:opacity-90 transition-all cursor-pointer shadow-sm"
              title="Continuous Alarm Sounding — Click to Silence Audio"
            >
              <Volume2 className="h-3 w-3 animate-bounce" />
              <span>ALARM SOUNDING · SILENCE</span>
            </button>
          )}
          {audioState.isSilenced && (isCritical || isWarning) && (
            <button
              onClick={() => audioAnnunciator.unsilenceAlarm()}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all cursor-pointer"
              title="Alarm Audio Silenced — Click to Resume Audio"
            >
              <VolumeX className="h-3 w-3" />
              <span>ALARM SILENCED · RESUME</span>
            </button>
          )}
        </div>

        {/* Center: mission telemetry stats */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <Stat icon={<Activity className="h-3.5 w-3.5" />} label="MISSION MODE" value={missionMode} />
          <Stat icon={<Cpu className="h-3.5 w-3.5" />} label="ENGINE RPM" value={isLive ? `${rpm.toLocaleString()} RPM` : "—"} />
          <Stat icon={<Wind className="h-3.5 w-3.5" />} label="HEALTH INDEX" value={isLive ? `${healthIndex} / 100` : "—"} highlight={isCritical ? "red" : isWarning ? "amber" : "emerald"} />
          <Stat icon={<Clock className="h-3.5 w-3.5" />} label="MISSION ELAPSED" value={metHms(metSeconds)} />
        </div>

        {/* Right: system clocks & link quality */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <div className="hidden flex-col items-end leading-none lg:flex">
            <span className="text-muted-foreground">ZULU TIME</span>
            <span className="font-medium text-foreground">
              <LiveClock />
            </span>
          </div>
          <div className="hidden h-6 w-px bg-border lg:block" />
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              isLive
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            <Radio className="h-3 w-3" />
            {isLive ? "WS LIVE · 10 Hz" : connectionStatus.toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Tactical Flight Ribbon (Profile Switcher + Speed + Safe Return) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs font-mono">
        {/* Left: Mission Profile Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase font-bold text-muted-foreground mr-1 flex items-center gap-1">
            <Sliders className="size-3 text-primary" /> PROFILE:
          </span>
          {[
            { id: "NORMAL", label: "NORMAL ISR" },
            { id: "HIGH_ALTITUDE", label: "HIGH-ALT" },
            { id: "HOT_WEATHER", label: "HOT-WX" },
            { id: "ENDURANCE", label: "MAX-LOITER" },
            { id: "RAPID_THROTTLE", label: "RAPID-RPM" },
          ].map((prof) => {
            const isSelected = currentMode === prof.id
            return (
              <button
                key={prof.id}
                onClick={() => handleSelectProfile(prof.id)}
                className={`px-2 py-1 rounded text-[10px] font-bold tracking-tight transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs ring-1 ring-primary"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {prof.label}
              </button>
            )
          })}
        </div>

        {/* Right: Simulation Speed + Safe Return */}
        <div className="flex items-center gap-2">
          {/* Speed Multipliers */}
          <div className="flex items-center bg-muted/60 rounded p-0.5 border border-border/50">
            <button
              onClick={handleTogglePause}
              className={`p-1 rounded text-[10px] hover:bg-background ${
                isPaused ? "text-amber-500 font-bold" : "text-muted-foreground"
              }`}
              title={isPaused ? "Resume telemetry" : "Pause telemetry"}
            >
              {isPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
            </button>
            {[1.0, 2.0, 5.0].map((spd) => (
              <button
                key={spd}
                onClick={() => handleSetSpeed(spd)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  currentSpeed === spd
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Emergency Safe Return Link */}
          <Link href="/mission-command">
            <Button
              size="sm"
              variant={isCritical ? "destructive" : "outline"}
              className={`h-7 px-2.5 text-[11px] font-bold font-mono tracking-tight gap-1.5 ${
                isCritical
                  ? "animate-pulse ring-2 ring-destructive"
                  : isWarning
                  ? "border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  : "hover:border-primary/50 text-foreground"
              }`}
            >
              <ShieldAlert className="size-3.5" />
              <span>SAFE RETURN</span>
              <ChevronRight className="size-3" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: "red" | "amber" | "emerald"
}) {
  const valueColor =
    highlight === "red"
      ? "text-red-500"
      : highlight === "amber"
      ? "text-amber-500"
      : highlight === "emerald"
      ? "text-emerald-500"
      : "text-foreground"

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="font-mono text-[9px] tracking-widest uppercase">{label}</span>
      </span>
      <span className={`font-mono text-sm font-bold tabular-nums ${valueColor}`}>
        {value}
      </span>
    </div>
  )
}
