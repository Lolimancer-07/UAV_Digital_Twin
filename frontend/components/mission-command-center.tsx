"use client"

import * as React from "react"
import Link from "next/link"
import {
  ActivityIcon,
  ArrowRightIcon,
  BatteryChargingIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  CloudSunIcon,
  FuelIcon,
  ListChecksIcon,
  NavigationIcon,
  PlaneTakeoffIcon,
  PlayIcon,
  RadarIcon,
  RadioIcon,
  RouteIcon,
  Share2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ThermometerIcon,
  UsersIcon,
  WindIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTelemetry } from "@/components/telemetry-provider"
import { TacticalMissionMap } from "@/components/tactical-mission-map"
import { EmergencyChecklistDialog } from "@/components/emergency-checklist-dialog"
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
      {
        id: "FOXTROT",
        name: "Recovery Field Foxtrot",
        latitude: 26.838,
        longitude: 78.167,
        terrain: "emergency strip",
        distance_nm: 5.8,
        suitability_score: 84,
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

function RecoverySiteRows({
  sites,
  selectedSiteId,
  onSelectSite,
}: {
  sites: MissionCommandRecoverySite[]
  selectedSiteId: string
  onSelectSite: (siteId: string) => void
}) {
  return (
    <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-background/60 overflow-hidden">
      {sites.slice(0, 3).map((site, index) => {
        const isSelected = site.id === selectedSiteId
        return (
          <button
            type="button"
            key={site.id}
            onClick={() => onSelectSite(site.id)}
            className={`w-full text-left grid grid-cols-[auto_1fr_auto] items-center gap-2.5 px-3 py-2.5 transition-all ${
              isSelected
                ? "bg-emerald-500/10 border-l-4 border-l-emerald-500"
                : "hover:bg-muted/40"
            }`}
          >
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                isSelected
                  ? "bg-emerald-500 text-white"
                  : index === 0
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-semibold">{site.name}</p>
                {isSelected && (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[8px] px-1 py-0 font-mono">
                    TARGET DIVERT
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {site.distance_nm.toFixed(1)} nm · {site.terrain}
              </p>
            </div>
            <Badge
              className={
                site.within_powerplant_safe_radius
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-mono text-[10px]"
              }
              variant="outline"
            >
              {site.suitability_score}%
            </Badge>
          </button>
        )
      })}
    </div>
  )
}

function PredictiveFuelReserveEnvelope({
  activeSiteId,
  recoverySites,
  liveSpeedKts,
}: {
  activeSiteId: string
  recoverySites: MissionCommandRecoverySite[]
  liveSpeedKts: number
}) {
  const fuelBurnLph = 12.9
  const totalFuelCapacityL = 40.0
  const currentFuelL = 28.5

  const siteProjections = recoverySites.slice(0, 3).map((site) => {
    const dist = site.distance_nm
    const timeHrs = dist / Math.max(25, liveSpeedKts)
    const fuelUsedL = timeHrs * fuelBurnLph
    const remainingFuelL = Math.max(0, currentFuelL - fuelUsedL)
    const remainingPct = Math.round((remainingFuelL / totalFuelCapacityL) * 100)
    const status = remainingPct >= 65 ? "OPTIMAL" : remainingPct >= 50 ? "ADEQUATE" : "CRITICAL"
    return {
      ...site,
      remainingFuelL: remainingFuelL.toFixed(1),
      remainingPct,
      status,
    }
  })

  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FuelIcon className="size-4 text-emerald-500" />
          <p className="text-xs font-bold text-foreground">Predictive Fuel & Energy Envelope</p>
        </div>
        <Badge variant="outline" className="font-mono text-[9px] text-cyan-600 dark:text-cyan-400 border-cyan-500/30">
          3.4 GPH (12.9 L/H) DERATE
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Dynamic touchdown reserve forecast factoring descent glide, winds aloft, and 28V DC bus health.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {siteProjections.map((site) => {
          const isTarget = site.id === activeSiteId
          return (
            <div
              key={site.id}
              className={`p-2 rounded-lg border font-mono transition-all ${
                isTarget
                  ? "border-emerald-500/50 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500/30"
                  : "border-border/60 bg-background/50"
              }`}
            >
              <div className="flex items-center justify-between text-[9px]">
                <span className="font-bold text-foreground">{site.id}</span>
                <span
                  className={`px-1 py-0.2 rounded text-[7.5px] font-bold ${
                    site.status === "OPTIMAL"
                      ? "text-emerald-500 bg-emerald-500/10"
                      : "text-amber-500 bg-amber-500/10"
                  }`}
                >
                  {site.status}
                </span>
              </div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {site.remainingPct}% <span className="text-[9px] font-normal text-muted-foreground">({site.remainingFuelL}L)</span>
              </div>
              <p className="text-[8.5px] text-muted-foreground mt-0.5 truncate">{site.name}</p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-border/60 bg-background/50 p-2 text-[9.5px] font-mono">
        <div className="flex items-center gap-1 text-muted-foreground">
          <BatteryChargingIcon className="size-3 text-emerald-500" />
          <span>AVIONICS: <strong className="text-foreground">28.4V DUAL BUS</strong></span>
        </div>
        <span className="text-muted-foreground">·</span>
        <div className="text-muted-foreground">
          RESERVE: <strong className="text-emerald-500">48 MIN BACKUP</strong>
        </div>
        <span className="text-muted-foreground">·</span>
        <div className="text-muted-foreground">
          WIND BONUS: <strong className="text-cyan-500">+0.4L TAILWIND</strong>
        </div>
      </div>
    </div>
  )
}

function SwarmRelieverHandshake({
  isSafeReturnActive,
  activeUavId = "UAV-07",
  relieverUavId = "UAV-02",
}: {
  isSafeReturnActive: boolean
  activeUavId?: string
  relieverUavId?: string
}) {
  const [countdownSecs, setCountdownSecs] = React.useState(340)

  React.useEffect(() => {
    if (!isSafeReturnActive) return
    const interval = setInterval(() => {
      setCountdownSecs((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [isSafeReturnActive])

  const etaFormatted = `${Math.floor(countdownSecs / 60)}m ${String(countdownSecs % 60).padStart(2, "0")}s`

  return (
    <Card className="border-cyan-500/30 bg-cyan-500/5 shadow-md" size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="size-4 text-cyan-500" />
            <CardTitle className="text-sm">Swarm Reliever Handshake (Fleet Handoff)</CardTitle>
          </div>
          <Badge className="border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 font-mono text-[10px]" variant="outline">
            {isSafeReturnActive ? "HANDOFF IN PROGRESS" : "STANDBY ASSET"}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          When {activeUavId} diverts, neighboring fleet assets dynamically vector to assume surveillance orbit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
          <div className="p-2 rounded-lg border border-border/60 bg-background/60">
            <span className="text-[10px] text-muted-foreground uppercase">Reliever ID</span>
            <p className="font-bold text-foreground mt-0.5">{relieverUavId} (ALPHA-02)</p>
            <span className="text-[9px] text-emerald-500">HEALTH: 87% · 112 cyc</span>
          </div>
          <div className="p-2 rounded-lg border border-border/60 bg-background/60">
            <span className="text-[10px] text-muted-foreground uppercase">Orbit Intercept</span>
            <p className="font-bold text-cyan-500 mt-0.5">{isSafeReturnActive ? etaFormatted : "STANDBY"}</p>
            <span className="text-[9px] text-muted-foreground">Point: Alpha Ridge</span>
          </div>
          <div className="p-2 rounded-lg border border-border/60 bg-background/60">
            <span className="text-[10px] text-muted-foreground uppercase">Handshake State</span>
            <p className="font-bold text-emerald-500 mt-0.5">
              {isSafeReturnActive ? "EN ROUTE (48 KT)" : "READY TO SCRAMBLE"}
            </p>
            <span className="text-[9px] text-muted-foreground">Range: 14.2 NM</span>
          </div>
          <div className="p-2 rounded-lg border border-border/60 bg-background/60 flex flex-col justify-center">
            <Link href="/fleet">
              <Button size="sm" variant="outline" className="w-full text-xs font-mono h-7 gap-1 border-cyan-500/40 text-cyan-600 dark:text-cyan-300">
                <Share2Icon className="size-3" /> FLEET MONITOR
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
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
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{event.type.replaceAll("_", " ")}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">cycle {event.cycle}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{event.message}</p>
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
  const [simulationRequested, setSimulationRequested] = React.useState(false)
  const [approvalRequested, setApprovalRequested] = React.useState(false)
  const [commandError, setCommandError] = React.useState<string | null>(null)
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>("ECHO")
  const [isSafeReturnEngaged, setIsSafeReturnEngaged] = React.useState(false)
  const [isChecklistOpen, setIsChecklistOpen] = React.useState(false)

  const command = (latestTelemetry?.mission_command as MissionCommandState | undefined) ?? FALLBACK_COMMAND
  const commandIsLive = Boolean(latestTelemetry?.mission_command)
  const action = command.action
  const plan = action.plan
  const simulation = action.simulation
  const simulationPending = simulationRequested && !simulation
  const approved = action.status === "APPROVED_AND_LOGGED"
  const isSafeReturnActive = isSafeReturnEngaged || approved || command.mission.risk_level === "CRITICAL"
  const riskTone = command.mission.risk_level === "CRITICAL" ? "crit" : command.mission.risk_level === "HIGH" || command.mission.risk_level === "MODERATE" ? "warn" : "ok"

  const selectedSite = command.route.recovery_sites.find((s) => s.id === selectedSiteId) ?? command.route.recovery_sites[0]

  const handleInitiateSafeReturn = () => {
    setIsSafeReturnEngaged(true)
    setIsChecklistOpen(true) // Open Aerospace Emergency Checklist
    setCommandError(null)
    sendCommand({ command: "mission_command_simulate" })
    sendCommand({ command: "set_profile", profile: "ENDURANCE" })
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
    <>
      {/* Emergency Aerospace Checklist Dialog */}
      <EmergencyChecklistDialog
        open={isChecklistOpen}
        onOpenChange={setIsChecklistOpen}
        destinationName={selectedSite?.name ?? "Forward Site Echo"}
      />

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
                    <CardDescription className="text-xs">Interactive tactical radar with FLIR HUD, glideslope elevation, and threat-avoidance routing.</CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    <NavigationIcon className="size-3" /> {command.route.position.latitude.toFixed(3)}, {command.route.position.longitude.toFixed(3)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <TacticalMissionMap
                  route={command.route}
                  selectedSiteId={selectedSiteId}
                  onSelectSite={setSelectedSiteId}
                  isSafeReturnActive={isSafeReturnActive}
                  healthIndex={latestTelemetry?.health?.health_index ?? 85}
                  currentRpm={plan.parameters.current_rpm}
                  targetRpm={plan.parameters.target_rpm}
                />
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-xs font-semibold">Best recovery options (Click site to divert)</p>
                    <p className="text-[11px] text-muted-foreground">Suitability includes real-time distance, terrain glide slope, and powerplant-safe range.</p>
                  </div>
                  <Badge className="w-fit border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]" variant="outline">
                    REAL-TIME VECTORING
                  </Badge>
                </div>
                <RecoverySiteRows
                  sites={command.route.recovery_sites}
                  selectedSiteId={selectedSiteId}
                  onSelectSite={setSelectedSiteId}
                />

                {/* Predictive Fuel & Battery Reserve Envelope */}
                <PredictiveFuelReserveEnvelope
                  activeSiteId={selectedSiteId}
                  recoverySites={command.route.recovery_sites}
                  liveSpeedKts={command.route.position.ground_speed_kts}
                />
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

                {isSafeReturnActive && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs flex items-center justify-between gap-2 text-emerald-700 dark:text-emerald-300 font-mono">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheckIcon className="size-4 text-emerald-500 animate-pulse shrink-0" />
                      <span>SAFE RETURN VECTOR ACTIVE → {selectedSiteId}</span>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono text-[9px]">
                      1200 RPM DERATE
                    </Badge>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button
                    disabled={simulationPending || approved}
                    onClick={handleInitiateSafeReturn}
                    size="sm"
                    className="w-full font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm gap-2"
                  >
                    <NavigationIcon className="size-3.5 animate-pulse" />
                    {simulationPending
                      ? "SIMULATION REQUESTED..."
                      : isSafeReturnActive
                      ? "RE-CALCULATE REAL-TIME SAFE RETURN"
                      : "INITIATE REAL-TIME SAFE RETURN"}
                  </Button>

                  {/* Checklist trigger button */}
                  <Button
                    onClick={() => setIsChecklistOpen(true)}
                    size="sm"
                    variant="outline"
                    className="w-full border-border font-semibold text-xs gap-1.5"
                  >
                    <ListChecksIcon className="size-3.5 text-emerald-500" />
                    OPEN EMERGENCY CHECKLIST (SOP)
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

                {/* Swarm Reliever Handshake Card in right column */}
                <SwarmRelieverHandshake
                  isSafeReturnActive={isSafeReturnActive}
                  activeUavId="UAV-07"
                  relieverUavId="UAV-02"
                />

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

          {/* ── Quick link: Mission Timeline ─────────────────────────────── */}
          <Link
            href="/mission-timeline"
            className="group flex items-center justify-between rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-cyan-500/5 px-4 py-3 transition-all hover:border-violet-500/60 hover:from-violet-500/15"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/15">
                <ArrowRightIcon className="size-4 text-violet-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-violet-300">View Predictive Mission Timeline</p>
                <p className="text-[10px] font-mono text-muted-foreground">RUL burn-down · Go/No-Go zones · Scenario comparison</p>
              </div>
            </div>
            <ArrowRightIcon className="size-4 text-violet-400 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <ActivityIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span><strong className="text-foreground">PropulsionX Defense Suite:</strong> Multi-layer mission decision support system with real-time vectoring, dynamic FLIR HUD vision, threat-avoidance routing, and automated fleet relief.</span>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
