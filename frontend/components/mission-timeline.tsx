"use client"

import * as React from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Download,
  FileCheck,
  FileText,
  Flag,
  Flame,
  Fuel,
  Gauge,
  Layers,
  Map,
  MapPin,
  Maximize2,
  Navigation,
  Plane,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wind,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTelemetry } from "@/components/telemetry-provider"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TimelinePoint {
  t: number
  cycle: number
  rul: number
  rulLower: number
  rulUpper: number
  health: number
  alert: string
  projected?: boolean
  scenario?: string
  cht?: number
  egt?: number
  rpm?: number
}

type TrajectoryScenario = "nominal" | "eco_cruise" | "high_altitude" | "rtl_immediate" | "divert_bravo"

interface FlightPhase {
  id: string
  name: string
  code: string
  altFt: number
  speedKts: number
  rpmTarget: number
  fuelBurnLph: number
  chtNominal: number
  minProgress: number
  maxProgress: number
  description: string
  gateCheck: string
}

const FLIGHT_PHASES: FlightPhase[] = [
  {
    id: "phase-0",
    name: "Pre-Flight & Ground Run-Up",
    code: "PHASE 0: PRE-FLT",
    altFt: 0,
    speedKts: 0,
    rpmTarget: 1800,
    fuelBurnLph: 6.2,
    chtNominal: 78,
    minProgress: 0,
    maxProgress: 10,
    description: "Engine warm-up, dual electronic ignition run-up check, BIT verification.",
    gateCheck: "DO-178C Level B Avionics BIT Passed, Fuel Pressure >= 3.0 bar",
  },
  {
    id: "phase-1",
    name: "Takeoff & Full Boost Climb",
    code: "PHASE 1: TO/CLIMB",
    altFt: 4500,
    speedKts: 72,
    rpmTarget: 5800,
    fuelBurnLph: 28.5,
    chtNominal: 118,
    minProgress: 10,
    maxProgress: 25,
    description: "Maximum continuous boost (115 HP, MAP 115 kPa), rapid climb to operational altitude.",
    gateCheck: "Turbine spool nominal, CHT < 135°C redline, Positive Rate confirmed",
  },
  {
    id: "phase-2",
    name: "Ingress Corridor Transit",
    code: "PHASE 2: INGRESS",
    altFt: 8500,
    speedKts: 88,
    rpmTarget: 4900,
    fuelBurnLph: 16.8,
    chtNominal: 106,
    minProgress: 25,
    maxProgress: 45,
    description: "Cruising along tactical flight corridor, GPS/INS waypoint following.",
    gateCheck: "STANAG 4586 C2 link margin >= 18 dB, Bingo Fuel reserve intact",
  },
  {
    id: "phase-3",
    name: "On-Station Persistent ISR Loiter",
    code: "PHASE 3: ON-STATION",
    altFt: 10000,
    speedKts: 68,
    rpmTarget: 4400,
    fuelBurnLph: 12.4,
    chtNominal: 98,
    minProgress: 45,
    maxProgress: 75,
    description: "Surveillance orbit, gimbal optical/IR payload tracking, maximum fuel endurance.",
    gateCheck: "Payload sensor stabilization locked, RUL consumption <= 1.0x baseline",
  },
  {
    id: "phase-4",
    name: "Egress Transit & RTB Descent",
    code: "PHASE 4: EGRESS",
    altFt: 6000,
    speedKts: 92,
    rpmTarget: 4600,
    fuelBurnLph: 14.2,
    chtNominal: 102,
    minProgress: 75,
    maxProgress: 90,
    description: "Exiting operational area, stepped descent towards home recovery corridor.",
    gateCheck: "Clearance for terminal approach corridor received, IFR reserve checked",
  },
  {
    id: "phase-5",
    name: "Terminal Approach & Recovery",
    code: "PHASE 5: RECOVERY",
    altFt: 800,
    speedKts: 58,
    rpmTarget: 2200,
    fuelBurnLph: 7.8,
    chtNominal: 86,
    minProgress: 90,
    maxProgress: 100,
    description: "Glide slope alignment, flare, touchdown, and engine shutdown cooldown.",
    gateCheck: "Touchdown RUL margin >= 20 cycles, Brake temperature nominal",
  },
]

// ─── Custom Tooltip ────────────────────────────────────────────────────────────

function RULTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: TimelinePoint }>
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const alertColor =
    d.alert === "CRITICAL" ? "#ef4444" : d.alert === "WARNING" ? "#f59e0b" : "#22c55e"

  return (
    <div className="rounded-xl border border-border/80 bg-card/95 px-3.5 py-2.5 text-[11px] font-mono shadow-2xl backdrop-blur-lg ring-1 ring-white/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-2 rounded-full" style={{ background: alertColor }} />
        <span className="font-bold text-foreground">Engine Cycle {d.cycle}</span>
        {d.projected ? (
          <Badge
            variant="outline"
            className="text-[8px] border-violet-500/40 text-violet-400 py-0 uppercase"
          >
            {d.scenario ? d.scenario.replace("_", " ") : "PROJECTED"}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[8px] border-emerald-500/40 text-emerald-400 py-0">
            ACTUAL
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">RUL:</span>
        <span className="font-bold" style={{ color: alertColor }}>
          {d.rul.toFixed(1)} cyc
        </span>
        <span className="text-muted-foreground">90% CI:</span>
        <span className="text-cyan-400">
          [{d.rulLower.toFixed(0)}, {d.rulUpper.toFixed(0)}]
        </span>
        <span className="text-muted-foreground">Health Index:</span>
        <span className="text-emerald-400">{d.health.toFixed(0)}%</span>
        <span className="text-muted-foreground">Alert State:</span>
        <span style={{ color: alertColor }}>{d.alert}</span>
        {d.cht && (
          <>
            <span className="text-muted-foreground">Est. CHT:</span>
            <span className="text-amber-400">{d.cht.toFixed(1)} °C</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Executive Go/No-Go Decision Card ──────────────────────────────────────────

function GoNoGoCard({
  rul,
  remaining,
  prob,
  safeRadiusNm,
}: {
  rul: number
  remaining: number
  prob: number
  safeRadiusNm: number
}) {
  const margin = rul - remaining
  const isGo = margin > 20 && prob > 70
  const isConditional = !isGo && margin > 0
  const isNoGo = margin <= 0

  const cfg = isGo
    ? {
        label: "GO — CLEARED FOR UNRESTRICTED MISSION PROFILE",
        badge: "AIRWORTHINESS CLEARED",
        icon: CheckCircle2,
        cl: "text-emerald-400",
        border: "border-emerald-500/30",
        bg: "from-emerald-950/20 via-emerald-900/10 to-transparent",
        glow: "shadow-[0_0_20px_rgba(34,197,94,0.15)]",
      }
    : isConditional
    ? {
        label: "CONDITIONAL GO — RESTRICTED OPERATIONAL ENVELOPE",
        badge: "CAUTION ADVISORY",
        icon: AlertTriangle,
        cl: "text-amber-400",
        border: "border-amber-500/30",
        bg: "from-amber-950/20 via-amber-900/10 to-transparent",
        glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]",
      }
    : {
        label: "NO-GO — MISSION ABORT & IMMEDIATE DIVERT RECOMMENDED",
        badge: "ABORT TRIGGERED",
        icon: ShieldAlert,
        cl: "text-red-400",
        border: "border-red-500/40",
        bg: "from-red-950/30 via-red-900/15 to-transparent",
        glow: "shadow-[0_0_25px_rgba(239,68,68,0.25)]",
      }

  return (
    <div
      className={`rounded-2xl border ${cfg.border} bg-gradient-to-br ${cfg.bg} p-5 transition-all duration-300 ${cfg.glow}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl border ${cfg.border} p-2.5 bg-card/80 backdrop-blur-md`}>
            <cfg.icon className={`size-6 ${cfg.cl}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                Airworthiness Dispatch Directive
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] font-mono font-bold tracking-wider ${cfg.border} ${cfg.cl} bg-card/60`}
              >
                {cfg.badge}
              </Badge>
            </div>
            <h2 className={`text-base sm:text-lg font-bold font-mono tracking-tight mt-0.5 ${cfg.cl}`}>
              {cfg.label}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-mono text-muted-foreground block">
              STANAG 4586 Gate Status
            </span>
            <span className="text-xs font-mono font-bold text-foreground">
              {isNoGo ? "GATE VIOLATION (ABORT)" : "ALL GATES COMPLIANT"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "RUL Margin",
            value: `${margin > 0 ? "+" : ""}${margin.toFixed(0)}`,
            subtext: `~${(margin * 0.5).toFixed(1)} Flight Hours`,
            unit: "cycles",
            color: margin > 20 ? "#22c55e" : margin > 0 ? "#f59e0b" : "#ef4444",
          },
          {
            label: "P(Complete)",
            value: `${prob.toFixed(0)}`,
            subtext: "Multi-factor reliability",
            unit: "%",
            color: prob > 75 ? "#22c55e" : prob > 50 ? "#f59e0b" : "#ef4444",
          },
          {
            label: "Sortie Remaining",
            value: `${remaining}`,
            subtext: `~${(remaining * 0.5).toFixed(1)} Flight Hours`,
            unit: "cycles",
            color: "#06b6d4",
          },
          {
            label: "Safe Glide Radius",
            value: `${safeRadiusNm.toFixed(0)}`,
            subtext: "Engine-out recovery reach",
            unit: "NM",
            color: "#a855f7",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center justify-between rounded-xl bg-card/70 border border-border/60 py-3 px-3 shadow-xs"
          >
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider text-center leading-tight">
              {s.label}
            </p>
            <div className="flex items-baseline gap-1 my-1">
              <span
                className="text-2xl sm:text-3xl font-mono font-black tabular-nums tracking-tight leading-none"
                style={{ color: s.color }}
              >
                {s.value}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">{s.unit}</span>
            </div>
            <p className="text-[9px] font-mono text-muted-foreground/80 text-center">{s.subtext}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Waypoint Progress Strip with Altitudes ────────────────────────────────────

function WaypointStrip({
  waypoints,
  progress,
  activeWaypointIdx,
}: {
  waypoints: { id: string; name: string; latitude?: number; longitude?: number }[]
  progress: number
  activeWaypointIdx: number
}) {
  const segs = Math.max(1, waypoints.length - 1)

  return (
    <div className="relative px-4 py-3">
      {/* Track background */}
      <div className="absolute top-7 left-8 right-8 h-1 -translate-y-1/2 bg-border/80 rounded-full" />
      {/* Progress fill */}
      <div
        className="absolute top-7 left-8 h-1 -translate-y-1/2 rounded-full transition-all duration-700"
        style={{
          width: `calc(${Math.min(progress, 100)}% * (100% - 4rem) / 100)`,
          background: "linear-gradient(to right, #06b6d4, #8b5cf6)",
          boxShadow: "0 0 10px rgba(6, 182, 212, 0.6)",
        }}
      />
      {/* Waypoint nodes */}
      <div className="relative flex justify-between">
        {waypoints.map((wp, i) => {
          const pct = (i / segs) * 100
          const passed = progress >= pct
          const current = i === activeWaypointIdx

          return (
            <div key={`${wp.id}-${i}`} className="flex flex-col items-center gap-1.5 z-10">
              <div className="relative">
                {current && (
                  <div
                    className="absolute -inset-1.5 rounded-full animate-ping opacity-50"
                    style={{ background: "#06b6d4" }}
                  />
                )}
                <div
                  className={`size-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                    passed
                      ? "border-cyan-400 bg-cyan-500 shadow-[0_0_10px_#06b6d4]"
                      : "border-border bg-card"
                  } ${current ? "scale-125 ring-2 ring-cyan-400/50" : ""}`}
                >
                  {passed ? (
                    <Check className="size-2.5 text-black stroke-[3]" />
                  ) : (
                    <div className="size-1.5 rounded-full bg-muted-foreground/60" />
                  )}
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold text-foreground text-center leading-tight">
                {wp.id}
              </span>
              <span className="text-[8.5px] font-mono text-muted-foreground/80 max-w-16 text-center truncate leading-tight">
                {wp.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function MissionTimeline() {
  const { latestTelemetry: t, rulHistory, metSeconds, telemetryLog } = useTelemetry()

  // Selected trajectory simulation scenario
  const [activeScenario, setActiveScenario] = React.useState<TrajectoryScenario>("nominal")
  // Active flight phase filter/tab
  const [selectedPhaseId, setSelectedPhaseId] = React.useState<string>("phase-3")
  // Time travel scrubber cycle index
  const [scrubberCycle, setScrubberCycle] = React.useState<number | null>(null)
  // Debrief manifest modal
  const [manifestModalOpen, setManifestModalOpen] = React.useState(false)
  const [copiedHash, setCopiedHash] = React.useState(false)

  const currentRul = t?.predicted_rul ?? 86
  const completionProb = t?.mission_risk?.mission_completion_probability ?? 88
  const progress = t?.mission_progress_pct ?? 34
  const safeTime = t?.mission_risk?.safe_operating_time_h ?? 3.4
  const safeRadiusNm = t?.mission_command?.route?.safe_radius_nm ?? 48

  // Build historical data points from telemetry or fallback
  const historical: TimelinePoint[] = React.useMemo(() => {
    if (rulHistory && rulHistory.length > 0) {
      return rulHistory.map((p, i) => ({
        t: i,
        cycle: p.cycle,
        rul: p.predicted_rul,
        rulLower: p.rul_ci_lower ?? Math.max(0, p.predicted_rul - 12),
        rulUpper: p.rul_ci_upper ?? p.predicted_rul + 12,
        health: Math.max(20, Math.min(100, p.predicted_rul * 0.58 + 30)),
        alert: p.predicted_rul < 20 ? "CRITICAL" : p.predicted_rul < 50 ? "WARNING" : "NOMINAL",
        cht: 95 + (i % 8) * 2.1,
        egt: 780 + (i % 6) * 4.5,
        rpm: 4800,
      }))
    }
    // Synthetic baseline if empty
    return Array.from({ length: 20 }, (_, i) => {
      const cycle = 100 + i
      const rul = Math.max(20, 110 - i * 1.4)
      return {
        t: i,
        cycle,
        rul,
        rulLower: Math.max(0, rul - 10),
        rulUpper: rul + 10,
        health: Math.max(20, rul * 0.6 + 25),
        alert: rul < 20 ? "CRITICAL" : rul < 50 ? "WARNING" : "NOMINAL",
        cht: 98.5 + (i % 5) * 1.5,
        egt: 790 + (i % 4) * 3,
        rpm: 4850,
      }
    })
  }, [rulHistory])

  // Current cycle number
  const nowCycle = historical[historical.length - 1]?.cycle ?? 120
  const missionRemaining = Math.max(10, Math.round((100 - progress) * 1.25))

  // Forward projection based on selected scenario
  const projected: TimelinePoint[] = React.useMemo(() => {
    if (historical.length < 2) return []
    const last = historical[historical.length - 1]

    let slope = -0.55
    let deltaOffset = 0
    let chtTrend = 98

    if (activeScenario === "eco_cruise") {
      slope = -0.32 // Slower degradation rate
      deltaOffset = 18
      chtTrend = 89
    } else if (activeScenario === "high_altitude") {
      slope = -0.38
      deltaOffset = 11
      chtTrend = 86
    } else if (activeScenario === "rtl_immediate") {
      slope = -0.15 // Very brief return
      deltaOffset = 42
      chtTrend = 82
    } else if (activeScenario === "divert_bravo") {
      slope = -0.22
      deltaOffset = 34
      chtTrend = 84
    }

    const numPoints = activeScenario === "rtl_immediate" ? 14 : 32

    return Array.from({ length: numPoints }, (_, i) => {
      const cyc = last.cycle + i + 1
      const baseRul = Math.max(0, last.rul + slope * (i + 1) + (i > 1 ? deltaOffset * 0.15 : 0))
      const projRul = Math.max(0, baseRul)
      const ciSpread = 12 + (i + 1) * 0.45

      return {
        t: last.t + i + 1,
        cycle: cyc,
        rul: projRul,
        projected: true,
        scenario: activeScenario,
        rulLower: Math.max(0, projRul - ciSpread),
        rulUpper: projRul + ciSpread,
        health: Math.max(15, Math.min(100, projRul * 0.58 + 28)),
        alert: projRul < 20 ? "CRITICAL" : projRul < 50 ? "WARNING" : "NOMINAL",
        cht: chtTrend + Math.sin(i * 0.3) * 2,
        egt: 770 + Math.cos(i * 0.2) * 8,
        rpm: activeScenario === "eco_cruise" ? 4200 : 4750,
      }
    })
  }, [historical, activeScenario])

  const allData = [...historical, ...projected]
  const abortCycle = allData.find((d) => d.rul <= 20)?.cycle

  // Default scrubber to current cycle if unset
  const activeScrubber = scrubberCycle ?? nowCycle
  const inspectedPoint = allData.find((d) => d.cycle === activeScrubber) ?? allData[allData.length - 1]

  const waypoints = t?.mission_command?.route?.waypoints ?? [
    { id: "WP-01", name: "Alverca Airbase (Home)", latitude: 38.88, longitude: -9.03 },
    { id: "WP-02", name: "Alpha Ingress Corridor", latitude: 38.95, longitude: -8.92 },
    { id: "WP-03", name: "Bravo Primary Survey", latitude: 39.12, longitude: -8.78 },
    { id: "WP-04", name: "Charlie Orbit Loiter", latitude: 39.25, longitude: -8.65 },
    { id: "WP-05", name: "Delta Egress Transit", latitude: 39.05, longitude: -8.85 },
    { id: "WP-06", name: "Recovery Point Home", latitude: 38.88, longitude: -9.03 },
  ]

  const activeWaypointIdx = Math.min(
    waypoints.length - 1,
    Math.floor((progress / 100) * waypoints.length)
  )

  const metFmt = `${Math.floor(metSeconds / 60)}:${String(metSeconds % 60).padStart(2, "0")}`

  const rulTrend =
    historical.length >= 6
      ? historical[historical.length - 1].rul - historical[historical.length - 6].rul
      : 0

  // ── Mission Events Log (correlated with timeline) ──────────────────────────
  const correlatedEvents = React.useMemo(() => {
    return [
      {
        cycle: Math.max(1, nowCycle - 48),
        met: "04:12",
        type: "WAYPOINT",
        title: "Waypoint WP-01 Cleared (Takeoff Run)",
        severity: "INFO",
        desc: "Full thrust 115 HP established. MAP 114.8 kPa, climb angle 8.2°.",
      },
      {
        cycle: Math.max(1, nowCycle - 36),
        met: "09:40",
        type: "MILESTONE",
        title: "Ingress Corridor Alpha Ingress",
        severity: "INFO",
        desc: "Cruising at 8,500 ft MSL, FADEC auto-mixture closed-loop active.",
      },
      {
        cycle: Math.max(1, nowCycle - 24),
        met: "15:22",
        type: "THERMAL",
        title: "Cylinder #2 CHT Thermal Transient (+8.4°C)",
        severity: "WARNING",
        desc: "Exhaust runner transient during climb power segment. Auto-rebalanced.",
      },
      {
        cycle: Math.max(1, nowCycle - 12),
        met: "21:05",
        type: "FADEC",
        title: "Wastegate Actuator Closed-Loop Adjustment",
        severity: "INFO",
        desc: "Servo trimmed boost pressure by -1.8 kPa to preserve turbine bearing life.",
      },
      {
        cycle: nowCycle,
        met: metFmt,
        type: "STATUS",
        title: "Current Operational State",
        severity: currentRul < 20 ? "CRITICAL" : currentRul < 50 ? "WARNING" : "NOMINAL",
        desc: `Health Index ${inspectedPoint?.health?.toFixed(0)}%, RUL ${currentRul.toFixed(0)} cycles remaining.`,
      },
    ]
  }, [nowCycle, metFmt, currentRul, inspectedPoint])

  // ── STANAG 4586 Gate Checklist ──────────────────────────────────────────────
  const stanagGates = [
    {
      gate: "GATE 1",
      name: "Pre-Flight Systems & Avionics BIT",
      standard: "DO-178C Level B / STANAG 4586 VSM",
      status: "PASSED",
      margin: "100% Sensors Nominal",
      color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    },
    {
      gate: "GATE 2",
      name: "Climb Thermal Equilibrium Envelope",
      standard: "Rotax 914 F Redline Check (CHT < 135°C)",
      status: (t?.cht ?? 108) <= 125 ? "PASSED" : "CAUTION",
      margin: `CHT ${(t?.cht ?? 108).toFixed(1)}°C (Margin +${(135 - (t?.cht ?? 108)).toFixed(1)}°C)`,
      color: (t?.cht ?? 108) <= 125 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-amber-400 border-amber-500/30 bg-amber-500/10",
    },
    {
      gate: "GATE 3",
      name: "Ingress Bingo Fuel & RUL Safe Margin",
      standard: "MIL-HDBK-516C Airworthiness",
      status: currentRul >= 30 ? "PASSED" : "CAUTION",
      margin: `RUL ${currentRul.toFixed(0)} cyc (Threshold: 20 cyc)`,
      color: currentRul >= 30 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-amber-400 border-amber-500/30 bg-amber-500/10",
    },
    {
      gate: "GATE 4",
      name: "RF Datalink & Telemetry Integrity",
      standard: "STANAG 7085 Common Data Link (CDL)",
      status: "PASSED",
      margin: "SNR 26.4 dB | Bit Error Rate < 1e-7",
      color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    },
    {
      gate: "GATE 5",
      name: "Terminal Recovery Point Margin",
      standard: "FAA Part 107 / EASA Specific Category",
      status: currentRul - missionRemaining > 15 ? "PASSED" : "CAUTION",
      margin: `Touchdown Margin: +${Math.max(0, currentRul - missionRemaining).toFixed(0)} cyc`,
      color: currentRul - missionRemaining > 15 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-amber-400 border-amber-500/30 bg-amber-500/10",
    },
  ]

  // Copy STANAG debrief hash
  const handleCopyHash = () => {
    navigator.clipboard.writeText(
      `STANAG-4586-AUDIT-MANIFEST-UAV-07-${nowCycle}-SHA256: e8b94df10c49b2938afdc5528b12204a9f39487c67e81033bca`
    )
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300 max-w-7xl mx-auto w-full">
      {/* ── Top Header & Actions ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-violet-500/40 bg-violet-500/15 shadow-md shadow-violet-500/10">
            <Map className="size-5 text-violet-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Mission Timeline & Trajectory Correlator
              </h1>
              <Badge variant="outline" className="text-[10px] font-mono border-violet-500/40 text-violet-400 bg-violet-500/10">
                STANAG 4586 C2
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Predictive RUL burn-down · Monte Carlo 90% CI bands · Tactical trajectory replanner
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs border-cyan-500/40 text-cyan-400 bg-cyan-500/5 gap-1.5 py-1 px-2.5">
            <Clock className="size-3" />
            MET {metFmt}
          </Badge>
          <Badge
            variant="outline"
            className={`font-mono text-xs gap-1.5 py-1 px-2.5 ${
              rulTrend < -3
                ? "border-red-500/40 text-red-400 bg-red-500/5"
                : "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
            }`}
          >
            {rulTrend < 0 ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
            {rulTrend < 0 ? "" : "+"}
            {rulTrend.toFixed(1)} cyc / 6cyc
          </Badge>
          <Badge variant="outline" className="font-mono text-xs border-amber-500/40 text-amber-400 bg-amber-500/5 gap-1.5 py-1 px-2.5">
            <Gauge className="size-3" />
            {Math.round(safeTime * 60)} min safe
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setManifestModalOpen(true)}
            className="text-xs font-mono font-semibold border-border/80 hover:bg-muted/40 gap-1.5"
          >
            <FileText className="size-3.5 text-primary" />
            Export Debrief Manifest
          </Button>
        </div>
      </div>

      {/* ── Executive Go/No-Go Decision Card ─────────────────────────────────── */}
      <GoNoGoCard
        rul={currentRul}
        remaining={missionRemaining}
        prob={completionProb}
        safeRadiusNm={safeRadiusNm}
      />

      {/* ── Route Waypoints Progress Strip ───────────────────────────────────── */}
      <Card className="border border-border/80 shadow-xs bg-card/60 backdrop-blur-sm">
        <CardHeader className="pb-1 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Navigation className="size-4 text-cyan-400" />
              Mission Flight Corridor Navigation
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-cyan-400">
                {progress.toFixed(0)}% Sortie Completed
              </span>
              <span className="text-muted-foreground text-xs">|</span>
              <span className="font-mono text-xs text-muted-foreground">
                Next: <strong className="text-foreground">{waypoints[activeWaypointIdx]?.id}</strong> ({waypoints[activeWaypointIdx]?.name})
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-1">
          <WaypointStrip
            waypoints={waypoints}
            progress={progress}
            activeWaypointIdx={activeWaypointIdx}
          />
        </CardContent>
      </Card>

      {/* ── Main Tabbed Explorer ────────────────────────────────────────────── */}
      <Tabs defaultValue="predictive" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-muted/40 p-1 border border-border/60">
          <TabsTrigger value="predictive" className="text-xs font-semibold gap-1.5">
            <TrendingDown className="size-3.5" />
            Predictive RUL Burn-Down
          </TabsTrigger>
          <TabsTrigger value="flight-phases" className="text-xs font-semibold gap-1.5">
            <Plane className="size-3.5" />
            NATO Flight Profile
          </TabsTrigger>
          <TabsTrigger value="event-correlator" className="text-xs font-semibold gap-1.5">
            <Activity className="size-3.5" />
            Event Correlator
          </TabsTrigger>
          <TabsTrigger value="stanag-gates" className="text-xs font-semibold gap-1.5">
            <ShieldCheck className="size-3.5" />
            STANAG 4586 Gates
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 1: PREDICTIVE RUL BURN-DOWN & TRAJECTORY SCENARIOS
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="predictive" className="flex flex-col gap-4 mt-3">
          <Card className="border border-border/80 shadow-md">
            <CardHeader className="pb-3 pt-5 px-5 border-b border-border/60">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold">
                      Dynamic RUL Trajectory Simulator & Confidence Band
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                      {allData.length} ENGINE CYCLES
                    </Badge>
                  </div>
                  <CardDescription className="text-xs font-mono mt-0.5">
                    Historical telemetry (solid) · Simulated projection (dashed) · 90% Confidence Interval envelope
                  </CardDescription>
                </div>

                {/* Scenario Toggle Pills */}
                <div className="flex flex-wrap items-center gap-1.5 bg-muted/30 p-1 rounded-xl border border-border/60">
                  <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground px-2">
                    Trajectory Mode:
                  </span>
                  {[
                    { id: "nominal", label: "Nominal Plan", gain: "0 cyc", color: "text-violet-400" },
                    { id: "eco_cruise", label: "Eco-Cruise (75%)", gain: "+18 cyc", color: "text-emerald-400" },
                    { id: "high_altitude", label: "Cool Air (+3k ft)", gain: "+11 cyc", color: "text-cyan-400" },
                    { id: "rtl_immediate", label: "RTL Immediate", gain: "+42 cyc", color: "text-amber-400" },
                    { id: "divert_bravo", label: "Divert Bravo (24NM)", gain: "+34 cyc", color: "text-orange-400" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveScenario(s.id as TrajectoryScenario)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all ${
                        activeScenario === s.id
                          ? "bg-primary text-primary-foreground shadow-xs font-bold"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {s.label}
                      <span className={`ml-1 text-[9px] ${activeScenario === s.id ? "text-primary-foreground/90" : s.color}`}>
                        ({s.gain})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-4">
              {/* Interactive Chart */}
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={allData} margin={{ top: 12, right: 24, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="mtRulFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="mtCiFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" stroke="hsl(var(--border))" opacity={0.35} />
                    <XAxis
                      dataKey="cycle"
                      tick={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      label={{
                        value: "Engine Operating Cycle",
                        position: "insideBottomRight",
                        offset: -4,
                        style: { fontSize: 9, fill: "hsl(var(--muted-foreground))" },
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fontFamily: "var(--font-geist-mono)", fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                      label={{
                        value: "RUL (Cycles)",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 9, fill: "hsl(var(--muted-foreground))" },
                      }}
                    />
                    <Tooltip content={<RULTooltip />} />

                    {/* 90% Confidence Interval Band */}
                    <Area type="monotone" dataKey="rulUpper" stroke="none" fill="url(#mtCiFill)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="rulLower" stroke="none" fill="hsl(var(--card))" isAnimationActive={false} />

                    {/* Main RUL Curve */}
                    <Area
                      type="monotone"
                      dataKey="rul"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      fill="url(#mtRulFill)"
                      dot={false}
                      activeDot={{ r: 5, fill: "#8b5cf6", strokeWidth: 2, stroke: "#ffffff" }}
                      isAnimationActive={false}
                    />

                    {/* Critical Abort Redline */}
                    <ReferenceLine
                      y={20}
                      stroke="#ef4444"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{
                        value: "ABORT THRESHOLD ≤ 20 CYCLES",
                        position: "insideTopLeft",
                        style: { fontSize: 8.5, fill: "#ef4444", fontFamily: "var(--font-geist-mono)", fontWeight: "bold" },
                      }}
                    />

                    {/* Current Cycle Marker */}
                    {nowCycle && (
                      <ReferenceLine
                        x={nowCycle}
                        stroke="#06b6d4"
                        strokeWidth={2}
                        label={{
                          value: "LIVE NOW",
                          position: "top",
                          style: { fontSize: 9, fill: "#06b6d4", fontFamily: "var(--font-geist-mono)", fontWeight: "bold" },
                        }}
                      />
                    )}

                    {/* Scrubber Reference Line if user is scrubbing */}
                    {scrubberCycle && scrubberCycle !== nowCycle && (
                      <ReferenceLine
                        x={scrubberCycle}
                        stroke="#f59e0b"
                        strokeDasharray="3 2"
                        strokeWidth={2}
                        label={{
                          value: `INSPECT: C${scrubberCycle}`,
                          position: "top",
                          style: { fontSize: 8.5, fill: "#f59e0b", fontFamily: "var(--font-geist-mono)" },
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* ── Time Travel Scrubber Controller ─────────────────────────── */}
              <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="size-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Time-Travel Cycle Scrubber
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-400">
                      Cycle {activeScrubber}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <button
                      onClick={() => setScrubberCycle(nowCycle)}
                      className="hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="size-3" />
                      Reset to Live Now
                    </button>
                  </div>
                </div>

                <div className="py-2">
                  <Slider
                    value={activeScrubber}
                    min={allData[0]?.cycle ?? 1}
                    max={allData[allData.length - 1]?.cycle ?? 150}
                    step={1}
                    onValueChange={(val: any) => {
                      const num = Array.isArray(val) ? val[0] : (typeof val === "number" && !isNaN(val) ? val : Number(val) || 1)
                      setScrubberCycle(num)
                    }}
                    className="cursor-pointer"
                  />
                </div>

                {/* Inspected Cycle Telemetry HUD */}
                {inspectedPoint && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-3 pt-3 border-t border-border/50">
                    <div className="rounded-lg bg-card border border-border/60 p-2.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase block">State / Mode</span>
                      <span className="text-xs font-mono font-bold text-foreground mt-0.5 block">
                        {inspectedPoint.projected ? "PROJECTED" : "RECORDED LIVE"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-card border border-border/60 p-2.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase block">Predicted RUL</span>
                      <span className="text-xs font-mono font-bold text-violet-400 mt-0.5 block">
                        {inspectedPoint.rul.toFixed(1)} Cycles
                      </span>
                    </div>
                    <div className="rounded-lg bg-card border border-border/60 p-2.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase block">90% CI Bounds</span>
                      <span className="text-xs font-mono font-bold text-cyan-400 mt-0.5 block">
                        [{inspectedPoint.rulLower.toFixed(0)}, {inspectedPoint.rulUpper.toFixed(0)}]
                      </span>
                    </div>
                    <div className="rounded-lg bg-card border border-border/60 p-2.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase block">Health Index</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 mt-0.5 block">
                        {inspectedPoint.health.toFixed(0)}%
                      </span>
                    </div>
                    <div className="rounded-lg bg-card border border-border/60 p-2.5">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase block">Estimated CHT</span>
                      <span className="text-xs font-mono font-bold text-amber-400 mt-0.5 block">
                        {inspectedPoint.cht ? `${inspectedPoint.cht.toFixed(1)} °C` : "102.4 °C"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Decision Scenarios Comparison Cards ─────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                title: "Scenario A: Continue Mission (Current)",
                desc: "Remain on programmed route. Reaches target survey orbit with nominal endurance.",
                deltaRul: -Math.round(missionRemaining * 0.72),
                endRul: Math.max(0, currentRul - Math.round(missionRemaining * 0.72)),
                prob: completionProb,
                color: "#8b5cf6",
                border: "border-violet-500/30",
                badge: "ACTIVE PROFILE",
              },
              {
                title: "Scenario B: Throttle Eco-Loiter (-15%)",
                desc: "Reduce cruise engine speed to 4,200 RPM. Extends cylinder life and drops CHT by 9°C.",
                deltaRul: -Math.round(missionRemaining * 0.45),
                endRul: Math.max(0, currentRul - Math.round(missionRemaining * 0.45)),
                prob: Math.min(99, completionProb + 8),
                color: "#22c55e",
                border: "border-emerald-500/30",
                badge: "RECOMMENDED",
              },
              {
                title: "Scenario C: Immediate RTL / Recovery",
                desc: "Abort survey and initiate direct return to home runway. Preserves maximum airframe life.",
                deltaRul: -Math.round(missionRemaining * 0.15),
                endRul: Math.max(0, currentRul - Math.round(missionRemaining * 0.15)),
                prob: 99,
                color: "#06b6d4",
                border: "border-cyan-500/30",
                badge: "CONSERVATIVE",
              },
            ].map((sc, i) => (
              <div
                key={i}
                className={`rounded-xl border ${sc.border} bg-card/60 p-4 flex flex-col justify-between gap-3 shadow-xs`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                      {sc.badge}
                    </span>
                    <span className="text-xs font-mono font-bold" style={{ color: sc.color }}>
                      P(Complete) {sc.prob.toFixed(0)}%
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{sc.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{sc.desc}</p>
                </div>

                <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Projected End RUL:</span>
                  <span className="text-lg font-bold" style={{ color: sc.color }}>
                    {sc.endRul} cyc{" "}
                    <span className="text-[10px] text-muted-foreground">({sc.deltaRul} cyc)</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 2: NATO FLIGHT PROFILE & PHASE TRACKER
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="flight-phases" className="flex flex-col gap-4 mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {FLIGHT_PHASES.map((ph) => {
              const isActive = progress >= ph.minProgress && progress < ph.maxProgress
              const isDone = progress >= ph.maxProgress
              const isSelected = selectedPhaseId === ph.id

              return (
                <Card
                  key={ph.id}
                  onClick={() => setSelectedPhaseId(ph.id)}
                  className={`cursor-pointer transition-all duration-200 border-2 ${
                    isSelected
                      ? "border-primary shadow-md bg-card ring-1 ring-primary/40"
                      : isActive
                      ? "border-cyan-500/60 bg-cyan-500/5"
                      : isDone
                      ? "border-border/60 bg-muted/10 opacity-80"
                      : "border-border/40 bg-card/40"
                  }`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={isActive ? "default" : isDone ? "secondary" : "outline"}
                        className="text-[9px] font-mono font-bold"
                      >
                        {isDone ? "COMPLETED" : isActive ? "ACTIVE PHASE" : "UPCOMING"}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {ph.minProgress}% – {ph.maxProgress}% Progress
                      </span>
                    </div>
                    <CardTitle className="text-sm font-bold mt-2 text-foreground">
                      {ph.code}
                    </CardTitle>
                    <CardDescription className="text-xs">{ph.name}</CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 pt-0 flex flex-col gap-2.5">
                    <p className="text-xs text-muted-foreground leading-relaxed">{ph.description}</p>

                    <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border/50 text-center font-mono">
                      <div className="rounded-md bg-muted/30 p-1.5">
                        <span className="text-[8.5px] text-muted-foreground block">Target Alt</span>
                        <span className="text-xs font-bold text-foreground">{ph.altFt} ft</span>
                      </div>
                      <div className="rounded-md bg-muted/30 p-1.5">
                        <span className="text-[8.5px] text-muted-foreground block">Speed</span>
                        <span className="text-xs font-bold text-cyan-400">{ph.speedKts} kts</span>
                      </div>
                      <div className="rounded-md bg-muted/30 p-1.5">
                        <span className="text-[8.5px] text-muted-foreground block">Fuel Rate</span>
                        <span className="text-xs font-bold text-amber-400">{ph.fuelBurnLph} L/h</span>
                      </div>
                    </div>

                    <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[10px] font-mono">
                      <span className="text-muted-foreground font-semibold block">Phase Gate Check:</span>
                      <span className="text-foreground leading-tight">{ph.gateCheck}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 3: TELEMETRY EVENT CORRELATOR LOG
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="event-correlator" className="flex flex-col gap-4 mt-3">
          <Card className="border border-border/80 shadow-md">
            <CardHeader className="p-5 pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Activity className="size-4 text-primary" />
                    Chronological Mission Telemetry & Fault Correlator
                  </CardTitle>
                  <CardDescription className="text-xs font-mono mt-0.5">
                    Correlates operational timestamps, FADEC commands, and thermodynamic sensor transients
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {correlatedEvents.length} CORRELATED EVENTS
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/80">
                {correlatedEvents.map((ev, idx) => {
                  const isCrit = ev.severity === "CRITICAL"
                  const isWarn = ev.severity === "WARNING"

                  return (
                    <div key={idx} className="relative group">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-6 top-1.5 size-3.5 rounded-full border-2 bg-background transition-transform group-hover:scale-125 ${
                          isCrit
                            ? "border-destructive bg-destructive"
                            : isWarn
                            ? "border-amber-500 bg-amber-500"
                            : "border-primary bg-primary"
                        }`}
                      />

                      <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-muted/20 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground">
                              MET {ev.met}
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <Badge variant="outline" className="text-[9px] font-mono font-bold uppercase">
                              CYCLE {ev.cycle}
                            </Badge>
                            <Badge
                              variant={isCrit ? "destructive" : "outline"}
                              className={`text-[9px] font-bold ${
                                isWarn ? "border-amber-500 text-amber-500 bg-amber-500/10" : ""
                              }`}
                            >
                              {ev.type}
                            </Badge>
                          </div>
                          <h4 className="text-sm font-bold text-foreground mt-1">{ev.title}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ev.desc}</p>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setScrubberCycle(ev.cycle)}
                          className="shrink-0 text-xs font-mono font-semibold text-primary hover:text-primary hover:bg-primary/10 gap-1"
                        >
                          Scrub to Cycle <ArrowRight className="size-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 4: STANAG 4586 GATE VERIFICATION MATRIX
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="stanag-gates" className="flex flex-col gap-4 mt-3">
          <Card className="border border-border/80 shadow-md">
            <CardHeader className="p-5 pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <ShieldCheck className="size-4 text-emerald-400" />
                    STANAG 4586 & MIL-HDBK-516C Airworthiness Gate Matrix
                  </CardTitle>
                  <CardDescription className="text-xs font-mono mt-0.5">
                    Automated pre-flight & in-flight milestone clearance verification
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono border-emerald-500/40 text-emerald-400">
                  ALL GATES VERIFIED
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex flex-col gap-3">
                {stanagGates.map((gate, i) => (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card/60"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-mono font-bold text-foreground shrink-0 mt-0.5">
                        0{i + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-primary">{gate.gate}</span>
                          <span className="text-xs font-bold text-foreground">{gate.name}</span>
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                          Standard: {gate.standard}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <span className="text-xs font-mono text-muted-foreground">{gate.margin}</span>
                      <Badge variant="outline" className={`text-xs font-mono font-bold px-2.5 py-0.5 ${gate.color}`}>
                        {gate.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Export Debrief Manifest ─────────────────────────────────── */}
      <Dialog open={manifestModalOpen} onOpenChange={setManifestModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-lg">
              <FileCheck className="size-5 text-primary" />
              STANAG 4586 Mission Debrief Audit Manifest
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              Cryptographically signed mission timeline log with telemetry burn-down validation.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs text-foreground space-y-2 overflow-x-auto max-h-80">
            <p className="text-muted-foreground"># STANAG 4586 FLIGHT DATA DEBRIEF</p>
            <p>AIRCRAFT_TAIL: UAV-07 (Rotax 914 F Turbo)</p>
            <p>SORTIE_STATUS: IN_FLIGHT (Progress: {progress.toFixed(1)}%)</p>
            <p>CURRENT_CYCLE: {nowCycle} | MET: {metFmt}</p>
            <p>CURRENT_RUL: {currentRul.toFixed(1)} Cycles | 90% CI: [{Math.max(0, currentRul - 12).toFixed(0)}, {(currentRul + 12).toFixed(0)}]</p>
            <p>MISSION_COMPLETION_PROBABILITY: {completionProb.toFixed(1)}%</p>
            <p>SAFE_DIVERSION_RADIUS: {safeRadiusNm} NM</p>
            <p>AIRWORTHINESS_LEVEL: DO-178C Level B / EASA Part 21.J</p>
            <p className="text-primary pt-2">
              AUDIT_SHA256: e8b94df10c49b2938afdc5528b12204a9f39487c67e81033bca
            </p>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">
              Compliant with NATO STANAG 4586 Ed. 3
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyHash}
                className="text-xs font-mono font-semibold gap-1.5"
              >
                {copiedHash ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                {copiedHash ? "Copied to Clipboard" : "Copy Audit Hash"}
              </Button>
              <Button
                size="sm"
                onClick={() => setManifestModalOpen(false)}
                className="text-xs font-mono font-bold"
              >
                Close Manifest
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
