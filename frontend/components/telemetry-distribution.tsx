"use client"

import * as React from "react"
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Flame,
  Gauge,
  Droplets,
  Zap,
  Sliders,
  Radio,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"

type ChannelCategory = "ALL" | "THERMAL" | "PROPULSION" | "LUBRICATION" | "AVIONICS"

interface ChannelDef {
  id: string
  name: string
  subsystem: "THERMAL" | "PROPULSION" | "LUBRICATION" | "AVIONICS"
  unit: string
  getValue: (t: any) => number
  format: (v: number) => string
  status: (v: number) => "nom" | "warn" | "crit"
  limits: string
  sparkKey?: string
}

function MiniSparkline({
  points,
  status,
}: {
  points?: number[]
  status: "nom" | "warn" | "crit"
}) {
  if (!points || points.length < 2) {
    return (
      <div className="h-4 w-14 bg-muted/40 rounded flex items-center justify-center">
        <span className="text-[8px] text-muted-foreground/50">10Hz</span>
      </div>
    )
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 56
  const h = 16

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * w
    const y = h - ((val - min) / range) * (h - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const path = `M ${coords.join(" L ")}`
  const strokeColor =
    status === "crit"
      ? "#ef4444"
      : status === "warn"
      ? "#f59e0b"
      : "#10b981"

  return (
    <svg width={w} height={h} className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TelemetryDistribution() {
  const { latestTelemetry: t, sparklineHistory } = useTelemetry()
  const [filter, setFilter] = React.useState<ChannelCategory>("ALL")

  const sensorIntegrity = t?.sensor_integrity ?? {}
  const trustScore = Math.round(sensorIntegrity.integrity_score ?? 99.4)
  const isDegradedSensor = trustScore < 90

  const channels: ChannelDef[] = [
    {
      id: "cht-1",
      name: "CHT Cyl 1",
      subsystem: "THERMAL",
      unit: "°F",
      getValue: (t) => t?.cht_cyl?.[0] ?? (t?.cht ? t.cht - 3 : 378),
      format: (v) => v.toFixed(1),
      status: (v) => (v > 435 ? "crit" : v > 410 ? "warn" : "nom"),
      limits: "< 410°F",
      sparkKey: "cht",
    },
    {
      id: "cht-2",
      name: "CHT Cyl 2",
      subsystem: "THERMAL",
      unit: "°F",
      getValue: (t) => t?.cht_cyl?.[1] ?? (t?.cht ? t.cht - 1 : 380),
      format: (v) => v.toFixed(1),
      status: (v) => (v > 435 ? "crit" : v > 410 ? "warn" : "nom"),
      limits: "< 410°F",
      sparkKey: "cht",
    },
    {
      id: "cht-3",
      name: "CHT Cyl 3",
      subsystem: "THERMAL",
      unit: "°F",
      getValue: (t) => t?.cht_cyl?.[2] ?? (t?.cht ? t.cht + 2 : 385),
      format: (v) => v.toFixed(1),
      status: (v) => (v > 435 ? "crit" : v > 410 ? "warn" : "nom"),
      limits: "< 410°F",
      sparkKey: "cht",
    },
    {
      id: "cht-4",
      name: "CHT Cyl 4",
      subsystem: "THERMAL",
      unit: "°F",
      getValue: (t) => t?.cht_cyl?.[3] ?? (t?.cht ? t.cht + 4 : 388),
      format: (v) => v.toFixed(1),
      status: (v) => (v > 435 ? "crit" : v > 410 ? "warn" : "nom"),
      limits: "< 410°F",
      sparkKey: "cht",
    },
    {
      id: "egt-avg",
      name: "Exhaust EGT",
      subsystem: "THERMAL",
      unit: "°F",
      getValue: (t) => t?.egt ?? 1465,
      format: (v) => Math.round(v).toString(),
      status: (v) => (v > 1680 ? "crit" : v > 1600 ? "warn" : "nom"),
      limits: "< 1600°F",
      sparkKey: "egt",
    },
    {
      id: "engine-rpm",
      name: "Crankshaft RPM",
      subsystem: "PROPULSION",
      unit: "RPM",
      getValue: (t) => t?.rpm ?? 2400,
      format: (v) => Math.round(v).toLocaleString(),
      status: (v) => (v > 2800 ? "crit" : v > 2650 ? "warn" : "nom"),
      limits: "1200-2650",
      sparkKey: "rpm",
    },
    {
      id: "map-press",
      name: "Manifold MAP",
      subsystem: "PROPULSION",
      unit: "kPa",
      getValue: (t) => t?.map_kpa ?? 98.4,
      format: (v) => v.toFixed(1),
      status: (v) => (v > 115 ? "crit" : v > 108 ? "warn" : "nom"),
      limits: "30-108 kPa",
      sparkKey: "map_kpa",
    },
    {
      id: "fuel-flow",
      name: "Fuel Flow",
      subsystem: "PROPULSION",
      unit: "GPH",
      getValue: (t) => t?.fuel_flow ?? 7.8,
      format: (v) => v.toFixed(1),
      status: (v) => (v > 17 ? "crit" : v > 14 ? "warn" : "nom"),
      limits: "4.0-14.0",
      sparkKey: "fuel_flow",
    },
    {
      id: "oil-press",
      name: "Oil Gallery Press",
      subsystem: "LUBRICATION",
      unit: "PSI",
      getValue: (t) => t?.oil_pressure ?? 52.4,
      format: (v) => v.toFixed(1),
      status: (v) => (v < 30 ? "crit" : v < 40 || v > 85 ? "warn" : "nom"),
      limits: "40-85 PSI",
      sparkKey: "oil_p",
    },
    {
      id: "oil-temp",
      name: "Oil Sump Temp",
      subsystem: "LUBRICATION",
      unit: "°F",
      getValue: (t) => t?.oil_temp ?? 186.2,
      format: (v) => Math.round(v).toString(),
      status: (v) => (v > 245 ? "crit" : v > 230 ? "warn" : "nom"),
      limits: "140-230°F",
      sparkKey: "oil_t",
    },
    {
      id: "vibe-g",
      name: "Vibration RMS",
      subsystem: "AVIONICS",
      unit: "g",
      getValue: (t) => t?.vibration_g ?? 1.45,
      format: (v) => v.toFixed(2),
      status: (v) => (v > 4.5 ? "crit" : v > 3.0 ? "warn" : "nom"),
      limits: "< 3.0g",
      sparkKey: "vibration_g",
    },
    {
      id: "bus-volt",
      name: "Avionics Bus 28V",
      subsystem: "AVIONICS",
      unit: "V",
      getValue: (t) => t?.bus_voltage ?? 27.8,
      format: (v) => v.toFixed(1),
      status: (v) => (v < 24.0 ? "crit" : v < 26.0 || v > 29.5 ? "warn" : "nom"),
      limits: "26.0-29.5V",
      sparkKey: "bus_voltage",
    },
  ]

  const filteredChannels =
    filter === "ALL"
      ? channels
      : channels.filter((c) => c.subsystem === filter)

  // Status counts
  const critCount = channels.filter((c) => c.status(c.getValue(t)) === "crit").length
  const warnCount = channels.filter((c) => c.status(c.getValue(t)) === "warn").length

  return (
    <Card className="border-border bg-card/90 shadow-md flex flex-col h-full">
      <CardHeader className="p-4 pb-2 border-b border-border/60 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold tracking-wide">
              12-CHANNEL TELEMETRY MATRIX
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] ${
              isDegradedSensor
                ? "border-amber-500 text-amber-500 bg-amber-500/10"
                : "border-emerald-500 text-emerald-500 bg-emerald-500/10"
            }`}
          >
            KALMAN TRUST: {trustScore}%
          </Badge>
        </div>
        <CardDescription className="text-xs flex items-center justify-between mt-1">
          <span>Real-time cross-channel acquisition @ 10 Hz</span>
          <span className="font-mono text-[11px] font-semibold">
            {critCount > 0 ? (
              <span className="text-destructive font-bold">🔴 {critCount} EXCEEDANCE</span>
            ) : warnCount > 0 ? (
              <span className="text-amber-500 font-bold">🟡 {warnCount} CAUTION</span>
            ) : (
              <span className="text-emerald-500">🟢 12/12 NOMINAL</span>
            )}
          </span>
        </CardDescription>

        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-1 mt-2 pt-1 border-t border-border/40">
          {(["ALL", "THERMAL", "PROPULSION", "LUBRICATION", "AVIONICS"] as ChannelCategory[]).map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                  filter === cat
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            )
          )}
        </div>
      </CardHeader>

      <CardContent className="p-2.5 flex-1 overflow-y-auto max-h-[380px]">
        <div className="grid grid-cols-1 gap-1.5 font-mono text-xs">
          {filteredChannels.map((channel) => {
            const val = channel.getValue(t)
            const stat = channel.status(val)
            const rawHistory = channel.sparkKey
              ? (sparklineHistory as Record<string, any[]>)?.[channel.sparkKey]
              : undefined
            const sparkPoints: number[] | undefined = Array.isArray(rawHistory)
              ? rawHistory.slice(-15).map((pt: any) => (typeof pt === "number" ? pt : pt?.value ?? 0))
              : undefined

            const statusBorder =
              stat === "crit"
                ? "border-destructive/60 bg-destructive/10 text-destructive"
                : stat === "warn"
                ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
                : "border-border/40 bg-background/60 hover:bg-muted/30"

            return (
              <div
                key={channel.id}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border transition-colors ${statusBorder}`}
              >
                {/* Channel Name & Subsystem */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`size-1.5 rounded-full shrink-0 ${
                      stat === "crit"
                        ? "bg-destructive animate-ping"
                        : stat === "warn"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  <div className="flex flex-col leading-tight truncate">
                    <span className="font-semibold text-foreground text-[11px] truncate">
                      {channel.name}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      Limit: {channel.limits}
                    </span>
                  </div>
                </div>

                {/* Sparkline & Current Value */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="hidden sm:block">
                    <MiniSparkline points={sparkPoints} status={stat} />
                  </div>
                  <div className="text-right min-w-[62px]">
                    <span className="font-bold text-[12px] tabular-nums">
                      {channel.format(val)}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-1">
                      {channel.unit}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
