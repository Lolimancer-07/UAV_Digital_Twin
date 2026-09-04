"use client"

import * as React from "react"
import { ActivityIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTelemetry } from "@/components/telemetry-provider"
import type { SensorKey } from "@/lib/telemetry/types"

// ─── Sensor configuration ─────────────────────────────────────────────────────

interface SensorConfig {
  id: string
  label: string
  key: keyof ReturnType<typeof buildSensorValues>
  unit: string
  decimals: number
  warnHi?: number
  warnLo?: number
  critHi?: number
  critLo?: number
}

// Build all 12 sensor values in one place so the config array can reference them
function buildSensorValues(t: ReturnType<typeof useTelemetry>["latestTelemetry"]) {
  return {
    rpm:          t?.rpm              ?? 0,
    cht:          t?.cht              ?? 0,
    egt:          t?.egt              ?? 0,
    oil_pressure: t?.oil_pressure     ?? 0,
    oil_temp:     t?.oil_temp         ?? 0,
    fuel_flow:    t?.fuel_flow        ?? 0,
    fuel_rail:    t?.fuel_rail_pressure_bar ?? 0,
    vibration:    t?.vibration        ?? 0,
    vib_kurt:     t?.vibration_kurtosis ?? 0,
    battery_v:    t?.battery_v        ?? 0,
    bus_current:  t?.bus_current_a    ?? 0,
    inj_timing:   t?.inj_timing       ?? 0,
  }
}

const SENSOR_CONFIGS: SensorConfig[] = [
  { id: "01", label: "ENGINE SPEED",         key: "rpm",          unit: "RPM",    decimals: 0, warnHi: 5800, critHi: 6000, warnLo: 600,  critLo: 400  },
  { id: "02", label: "CYL HEAD TEMP",        key: "cht",          unit: "°F",     decimals: 1, warnHi: 450,  critHi: 500,  warnLo: 150                },
  { id: "03", label: "EXHAUST GAS TEMP",     key: "egt",          unit: "°F",     decimals: 1, warnHi: 1650, critHi: 1750                             },
  { id: "04", label: "OIL GALLERY PRESSURE", key: "oil_pressure", unit: "PSI",    decimals: 1, warnLo: 25,   critLo: 15,   warnHi: 80,  critHi: 90   },
  { id: "05", label: "OIL SUMP TEMP",        key: "oil_temp",     unit: "°F",     decimals: 1, warnHi: 240,  critHi: 260                              },
  { id: "06", label: "FUEL MASS FLOW",       key: "fuel_flow",    unit: "L/HR",   decimals: 2, warnHi: 18,   critHi: 20                               },
  { id: "07", label: "FUEL RAIL PRESSURE",   key: "fuel_rail",    unit: "BAR",    decimals: 2, warnLo: 2.0,  critLo: 1.5,  warnHi: 4.5, critHi: 5.0 },
  { id: "08", label: "VIBRATION RMS",        key: "vibration",    unit: "G",      decimals: 3, warnHi: 3.5,  critHi: 5.0                              },
  { id: "09", label: "VIBRATION KURTOSIS",   key: "vib_kurt",     unit: "K4",     decimals: 2, warnHi: 5.0,  critHi: 7.0                              },
  { id: "10", label: "28V ELECTRICAL BUS",   key: "battery_v",    unit: "VDC",    decimals: 2, warnLo: 12.5, critLo: 11.0, warnHi: 14.5, critHi: 15.0},
  { id: "11", label: "BUS CURRENT LOAD",     key: "bus_current",  unit: "A",      decimals: 1, warnHi: 38,   critHi: 44                               },
  { id: "12", label: "INJECTION TIMING",     key: "inj_timing",   unit: "°BTDC",  decimals: 1, warnLo: 14,   critLo: 12,   warnHi: 34,  critHi: 36   },
]

// Determine status badge given a sensor value and its thresholds
function getSensorStatus(value: number, cfg: SensorConfig): "NORM" | "WARN" | "CRIT" {
  if ((cfg.critHi != null && value >= cfg.critHi) || (cfg.critLo != null && value <= cfg.critLo)) return "CRIT"
  if ((cfg.warnHi != null && value >= cfg.warnHi) || (cfg.warnLo != null && value <= cfg.warnLo)) return "WARN"
  return "NORM"
}

const STATUS_COLORS: Record<"NORM" | "WARN" | "CRIT", string> = {
  NORM: "text-primary",
  WARN: "border-amber-500 text-amber-600 dark:text-amber-400",
  CRIT: "border-red-500 text-red-600 dark:text-red-400",
}

// ─── Sparkline using rolling history ─────────────────────────────────────────

const SPARKLINE_SENSOR_MAP: Record<string, SensorKey> = {
  "01": "rpm", "02": "cht", "03": "egt", "04": "oil_pressure",
  "05": "oil_temp", "06": "fuel_flow", "07": "fuel_rail_pressure_bar",
  "08": "vibration", "09": "vibration_kurtosis", "10": "battery_v",
  "11": "bus_current_a", "12": "inj_timing",
}

function Sparkline({ points, id }: { points: number[]; id: string }) {
  if (points.length < 2) {
    // Placeholder flat line while warming up
    return (
      <svg viewBox="0 0 120 24" preserveAspectRatio="none" className="mt-3 h-6 w-full text-primary/40" aria-hidden="true">
        <line x1="0" y1="12" x2="120" y2="12" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 120
  const h = 24
  const pad = 2
  const xs = points.map((_, i) => (i / (points.length - 1)) * w)
  const ys = points.map((v) => h - pad - ((v - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-6 w-full text-primary" aria-label={`Sensor ${id} sparkline`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TelemetryMatrix() {
  const { latestTelemetry: t, sparklineHistory, connectionStatus } = useTelemetry()
  const values = buildSensorValues(t)

  return (
    <section className="px-4 lg:px-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground">LIVE SENSOR ARRAY</p>
          <h2 className="mt-1 text-lg font-semibold tracking-wide">
            TELEMETRY MATRIX{" "}
            <span className="font-normal text-muted-foreground">— 12 SYNCHRONIZED SENSOR CHANNELS @ 10 HZ</span>
          </h2>
        </div>
        <Badge
          variant="outline"
          className={connectionStatus === "live" ? "text-primary" : "text-amber-500"}
        >
          <ActivityIcon />
          {connectionStatus === "live" ? "10.0 HZ · LIVE" : connectionStatus.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {SENSOR_CONFIGS.map((cfg) => {
          const value   = values[cfg.key]
          const status  = t ? getSensorStatus(value, cfg) : "NORM"
          const sensorKey = SPARKLINE_SENSOR_MAP[cfg.id] as SensorKey | undefined
          const history   = sensorKey ? (sparklineHistory[sensorKey] ?? []) : []
          const points    = history.map((p) => p.value)
          const displayVal = value.toFixed(cfg.decimals)

          return (
            <Card key={cfg.id} className="rounded-md border-border/80 bg-card/80">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-[10px] tracking-[0.12em] text-muted-foreground">
                  <span className="mr-2 font-mono text-primary">S-{cfg.id}</span>
                  {cfg.label}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`text-[9px] ${STATUS_COLORS[status]}`}
                >
                  {status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 font-mono text-2xl font-semibold">
                  {t ? displayVal : "—"}
                  <span className="text-xs font-normal text-muted-foreground">{cfg.unit}</span>
                </div>
                <Sparkline points={points} id={cfg.id} />
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
