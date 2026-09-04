"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertCircleIcon, CheckCircle2Icon, GaugeIcon, ShieldAlertIcon, SparklesIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"

export function PrognosticsPanel() {
  const { latestTelemetry, rulHistory } = useTelemetry()

  const predRul = latestTelemetry?.predicted_rul ?? 0
  const trueRul = latestTelemetry?.true_rul ?? 0
  const ciLower = latestTelemetry?.rul_ci_lower ?? 0
  const ciUpper = latestTelemetry?.rul_ci_upper ?? 0
  const failProb = latestTelemetry?.failure_probability ?? 0
  const bufPct = latestTelemetry?.buffer_pct ?? 0

  // 4-Cylinder arrays
  const chts = latestTelemetry?.cht_cyl ?? [latestTelemetry?.cht ?? 410, latestTelemetry?.cht ?? 410, latestTelemetry?.cht ?? 410, latestTelemetry?.cht ?? 410]
  const egts = latestTelemetry?.egt_cyl ?? [latestTelemetry?.egt ?? 1600, latestTelemetry?.egt ?? 1600, latestTelemetry?.egt ?? 1600, latestTelemetry?.egt ?? 1600]
  const avgCht = chts.length ? chts.reduce((a, b) => a + b, 0) / chts.length : 410
  const spreadCht = chts.length ? Math.max(...chts) - Math.min(...chts) : 0

  // XAI Attribution data
  const xai = latestTelemetry?.xai
  const topDriver = xai?.top_driver ?? "VIBRATION"
  const xaiNarrative = xai?.narrative ?? "Multivariate sensor distribution tracking within expected 3σ learned latent manifold."

  // Twin consistency data
  const tc = latestTelemetry?.twin_consistency
  const consistencyScore = tc?.consistency_score ?? 92
  const tcCase = tc?.case ?? "A"
  const tcLabel = tc?.case_label ?? "Verified Physical Degradation"

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top Prognostics KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Predicted RUL</div>
          <div className="mt-1 font-mono text-2xl font-bold text-primary">
            {bufPct < 100 ? `BUF ${bufPct}%` : `${Math.round(predRul)} cycles`}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            True: {Math.round(trueRul)} cycles
          </div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">90% Confidence Band</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            [{Math.round(ciLower)}, {Math.round(ciUpper)}]
          </div>
          <div className="text-[11px] text-muted-foreground">Monte Carlo Dropout ±{((ciUpper - ciLower) / 2).toFixed(0)}c</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Failure Probability</div>
          <div className={`mt-1 font-mono text-2xl font-bold ${failProb > 0.5 ? "text-destructive" : failProb > 0.2 ? "text-amber-500" : "text-emerald-500"}`}>
            {(failProb * 100).toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted-foreground">Composite Weibull + LSTM</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Twin Consistency</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {consistencyScore.toFixed(0)}% <span className="text-xs font-normal text-muted-foreground">Case {tcCase}</span>
          </div>
          <div className="text-[11px] text-emerald-500 font-medium">{tcLabel}</div>
        </Card>
      </div>

      {/* ── Main Chart: RUL Trajectory with Uncertainty Band ──────────── */}
      <Card className="bg-card/80">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-semibold">Prognostics Remaining Useful Life Trajectory</CardTitle>
            <CardDescription className="text-xs">
              Deep LSTM inference with Monte Carlo Dropout uncertainty propagation vs ground truth wear progression.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary font-mono">
              MC-DROPOUT N=20
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-64 w-full">
            {rulHistory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Collecting flight cycles to build RUL trajectory…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rulHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rulCiGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="cycle" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }} tickFormatter={(c) => `C${c}`} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.95)", borderColor: "rgba(255,255,255,0.15)", borderRadius: "8px", fontSize: "11px", fontFamily: "monospace" }}
                    formatter={(val: any, name: any) => [
                      `${Math.round(Number(val))} cycles`,
                      name === "predicted_rul" ? "Predicted RUL" : name === "true_rul" ? "True RUL" : name === "rul_ci_upper" ? "CI Upper 90%" : "CI Lower 90%",
                    ]}
                    labelFormatter={(label) => `Flight Cycle ${label}`}
                  />
                  <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "CRITICAL 20c", position: "insideTopRight", fill: "#ef4444", fontSize: 9 }} />
                  {/* CI band area */}
                  <Area dataKey="rul_ci_upper" type="monotone" stroke="transparent" fill="url(#rulCiGrad)" />
                  <Area dataKey="rul_ci_lower" type="monotone" stroke="transparent" fill="#0c0d12" />
                  {/* Lines */}
                  <Line dataKey="predicted_rul" type="monotone" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  <Line dataKey="true_rul" type="monotone" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Row 2: 4-Cylinder Balance + Explainable AI Attribution ──────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Card 1: 4-Cylinder Thermal Balance */}
        <Card className="bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">4-Cylinder Head & Exhaust Balance</CardTitle>
              <CardDescription className="text-xs">
                Per-cylinder thermocouple symmetry across all four combustion chambers.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] font-mono ${
                spreadCht > 25 ? "border-destructive text-destructive" : spreadCht > 12 ? "border-amber-500 text-amber-500" : "border-emerald-500 text-emerald-500"
              }`}
            >
              Δ {spreadCht.toFixed(1)}°F · {spreadCht > 25 ? "HOT BIAS" : spreadCht > 12 ? "SPREAD" : "BALANCED"}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-4 divide-x divide-border/40 border-t border-border/60">
              {chts.map((cVal, idx) => {
                const cylNum = idx + 1
                const delta = cVal - avgCht
                const egtVal = egts[idx] ?? 0
                return (
                  <div key={idx} className="p-3 text-center">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">CYL {cylNum}</div>
                    <div className="mt-1 font-mono text-base font-bold text-foreground">
                      {cVal ? cVal.toFixed(1) : "—"}°F
                    </div>
                    <div className={`text-[10px] font-mono font-medium ${delta > 15 ? "text-destructive" : delta > 8 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}°F
                    </div>
                    <div className="mt-2 border-t border-border/30 pt-1 text-[10px] font-mono text-muted-foreground">
                      EGT: {egtVal ? egtVal.toFixed(0) : "—"}°F
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-3 text-[11px] text-muted-foreground border-t border-border/40">
              Average CHT: <span className="font-mono font-semibold text-foreground">{avgCht.toFixed(1)}°F</span>. Temperature spreads exceeding 25°F signify localized injector restriction or asymmetric cooling fin airflow.
            </div>
          </CardContent>
        </Card>

        {/* Card 2: XAI Anomaly Feature Attribution */}
        <Card className="bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Explainable AI (XAI) Attribution</CardTitle>
              <CardDescription className="text-xs">
                Subsystem sigma deviations ranking root contributors to current anomaly scores.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
              DRIVER: {topDriver}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-2 font-mono text-xs">
              {[
                { label: "Vibration Overall (RMS)", val: latestTelemetry?.vibration ?? 0.18, unit: "g", devPct: 82 },
                { label: "Cylinder Head Temp (CHT)", val: latestTelemetry?.cht ?? 412, unit: "°F", devPct: 64 },
                { label: "Exhaust Gas Temp (EGT)", val: latestTelemetry?.egt ?? 1605, unit: "°F", devPct: 45 },
                { label: "Oil Gallery Pressure", val: latestTelemetry?.oil_pressure ?? 42, unit: "PSI", devPct: 38 },
                { label: "Vibration Kurtosis", val: latestTelemetry?.vibration_kurtosis ?? 3.2, unit: "k4", devPct: 28 },
              ].map((item, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-sans">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="font-mono text-muted-foreground">
                      {item.val.toFixed(1)} {item.unit}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={`h-full rounded-full ${
                        item.devPct > 75 ? "bg-destructive" : item.devPct > 50 ? "bg-amber-500" : "bg-primary"
                      }`}
                      style={{ width: `${item.devPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded bg-muted/20 p-2.5 font-sans text-xs leading-relaxed text-muted-foreground border border-border/40">
              <span className="font-semibold text-foreground">Diagnostic Narrative: </span>
              {xaiNarrative}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
