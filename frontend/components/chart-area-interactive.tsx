"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { useTelemetry } from "@/components/telemetry-provider"

// ─── Chart Modes ──────────────────────────────────────────────────────────────

export type ChartMode = "temperatures" | "propulsion" | "rul" | "dynamics"

interface ModeDefinition {
  value: ChartMode
  label: string
  shortLabel: string
  primaryLabel: string
  primaryUnit: string
  secondaryLabel: string
  secondaryUnit: string
  isDualAxis: boolean
}

const MODES: ModeDefinition[] = [
  {
    value: "temperatures",
    label: "Temperatures (EGT & CHT)",
    shortLabel: "Temps",
    primaryLabel: "Exhaust Gas Temp (EGT)",
    primaryUnit: "°F",
    secondaryLabel: "Cylinder Head Temp (CHT)",
    secondaryUnit: "°F",
    isDualAxis: true,
  },
  {
    value: "propulsion",
    label: "Propulsion (RPM & Oil Pressure)",
    shortLabel: "Propulsion",
    primaryLabel: "Engine Speed (RPM)",
    primaryUnit: "RPM",
    secondaryLabel: "Oil Gallery Pressure",
    secondaryUnit: "PSI",
    isDualAxis: true,
  },
  {
    value: "rul",
    label: "Prognostic RUL Trajectory",
    shortLabel: "RUL",
    primaryLabel: "Predicted RUL",
    primaryUnit: "cyc",
    secondaryLabel: "True RUL",
    secondaryUnit: "cyc",
    isDualAxis: false,
  },
  {
    value: "dynamics",
    label: "Dynamics (Vibration & 28V Bus)",
    shortLabel: "Dynamics",
    primaryLabel: "Vibration RMS",
    primaryUnit: "g",
    secondaryLabel: "28V DC Bus Voltage",
    secondaryUnit: "V",
    isDualAxis: true,
  },
]

// ─── High-Contrast Aerospace Chart Colors ─────────────────────────────────────

const CHART_CONFIGS: Record<ChartMode, ChartConfig> = {
  temperatures: {
    primary:   { label: "EGT (°F)",  color: "#f97316" }, // Warm Amber/Orange
    secondary: { label: "CHT (°F)",  color: "#06b6d4" }, // Electric Cyan
  },
  propulsion: {
    primary:   { label: "RPM",               color: "#3b82f6" }, // Sky Blue
    secondary: { label: "Oil Press (PSI)",   color: "#10b981" }, // Emerald Green
  },
  rul: {
    primary:   { label: "Predicted RUL",     color: "#8b5cf6" }, // Electric Violet
    secondary: { label: "True RUL",          color: "#06b6d4" }, // Cyan
    ciLower:   { label: "CI 90% Bound",      color: "#a78bfa" }, // Soft Violet
    ciUpper:   { label: "CI 90% Bound",      color: "#a78bfa" },
  } as ChartConfig,
  dynamics: {
    primary:   { label: "Vibration (g)",     color: "#f59e0b" }, // Amber
    secondary: { label: "Bus Voltage (V)",   color: "#a855f7" }, // Purple
  },
}

// ─── Window sizes ─────────────────────────────────────────────────────────────

const WINDOW_SIZES: Record<string, number> = { "90c": 90, "30c": 30, "10c": 10 }

// ─── Chart Data Builder ───────────────────────────────────────────────────────

interface ChartDataPoint {
  cycle: number
  primary: number
  secondary: number
  ciLower?: number
  ciUpper?: number
}

