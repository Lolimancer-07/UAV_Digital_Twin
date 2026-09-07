"use client"

import * as React from "react"
import {
  ActivityIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  CloudSunIcon,
  NavigationIcon,
  PlaneTakeoffIcon,
  PlayIcon,
  RadarIcon,
  RouteIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ThermometerIcon,
  WindIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTelemetry } from "@/components/telemetry-provider"
import type {
  MissionCommandRecoverySite,
  MissionCommandState,
} from "@/lib/telemetry/types"

const FALLBACK_COMMAND: MissionCommandState = {
  schema_version: "1.0",
  mode: "SIMULATED_TRAINING_CORRIDOR",
  mission: {
    completion_probability: 92,
    risk_level: "LOW",
    risk_color: "ok",
    safe_operating_time_h: 3.2,
    narrative: "Mission is within the simulated propulsion safety envelope.",
  },
  environment: {
    label: "NOMINAL ENVELOPE",
    score: 96,
    oat_c: 15,
    altitude_ft: 3000,
    factors: ["within simulated environmental envelope"],
    source: "Derived from live OAT and altitude telemetry; not an external weather feed.",
  },
  route: {
    label: "SIMULATED MISSION CORRIDOR",
    is_simulated: true,
    position: {
      latitude: 26.756,
      longitude: 78.118,
      mission_progress_pct: 31,
      heading_deg: 64,
      ground_speed_kts: 58,
    },
    waypoints: [
      { id: "HOME", name: "Home Base", latitude: 26.706, longitude: 78.026 },
      { id: "ALPHA", name: "Alpha Ridge", latitude: 26.755, longitude: 78.118 },
      { id: "BRAVO", name: "Bravo Survey", latitude: 26.812, longitude: 78.208 },
      { id: "CHARLIE", name: "Charlie Loiter", latitude: 26.858, longitude: 78.12 },
      { id: "RETURN", name: "Home Base", latitude: 26.706, longitude: 78.026 },
    ],
    safe_radius_nm: 186,
    recovery_sites: [
      {
        id: "HOME",
        name: "Home Base",
        latitude: 26.706,
        longitude: 78.026,
        terrain: "paved strip",
        distance_nm: 7.1,
        suitability_score: 96,
        within_powerplant_safe_radius: true,
      },
      {
        id: "ECHO",
        name: "Forward Site Echo",
        latitude: 26.776,
        longitude: 78.154,
        terrain: "prepared strip",
        distance_nm: 2.3,
        suitability_score: 98,
        within_powerplant_safe_radius: true,
      },
    ],
  },
  trust: {
    confidence: 94,
    label: "HIGH CONFIDENCE",
    twin_score: 96,
    sensor_score: 94,
    telemetry_score: 92,
    evidence: [
      { source: "AI anomaly model", state: "NOMINAL" },
      { source: "Physics cross-validation", state: "NORMAL" },
      { source: "Sensor integrity", state: "94% trusted" },
      { source: "Telemetry integrity", state: "92% trusted" },
    ],
  },
  fleet_reassignment: {
    required: false,
    candidate: {
      uav_id: "UAV-02",
      call_sign: "ALPHA-02",
      mission: "ROUTE-SURVEY",
      health: 89,
      rul: 110,
      mission_probability: 88,
      readiness_score: 88,
    },
    alternates: [],
    recommendation: "UAV-02 is the highest-readiness relief candidate if conditions worsen.",
  },
  action: {
    action_id: "RECOVERY-PLAN",
    status: "READY",
    execution_mode: "SIMULATION_ONLY",
    plan: {
      decision: "CONTINUE WITH MONITORING",
      action: "MAINTAIN PROFILE",
      requires_operator_approval: false,
      execution_mode: "SIMULATION_ONLY",
      rationale: "Current AI, physics, and mission-risk evidence support the active simulated profile.",
      evidence: ["No current propulsion condition requires a recovery diversion."],
      parameters: {
        current_rpm: 2200,
        target_rpm: 2200,
        current_altitude_ft: 3000,
        target_altitude_ft: 3000,
      },
    },
    simulation: null,
    approved_cycle: null,
  },
  timeline: [
    {
      id: "MC-001",
      cycle: 0,
      type: "MISSION_STATUS",
      severity: "INFO",
      message: "Mission Command Center is awaiting live twin telemetry.",
    },
  ],
  disclaimer: "Decision support only. Recovery controls remain simulated and require operator review.",
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function severityClasses(value: string) {
  if (value === "CRITICAL" || value === "crit" || value === "SIMULATION_ERROR") {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }
  if (value === "HIGH" || value === "MODERATE" || value === "WARNING" || value === "warn") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
}

function progressClass(value: number) {
  if (value >= 80) return "bg-emerald-500"
  if (value >= 60) return "bg-amber-500"
  return "bg-destructive"
}

function Metric({ label, value, detail, tone = "default" }: {
  label: string
  value: React.ReactNode
  detail: string
  tone?: "default" | "ok" | "warn" | "crit"
}) {
  const toneClass = {
    default: "text-foreground",
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    crit: "text-destructive",
  }[tone]

  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className={`mt-1 font-mono text-2xl font-bold ${toneClass}`}>{value}</div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  )
}

