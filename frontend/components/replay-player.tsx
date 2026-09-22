"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  ChevronFirst,
  ChevronLast,
  Clock,
  Download,
  FastForward,
  Gauge,
  ListChecks,
  Pause,
  Play,
  Rewind,
  ShieldAlert,
  Sliders,
  SkipForward,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTelemetry } from "@/components/telemetry-provider"
import type { TelemetryPayload } from "@/lib/telemetry/types"

// ─── Incident type ──────────────────────────────────────────────────────────────

interface Incident {
  cycle: number
  type: "FAULT" | "ANOMALY" | "RUL_DROP" | "ALERT"
  severity: "INFO" | "WARNING" | "CRITICAL"
  label: string
  detail: string
}

function svColor(s: string) {
  return s === "CRITICAL" ? "#ef4444" : s === "WARNING" ? "#f59e0b" : "#22c55e"
}
function svBadge(s: string) {
  return s === "CRITICAL"
    ? "border-red-500/40 bg-red-500/10 text-red-400"
    : s === "WARNING"
    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
}

function IncidentIcon({ type }: { type: Incident["type"] }) {
  const cls = "size-3 flex-shrink-0"
  if (type === "FAULT") return <Zap className={cls} />
  if (type === "ANOMALY") return <AlertTriangle className={cls} />
  if (type === "RUL_DROP") return <Gauge className={cls} />
  return <ShieldAlert className={cls} />
}

function deriveIncidents(log: TelemetryPayload[]): Incident[] {
  const out: Incident[] = []
  let prevAlert = "NOMINAL", prevRul = Infinity
  for (const p of log) {
    const cycle = p.cycle ?? 0
    const alert = p.alert ?? "NOMINAL"
    if (alert !== prevAlert) {
      out.push({ cycle, type: "ALERT", severity: alert === "CRITICAL" ? "CRITICAL" : alert === "WARNING" ? "WARNING" : "INFO", label: `Alert → ${alert}`, detail: `System alert changed from ${prevAlert} to ${alert}` })
      prevAlert = alert
    }
    if ((p.injected_faults ?? []).length > 0 && !out.find(i => i.cycle === cycle && i.type === "FAULT")) {
      out.push({ cycle, type: "FAULT", severity: "CRITICAL", label: `Fault: ${p.injected_faults![0]}`, detail: `Injected faults: ${(p.injected_faults ?? []).join(", ")}` })
    }
    if (p.xai?.is_anomaly && p.xai.top_driver && !out.find(i => Math.abs(i.cycle - cycle) < 3 && i.type === "ANOMALY")) {
      out.push({ cycle, type: "ANOMALY", severity: "WARNING", label: `Anomaly: ${p.xai.top_driver}`, detail: p.xai.narrative ?? `Top driver: ${p.xai.top_driver}` })
    }
    const rul = p.predicted_rul ?? p.true_rul ?? Infinity
    if (prevRul !== Infinity && prevRul - rul > 8) {
      out.push({ cycle, type: "RUL_DROP", severity: "WARNING", label: `RUL −${(prevRul - rul).toFixed(0)}`, detail: `RUL dropped from ${prevRul.toFixed(0)} → ${rul.toFixed(0)}` })
    }
    prevRul = rul
  }
  return out.slice(0, 60)
}

// ─── Metric pill ───────────────────────────────────────────────────────────────

function MetricPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 flex flex-col gap-0.5 transition-all hover:bg-muted/40">
      <p className="text-[9px] font-mono text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ReplayPlayer() {
  const { telemetryLog } = useTelemetry()
  const [playhead, setPlayhead] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const [speed, setSpeed] = React.useState<1 | 2 | 5>(1)
  const [selectedInc, setSelectedInc] = React.useState<Incident | null>(null)
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const progressBarRef = React.useRef<HTMLDivElement>(null)

  const log = telemetryLog
  const total = log.length
  const incidents = React.useMemo(() => deriveIncidents(log), [log])

  // Playback
  React.useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setPlayhead(p => { if (p >= total - 1) { setPlaying(false); return p } return p + 1 })
      }, 180 / speed)
    } else if (intervalRef.current) clearInterval(intervalRef.current)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, speed, total])

  const frame = log[playhead]
  const chartData = React.useMemo(() => log.map(p => ({
    cycle: p.cycle ?? 0,
    rul: p.predicted_rul ?? p.true_rul ?? 0,
    health: p.health?.health_index ?? 80,
  })), [log])

  function seekByPct(pct: number) {
    setPlayhead(Math.round(Math.max(0, Math.min(1, pct)) * (total - 1)))
  }
  function seekToCycle(cycle: number) {
    const idx = log.findIndex(p => (p.cycle ?? 0) >= cycle)
    if (idx >= 0) setPlayhead(idx)
  }
  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    seekByPct((e.clientX - rect.left) / rect.width)
  }
  function handleExport() {
    if (!log.length) return
    const keys = ["cycle", "alert", "predicted_rul", "true_rul", "health.health_index", "rpm", "cht", "egt", "oil_pressure", "vibration", "anomaly_score"]
    const rows = log.map(p => [p.cycle, p.alert, p.predicted_rul, p.true_rul, p.health?.health_index, p.rpm, p.cht, p.egt, p.oil_pressure, p.vibration, p.anomaly_score].join(","))
    const csv = [keys.join(","), ...rows].join("\n")
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `debrief_${frame?.uav_id ?? "UAV-01"}_${Date.now()}.csv` })
    a.click()
  }

  const currentCycle = frame?.cycle ?? 0
  const playPct = total > 1 ? (playhead / (total - 1)) * 100 : 0
  const maxRul = Math.max(...chartData.map(d => d.rul), 0)
  const minRul = Math.min(...chartData.filter(d => d.rul > 0).map(d => d.rul), maxRul)

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-28 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full animate-ping bg-muted opacity-40" />
          <div className="relative flex size-16 items-center justify-center rounded-full border border-dashed border-border bg-card">
            <Play className="size-7 text-muted-foreground/40" />
          </div>
        </div>
        <div>
          <p className="font-semibold text-base">No Flight Data Recorded Yet</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
            Connect the backend and let the UAV run. Telemetry frames will be captured automatically for post-mission forensic analysis.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs text-muted-foreground">Backend → ws://localhost:8765</Badge>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
            <ListChecks className="size-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Mission Debrief</h1>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {frame?.uav_id ?? "UAV-01"} · {total} frames · {incidents.length} incidents detected
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="font-mono text-xs gap-1.5 h-8">
          <Download className="size-3.5" />Export CSV
        </Button>
      </div>

      {/* ── Session stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: "Frames Recorded", value: total.toLocaleString(), color: "text-cyan-400" },
          { label: "RUL Peak → Floor", value: `${maxRul.toFixed(0)} → ${minRul.toFixed(0)}`, color: "text-violet-400" },
          { label: "Critical Events", value: incidents.filter(i => i.severity === "CRITICAL").length.toString(), color: "text-red-400" },
          { label: "Warning Events", value: incidents.filter(i => i.severity === "WARNING").length.toString(), color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
            <p className="text-[9.5px] font-mono text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-mono font-bold tabular-nums mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Scrubber chart ────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-0 pt-3 px-4">
          <CardTitle className="text-[10px] font-mono text-muted-foreground/80 uppercase tracking-widest font-bold">
            RUL Waveform — Click or drag to seek · Vertical marks = incidents
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className="h-24 w-full cursor-crosshair px-2"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              const idx = Math.round(pct * (chartData.length - 1))
              if (chartData[idx]) seekToCycle(chartData[idx].cycle)
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rp-rul-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 5" stroke="hsl(var(--border))" opacity={0.25} />
                <XAxis dataKey="cycle" hide />
                <YAxis hide domain={[0, "auto"]} />
                <Area type="monotone" dataKey="rul" stroke="#8b5cf6" strokeWidth={1.5}
                  fill="url(#rp-rul-fill)" dot={false} isAnimationActive={false} />
                {incidents.map((inc, i) => (
                  <ReferenceLine key={i} x={inc.cycle} stroke={svColor(inc.severity)}
                    strokeWidth={inc.severity === "CRITICAL" ? 1.5 : 1} strokeDasharray="2 3" />
                ))}
                <ReferenceLine x={currentCycle} stroke="#06b6d4" strokeWidth={2}
                  label={{ value: "▼", position: "top", style: { fontSize: 9, fill: "#06b6d4" } }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ── Transport controls ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex flex-col gap-3">
        {/* Progress track */}
        <div ref={progressBarRef} className="group relative h-2 w-full cursor-pointer rounded-full bg-muted overflow-hidden"
          onClick={handleBarClick}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-none"
            style={{ width: `${playPct}%`, background: "linear-gradient(to right, #06b6d4, #8b5cf6)", boxShadow: "0 0 8px #8b5cf680" }}
          />
          {/* Incident ticks */}
          {incidents.map((inc, i) => {
            const pct = total > 1 ? ((log.findIndex(p => p.cycle === inc.cycle)) / (total - 1)) * 100 : 0
            return (
              <div key={i} className="absolute top-0 h-full w-px opacity-70"
                style={{ left: `${pct}%`, background: svColor(inc.severity) }} />
            )
          })}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-1.5 justify-center">
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => setPlayhead(0)}>
            <ChevronFirst className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => setPlayhead(p => Math.max(0, p - 10))}>
            <Rewind className="size-4" />
          </Button>
          <Button size="icon" className="size-10 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
            onClick={() => setPlaying(p => !p)}>
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => setPlayhead(p => Math.min(total - 1, p + 10))}>
            <FastForward className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => setPlayhead(total - 1)}>
            <ChevronLast className="size-4" />
          </Button>

          {/* Speed selector */}
          <div className="ml-4 flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 px-2 py-1">
            <span className="text-[9px] font-mono text-muted-foreground mr-1">Speed</span>
            {([1, 2, 5] as const).map(s => (
              <button key={s} onClick={() => setSpeed(s)}
                className={`min-w-[1.6rem] rounded px-1.5 py-0.5 text-[9px] font-mono font-bold transition-all ${speed === s ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {s}×
              </button>
            ))}
          </div>

          <span className="ml-auto text-[9px] font-mono text-muted-foreground/70 tabular-nums">
            {playhead + 1}/{total} · Cyc {currentCycle}
          </span>
        </div>
      </div>

      {/* ── Snapshot + Incident log ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Frame snapshot */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="size-3.5 text-violet-500" />
              Frame Snapshot
              <span className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">Cycle {currentCycle}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              <MetricPill label="Alert" value={frame?.alert ?? "—"}
                color={frame?.alert === "CRITICAL" ? "#ef4444" : frame?.alert === "WARNING" ? "#f59e0b" : "#22c55e"} />
              <MetricPill label="RUL" value={`${(frame?.predicted_rul ?? frame?.true_rul ?? 0).toFixed(0)} cyc`} color="#8b5cf6" />
              <MetricPill label="Health" value={`${(frame?.health?.health_index ?? 0).toFixed(0)}%`} color="#06b6d4" />
              <MetricPill label="RPM" value={(frame?.rpm ?? 0).toFixed(0)} />
              <MetricPill label="CHT" value={`${(frame?.cht ?? 0).toFixed(0)}°F`}
                color={(frame?.cht ?? 0) > 410 ? "#ef4444" : undefined} />
              <MetricPill label="Vibration" value={`${(frame?.vibration ?? 0).toFixed(2)}g`}
                color={(frame?.vibration ?? 0) > 1.8 ? "#f59e0b" : undefined} />
              <MetricPill label="Oil Pres." value={`${(frame?.oil_pressure ?? 0).toFixed(1)} PSI`} />
              <MetricPill label="Fuel Flow" value={`${(frame?.fuel_flow ?? 0).toFixed(1)} L/h`} />
              <MetricPill label="Anomaly" value={`${((frame?.anomaly_score ?? 0) * 100).toFixed(0)}%`}
                color={(frame?.is_anomaly ?? false) ? "#ef4444" : undefined} />
            </div>

            {/* Active faults */}
            {(frame?.injected_faults ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                {(frame?.injected_faults ?? []).map(f => (
                  <Badge key={f} variant="outline" className="text-[9px] font-mono border-red-500/40 text-red-400 bg-red-500/10 gap-1">
                    <Zap className="size-2.5" />{f}
                  </Badge>
                ))}
              </div>
            )}

            {/* XAI narrative */}
            {frame?.xai?.narrative && (
              <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-2.5">
                <p className="text-[9px] font-mono font-bold text-violet-400 mb-1 uppercase tracking-widest">AI Narrative</p>
                <p className="text-[9px] font-mono text-muted-foreground leading-relaxed line-clamp-3">{frame.xai.narrative}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Incident log */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-amber-500" />
              Incident Log
            </CardTitle>
            <CardDescription className="text-[10px] font-mono">Click to jump to incident in timeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto scrollbar-thin pr-1">
              {incidents.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
                  <div className="rounded-full border border-dashed border-border p-2">
                    <ListChecks className="size-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs">No incidents detected</p>
                </div>
              ) : incidents.map((inc, i) => (
                <button
                  key={i}
                  onClick={() => { seekToCycle(inc.cycle); setSelectedInc(inc) }}
                  className={`group flex items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-150 hover:bg-accent/60 active:scale-[0.99] ${svBadge(inc.severity)} ${selectedInc === inc ? "ring-1 ring-inset ring-current/20" : ""}`}
                >
                  <div className="mt-0.5"><IncidentIcon type={inc.type} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold truncate">{inc.label}</span>
                      <span className="ml-auto text-[8px] font-mono opacity-60 flex-shrink-0">
                        <Clock className="inline size-2 mr-0.5" />Cyc {inc.cycle}
                      </span>
                    </div>
                    <p className="text-[9px] font-mono opacity-65 leading-relaxed mt-0.5 truncate">{inc.detail}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