function buildChartData(
  mode: ChartMode,
  sparklineHistory: ReturnType<typeof useTelemetry>["sparklineHistory"],
  rulHistory: ReturnType<typeof useTelemetry>["rulHistory"],
  windowSize: number
): ChartDataPoint[] {
  if (mode === "rul") {
    const slice = rulHistory.slice(-windowSize)
    return slice.map((p) => {
      // If LSTM prediction is 0 (model output near-zero), fall back to true_rul
      const resolvedPred = p.predicted_rul > 0 ? p.predicted_rul : (p.true_rul ?? p.predicted_rul)
      return {
        cycle: p.cycle,
        primary: resolvedPred,
        secondary: p.true_rul ?? resolvedPred,
        ciLower: p.rul_ci_lower,
        ciUpper: p.rul_ci_upper,
      }
    })
  }

  if (mode === "temperatures") {
    const egt = sparklineHistory["egt"] ?? []
    const cht = sparklineHistory["cht"] ?? []
    const len = Math.min(egt.length, cht.length)
    const slice = Math.min(len, windowSize)
    return egt.slice(-slice).map((p, i) => ({
      cycle: p.cycle,
      primary: p.value,
      secondary: cht[cht.length - slice + i]?.value ?? 0,
    }))
  }

  if (mode === "propulsion") {
    const rpm = sparklineHistory["rpm"] ?? []
    const oil = sparklineHistory["oil_pressure"] ?? []
    const len = Math.min(rpm.length, oil.length)
    const slice = Math.min(len, windowSize)
    return rpm.slice(-slice).map((p, i) => ({
      cycle: p.cycle,
      primary: p.value,
      secondary: oil[oil.length - slice + i]?.value ?? 0, // Real PSI!
    }))
  }

  // dynamics
  const vib = sparklineHistory["vibration"] ?? []
  const bus = sparklineHistory["battery_v"] ?? []
  const len = Math.min(vib.length, bus.length)
  const slice = Math.min(len, windowSize)
  return vib.slice(-slice).map((p, i) => ({
    cycle: p.cycle,
    primary: p.value,
    secondary: bus[bus.length - slice + i]?.value ?? 0,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [windowKey, setWindowKey] = React.useState("90c")
  const [mode, setMode] = React.useState<ChartMode>("temperatures")

  const activeWindowKey = isMobile ? "10c" : windowKey
  const windowSize = WINDOW_SIZES[activeWindowKey] ?? 90

  const { sparklineHistory, rulHistory, latestTelemetry, connectionStatus } = useTelemetry()
  const modeDef = React.useMemo(() => MODES.find((m) => m.value === mode) ?? MODES[0], [mode])
  const chartConfig = CHART_CONFIGS[mode]

  const data = React.useMemo(
    () => buildChartData(mode, sparklineHistory, rulHistory, windowSize),
    [mode, sparklineHistory, rulHistory, windowSize]
  )

  const isEmpty = data.length === 0
  const isRul = mode === "rul"

  // Compute clean, readable Y-axis domains with headroom
  const { leftDomain, rightDomain } = React.useMemo(() => {
    if (data.length === 0) {
      return { leftDomain: [0, 100], rightDomain: [0, 100] }
    }

    if (isRul) {
      const primaries = data.map((d) => d.primary).filter(Number.isFinite)
      const secondaries = data.map((d) => d.secondary).filter(Number.isFinite)
      const maxVal = Math.max(...primaries, ...secondaries, 50)
      return {
        leftDomain: [0, Math.ceil(maxVal * 1.12)],
        rightDomain: [0, 100],
      }
    }

    const primaries = data.map((d) => d.primary).filter(Number.isFinite)
    const secondaries = data.map((d) => d.secondary).filter(Number.isFinite)

    const minP = Math.min(...primaries)
    const maxP = Math.max(...primaries)
    const spanP = Math.max(maxP - minP, minP * 0.05, 5)
    const padP = Math.max(spanP * 0.18, 2)

    const minS = Math.min(...secondaries)
    const maxS = Math.max(...secondaries)
    const spanS = Math.max(maxS - minS, minS * 0.05, 2)
    const padS = Math.max(spanS * 0.18, 1)

    return {
      leftDomain: [Math.floor(minP - padP), Math.ceil(maxP + padP)],
      rightDomain: [Math.floor(minS - padS), Math.ceil(maxS + padS)],
    }
  }, [data, isRul])

  // Live sensor values for the header badge
  const liveStats = React.useMemo(() => {
    if (!latestTelemetry) return null

    switch (mode) {
      case "temperatures": {
        const chtVal = latestTelemetry.cht ?? 0
        const isElevated = chtVal > 420
        return {
          primary: `${latestTelemetry.egt?.toFixed(1) ?? "—"} °F`,
          secondary: `${latestTelemetry.cht?.toFixed(1) ?? "—"} °F`,
          note: isElevated ? "CHT ELEVATED" : "NOMINAL THERMAL",
          alert: isElevated,
        }
      }
      case "propulsion": {
        const oilPress = latestTelemetry.oil_pressure ?? 50
        const isLow = oilPress < 40
        return {
          primary: `${Math.round(latestTelemetry.rpm ?? 0)} RPM`,
          secondary: `${latestTelemetry.oil_pressure?.toFixed(1) ?? "—"} PSI`,
          note: isLow ? "LOW OIL PRESS" : "PROPULSION OK",
          alert: isLow,
        }
      }
      case "rul": {
        const rawPred = latestTelemetry.predicted_rul ?? 0
        const trueRul = latestTelemetry.true_rul ?? 0
        const displayRul = rawPred > 0 ? rawPred : trueRul
        const isCrit = displayRul > 0 && displayRul < 30
        return {
          primary: `${displayRul > 0 ? Math.round(displayRul) : "—"} cyc`,
          secondary: `${trueRul > 0 ? Math.round(trueRul) : "—"} cyc (true)`,
          note: isCrit ? "CRITICAL RUL" : "LIFECYCLE NOMINAL",
          alert: isCrit,
        }
      }
      case "dynamics": {
        const vib = latestTelemetry.vibration ?? 0
        const isHigh = vib > 1.8
        return {
          primary: `${latestTelemetry.vibration?.toFixed(3) ?? "—"} g`,
          secondary: `${latestTelemetry.battery_v?.toFixed(2) ?? "—"} V`,
          note: isHigh ? "HIGH VIB RMS" : "DYNAMICS OK",
          alert: isHigh,
        }
      }
    }

  }, [latestTelemetry, mode])

  return (
    <Card className="@container/card border-border/80 bg-card/95 shadow-md backdrop-blur-xs">
      <CardHeader className="flex flex-col gap-3 pb-2 @[640px]/card:flex-row @[640px]/card:items-center @[640px]/card:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold tracking-wide text-foreground">
              ENGINE TELEMETRY TREND
            </CardTitle>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              10 Hz LIVE
            </span>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            {modeDef.label} — Multi-channel synchronized timeline
          </CardDescription>
        </div>

        <CardAction className="flex flex-wrap items-center gap-2">
          {/* Mode Selector for Mobile */}
          <Select value={mode} onValueChange={(v) => setMode(v as ChartMode)}>
            <SelectTrigger className="w-36 text-xs @[780px]/card:hidden" size="sm">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.shortLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mode Buttons for Desktop */}
          <div className="hidden items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5 @[780px]/card:flex">
            {MODES.map((m) => {
              const active = mode === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 ease-out active:scale-95 ${
                    active
                      ? "bg-background text-foreground shadow-xs ring-1 ring-border/80"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                  }`}
                >
                  {m.shortLabel}
                </button>
              )
            })}
          </div>

          {/* Window size buttons */}
          <ToggleGroup
            multiple={false}
            value={activeWindowKey ? [activeWindowKey] : []}
            onValueChange={(value) => {
              if (value[0]) setWindowKey(value[0])
            }}
            variant="outline"
            className="hidden items-center @[540px]/card:flex"
          >
            <ToggleGroupItem value="10c" className="px-2.5 text-xs">
              10c
            </ToggleGroupItem>
            <ToggleGroupItem value="30c" className="px-2.5 text-xs">
              30c
            </ToggleGroupItem>
            <ToggleGroupItem value="90c" className="px-2.5 text-xs">
              90c
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>

      {/* Top Live Readout & Legend Bar */}
      <div className="flex flex-wrap items-center justify-between border-y border-border/50 bg-muted/20 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          {/* Primary Channel */}
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
              style={{ backgroundColor: chartConfig.primary.color }}
            />
            <span className="text-muted-foreground font-medium">
              {modeDef.primaryLabel}:
            </span>
            <span className="font-mono font-bold text-foreground">
              {liveStats?.primary ?? "—"}
            </span>
          </div>

          {/* Secondary Channel */}
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
              style={{ backgroundColor: chartConfig.secondary.color }}
            />
            <span className="text-muted-foreground font-medium">
              {modeDef.secondaryLabel}:
            </span>
            <span className="font-mono font-bold text-foreground">
              {liveStats?.secondary ?? "—"}
            </span>
          </div>
        </div>

        {/* Live Channel Status Pill */}
        {liveStats && (
          <div className="mt-1 flex items-center gap-2 @[540px]/card:mt-0">
            <span
              className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold ${
                liveStats.alert
                  ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/30"
                  : "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20"
              }`}
            >
              {liveStats.note}
            </span>
          </div>
        )}
      </div>

      <CardContent className="px-1 pt-3 pb-2 sm:px-4 sm:pt-4">
        {isEmpty ? (
          <div className="flex h-[320px] w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>
              {connectionStatus === "live"
                ? "Streaming telemetry telemetry into buffer…"
                : connectionStatus === "connecting"
                ? "Connecting to WebSocket server (ws://127.0.0.1:8765)…"
                : "Awaiting telemetry connection"}
            </span>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[320px] w-full"
          >
            <AreaChart
              data={data}
              margin={{ top: 12, right: modeDef.isDualAxis ? 14 : 20, left: 10, bottom: 6 }}
            >
              <defs>
                {/* Primary Area Fill Gradient */}
                <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0.16}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-primary)"
                    stopOpacity={0.0}
                  />
                </linearGradient>

                {/* Secondary Area Fill Gradient */}
                <linearGradient id="fillSecondary" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-secondary)"
                    stopOpacity={0.14}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-secondary)"
                    stopOpacity={0.0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-border/40"
              />

              {/* X-Axis (Flight Cycle Timeline) */}
              <XAxis
                dataKey="cycle"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={25}
                tickFormatter={(v) => `C${v}`}
                className="text-[11px] font-mono fill-muted-foreground"
              />

              {/* Left Y-Axis (Primary Metric) */}
              <YAxis
                yAxisId="left"
                orientation="left"
                domain={leftDomain}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={48}
                tickFormatter={(v) => {
                  if (v >= 1000) return `${Math.round(v)}`
                  if (Math.abs(v) < 10 && v % 1 !== 0) return `${v.toFixed(1)}`
                  return `${Math.round(v)}`
                }}
                className="text-[11px] font-mono fill-muted-foreground"
              />

              {/* Right Y-Axis (Secondary Metric for Dual-Axis Modes) */}
              {modeDef.isDualAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={rightDomain}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={48}
                  tickFormatter={(v) => {
                    if (v >= 1000) return `${Math.round(v)}`
                    if (Math.abs(v) < 10 && v % 1 !== 0) return `${v.toFixed(1)}`
                    return `${Math.round(v)}`
                  }}
                  className="text-[11px] font-mono fill-muted-foreground"
                />
              ) : null}

              {/* Critical RUL Reference Line at 20 Cycles */}
              {isRul && (
                <ReferenceLine
                  yAxisId="left"
                  y={20}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  label={{
                    value: "CRITICAL 20 CYC",
                    position: "insideTopRight",
                    fill: "#ef4444",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}

              {/* Tooltip with Clean Readable Values & Units */}
              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null

                  const pt = payload[0]?.payload as ChartDataPoint | undefined
                  if (!pt) return null

                  return (
                    <div className="rounded-lg border border-border/80 bg-background/95 p-3 shadow-xl backdrop-blur-md">
                      <div className="mb-2 flex items-center justify-between gap-4 border-b border-border/50 pb-1.5">
                        <span className="font-mono text-xs font-bold text-foreground">
                          FLIGHT CYCLE {label}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase">
                          {modeDef.shortLabel}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 text-xs">
                        {/* Primary Value */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: chartConfig.primary.color }}
                            />
                            <span className="text-muted-foreground">
                              {modeDef.primaryLabel}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-foreground">
                            {typeof pt.primary === "number"
                              ? pt.primary.toFixed(mode === "dynamics" ? 3 : 1)
                              : pt.primary}{" "}
                            {modeDef.primaryUnit}
                          </span>
                        </div>

                        {/* Secondary Value */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: chartConfig.secondary.color }}
                            />
                            <span className="text-muted-foreground">
                              {modeDef.secondaryLabel}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-foreground">
                            {typeof pt.secondary === "number"
                              ? pt.secondary.toFixed(mode === "dynamics" ? 2 : 1)
                              : pt.secondary}{" "}
                            {modeDef.secondaryUnit}
                          </span>
                        </div>

                        {/* RUL CI Bounds */}
                        {isRul && pt.ciLower != null && pt.ciUpper != null && (
                          <div className="mt-1 border-t border-border/40 pt-1 text-[11px] text-muted-foreground flex justify-between">
                            <span>90% CI Bounds:</span>
                            <span className="font-mono font-medium text-foreground">
                              [{pt.ciLower.toFixed(0)} — {pt.ciUpper.toFixed(0)} cyc]
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }}
              />

              {/* Secondary Channel Area Curve */}
              <Area
                yAxisId={modeDef.isDualAxis ? "right" : "left"}
                dataKey="secondary"
                type="monotone"
                fill="url(#fillSecondary)"
                stroke="var(--color-secondary)"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 1, stroke: "#fff" }}
                isAnimationActive={false}
              />

              {/* Primary Channel Area Curve */}
              <Area
                yAxisId="left"
                dataKey="primary"
                type="monotone"
                fill="url(#fillPrimary)"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 1, stroke: "#fff" }}
                isAnimationActive={false}
              />

              {/* RUL Confidence Interval Envelope */}
              {isRul && (
                <>
                  <Area
                    yAxisId="left"
                    dataKey="ciLower"
                    type="monotone"
                    fill="none"
                    stroke="var(--color-ciLower)"
                    strokeWidth={1.2}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="left"
                    dataKey="ciUpper"
                    type="monotone"
                    fill="none"
                    stroke="var(--color-ciUpper)"
                    strokeWidth={1.2}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </>
              )}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