function MissionMap({ route }: { route: MissionCommandState["route"] }) {
  const mapPoints = [...route.waypoints, ...route.recovery_sites, route.position]
  const latitudes = mapPoints.map((point) => point.latitude)
  const longitudes = mapPoints.map((point) => point.longitude)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)
  const latSpan = Math.max(0.01, maxLat - minLat)
  const lonSpan = Math.max(0.01, maxLon - minLon)
  const padding = 38
  const width = 640
  const height = 340
  const x = (longitude: number) => padding + ((longitude - minLon) / lonSpan) * (width - padding * 2)
  const y = (latitude: number) => height - padding - ((latitude - minLat) / latSpan) * (height - padding * 2)
  const routeLine = route.waypoints.map((point) => `${x(point.longitude)},${y(point.latitude)}`).join(" ")
  const currentX = x(route.position.longitude)
  const currentY = y(route.position.latitude)
  const safeRadius = clamp(route.safe_radius_nm * 0.65, 34, 106)

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-slate-950 text-slate-100">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <Badge className="border-cyan-300/30 bg-cyan-300/10 font-mono text-[10px] text-cyan-100" variant="outline">
          <RadarIcon className="size-3" /> SIMULATED TRACK
        </Badge>
      </div>
      <div className="absolute bottom-3 left-3 z-10 rounded-md border border-white/10 bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-slate-300">
        Powerplant-safe radius: {route.safe_radius_nm.toFixed(0)} nm
      </div>
      <svg aria-label="Simulated mission corridor and recovery sites" className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <pattern height="24" id="command-grid" patternUnits="userSpaceOnUse" width="24">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(148, 163, 184, .12)" strokeWidth="1" />
          </pattern>
          <radialGradient id="safe-radius" r="1">
            <stop offset="0%" stopColor="rgb(45 212 191)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgb(45 212 191)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect fill="url(#command-grid)" height={height} width={width} />
        <path d="M30 275 C155 244 235 122 366 105 S510 166 620 73" fill="none" opacity="0.18" stroke="rgb(45 212 191)" strokeWidth="13" />
        <polyline fill="none" points={routeLine} stroke="rgb(103 232 249)" strokeDasharray="7 6" strokeWidth="2.5" />
        <circle cx={currentX} cy={currentY} fill="url(#safe-radius)" r={safeRadius} />
        <circle cx={currentX} cy={currentY} fill="none" r={safeRadius} stroke="rgb(45 212 191)" strokeDasharray="4 5" strokeOpacity="0.75" strokeWidth="1.5" />

        {route.waypoints.map((waypoint, index) => {
          const waypointX = x(waypoint.longitude)
          const waypointY = y(waypoint.latitude)
          return (
            <g key={`${waypoint.id}-${index}`}>
              <circle cx={waypointX} cy={waypointY} fill="rgb(186 230 253)" r="4" />
              <text fill="rgb(203 213 225)" fontFamily="monospace" fontSize="10" x={waypointX + 8} y={waypointY - 7}>
                {waypoint.name}
              </text>
            </g>
          )
        })}

        {route.recovery_sites.map((site) => {
          const siteX = x(site.longitude)
          const siteY = y(site.latitude)
          return (
            <g key={site.id}>
              <rect fill={site.within_powerplant_safe_radius ? "rgb(52 211 153)" : "rgb(251 146 60)"} height="9" rx="2" width="9" x={siteX - 4.5} y={siteY - 4.5} />
              <text fill="rgb(241 245 249)" fontFamily="monospace" fontSize="10" x={siteX + 8} y={siteY + 14}>
                {site.id}
              </text>
            </g>
          )
        })}

        <g transform={`translate(${currentX} ${currentY}) rotate(${route.position.heading_deg})`}>
          <circle fill="rgb(34 211 238)" opacity="0.25" r="17" />
          <path d="M0 -12 L8 10 L0 6 L-8 10 Z" fill="rgb(103 232 249)" stroke="white" strokeWidth="1" />
        </g>
      </svg>
    </div>
  )
}

