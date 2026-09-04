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
  ChartTooltipContent,
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

// ─── Chart modes ──────────────────────────────────────────────────────────────

type ChartMode = "temperatures" | "propulsion" | "rul"

const MODES: { value: ChartMode; label: string; shortLabel: string }[] = [
  { value: "temperatures", label: "Temperatures (CHT & EGT)",      shortLabel: "Temps" },
  { value: "propulsion",   label: "Propulsion (RPM & Oil Press)",   shortLabel: "Props" },
  { value: "rul",          label: "Prognostic Trajectory (RUL)",    shortLabel: "RUL"   },
]

// ─── Chart configs per mode ───────────────────────────────────────────────────

const CHART_CONFIGS: Record<ChartMode, ChartConfig> = {
  temperatures: {
    primary:   { label: "EGT (°F)",  color: "var(--chart-1)" },
    secondary: { label: "CHT (°F)",  color: "var(--chart-2)" },
  },
  propulsion: {
    primary:   { label: "RPM",          color: "var(--chart-1)" },
    secondary: { label: "Oil Press (PSI)", color: "var(--chart-3)" },
  },
  rul: {
    primary:   { label: "Predicted RUL", color: "var(--chart-1)" },
    secondary: { label: "True RUL",      color: "var(--chart-4)" },
    ciLower:   { label: "CI Lower 90%",  color: "var(--chart-5)" },
    ciUpper:   { label: "CI Upper 90%",  color: "var(--chart-5)" },
  } as ChartConfig,
}

// ─── Window sizes ─────────────────────────────────────────────────────────────

const WINDOW_SIZES: Record<string, number> = { "90c": 90, "30c": 30, "10c": 10 }

// ─── Build chart data from rolling histories ──────────────────────────────────

function buildChartData(
  mode: ChartMode,
  sparklineHistory: ReturnType<typeof useTelemetry>["sparklineHistory"],
  rulHistory: ReturnType<typeof useTelemetry>["rulHistory"],
  windowSize: number
) {
  if (mode === "rul") {
    const slice = rulHistory.slice(-windowSize)
    return slice.map((p) => ({
      cycle: p.cycle,
      primary:   p.predicted_rul,
      secondary: p.true_rul ?? p.predicted_rul,
      ciLower:   p.rul_ci_lower,
      ciUpper:   p.rul_ci_upper,
    }))
  }

  if (mode === "temperatures") {
    const egt = sparklineHistory["egt"] ?? []
    const cht = sparklineHistory["cht"] ?? []
    const len = Math.min(egt.length, cht.length)
    const slice = Math.min(len, windowSize)
    return egt.slice(-slice).map((p, i) => ({
      cycle:     p.cycle,
      primary:   p.value,
      secondary: cht[cht.length - slice + i]?.value ?? 0,
    }))
  }

  // propulsion
  const rpm  = sparklineHistory["rpm"] ?? []
  const oil  = sparklineHistory["oil_pressure"] ?? []
  const len  = Math.min(rpm.length, oil.length)
  const slice = Math.min(len, windowSize)
  return rpm.slice(-slice).map((p, i) => ({
    cycle:     p.cycle,
    primary:   p.value,
    secondary: (oil[oil.length - slice + i]?.value ?? 0) * 20, // scale PSI onto RPM axis
    oilRaw:    oil[oil.length - slice + i]?.value ?? 0,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [windowKey, setWindowKey] = React.useState("90c")
  const [mode, setMode] = React.useState<ChartMode>("temperatures")

  const activeWindowKey = isMobile ? "10c" : windowKey
  const windowSize = WINDOW_SIZES[activeWindowKey] ?? 90

  const { sparklineHistory, rulHistory, connectionStatus } = useTelemetry()
  const chartConfig = CHART_CONFIGS[mode]

  const data = React.useMemo(
    () => buildChartData(mode, sparklineHistory, rulHistory, windowSize),
    [mode, sparklineHistory, rulHistory, windowSize]
  )

  const isEmpty = data.length === 0
  const isRul   = mode === "rul"
  const isProps = mode === "propulsion"

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>ENGINE TELEMETRY TREND</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Live propulsion telemetry — {MODES.find((m) => m.value === mode)?.label}
          </span>
          <span className="@[540px]/card:hidden">Live sensor history</span>
        </CardDescription>
        <CardAction>
          {/* Mode selector */}
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as ChartMode)}
          >
            <SelectTrigger className="mr-1 w-36 text-xs @[767px]/card:hidden" size="sm">
              <SelectValue placeholder="Temperatures" />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.shortLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden items-center gap-1 @[767px]/card:flex">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  mode === m.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {m.shortLabel}
              </button>
            ))}
          </div>

          {/* Window selector */}
          <ToggleGroup
            multiple={false}
            value={activeWindowKey ? [activeWindowKey] : []}
            onValueChange={(value) => { setWindowKey(value[0] ?? "90c") }}
            variant="outline"
            className="ml-1 hidden *:data-[slot=toggle-group-item]:px-3! @[767px]/card:flex"
          >
            <ToggleGroupItem value="90c">90</ToggleGroupItem>
            <ToggleGroupItem value="30c">30</ToggleGroupItem>
            <ToggleGroupItem value="10c">10</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isEmpty ? (
          <div className="flex aspect-auto h-62.5 w-full items-center justify-center text-sm text-muted-foreground">
            {connectionStatus === "live"
              ? "Collecting telemetry data…"
              : connectionStatus === "connecting"
              ? "Connecting to WebSocket…"
              : "Telemetry disconnected"}
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-62.5 w-full"
          >
            <AreaChart data={data} margin={{ left: 0, right: 0 }}>
              <defs>
                <linearGradient id="fillPrimary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-primary)"   stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-primary)"   stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillSecondary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-secondary)" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="var(--color-secondary)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="cycle"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={20}
                tickFormatter={(v) => `C${v}`}
              />
              {isRul && (
                <ReferenceLine
                  y={20}
                  stroke="var(--destructive)"
                  strokeDasharray="4 4"
                  label={{ value: "CRITICAL", position: "insideTopRight", fontSize: 9 }}
                />
              )}
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => `Cycle ${v}`}
                    formatter={(value, name) => {
                      const numVal = Number(value)
                      if (isProps && name === "secondary") {
                        return [`${(numVal / 20).toFixed(1)} PSI`, "Oil Press"]
                      }
                      return [
                        typeof value === "number" ? value.toFixed(1) : String(value),
                        chartConfig[name as keyof typeof chartConfig]?.label ?? String(name),
                      ]
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="secondary"
                type="monotone"
                fill="url(#fillSecondary)"
                stroke="var(--color-secondary)"
                strokeWidth={1.5}
                dot={false}
              />
              <Area
                dataKey="primary"
                type="monotone"
                fill="url(#fillPrimary)"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
              />
              {isRul && (
                <>
                  <Area
                    dataKey="ciLower"
                    type="monotone"
                    fill="none"
                    stroke="var(--color-ciLower)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                  <Area
                    dataKey="ciUpper"
                    type="monotone"
                    fill="none"
                    stroke="var(--color-ciUpper)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
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
