"use client"

import * as React from "react"
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
} from "lucide-react"

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
  const { latestTelemetry: t, connectionStatus, metSeconds } = useTelemetry()

  const uavId = t?.uav_id ?? "UAV-01"
  const alertLevel = t?.alert ?? "NOMINAL"
  const healthIndex = Math.round(t?.health?.health_index ?? 94)
  const rpm = Math.round(t?.rpm ?? 0)
  const missionMode = (t?.mission_mode ?? "NORMAL").replace(/_/g, " ")
  const isAnomaly = t?.is_anomaly ?? false

  const isLive = connectionStatus === "live"
  const isCritical = alertLevel === "CRITICAL" || healthIndex < 40
  const isWarning = alertLevel === "WARNING" || isAnomaly

  // Status color
  const statusColor = isCritical
    ? "bg-red-600"
    : isWarning
    ? "bg-amber-500"
    : "bg-emerald-500"

  const statusText = isCritical
    ? "CRITICAL FAULT"
    : isWarning
    ? "ANOMALY DETECTED"
    : "SYSTEM NOMINAL"

  const statusBg = isCritical
    ? "bg-red-950/40 border-red-900/60"
    : isWarning
    ? "bg-amber-950/30 border-amber-900/50"
    : "bg-emerald-950/20 border-emerald-900/30"

  return (
    <div
      className={`mx-4 mb-1 mt-0 rounded-xl border px-5 py-3 lg:mx-6 ${statusBg} transition-colors duration-700`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: UAV ID + status */}
        <div className="flex items-center gap-3">
          {/* Status indicator dot */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${statusColor}`}
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
          <div className="hidden h-8 w-px bg-border/60 sm:block" />
          <div className="hidden flex-col leading-none sm:flex">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
              TWIN STATUS
            </span>
            <span
              className={`text-sm font-bold ${
                isCritical
                  ? "text-red-500"
                  : isWarning
                  ? "text-amber-500"
                  : "text-emerald-500"
              }`}
            >
              {statusText}
            </span>
          </div>
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
          <div className="hidden h-6 w-px bg-border/50 lg:block" />
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
              isLive
                ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/30"
                : "bg-muted text-muted-foreground ring-border"
            }`}
          >
            <Radio className="h-3 w-3" />
            {isLive ? "WS LIVE · 10 Hz" : connectionStatus.toUpperCase()}
          </div>
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
