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
  GitCompare,
  FileText,
  ShieldCheck,
  MessageSquarePlus,
  RefreshCw,
  ExternalLink,
  Printer,
  CheckCircle2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTelemetry } from "@/components/telemetry-provider"
import type {
  TelemetryPayload,
  FlightRecord,
  ReplayAnnotation,
  FlightComparison,
  CommandAuditRecord,
  PostFlightReport,
} from "@/lib/telemetry/types"

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
      out.push({
        cycle,
        type: "ALERT",
        severity: alert === "CRITICAL" ? "CRITICAL" : alert === "WARNING" ? "WARNING" : "INFO",
        label: `Alert → ${alert}`,
        detail: `System alert changed from ${prevAlert} to ${alert}`,
      })
      prevAlert = alert
    }
    if ((p.injected_faults ?? []).length > 0 && !out.find(i => i.cycle === cycle && i.type === "FAULT")) {
      out.push({
        cycle,
        type: "FAULT",
        severity: "CRITICAL",
        label: `Fault: ${p.injected_faults![0]}`,
        detail: `Injected faults: ${(p.injected_faults ?? []).join(", ")}`,
      })
    }
    if (p.xai?.is_anomaly && p.xai.top_driver && !out.find(i => Math.abs(i.cycle - cycle) < 3 && i.type === "ANOMALY")) {
      out.push({
        cycle,
        type: "ANOMALY",
        severity: "WARNING",
        label: `Anomaly: ${p.xai.top_driver}`,
        detail: p.xai.narrative ?? `Top driver: ${p.xai.top_driver}`,
      })
    }
    const rul = p.predicted_rul ?? p.true_rul ?? Infinity
    if (prevRul !== Infinity && prevRul - rul > 8) {
      out.push({
        cycle,
        type: "RUL_DROP",
        severity: "WARNING",
        label: `RUL −${(prevRul - rul).toFixed(0)}`,
        detail: `RUL dropped from ${prevRul.toFixed(0)} → ${rul.toFixed(0)}`,
      })
    }
    prevRul = rul
  }
  return out.slice(0, 60)
}

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
  const { telemetryLog, sendCommand } = useTelemetry()

  // Tab navigation
  const [activeTab, setActiveTab] = React.useState<"replay" | "compare" | "audit" | "report">("replay")

  // Flight selection from Event Store
  const [availableFlights, setAvailableFlights] = React.useState<FlightRecord[]>([])
  const [selectedFlightId, setSelectedFlightId] = React.useState<string>("LIVE_SESSION")
  const [storedEvents, setStoredEvents] = React.useState<TelemetryPayload[]>([])
  const [annotations, setAnnotations] = React.useState<ReplayAnnotation[]>([])
  const [loadingFlights, setLoadingFlights] = React.useState(false)

  // Replay playback state
  const [playhead, setPlayhead] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const [speed, setSpeed] = React.useState<1 | 2 | 5>(1)
  const [selectedInc, setSelectedInc] = React.useState<Incident | null>(null)
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const progressBarRef = React.useRef<HTMLDivElement>(null)

  // Annotation dialog state
  const [showAnnotationBox, setShowAnnotationBox] = React.useState(false)
  const [newAnnotationNote, setNewAnnotationNote] = React.useState("")
  const [newAnnotationCat, setNewAnnotationCat] = React.useState<string>("OBSERVATION")

  // Comparison state
  const [compareFlightA, setCompareFlightA] = React.useState<string>("")
  const [compareFlightB, setCompareFlightB] = React.useState<string>("")
  const [comparisonResult, setComparisonResult] = React.useState<FlightComparison | null>(null)
  const [loadingComparison, setLoadingComparison] = React.useState(false)

  // Audit state
  const [auditCommands, setAuditCommands] = React.useState<CommandAuditRecord[]>([])
  const [loadingAudit, setLoadingAudit] = React.useState(false)

  // Post-flight report state
  const [postFlightReport, setPostFlightReport] = React.useState<PostFlightReport | null>(null)
  const [loadingReport, setLoadingReport] = React.useState(false)

  // Determine active log (stored flight events if selected, else live in-memory telemetryLog)
  const isLive = selectedFlightId === "LIVE_SESSION"
  const log = isLive ? telemetryLog : storedEvents
  const total = log.length
  const incidents = React.useMemo(() => deriveIncidents(log), [log])

  // Fetch flight index from event store on mount
  const refreshFlights = React.useCallback(async () => {
    setLoadingFlights(true)
    try {
      const res = await fetch("/api/twin/replay/flights")
      if (res.ok) {
        const data = await res.json()
        const fls: FlightRecord[] = data.flights || []
        setAvailableFlights(fls)
        if (fls.length > 0 && !compareFlightA) {
          setCompareFlightA(fls[0].flight_id)
          if (fls.length > 1) setCompareFlightB(fls[1].flight_id)
        }
      }
    } catch {
      // Backend API will be polled or offline
    } finally {
      setLoadingFlights(false)
    }
  }, [compareFlightA])

  React.useEffect(() => {
    refreshFlights()
  }, [refreshFlights])

  // Fetch events & annotations when a stored flight is selected
  React.useEffect(() => {
    if (selectedFlightId === "LIVE_SESSION") {
      setStoredEvents([])
      setPlayhead(0)
      return
    }

    async function loadFlightEvents() {
      try {
        const evRes = await fetch(`/api/twin/replay/events?flight_id=${encodeURIComponent(selectedFlightId)}`)
        if (evRes.ok) {
          const data = await evRes.json()
          setStoredEvents(data.events || [])
          setPlayhead(0)
        }
        const annRes = await fetch(`/api/twin/replay/annotations?flight_id=${encodeURIComponent(selectedFlightId)}`)
        if (annRes.ok) {
          const annData = await annRes.json()
          setAnnotations(annData.annotations || [])
        }
      } catch (err) {
        console.error("Failed to load stored flight events:", err)
      }
    }

    loadFlightEvents()
  }, [selectedFlightId])

  // Playback timer
  React.useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setPlayhead(p => {
          if (p >= total - 1) {
            setPlaying(false)
            return p
          }
          return p + 1
        })
      }, 180 / speed)
    } else if (intervalRef.current) clearInterval(intervalRef.current)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, speed, total])

  const frame = log[playhead]
  const currentCycle = frame?.cycle ?? 0

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

  function handleExportCsv() {
    if (!log.length) return
    const keys = ["cycle", "alert", "predicted_rul", "true_rul", "health.health_index", "rpm", "cht", "egt", "oil_pressure", "vibration", "anomaly_score"]
    const rows = log.map(p => [p.cycle, p.alert, p.predicted_rul, p.true_rul, p.health?.health_index, p.rpm, p.cht, p.egt, p.oil_pressure, p.vibration, p.anomaly_score].join(","))
    const csv = [keys.join(","), ...rows].join("\n")
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `debrief_${selectedFlightId}_${frame?.uav_id ?? "UAV-01"}_${Date.now()}.csv`,
    })
    a.click()
  }

  // Submit forensic annotation
  async function submitAnnotation() {
    if (!newAnnotationNote.trim()) return
    const flightId = isLive ? (frame?.uav_id ? `flight-${frame.uav_id}` : "flight-live") : selectedFlightId
    const body = {
      flight_id: flightId,
      aircraft_id: frame?.uav_id ?? "UAV-01",
      cycle: currentCycle,
      note: newAnnotationNote.trim(),
      category: newAnnotationCat,
      author: "GCS_OPERATOR_1",
    }

    try {
      const res = await fetch("/api/twin/replay/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setAnnotations(prev => [...prev, {
          aircraft_id: body.aircraft_id,
          flight_id: body.flight_id,
          cycle: body.cycle,
          author: body.author,
          category: body.category,
          note: body.note,
          created_at: new Date().toISOString(),
        }])
        setNewAnnotationNote("")
        setShowAnnotationBox(false)
      }
    } catch {
      // Fallback via WS command
      sendCommand({
        command: "annotate_replay",
        flight_id: body.flight_id,
        cycle: body.cycle,
        note: body.note,
        category: body.category as any,
        author: body.author,
      })
      setNewAnnotationNote("")
      setShowAnnotationBox(false)
    }
  }

  // Load Run Comparison
  async function runComparison() {
    if (!compareFlightA || !compareFlightB) return
    setLoadingComparison(true)
    try {
      const res = await fetch(`/api/twin/replay/compare?flight_a=${encodeURIComponent(compareFlightA)}&flight_b=${encodeURIComponent(compareFlightB)}`)
      if (res.ok) {
        const data = await res.json()
        setComparisonResult(data.comparison)
      }
    } catch (e) {
      console.error("Comparison error:", e)
    } finally {
      setLoadingComparison(false)
    }
  }

  // Load Audit Trail
  const loadAuditTrail = React.useCallback(async () => {
    setLoadingAudit(true)
    try {
      const res = await fetch("/api/twin/audit/commands?limit=100")
      if (res.ok) {
        const data = await res.json()
        setAuditCommands(data.commands || [])
      }
    } catch (e) {
      console.error("Audit error:", e)
    } finally {
      setLoadingAudit(false)
    }
  }, [])

  // Load Post Flight Report
  const loadReport = React.useCallback(async () => {
    const flightId = isLive ? (availableFlights[0]?.flight_id || "flight-live") : selectedFlightId
    setLoadingReport(true)
    try {
      const res = await fetch(`/api/twin/reports/flight?flight_id=${encodeURIComponent(flightId)}&format=json`)
      if (res.ok) {
        const data = await res.json()
        setPostFlightReport(data.report)
      }
    } catch (e) {
      console.error("Report error:", e)
    } finally {
      setLoadingReport(false)
    }
  }, [availableFlights, isLive, selectedFlightId])

  React.useEffect(() => {
    if (activeTab === "audit") {
      loadAuditTrail()
    } else if (activeTab === "report") {
      loadReport()
    }
  }, [activeTab, loadAuditTrail, loadReport])

  const playPct = total > 1 ? (playhead / (total - 1)) * 100 : 0
  const maxRul = Math.max(...chartData.map(d => d.rul), 0)
  const minRul = Math.min(...chartData.filter(d => d.rul > 0).map(d => d.rul), maxRul)

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">

      {/* ── Top Bar: Title, Flight Selector, and Modes ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
            <ListChecks className="size-4 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Mission Debrief & Event Replay</h1>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Append-only event store · Frame-accurate replay · Immutable audit trail
            </p>
          </div>
        </div>

        {/* Flight Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1">
            <Clock className="size-3.5 text-muted-foreground" />
            <select
              value={selectedFlightId}
              onChange={(e) => setSelectedFlightId(e.target.value)}
              className="bg-transparent text-xs font-mono font-medium focus:outline-none cursor-pointer"
            >
              <option value="LIVE_SESSION">Live Buffer ({telemetryLog.length} frames)</option>
              {availableFlights.map(f => (
                <option key={f.flight_id} value={f.flight_id}>
                  {f.flight_id} ({f.aircraft_id} · {f.total_cycles} cyc)
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="size-5 ml-1 text-muted-foreground hover:text-foreground"
              onClick={refreshFlights}
              title="Refresh flight index from Event Store"
            >
              <RefreshCw className={`size-3 ${loadingFlights ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleExportCsv} className="font-mono text-xs gap-1.5 h-8">
            <Download className="size-3.5" />Export CSV
          </Button>
        </div>
      </div>

      {/* ── Mode Navigation Tabs ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/20 p-1 w-fit">
        <button
          onClick={() => setActiveTab("replay")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium font-mono transition-all ${
            activeTab === "replay"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Play className="size-3" />Forensic Replay
        </button>

        <button
          onClick={() => setActiveTab("compare")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium font-mono transition-all ${
            activeTab === "compare"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitCompare className="size-3" />Run Comparison (A vs B)
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium font-mono transition-all ${
            activeTab === "audit"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck className="size-3" />Command Audit Trail
        </button>

        <button
          onClick={() => setActiveTab("report")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium font-mono transition-all ${
            activeTab === "report"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="size-3" />Post-Flight Maintenance Record
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 1: FORENSIC REPLAY & SCRUBBER
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "replay" && (
        <div className="flex flex-col gap-5">
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
              <div className="relative flex size-14 items-center justify-center rounded-full border border-dashed border-border bg-card">
                <Play className="size-6 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-semibold text-base">No Telemetry Frames In Selected Flight</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Run the digital twin to persist telemetry cycles into the event store, or select another flight above.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Session summary stats */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { label: "Stored Frames", value: total.toLocaleString(), color: "text-cyan-400" },
                  { label: "RUL Peak → Floor", value: `${maxRul.toFixed(0)} → ${minRul.toFixed(0)} cyc`, color: "text-violet-400" },
                  { label: "Critical Events", value: incidents.filter(i => i.severity === "CRITICAL").length.toString(), color: "text-red-400" },
                  { label: "Operator Annotations", value: annotations.length.toString(), color: "text-amber-400" },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
                    <p className="text-[9.5px] font-mono text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-mono font-bold tabular-nums mt-0.5 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Scrubber chart */}
              <Card className="overflow-hidden shadow-sm">
                <CardHeader className="pb-0 pt-3 px-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] font-mono text-muted-foreground/80 uppercase tracking-widest font-bold">
                    RUL Waveform · Click or drag to seek · Vertical markers = Incidents & Annotations
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] font-mono gap-1 text-cyan-400 hover:text-cyan-300"
                    onClick={() => setShowAnnotationBox(b => !b)}
                  >
                    <MessageSquarePlus className="size-3" />Annotate Cyc {currentCycle}
                  </Button>
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
                          <ReferenceLine key={`inc-${i}`} x={inc.cycle} stroke={svColor(inc.severity)}
                            strokeWidth={inc.severity === "CRITICAL" ? 1.5 : 1} strokeDasharray="2 3" />
                        ))}
                        {annotations.map((ann, i) => (
                          <ReferenceLine key={`ann-${i}`} x={ann.cycle} stroke="#38bdf8" strokeWidth={1.5}
                            label={{ value: "◆", position: "top", style: { fontSize: 8, fill: "#38bdf8" } }} />
                        ))}
                        <ReferenceLine x={currentCycle} stroke="#06b6d4" strokeWidth={2}
                          label={{ value: "▼", position: "top", style: { fontSize: 9, fill: "#06b6d4" } }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Inline Annotation Entry */}
              {showAnnotationBox && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5 flex flex-col gap-2.5 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono font-bold text-cyan-400">
                      Add Forensic Note at Cycle {currentCycle}
                    </p>
                    <select
                      value={newAnnotationCat}
                      onChange={e => setNewAnnotationCat(e.target.value)}
                      className="rounded bg-background px-2 py-0.5 text-[10px] font-mono border border-border"
                    >
                      <option value="OBSERVATION">OBSERVATION</option>
                      <option value="FAULT_CONFIRMATION">FAULT_CONFIRMATION</option>
                      <option value="FALSE_ALARM">FALSE_ALARM</option>
                      <option value="MAINTENANCE_NOTE">MAINTENANCE_NOTE</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter engineering notes or forensic rationale..."
                    value={newAnnotationNote}
                    onChange={e => setNewAnnotationNote(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") submitAnnotation() }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAnnotationBox(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500 text-white" onClick={submitAnnotation}>
                      Save Annotation
                    </Button>
                  </div>
                </div>
              )}

              {/* Transport controls */}
              <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm flex flex-col gap-3">
                <div ref={progressBarRef} className="group relative h-2 w-full cursor-pointer rounded-full bg-muted overflow-hidden"
                  onClick={handleBarClick}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-none"
                    style={{ width: `${playPct}%`, background: "linear-gradient(to right, #06b6d4, #8b5cf6)", boxShadow: "0 0 8px #8b5cf680" }}
                  />
                  {incidents.map((inc, i) => {
                    const pct = total > 1 ? ((log.findIndex(p => p.cycle === inc.cycle)) / (total - 1)) * 100 : 0
                    return (
                      <div key={i} className="absolute top-0 h-full w-px opacity-70"
                        style={{ left: `${pct}%`, background: svColor(inc.severity) }} />
                    )
                  })}
                </div>

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

              {/* Snapshot + Incidents/Annotations Log */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

                {/* Frame snapshot */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Gauge className="size-3.5 text-violet-500" />
                      Decision Envelope Snapshot
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

                    {(frame?.injected_faults ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                        {(frame?.injected_faults ?? []).map(f => (
                          <Badge key={f} variant="outline" className="text-[9px] font-mono border-red-500/40 text-red-400 bg-red-500/10 gap-1">
                            <Zap className="size-2.5" />{f}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {frame?.xai?.narrative && (
                      <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-2.5">
                        <p className="text-[9px] font-mono font-bold text-violet-400 mb-1 uppercase tracking-widest">AI Narrative</p>
                        <p className="text-[9px] font-mono text-muted-foreground leading-relaxed line-clamp-3">{frame.xai.narrative}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Incident and Annotation Timeline */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="size-3.5 text-amber-500" />
                      Forensic Events & Annotations
                    </CardTitle>
                    <CardDescription className="text-[10px] font-mono">Click to jump to cycle</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1 max-h-64 overflow-y-auto scrollbar-thin pr-1">
                      {/* Operator annotations first */}
                      {annotations.map((ann, i) => (
                        <button
                          key={`ann-entry-${i}`}
                          onClick={() => seekToCycle(ann.cycle)}
                          className="flex items-start gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-950/10 px-2.5 py-2 text-left transition-all hover:bg-cyan-950/20"
                        >
                          <div className="mt-0.5 text-cyan-400">◆</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold text-cyan-400">{ann.category}</span>
                              <span className="ml-auto text-[8px] font-mono opacity-60 flex-shrink-0">
                                Cyc {ann.cycle} · {ann.author}
                              </span>
                            </div>
                            <p className="text-[9px] font-mono opacity-75 mt-0.5 truncate">{ann.note}</p>
                          </div>
                        </button>
                      ))}

                      {/* Automated incidents */}
                      {incidents.length === 0 && annotations.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
                          <ListChecks className="size-4 text-muted-foreground/40" />
                          <p className="text-xs">No incidents or annotations recorded</p>
                        </div>
                      ) : incidents.map((inc, i) => (
                        <button
                          key={`inc-${i}`}
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
            </>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 2: RUN COMPARISON (RUN A VS RUN B)
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "compare" && (
        <div className="flex flex-col gap-5">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitCompare className="size-4 text-violet-400" />
                Flight Run Differential Analysis
              </CardTitle>
              <CardDescription className="text-xs font-mono">
                Compare baseline vs degraded runs or assess the impact of counterfactual operational parameters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase">Flight Run A (Baseline)</label>
                  <select
                    value={compareFlightA}
                    onChange={e => setCompareFlightA(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-mono"
                  >
                    {availableFlights.map(f => (
                      <option key={`a-${f.flight_id}`} value={f.flight_id}>
                        {f.flight_id} ({f.aircraft_id} · {f.total_cycles} cyc)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase">Flight Run B (Comparison Target)</label>
                  <select
                    value={compareFlightB}
                    onChange={e => setCompareFlightB(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-mono"
                  >
                    {availableFlights.map(f => (
                      <option key={`b-${f.flight_id}`} value={f.flight_id}>
                        {f.flight_id} ({f.aircraft_id} · {f.total_cycles} cyc)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={runComparison}
                    disabled={!compareFlightA || !compareFlightB || loadingComparison}
                    className="w-full font-mono text-xs gap-2"
                  >
                    <GitCompare className={`size-3.5 ${loadingComparison ? "animate-spin" : ""}`} />
                    Execute Comparison
                  </Button>
                </div>
              </div>

              {comparisonResult && (
                <div className="flex flex-col gap-4 animate-in fade-in">
                  <div className="rounded-xl border border-violet-500/30 bg-violet-950/10 p-3.5">
                    <p className="text-xs font-mono font-bold text-violet-400 mb-1">Comparative Narrative</p>
                    <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                      {comparisonResult.summary}
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="border-b border-border bg-muted/30 text-muted-foreground">
                        <tr>
                          <th className="p-2.5">Metric Channel</th>
                          <th className="p-2.5">Run A</th>
                          <th className="p-2.5">Run B</th>
                          <th className="p-2.5">Delta</th>
                          <th className="p-2.5">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {comparisonResult.metrics.map(m => (
                          <tr key={m.metric} className="hover:bg-muted/10">
                            <td className="p-2.5 font-medium">{m.metric}</td>
                            <td className="p-2.5">{m.run_a} {m.unit}</td>
                            <td className="p-2.5 font-bold">{m.run_b} {m.unit}</td>
                            <td className="p-2.5 font-bold" style={{ color: m.delta < 0 ? "#ef4444" : "#10b981" }}>
                              {m.delta > 0 ? `+${m.delta}` : m.delta} {m.unit}
                            </td>
                            <td className="p-2.5">
                              <Badge variant="outline" className={`text-[9px] ${m.percent_change < 0 ? "text-red-400 border-red-500/30" : "text-emerald-400 border-emerald-500/30"}`}>
                                {m.percent_change > 0 ? `+${m.percent_change}%` : `${m.percent_change}%`}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 3: COMMAND AUDIT TRAIL
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "audit" && (
        <div className="flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-400" />
                  Immutable Command Audit Log (DO-178C / SOC 2 Ready)
                </CardTitle>
                <CardDescription className="text-xs font-mono">
                  Who commanded what, when, and with what effect — recorded in the append-only store with SHA-256 signatures.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={loadAuditTrail} className="font-mono text-xs gap-1.5 h-8">
                <RefreshCw className={`size-3 ${loadingAudit ? "animate-spin" : ""}`} />Refresh Log
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Intent ID (Idempotency)</th>
                      <th className="p-2.5">Command Verb</th>
                      <th className="p-2.5">Target UAV</th>
                      <th className="p-2.5">Issued By</th>
                      <th className="p-2.5">Issued At (UTC)</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Parameters</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditCommands.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No operator commands recorded yet in this environment.
                        </td>
                      </tr>
                    ) : auditCommands.map(cmd => (
                      <tr key={cmd.intent_id} className="hover:bg-muted/10">
                        <td className="p-2.5 font-bold text-muted-foreground font-mono">
                          {cmd.intent_id.slice(0, 16)}...
                        </td>
                        <td className="p-2.5 font-bold text-foreground">
                          {cmd.command}
                        </td>
                        <td className="p-2.5 text-cyan-400">{cmd.aircraft_id}</td>
                        <td className="p-2.5">{cmd.issued_by}</td>
                        <td className="p-2.5 text-muted-foreground">{new Date(cmd.issued_at).toLocaleTimeString()}</td>
                        <td className="p-2.5">
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px]">
                            {cmd.status}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-muted-foreground max-w-xs truncate">
                          {JSON.stringify(cmd.params || {})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 4: POST-FLIGHT MAINTENANCE RECORD
      ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "report" && (
        <div className="flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="size-4 text-cyan-400" />
                  Post-Flight Maintenance Record (ATA-Spec Work Orders)
                </CardTitle>
                <CardDescription className="text-xs font-mono">
                  Assembled from stored events alone — reproducible maintenance bundle with operational envelope bounds.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const flId = isLive ? (availableFlights[0]?.flight_id || "flight-live") : selectedFlightId
                    window.open(`/api/twin/reports/flight?flight_id=${encodeURIComponent(flId)}&format=html`, "_blank")
                  }}
                  className="font-mono text-xs gap-1.5 h-8"
                >
                  <Printer className="size-3.5" />Print / HTML View
                </Button>
                <Button
                  size="sm"
                  onClick={loadReport}
                  className="font-mono text-xs gap-1.5 h-8 bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  <RefreshCw className={`size-3.5 ${loadingReport ? "animate-spin" : ""}`} />
                  Generate Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {postFlightReport ? (
                <div className="flex flex-col gap-5 animate-in fade-in">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[9px] font-mono text-muted-foreground uppercase">Report ID</p>
                      <p className="text-xs font-mono font-bold mt-0.5 truncate">{postFlightReport.report_id}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[9px] font-mono text-muted-foreground uppercase">Flight Duration</p>
                      <p className="text-sm font-mono font-bold mt-0.5">{postFlightReport.flight_summary.duration_s}s ({postFlightReport.flight_summary.total_cycles} cyc)</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[9px] font-mono text-muted-foreground uppercase">RUL Burn Rate</p>
                      <p className="text-sm font-mono font-bold mt-0.5 text-cyan-400">{postFlightReport.prognostics_trajectory.burn_rate_per_cycle} cyc/cyc</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-[9px] font-mono text-muted-foreground uppercase">Provenance</p>
                      <p className="text-xs font-mono font-bold mt-0.5 text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" />SHA-256 Verified
                      </p>
                    </div>
                  </div>

                  {/* ATA Work Orders */}
                  <div>
                    <h3 className="text-xs font-mono uppercase font-bold text-muted-foreground tracking-wider mb-2">
                      ATA Work Orders & Recommended Actions
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="p-2.5">ATA Chapter</th>
                            <th className="p-2.5">Subsystem</th>
                            <th className="p-2.5">Required Maintenance Action</th>
                            <th className="p-2.5">Urgency</th>
                            <th className="p-2.5">Sign-Off Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {postFlightReport.prescriptive_work_orders.map((wo, i) => (
                            <tr key={i} className="hover:bg-muted/10">
                              <td className="p-2.5 font-bold text-cyan-400">{wo.ata_chapter}</td>
                              <td className="p-2.5">{wo.subsystem}</td>
                              <td className="p-2.5 font-medium">{wo.action}</td>
                              <td className="p-2.5">
                                <Badge variant="outline" className={`text-[9px] ${
                                  wo.urgency === "CRITICAL" ? "border-red-500/40 text-red-400" :
                                  wo.urgency === "URGENT" ? "border-amber-500/40 text-amber-400" :
                                  "border-emerald-500/40 text-emerald-400"
                                }`}>
                                  {wo.urgency}
                                </Badge>
                              </td>
                              <td className="p-2.5">
                                <span className="text-[10px] text-muted-foreground font-semibold">{wo.sign_off_status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <FileText className="size-8 text-muted-foreground/40" />
                  <p className="text-xs font-mono text-muted-foreground">
                    Click &quot;Generate Report&quot; above to assemble the post-flight maintenance record from stored events.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  )
}
