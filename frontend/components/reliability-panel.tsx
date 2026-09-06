"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  InfoIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"

// Approximate Gamma(1 + 1/beta) via Lanczos approximation for Weibull MTBF
function gammaWeibull(beta: number): number {
  const z = 1 + 1 / Math.max(0.1, beta)
  // Stirling / Lanczos approximation
  const g = 7
  const C = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109583659912,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  let x = C[0]
  for (let i = 1; i < g + 2; i++) {
    x += C[i] / (z + i - 1)
  }
  const t = z + g - 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z - 0.5) * Math.exp(-t) * x
}

export function ReliabilityHazardPanel() {
  const { latestTelemetry } = useTelemetry()

  const cycle = latestTelemetry?.cycle ?? 35
  const rul = latestTelemetry?.predicted_rul ?? 220
  const eta = 260.0 // Characteristic life in flight cycles

  // Determine Weibull parameters dynamically based on wear & cycle
  const beta = React.useMemo(() => {
    if (cycle < 20) return 0.85 // Infant mortality
    if (cycle > 180 || rul < 50) return 2.85 // Accelerated wear-out
    // Normal useful life progressing toward wear-out
    return 1.05 + 1.2 * Math.pow(cycle / eta, 1.8)
  }, [cycle, rul, eta])

  // Bathtub Phase
  const bathtubPhase = React.useMemo(() => {
    if (beta < 0.95) return { name: "Infant Mortality (Phase 1)", color: "text-amber-400", badge: "RUN-IN" }
    if (beta <= 1.45) return { name: "Useful Life / Constant Hazard (Phase 2)", color: "text-emerald-400", badge: "STABLE" }
    return { name: "Wear-Out & Mechanical Fatigue (Phase 3)", color: "text-destructive", badge: "WEAR-OUT" }
  }, [beta])

  // MTBF (Mean Time Between Failures)
  const mtbfCycles = React.useMemo(() => {
    return eta * gammaWeibull(beta)
  }, [eta, beta])

  // B10 Life: cycle at which 10% of fleet experiences wear-out
  const b10Cycles = React.useMemo(() => {
    return eta * Math.pow(-Math.log(0.9), 1 / beta)
  }, [eta, beta])

  // Current instantaneous hazard rate lambda(t) per 1,000 cycles
  const currentHazard = React.useMemo(() => {
    const t = Math.max(1, cycle)
    const lam = (beta / eta) * Math.pow(t / eta, beta - 1)
    return lam * 1000.0 // per 1000 cycles
  }, [cycle, beta, eta])

  // Generate Bathtub curve points: lambda(t) across 0 to 260 cycles
  const bathtubData = React.useMemo(() => {
    const points = []
    for (let t = 1; t <= 260; t += 8) {
      // Classic bathtub piecewise composite:
      // Infant term: 3.5 * exp(-t / 15)
      // Constant random term: 0.8
      // Wearout Weibull term: (3.2 / 260) * (t / 260)^2.2 * 1000
      const infantTerm = 4.2 * Math.exp(-t / 18)
      const randomTerm = 0.65
      const wearTerm = (3.0 / eta) * Math.pow(t / eta, 2.5) * 1000
      const lambdaVal = Number((infantTerm + randomTerm + wearTerm).toFixed(2))

      // Reliability R(t) = exp(-(t/eta)^beta) * 100%
      const rVal = Number((Math.exp(-Math.pow(t / eta, beta)) * 100).toFixed(1))

      points.push({
        cycle: t,
        hazard_rate: lambdaVal,
        reliability_pct: rVal,
      })
    }
    return points
  }, [beta, eta])

  return (
    <Card className="bg-card/80 border border-border/70">
      <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">Reliability & Bathtub Hazard Rate Analysis</CardTitle>
            <Badge variant="outline" className={`text-[10px] font-mono border-current ${bathtubPhase.color}`}>
              {bathtubPhase.badge}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Weibull survival analysis $\lambda(t)$, Mean Time Between Failures (MTBF), and B10 design life tracking.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-muted-foreground">Bathtub Curve: </span>
          <span className={`font-semibold ${bathtubPhase.color}`}>{bathtubPhase.name}</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Metric KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Weibull Shape ($\beta$)
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-foreground">
              {beta.toFixed(2)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {beta < 1 ? "Infant burn-in" : beta <= 1.5 ? "Constant hazard" : "Wear-out mode"}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Instantaneous Hazard $\lambda(t)$
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-primary">
              {currentHazard.toFixed(2)} <span className="text-xs font-normal">/ 1kc</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Failures per 1,000 flight cycles
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Estimated MTBF
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
              {Math.round(mtbfCycles)} cycles
            </div>
            <div className="text-[11px] text-muted-foreground">
              Mean Time Between Failures
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              B10 Life Limit
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-400">
              {Math.round(b10Cycles)} cycles
            </div>
            <div className="text-[11px] text-muted-foreground">
              10% fleet wear-out threshold
            </div>
          </div>
        </div>

        {/* Chart: Bathtub Hazard Rate Curve */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Bathtub Hazard Rate Curve $\lambda(t)$ vs Flight Cycles</span>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-primary" /> Hazard Rate $\lambda(t)$
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-emerald-400" /> Reliability $R(t)$ %
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="inline-block size-2 rounded-full bg-amber-400" /> Current Operating Point (C{cycle})
              </span>
            </div>
          </div>

          <div className="h-64 w-full border border-border/50 rounded-lg p-2 bg-card/60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bathtubData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hazardGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                <XAxis
                  dataKey="cycle"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                  tickFormatter={(c) => `C${c}`}
                />
                <YAxis
                  yAxisId="hazard"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                  label={{ value: "Hazard λ / 1kc", angle: -90, position: "insideLeft", fill: "currentColor", opacity: 0.6, fontSize: 9 }}
                />
                <YAxis
                  yAxisId="rel"
                  orientation="right"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    borderColor: "rgba(255,255,255,0.15)",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                  formatter={(val: any, name: any) => [
                    name === "hazard_rate" ? `${val} / 1kc` : `${val}%`,
                    name === "hazard_rate" ? "Hazard Rate λ(t)" : "Reliability R(t)",
                  ]}
                  labelFormatter={(label) => `Flight Cycle ${label}`}
                />

                {/* Vertical reference for current operating cycle */}
                <ReferenceLine
                  yAxisId="hazard"
                  x={cycle}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{ value: `C${cycle}`, position: "insideTopLeft", fill: "#f59e0b", fontSize: 10, fontWeight: "bold" }}
                />

                {/* Curves */}
                <Area
                  yAxisId="hazard"
                  dataKey="hazard_rate"
                  type="monotone"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="url(#hazardGrad)"
                />
                <Line
                  yAxisId="rel"
                  dataKey="reliability_pct"
                  type="monotone"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="3 3"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
