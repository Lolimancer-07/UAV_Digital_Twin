"use client"

import * as React from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flag,
  Gauge,
  Map,
  MapPin,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTelemetry } from "@/components/telemetry-provider"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TimelinePoint {
  t: number; cycle: number; rul: number
  rulLower: number; rulUpper: number
  health: number; alert: string; projected?: boolean
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────

function RULTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TimelinePoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const alertColor = d.alert === "CRITICAL" ? "#ef4444" : d.alert === "WARNING" ? "#f59e0b" : "#22c55e"
  return (
    <div className="rounded-xl border border-border/60 bg-card/95 px-3.5 py-2.5 text-[11px] font-mono shadow-2xl backdrop-blur-lg ring-1 ring-white/5">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-1.5 rounded-full" style={{ background: alertColor }} />
        <span className="font-bold text-foreground">Cycle {d.cycle}</span>
        {d.projected && <Badge variant="outline" className="text-[8px] border-violet-500/40 text-violet-400 py-0">PROJECTED</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">RUL</span>
        <span className="font-bold" style={{ color: alertColor }}>{d.rul.toFixed(0)} cyc</span>
        <span className="text-muted-foreground">90% CI</span>
        <span className="text-cyan-400">[{d.rulLower.toFixed(0)}, {d.rulUpper.toFixed(0)}]</span>
        <span className="text-muted-foreground">Health</span>
        <span className="text-emerald-400">{d.health.toFixed(0)}%</span>
        <span className="text-muted-foreground">Alert</span>
        <span style={{ color: alertColor }}>{d.alert}</span>
      </div>
    </div>
  )
}

// ─── Go/No-Go card ─────────────────────────────────────────────────────────────

function GoNoGoCard({ rul, remaining, prob }: { rul: number; remaining: number; prob: number }) {
  const margin = rul - remaining
  const isGo = margin > 20 && prob > 70
  const isConditional = !isGo && margin > 0
  const isNoGo = margin <= 0

  const cfg = isGo
    ? { label: "GO — Continue Mission", icon: CheckCircle2, cl: "text-emerald-400", border: "border-emerald-500/25", bg: "from-emerald-500/8 to-transparent" }
    : isConditional
    ? { label: "CONDITIONAL GO — Monitor Closely", icon: AlertTriangle, cl: "text-amber-400", border: "border-amber-500/25", bg: "from-amber-500/8 to-transparent" }
    : { label: "NO-GO — Abort Recommended", icon: AlertTriangle, cl: "text-red-400", border: "border-red-500/25", bg: "from-red-500/8 to-transparent" }

  return (
    <div className={`rounded-2xl border ${cfg.border} bg-gradient-to-br ${cfg.bg} p-4`}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`rounded-lg border ${cfg.border} p-1.5 bg-card/60`}>
          <cfg.icon className={`size-4 ${cfg.cl}`} />
        </div>
        <span className={`text-sm font-bold font-mono tracking-wide ${cfg.cl}`}>{cfg.label}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "RUL Margin", value: `${margin > 0 ? "+" : ""}${margin.toFixed(0)}`, unit: "cycles", color: margin > 0 ? "#22c55e" : "#ef4444" },
          { label: "P(Complete)", value: `${prob.toFixed(0)}`, unit: "%", color: prob > 70 ? "#22c55e" : "#f59e0b" },
          { label: "Est. Remaining", value: `${remaining}`, unit: "cycles", color: "#06b6d4" },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center gap-0.5 rounded-xl bg-card/60 border border-border/40 py-3 px-2">
            <p className="text-[9px] font-mono text-muted-foreground text-center leading-tight">{s.label}</p>
            <p className="text-2xl font-mono font-bold tabular-nums leading-none mt-1.5" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[9px] font-mono text-muted-foreground">{s.unit}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Waypoint progress strip ────────────────────────────────────────────────────

function WaypointStrip({ waypoints, progress }: { waypoints: { id: string; name: string }[]; progress: number }) {
  const segs = waypoints.length - 1
  return (
    <div className="relative px-4 py-2">
      {/* Track background */}
      <div className="absolute top-1/2 left-6 right-6 h-0.5 -translate-y-1/2 bg-border/60 rounded-full" />
      {/* Progress fill */}
      <div
        className="absolute top-1/2 left-6 h-0.5 -translate-y-1/2 rounded-full transition-all duration-700"
        style={{
          width: `calc(${Math.min(progress, 100)}% * (100% - 3rem) / 100)`,
          background: "linear-gradient(to right, #06b6d4, #8b5cf6)",
          boxShadow: "0 0 6px #06b6d480",
        }}
      />
      {/* Dots */}
      <div className="relative flex justify-between px-0">
        {waypoints.map((wp, i) => {
          const pct = segs > 0 ? (i / segs) * 100 : 0
          const passed = progress >= pct
          const current = progress >= pct && (i === segs || progress < (segs > 0 ? ((i + 1) / segs) * 100 : 101))
          return (
            <div key={wp.id} className="flex flex-col items-center gap-1.5">
              <div className="relative">
                {current && (
                  <div className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: "#06b6d4", opacity: 0.35 }} />
                )}
                <div
                  className={`relative size-3 rounded-full border-2 transition-all duration-500 ${
                    passed ? "border-cyan-400 bg-cyan-500 shadow-[0_0_8px_#06b6d4]" : "border-border bg-card"
                  } ${current ? "scale-125" : ""}`}
                />
              </div>
              <span className="text-[8px] font-mono text-muted-foreground/70 whitespace-nowrap max-w-12 text-center leading-tight">
                {wp.name.split(" ")[0]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Scenario comparison ────────────────────────────────────────────────────────

function ScenarioCompare({ rul, continueDelta, rtlDelta }: { rul: number; continueDelta: number; rtlDelta: number }) {
  const cRul = Math.max(0, rul + continueDelta)
  const rRul = Math.max(0, rul + rtlDelta)
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Continue Mission", icon: TrendingDown, delta: continueDelta, endRul: cRul, color: "#f97316", border: "border-orange-500/25", bg: "from-orange-500/8" },
        { label: "Return to Launch", icon: TrendingUp, delta: rtlDelta, endRul: rRul, color: "#22c55e", border: "border-emerald-500/25", bg: "from-emerald-500/8" },
      ].map(s => (
        <div key={s.label} className={`rounded-2xl border ${s.border} bg-gradient-to-br ${s.bg} to-transparent p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <s.icon className="size-3.5" style={{ color: s.color }} />
            <span className="text-[10px] font-mono font-bold" style={{ color: s.color }}>{s.label}</span>
          </div>
          <div className="text-3xl font-mono font-bold tabular-nums" style={{ color: s.color }}>{s.endRul.toFixed(0)}</div>
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">projected RUL</div>
          <div className="mt-2 flex items-center gap-1">
            <div className="size-1.5 rounded-full" style={{ background: s.color }} />
            <span className="text-[9px] font-mono" style={{ color: s.color }}>
              {s.delta > 0 ? "+" : ""}{s.delta} cycles impact
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MissionTimeline() {
  const { latestTelemetry: t, rulHistory, metSeconds } = useTelemetry()

  const currentRul = t?.predicted_rul ?? 0
  const completionProb = t?.mission_risk?.mission_completion_probability ?? 88
  const progress = t?.mission_progress_pct ?? 31
  const safeTime = t?.mission_risk?.safe_operating_time_h ?? 3.2

  // Build historical data
  const historical: TimelinePoint[] = React.useMemo(() => rulHistory.map((p, i) => ({
    t: i, cycle: p.cycle,
    rul: p.predicted_rul,
    rulLower: p.rul_ci_lower ?? Math.max(0, p.predicted_rul - 12),
    rulUpper: p.rul_ci_upper ?? p.predicted_rul + 12,
    health: Math.max(20, Math.min(100, p.predicted_rul * 0.58 + 30)),
    alert: p.predicted_rul < 20 ? "CRITICAL" : p.predicted_rul < 50 ? "WARNING" : "NOMINAL",
  })), [rulHistory])

  // Forward projection — linear extrapolation
  const projected: TimelinePoint[] = React.useMemo(() => {
    if (historical.length < 3) return []
    const slice = historical.slice(-Math.min(12, historical.length))
    const slope = slice.length > 1 ? (slice[slice.length - 1].rul - slice[0].rul) / (slice.length - 1) : -0.5
    const last = slice[slice.length - 1]
    return Array.from({ length: 30 }, (_, i) => {
      const projRul = Math.max(0, last.rul + slope * (i + 1))
      return {
        t: last.t + i + 1, cycle: last.cycle + i + 1, rul: projRul, projected: true,
        rulLower: Math.max(0, projRul - 15 - (i + 1) * 0.35),
        rulUpper: projRul + 15 + (i + 1) * 0.35,
        health: Math.max(20, projRul * 0.58 + 30),
        alert: projRul < 20 ? "CRITICAL" : projRul < 50 ? "WARNING" : "NOMINAL",
      }
    })
  }, [historical])

  const allData = [...historical, ...projected]
  const nowCycle = historical[historical.length - 1]?.cycle
  const abortCycle = allData.find(d => d.rul <= 20)?.cycle
  const missionRemaining = Math.round((100 - progress) * 1.2)

  const waypoints = t?.mission_command?.route?.waypoints ?? [
    { id: "HOME", name: "Home Base" },
    { id: "ALPHA", name: "Alpha Ridge" },
    { id: "BRAVO", name: "Bravo Survey" },
    { id: "CHARLIE", name: "Charlie Loiter" },
    { id: "RETURN", name: "Return" },
  ]

  const rulTrend = historical.length >= 6
    ? historical[historical.length - 1].rul - historical[historical.length - 6].rul
    : 0

  const metFmt = `${Math.floor(metSeconds / 60)}:${String(metSeconds % 60).padStart(2, "0")}`

  const riskComponents = t?.mission_risk?.components
  // Backend provides components in [0, 100] percentage scale (e.g. 96.0 for 96%).
  // Normalize safely to [0, 1] fractions for SVG arcs, clamping between 0 and 1.
  const normFraction = (val: number | undefined, defaultFraction: number) => {
    if (val === undefined || val === null || isNaN(val)) return defaultFraction
    // Backend components are always 0..100 percentage values (e.g. 1.0 = 1%, 96.0 = 96%)
    const frac = val / 100
    return Math.max(0, Math.min(1, frac))
  }

  const rings = [
    { label: "Engine", v: normFraction(riskComponents?.engine_reliability, 0.92), color: "#8b5cf6" },
    { label: "Thermal", v: normFraction(riskComponents?.thermal_margin, 0.88), color: "#f59e0b" },
    { label: "RUL", v: normFraction(riskComponents?.rul_time_margin, 0.91), color: "#06b6d4" },
    { label: "Environ.", v: normFraction(riskComponents?.environmental, 0.95), color: "#22c55e" },
    { label: "Faults", v: normFraction(riskComponents?.fault_penalty, 0.95), color: "#ef4444" },
  ]

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
            <Map className="size-4 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Mission RUL Timeline</h1>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Predictive burn-down · 90% CI bands · {allData.length} data points
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] border-cyan-500/40 text-cyan-400 gap-1">
            <Clock className="size-2.5" />MET {metFmt}
          </Badge>
          <Badge variant="outline" className={`font-mono text-[10px] gap-1 ${rulTrend < -3 ? "border-red-500/40 text-red-400" : "border-emerald-500/40 text-emerald-400"}`}>
            {rulTrend < 0 ? <TrendingDown className="size-2.5" /> : <TrendingUp className="size-2.5" />}
            {rulTrend < 0 ? "" : "+"}{rulTrend.toFixed(1)}/6cyc
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px] border-amber-500/40 text-amber-400 gap-1">
            <Gauge className="size-2.5" />{Math.round(safeTime * 60)}min safe
          </Badge>
        </div>
      </div>

      {/* ── Go/No-Go ─────────────────────────────────────────────────────────── */}
      <GoNoGoCard rul={currentRul} remaining={missionRemaining} prob={completionProb} />

      {/* ── Waypoint strip ───────────────────────────────────────────────────── */}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="size-3.5 text-cyan-500" />
            Mission Route Progress
            <span className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">{progress.toFixed(0)}% complete</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-3">
          <WaypointStrip waypoints={waypoints} progress={progress} />
          <p className="text-[9px] font-mono text-muted-foreground/60 mt-1.5 px-1">
            {t?.mission_command?.route?.label ?? "SIMULATED MISSION CORRIDOR"}
          </p>
        </CardContent>
      </Card>

      {/* ── RUL chart ────────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="size-3.5 text-violet-500" />
            RUL Burn-Down · Predictive Projection
          </CardTitle>
          <CardDescription className="font-mono text-[10px]">
            Historical (solid) · Projected (gradient fade) · 90% CI band · Abort threshold at 20 cycles
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="h-60 w-full px-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={allData} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="mtRulFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="mtCiFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="mtProjFade" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="hsl(var(--border))" opacity={0.35} />
                <XAxis dataKey="cycle" tick={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
                  label={{ value: "Engine Cycle", position: "insideBottomRight", offset: -4, style: { fontSize: 8, fill: "hsl(var(--muted-foreground))" } }} />
                <YAxis tick={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32}
                  label={{ value: "RUL", angle: -90, position: "insideLeft", style: { fontSize: 8, fill: "hsl(var(--muted-foreground))" } }} />
                <Tooltip content={<RULTooltip />} />
                {/* CI upper */}
                <Area type="monotone" dataKey="rulUpper" stroke="none" fill="url(#mtCiFill)" isAnimationActive={false} />
                {/* CI lower — erase to white */}
                <Area type="monotone" dataKey="rulLower" stroke="none" fill="hsl(var(--card))" isAnimationActive={false} />
                {/* Main RUL */}
                <Area type="monotone" dataKey="rul" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#mtRulFill)"
                  dot={false} activeDot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }} isAnimationActive={false} />
                {/* References */}
                <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
                  label={{ value: "ABORT ≤20", position: "insideTopLeft", style: { fontSize: 8, fill: "#ef4444", fontFamily: "var(--font-geist-mono)" } }} />
                {nowCycle && (
                  <ReferenceLine x={nowCycle} stroke="#06b6d4" strokeWidth={2}
                    label={{ value: "NOW", position: "top", style: { fontSize: 8, fill: "#06b6d4", fontFamily: "var(--font-geist-mono)", fontWeight: "bold" } }} />
                )}
                {abortCycle && abortCycle !== nowCycle && (
                  <ReferenceLine x={abortCycle} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: "RUL ≤20", position: "top", style: { fontSize: 7, fill: "#f97316", fontFamily: "var(--font-geist-mono)" } }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ── Scenario compare ──────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2.5 flex items-center gap-2">
          <ChevronRight className="size-3.5 text-muted-foreground/50" />
          <p className="text-xs font-semibold text-muted-foreground">Decision Scenarios</p>
        </div>
        <ScenarioCompare rul={currentRul} continueDelta={-Math.round(missionRemaining * 0.78)} rtlDelta={-Math.round(missionRemaining * 0.14)} />
      </div>

      {/* ── Risk component matrix ─────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Flag className="size-3.5 text-amber-500" />
            Mission Risk Components
          </CardTitle>
          <CardDescription className="text-[10px] font-mono">
            P(complete) = Π of all sub-probability components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {rings.map(r => {
              const circ = 2 * Math.PI * 16; const dash = r.v * circ
              return (
                <div key={r.label} className="flex flex-col items-center gap-2 rounded-xl border border-border/40 bg-muted/15 py-3 px-1 transition-all hover:bg-muted/30">
                  <div className="relative size-12">
                    <svg width={48} height={48} viewBox="0 0 40 40" className="-rotate-90">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                      <circle cx="20" cy="20" r="16" fill="none" stroke={r.color} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={`${dash} ${circ}`}
                        style={{ filter: `drop-shadow(0 0 4px ${r.color}88)`, transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold tabular-nums" style={{ color: r.color }}>
                      {(r.v * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[8.5px] font-mono text-center text-muted-foreground leading-tight">{r.label}</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