function RecoverySiteRows({ sites }: { sites: MissionCommandRecoverySite[] }) {
  return (
    <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-background/60">
      {sites.slice(0, 3).map((site, index) => (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2.5" key={site.id}>
          <span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${index === 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{site.name}</p>
            <p className="text-[10px] text-muted-foreground">{site.distance_nm.toFixed(1)} nm · {site.terrain}</p>
          </div>
          <Badge className={site.within_powerplant_safe_radius ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"} variant="outline">
            {site.suitability_score}%
          </Badge>
        </div>
      ))}
    </div>
  )
}

function TrustMeter({ command }: { command: MissionCommandState }) {
  const metrics = [
    ["Twin agreement", command.trust.twin_score],
    ["Sensor integrity", command.trust.sensor_score],
    ["Telemetry integrity", command.trust.telemetry_score],
  ] as const

  return (
    <Card className="border-border/70 bg-card/80" size="sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 text-primary" />
              <CardTitle>Evidence & Trust</CardTitle>
            </div>
            <CardDescription className="text-xs">Why the recommendation is credible</CardDescription>
          </div>
          <Badge className={severityClasses(command.trust.label === "HIGH CONFIDENCE" ? "ok" : "warn")} variant="outline">
            {command.trust.confidence.toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-semibold">{value.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${progressClass(value)}`} style={{ width: `${clamp(value, 0, 100)}%` }} />
            </div>
          </div>
        ))}
        <div className="space-y-1 border-t border-border/60 pt-2">
          {command.trust.evidence.map((item) => (
            <div className="flex items-center justify-between gap-3 text-[11px]" key={item.source}>
              <span className="text-muted-foreground">{item.source}</span>
              <span className="truncate font-mono font-semibold text-right">{item.state}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Timeline({ events }: { events: MissionCommandState["timeline"] }) {
  return (
    <Card className="border-border/70 bg-card/80" size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardCheckIcon className="size-4 text-primary" />
          <CardTitle>Decision Audit Trail</CardTitle>
        </div>
        <CardDescription className="text-xs">Evidence, simulation, and operator approvals are cycle-stamped.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {events.slice(0, 5).map((event) => (
            <li className="grid grid-cols-[auto_1fr] gap-2" key={event.id}>
              <span className={`mt-1.5 size-2 rounded-full ${event.severity === "CRITICAL" ? "bg-destructive" : event.severity === "WARNING" ? "bg-amber-500" : "bg-emerald-500"}`} />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold tracking-wide text-muted-foreground">{event.type.replaceAll("_", " ")}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">C{event.cycle}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed">{event.message}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function MissionCommandCenter() {
  const { latestTelemetry, sendCommand } = useTelemetry()
  const command = latestTelemetry?.mission_command ?? FALLBACK_COMMAND
  const commandIsLive = Boolean(latestTelemetry?.mission_command)
  const [simulationRequested, setSimulationRequested] = React.useState(false)
  const [approvalRequested, setApprovalRequested] = React.useState(false)
  const [commandError, setCommandError] = React.useState<string | null>(null)

  const action = command.action
  const plan = action.plan
  const simulation = action.simulation
  const simulationPending = simulationRequested && action.status === "READY"
  const approved = action.status === "APPROVED_AND_LOGGED"
  const riskTone = command.mission.risk_level === "CRITICAL" ? "crit" : command.mission.risk_level === "HIGH" || command.mission.risk_level === "MODERATE" ? "warn" : "ok"

  const requestSimulation = () => {
    setCommandError(null)
    if (!sendCommand({ command: "mission_command_simulate" })) {
      setCommandError("Connect to the updated Digital Twin core to run this simulation.")
      return
    }
    setSimulationRequested(true)
  }

  const approvePlan = () => {
    setCommandError(null)
    if (!sendCommand({ command: "mission_command_approve" })) {
      setCommandError("The operator approval could not be logged because the live link is unavailable.")
      return
    }
    setApprovalRequested(true)
  }

  return (
    <Card className="border-2 border-primary/25 bg-card/90 shadow-xl" size="sm">
      <CardHeader className="border-b border-border/70 bg-muted/25">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-primary/40 bg-primary/10 font-mono text-[10px] text-primary" variant="outline">
                <RadarIcon className="size-3" /> MISSION COMMAND CENTER
              </Badge>
              <Badge className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-700 dark:text-cyan-300" variant="outline">
                HUMAN-IN-THE-LOOP
              </Badge>
              {!commandIsLive && (
                <Badge className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300" variant="outline">
                  DEMO PREVIEW
                </Badge>
              )}
            </div>
            <CardTitle className="mt-2 text-xl">Turn propulsion intelligence into a mission decision</CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-xs leading-relaxed">
              Route-aware recovery planning, transparent evidence, fleet relief, and an audit-only approval flow—without replacing the existing Digital Twin controls.
            </CardDescription>
          </div>
          <Badge className={`px-3 py-1.5 font-mono text-xs ${severityClasses(command.mission.risk_level)}`} variant="outline">
            {command.mission.risk_level} · {command.mission.completion_probability.toFixed(1)}% MISSION
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric detail="Existing mission-risk model" label="Mission completion" tone={riskTone} value={`${command.mission.completion_probability.toFixed(1)}%`} />
          <Metric detail="Powerplant-safe endurance estimate" label="Safe operating time" tone={riskTone} value={`${command.mission.safe_operating_time_h.toFixed(1)} h`} />
          <Metric detail={`${command.route.position.ground_speed_kts.toFixed(0)} kt · HDG ${command.route.position.heading_deg.toFixed(0)}°`} label="Mission progress" value={`${command.route.position.mission_progress_pct.toFixed(0)}%`} />
          <Metric detail="AI + physics + data quality" label="Decision confidence" tone={command.trust.confidence >= 80 ? "ok" : "warn"} value={`${command.trust.confidence.toFixed(0)}%`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.85fr)]">
          <Card className="border-border/70 bg-card/70" size="sm">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <RouteIcon className="size-4 text-primary" />
                    <CardTitle>Route-aware Safe Return</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Notional training corridor with recovery-site suitability based on current powerplant-safe range.</CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  <NavigationIcon className="size-3" /> {command.route.position.latitude.toFixed(3)}, {command.route.position.longitude.toFixed(3)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <MissionMap route={command.route} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-xs font-semibold">Best recovery options</p>
                  <p className="text-[11px] text-muted-foreground">Suitability includes distance to the simulated site and the live environmental envelope.</p>
                </div>
                <Badge className="w-fit border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" variant="outline">
                  SIMULATION ONLY
                </Badge>
              </div>
              <RecoverySiteRows sites={command.route.recovery_sites} />
            </CardContent>
          </Card>

          <Card className={`border ${plan.requires_operator_approval ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`} size="sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {plan.requires_operator_approval ? <ShieldAlertIcon className="size-4 text-amber-600 dark:text-amber-400" /> : <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />}
                    <CardTitle>Recommended Next Move</CardTitle>
                  </div>
                  <CardDescription className="text-xs">{plan.decision}</CardDescription>
                </div>
                <Badge className={severityClasses(action.status === "SIMULATION_ERROR" ? "SIMULATION_ERROR" : plan.requires_operator_approval ? "warn" : "ok")} variant="outline">
                  {action.status.replaceAll("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-background/75 p-3">
                <p className="font-mono text-sm font-bold text-primary">{plan.action}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plan.rationale}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-background/60 p-3 font-mono text-xs">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">RPM target</p>
                  <p className="mt-1 font-bold">{plan.parameters.current_rpm.toFixed(0)} <ArrowRightIcon className="mx-1 inline size-3 text-muted-foreground" /> <span className="text-primary">{plan.parameters.target_rpm.toFixed(0)}</span></p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Altitude target</p>
                  <p className="mt-1 font-bold">{(plan.parameters.current_altitude_ft / 1000).toFixed(1)}k <ArrowRightIcon className="mx-1 inline size-3 text-muted-foreground" /> <span className="text-primary">{(plan.parameters.target_altitude_ft / 1000).toFixed(1)}k</span></p>
                </div>
              </div>

              {simulation ? (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold">Simulated outcome</p>
                    <Badge className="border-primary/30 bg-primary/10 font-mono text-[10px] text-primary" variant="outline">PHYSICS-INFORMED</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Mission</p>
                      <p className="mt-0.5 font-bold">{simulation.baseline_completion_probability.toFixed(1)}% <span className="text-primary">→ {simulation.projected_completion_probability.toFixed(1)}%</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">RUL</p>
                      <p className="mt-0.5 font-bold">{simulation.rul_delta >= 0 ? "+" : ""}{simulation.rul_delta.toFixed(1)} cyc</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Thermal relief</p>
                      <p className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">−{simulation.thermal_relief_f.toFixed(1)}°F</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
                  Run the safe-return simulation to compare the current mission against the proposed lower-load profile.
                </div>
              )}

              {commandError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                  {commandError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button disabled={simulationPending || approved} onClick={requestSimulation} size="sm" className="w-full font-semibold">
                  <PlayIcon className="size-3.5" />
                  {simulationPending ? "SIMULATION REQUESTED" : simulation ? "RE-RUN SAFE RETURN" : "SIMULATE SAFE RETURN"}
                </Button>
                {simulation && !approved && (
                  <Button disabled={approvalRequested} onClick={approvePlan} size="sm" variant="outline" className="w-full border-primary/40 font-semibold text-primary">
                    <ClipboardCheckIcon className="size-3.5" />
                    {approvalRequested ? "APPROVAL REQUESTED" : "LOG OPERATOR APPROVAL"}
                  </Button>
                )}
                {approved && (
                  <div className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2Icon className="size-3.5" /> APPROVAL AUDIT-LOGGED
                  </div>
                )}
              </div>
              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">{command.disclaimer}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <TrustMeter command={command} />

          <Card className="border-border/70 bg-card/80" size="sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CloudSunIcon className="size-4 text-primary" />
                <CardTitle>Environmental Envelope</CardTitle>
              </div>
              <CardDescription className="text-xs">Uses existing live ambient and altitude telemetry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/70 bg-background/60 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><ThermometerIcon className="size-3" /> OAT</div>
                  <p className="mt-1 font-mono text-lg font-bold">{command.environment.oat_c.toFixed(0)}°C</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/60 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><WindIcon className="size-3" /> Altitude</div>
                  <p className="mt-1 font-mono text-lg font-bold">{(command.environment.altitude_ft / 1000).toFixed(1)}k</p>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Envelope score</span>
                  <span className="font-mono font-semibold">{command.environment.score.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${progressClass(command.environment.score)}`} style={{ width: `${clamp(command.environment.score, 0, 100)}%` }} /></div>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground">{command.environment.factors.join(" · ")}</div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80" size="sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <PlaneTakeoffIcon className="size-4 text-primary" />
                <CardTitle>Fleet Relief Recommendation</CardTitle>
              </div>
              <CardDescription className="text-xs">Preserves mission continuity if the active airframe is at risk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {command.fleet_reassignment.candidate ? (
                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-bold text-primary">{command.fleet_reassignment.candidate.uav_id}</p>
                      <p className="text-[11px] text-muted-foreground">{command.fleet_reassignment.candidate.call_sign ?? "Standby airframe"}</p>
                    </div>
                    <Badge className={command.fleet_reassignment.required ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"} variant="outline">
                      {command.fleet_reassignment.candidate.readiness_score.toFixed(0)}% READY
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 font-mono text-[10px]">
                    <span>Health <strong className="block text-sm">{command.fleet_reassignment.candidate.health?.toFixed(0) ?? "—"}</strong></span>
                    <span>RUL <strong className="block text-sm">{command.fleet_reassignment.candidate.rul?.toFixed(0) ?? "—"}</strong></span>
                    <span>Mission <strong className="block text-sm">{command.fleet_reassignment.candidate.mission_probability?.toFixed(0) ?? "—"}%</strong></span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No standby airframe is available in the current fleet state.</div>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">{command.fleet_reassignment.recommendation}</p>
            </CardContent>
          </Card>
        </div>

        <Timeline events={command.timeline} />

        <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <ActivityIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span><strong className="text-foreground">Demo note:</strong> the corridor, locations, and recovery sites are explicitly simulated for the digital-twin demonstration. The decision confidence and recommendations are derived from the existing live telemetry, AI, physics, and integrity modules.</span>
        </div>
      </CardContent>
    </Card>
  )
}
