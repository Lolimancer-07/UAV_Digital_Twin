"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, Radio } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTelemetry } from "@/components/telemetry-provider"

const ROUTE_LABELS: Record<string, { label: string; parent?: string }> = {
  "/": { label: "GCS Overview" },
  "/dashboard": { label: "GCS Overview" },
  "/twin-3d": { label: "3D Digital Twin", parent: "GCS Overview" },
  "/mission-timeline": { label: "Mission Timeline", parent: "GCS Overview" },
  "/telemetry": { label: "Telemetry Matrix", parent: "GCS Overview" },
  "/prognostics": { label: "Prognostics & Attribution", parent: "GCS Overview" },
  "/thermodynamics": { label: "Thermodynamics & P-V", parent: "GCS Overview" },
  "/envelope": { label: "Operational Envelope", parent: "GCS Overview" },
  "/can": { label: "CAN Bus FDR", parent: "GCS Overview" },
  "/maintenance": { label: "Maintenance Advisories", parent: "GCS Overview" },
  "/fleet": { label: "Multi-UAV Fleet", parent: "GCS Overview" },
  "/mission-command": { label: "Mission Command", parent: "GCS Overview" },
  "/neural-engine": { label: "PropulsionX Neural Engine", parent: "AI Intelligence" },
  "/nexus": { label: "PropulsionX Neural Engine", parent: "AI Intelligence" },
  "/airworthiness": { label: "Airworthiness", parent: "Engineering" },
  "/replay": { label: "Mission Debrief", parent: "Engineering" },
  "/flight-data": { label: "Flight Data Recorder", parent: "Engineering" },
  "/dossier": { label: "Dossier Export", parent: "Engineering" },
  "/settings": { label: "System Settings", parent: "System" },
}

function Breadcrumb() {
  const pathname = usePathname()
  const route = ROUTE_LABELS[pathname] ?? { label: pathname.replace(/\//g, "").replace(/-/g, " ").toUpperCase() }
  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-[11px] font-mono md:flex">
      {route.parent && (
        <>
          <span className="text-muted-foreground/60">{route.parent}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
        </>
      )}
      <span className="font-semibold text-foreground tracking-wide">{route.label}</span>
    </nav>
  )
}

function ConnectionBadge() {
  const { connectionStatus, reconnect } = useTelemetry()

  if (connectionStatus === "live") {
    return (
      <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/50">
        <Radio data-icon="inline-start" className="text-emerald-500" />
        <span className="hidden sm:inline">10 HZ · LIVE</span>
        <span className="sm:hidden">LIVE</span>
      </Badge>
    )
  }

  if (connectionStatus === "connecting" || connectionStatus === "reconnecting") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-500/10"
        onClick={reconnect}
      >
        <Radio data-icon="inline-start" className="animate-pulse" />
        <span className="hidden sm:inline">
          {connectionStatus === "reconnecting" ? "RECONNECTING…" : "CONNECTING…"}
        </span>
        <span className="sm:hidden">…</span>
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="border-destructive text-destructive cursor-pointer hover:bg-destructive/10 animate-pulse"
      onClick={reconnect}
    >
      <Radio data-icon="inline-start" />
      <span className="hidden sm:inline">TWIN OFFLINE</span>
      <span className="sm:hidden">OFF</span>
    </Badge>
  )
}

function AlertBadge() {
  const { latestTelemetry } = useTelemetry()
  const alert = latestTelemetry?.alert

  if (alert === "CRITICAL") {
    return (
      <Badge className="hidden bg-destructive/10 text-destructive sm:inline-flex animate-pulse">
        CRITICAL
      </Badge>
    )
  }
  if (alert === "WARNING") {
    return (
      <Badge className="hidden bg-amber-500/10 text-amber-600 dark:text-amber-400 sm:inline-flex">
        WARNING
      </Badge>
    )
  }
  return (
    <Badge className="hidden bg-primary/10 text-primary sm:inline-flex">
      OPERATIONAL
    </Badge>
  )
}

import * as React from "react"
import { ExportDialog } from "@/components/export-dialog"
import { JargonGuideDialog } from "@/components/jargon-guide-dialog"
import { SecurityPostureDialog } from "@/components/security-posture-dialog"
import { Volume2, VolumeX, BellRing, BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { audioAnnunciator } from "@/lib/audio-annunciator"

function AudioToggle() {
  const [mounted, setMounted] = React.useState(false)
  const [state, setState] = React.useState(() => audioAnnunciator.getState())

  React.useEffect(() => {
    setMounted(true)
    setState(audioAnnunciator.getState())
    const unsubscribe = audioAnnunciator.subscribe(() => {
      setState(audioAnnunciator.getState())
    })
    return unsubscribe
  }, [])

  const isSounding = mounted && state.isSounding
  const isMuted = !mounted || state.isMuted
  const severity = state.severity

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`relative flex size-8 items-center justify-center rounded-md border text-xs transition-all cursor-pointer ${
          isSounding
            ? severity === "CRITICAL"
              ? "border-red-500 bg-red-500/20 text-red-600 dark:text-red-400 animate-pulse ring-2 ring-red-500/50"
              : "border-amber-500 bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse ring-2 ring-amber-500/50"
            : isMuted
            ? "border-border/60 text-muted-foreground/60 hover:text-foreground hover:bg-muted"
            : "border-border text-emerald-600 dark:text-emerald-400 hover:bg-muted"
        }`}
        title={
          isSounding
            ? `${severity} ALARM SOUNDING CONTINUOUSLY — Click for Audio Controls`
            : isMuted
            ? "Avionics Audio Muted"
            : "Avionics Audio Armed & Active"
        }
        aria-label="Avionics Audio Settings"
      >
        {isSounding ? (
          <>
            <BellRing className="size-4 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  severity === "CRITICAL" ? "bg-red-500" : "bg-amber-500"
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  severity === "CRITICAL" ? "bg-red-600" : "bg-amber-600"
                }`}
              />
            </span>
          </>
        ) : isMuted ? (
          <VolumeX className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 p-3 font-sans shadow-2xl">
        <DropdownMenuLabel className="px-0 py-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase flex items-center justify-between">
          <span>Avionics Annunciator</span>
          <span className="font-bold text-foreground">10 Hz Telemetry Sync</span>
        </DropdownMenuLabel>

        {/* Live Alarm Status Banner */}
        <div className="my-2 rounded-md p-2.5 border border-border bg-card/50 text-xs">
          {isSounding ? (
            <div
              className={`flex flex-col gap-1.5 ${
                severity === "CRITICAL"
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <BellRing className="size-3.5 animate-pulse" />
                <span>
                  {severity === "CRITICAL"
                    ? "MASTER WARNING SOUNDING"
                    : "MASTER CAUTION SOUNDING"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Continuous alarm loop running at high intensity.
                {state.faults.length > 0 &&
                  ` Active: ${state.faults
                    .map((f) => f.name || "FAULT")
                    .join(", ")
                    .replace(/_/g, " ")}`}
              </p>
              <div className="flex gap-1.5 mt-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs flex-1 font-bold cursor-pointer"
                  onClick={() => audioAnnunciator.silenceAlarm()}
                >
                  <BellOff className="size-3.5 mr-1" />
                  SILENCE ALARM
                </Button>
              </div>
            </div>
          ) : state.isSilenced && state.severity ? (
            <div className="flex flex-col gap-1 text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-1.5 font-semibold text-xs">
                <BellOff className="size-3.5" />
                <span>Alarm Temporarily Silenced</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Will re-arm on next fault or un-silence
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] mt-1 cursor-pointer"
                onClick={() => audioAnnunciator.unsilenceAlarm()}
              >
                Resume Audio Alarm
              </Button>
            </div>
          ) : isMuted ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <VolumeX className="size-3.5" />
                Audio Master Muted
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] cursor-pointer"
                onClick={() => audioAnnunciator.setMuted(false)}
              >
                UNMUTE
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1.5 font-semibold">
                <Volume2 className="size-3.5 text-emerald-500" />
                NOMINAL · ARMED
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">READY</span>
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Master Sound Intensity (Requested: "and increase the sound intensity") */}
        <div className="py-1.5">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-foreground">Sound Intensity</span>
            <span className="font-mono text-[11px] font-bold text-primary">
              {state.intensity >= 1.6
                ? "MAX COMBAT (170%)"
                : state.intensity >= 1.3
                ? "HIGH (135%)"
                : "STANDARD (100%)"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <Button
              size="sm"
              variant={state.intensity < 1.2 ? "default" : "outline"}
              className="h-6 text-[10px] px-1 cursor-pointer"
              onClick={() => audioAnnunciator.setIntensity(1.0)}
            >
              1.0× Norm
            </Button>
            <Button
              size="sm"
              variant={state.intensity >= 1.2 && state.intensity < 1.5 ? "default" : "outline"}
              className="h-6 text-[10px] px-1 font-bold cursor-pointer"
              onClick={() => audioAnnunciator.setIntensity(1.35)}
            >
              1.35× High
            </Button>
            <Button
              size="sm"
              variant={state.intensity >= 1.5 ? "default" : "outline"}
              className="h-6 text-[10px] px-1 font-bold cursor-pointer"
              onClick={() => audioAnnunciator.setIntensity(1.7)}
            >
              1.7× Max
            </Button>
          </div>
        </div>

        {/* Master Volume */}
        <div className="py-1.5">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-foreground">Master Volume</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {Math.round(state.volume * 100)}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[0.25, 0.5, 0.75, 1.0].map((v) => (
              <Button
                key={v}
                size="sm"
                variant={Math.abs(state.volume - v) < 0.1 ? "default" : "outline"}
                className="h-6 text-[10px] px-1 cursor-pointer"
                onClick={() => audioAnnunciator.setVolume(v)}
              >
                {Math.round(v * 100)}%
              </Button>
            ))}
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Test Continuous Alarms */}
        <div className="py-1">
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase block mb-1">
            Test Continuous Alarms
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] font-semibold text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10 cursor-pointer"
              onClick={() => audioAnnunciator.testAlarm("CRITICAL", 4)}
            >
              🚨 Test Klaxon
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
              onClick={() => audioAnnunciator.testAlarm("WARNING", 4)}
            >
              ⚠️ Test Chime
            </Button>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Mute Toggle Action */}
        <div className="pt-1 flex items-center justify-between">
          <Button
            size="sm"
            variant={isMuted ? "default" : "outline"}
            className="h-7 w-full text-xs font-semibold gap-1.5 cursor-pointer"
            onClick={() => audioAnnunciator.toggleMute()}
          >
            {isMuted ? (
              <>
                <Volume2 className="size-3.5" />
                <span>UNMUTE AVIONICS AUDIO</span>
              </>
            ) : (
              <>
                <VolumeX className="size-3.5" />
                <span>MUTE ALL AUDIO</span>
              </>
            )}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { Users, ChevronDown, Check, ShieldCheck, Lock, Loader2 } from "lucide-react"
import { getActiveSession, fetchSessionToken, UserRole, subscribeToSessionChanges, DEFAULT_SESSION } from "@/lib/telemetry/auth"

function TenantRoleSwitcher() {
  const [mounted, setMounted] = React.useState(false)
  const [session, setSession] = React.useState(() => DEFAULT_SESSION)
  const [switching, setSwitching] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    setSession(getActiveSession())
    return subscribeToSessionChanges((newSession) => {
      setSession(newSession)
    })
  }, [])

  const handleSwitchTenant = async (tenantId: string) => {
    setSwitching(true)
    try {
      await fetchSessionToken({ tenant_id: tenantId, role: session.role })
    } finally {
      setSwitching(false)
    }
  }

  const handleSwitchRole = async (role: UserRole) => {
    setSwitching(true)
    try {
      await fetchSessionToken({ tenant_id: session.tenant_id, role })
    } finally {
      setSwitching(false)
    }
  }

  const activeTenantId = mounted ? session.tenant_id : "tenant_alpha"
  const activeRole = mounted ? session.role : "dispatcher"
  const tenantLabel = activeTenantId === "tenant_bravo" ? "Bravo Fleet" : "Alpha Fleet"

  const roleConfig: Record<
    UserRole,
    {
      label: string
      level: string
      desc: string
      badge: string
      border: string
      glow: string
      activeRing: string
    }
  > = {
    viewer: {
      label: "Viewer",
      level: "L1",
      desc: "Read-only telemetry",
      badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
      border: "border-zinc-500/40 hover:border-zinc-400",
      glow: "hover:shadow-[0_0_12px_rgba(161,161,170,0.15)]",
      activeRing: "border-zinc-400 bg-zinc-500/10 ring-1 ring-zinc-400/40",
    },
    dispatcher: {
      label: "Dispatcher",
      level: "L2",
      desc: "Mission & flight ops",
      badge: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      border: "border-sky-500/40 hover:border-sky-400",
      glow: "hover:shadow-[0_0_12px_rgba(56,189,248,0.2)]",
      activeRing: "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/50",
    },
    maintainer: {
      label: "Maintainer",
      level: "L3",
      desc: "Diagnostics & health",
      badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      border: "border-amber-500/40 hover:border-amber-400",
      glow: "hover:shadow-[0_0_12px_rgba(245,158,11,0.2)]",
      activeRing: "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50",
    },
    admin: {
      label: "Admin",
      level: "L4",
      desc: "Root policy & keys",
      badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",
      border: "border-purple-500/40 hover:border-purple-400",
      glow: "hover:shadow-[0_0_12px_rgba(168,85,247,0.25)]",
      activeRing: "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/50",
    },
  }

  const currentRole = roleConfig[activeRole] || roleConfig.dispatcher

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`group hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-mono font-medium transition-all duration-200 cursor-pointer shadow-xs bg-background/80 hover:bg-muted/40 active:scale-[0.98] ${currentRole.border} ${currentRole.glow}`}
        title="Tenant & RBAC Access Scope"
      >
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span suppressHydrationWarning className="font-semibold text-foreground tracking-tight">
            {tenantLabel}
          </span>
        </div>
        <span
          suppressHydrationWarning
          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold tracking-wider uppercase border ${currentRole.badge}`}
        >
          {activeRole}
        </span>
        <ChevronDown className="size-3 text-muted-foreground/70 group-hover:text-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[330px] p-3 font-sans rounded-xl border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl animate-in fade-in-50 zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-foreground">
                Access & Fleet Scope
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                HMAC-SHA256 Tokenized Envelope
              </div>
            </div>
          </div>
          {switching ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-primary animate-pulse font-medium">
              <Loader2 className="size-3 animate-spin" />
              Syncing…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 font-semibold">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE JWS
            </span>
          )}
        </div>

        {/* Tenant Section */}
        <div className="space-y-1.5 mb-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 px-1 font-semibold flex items-center justify-between">
            <span>Tenant Isolation Squadron</span>
            <span className="text-[9px] font-normal lowercase text-muted-foreground/60">aircraft-scoped</span>
          </div>

          {/* Alpha Fleet */}
          <button
            type="button"
            disabled={switching}
            onClick={() => handleSwitchTenant("tenant_alpha")}
            className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer ${
              session.tenant_id === "tenant_alpha"
                ? "bg-primary/10 border-primary/60 shadow-xs"
                : "bg-muted/30 border-border/60 hover:bg-muted/70 hover:border-border"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`size-2 rounded-full ${
                  session.tenant_id === "tenant_alpha"
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                    : "bg-muted-foreground/40"
                }`}
              />
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  Alpha Fleet
                  <span className="text-[10px] font-mono font-normal text-muted-foreground">
                    (UAV-01 .. UAV-03)
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  Active Mission Squadron · 3 Aircraft
                </div>
              </div>
            </div>
            {session.tenant_id === "tenant_alpha" && (
              <Check className="size-4 text-primary shrink-0" />
            )}
          </button>

          {/* Bravo Fleet */}
          <button
            type="button"
            disabled={switching}
            onClick={() => handleSwitchTenant("tenant_bravo")}
            className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all duration-150 cursor-pointer ${
              session.tenant_id === "tenant_bravo"
                ? "bg-primary/10 border-primary/60 shadow-xs"
                : "bg-muted/30 border-border/60 hover:bg-muted/70 hover:border-border"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`size-2 rounded-full ${
                  session.tenant_id === "tenant_bravo"
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                    : "bg-muted-foreground/40"
                }`}
              />
              <div>
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  Bravo Fleet
                  <span className="text-[10px] font-mono font-normal text-muted-foreground">
                    (UAV-04 .. UAV-05)
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  Reserve Patrol Wing · 2 Aircraft
                </div>
              </div>
            </div>
            {session.tenant_id === "tenant_bravo" && (
              <Check className="size-4 text-primary shrink-0" />
            )}
          </button>
        </div>

        {/* RBAC Role Clearance Level Matrix */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 px-1 font-semibold flex items-center justify-between">
            <span>RBAC Clearance Level</span>
            <span className="text-[9px] font-normal lowercase text-muted-foreground/60">role permissions</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(["viewer", "dispatcher", "maintainer", "admin"] as UserRole[]).map((r) => {
              const cfg = roleConfig[r]
              const isSelected = session.role === r
              return (
                <button
                  key={r}
                  type="button"
                  disabled={switching}
                  onClick={() => handleSwitchRole(r)}
                  className={`flex flex-col p-2 rounded-lg border text-left transition-all duration-150 cursor-pointer relative ${
                    isSelected
                      ? cfg.activeRing
                      : "bg-muted/20 border-border/60 hover:bg-muted/50 hover:border-border"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                      {cfg.label}
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-1 py-0.2 rounded border ${cfg.badge}`}>
                      {cfg.level}
                    </span>
                  </div>
                  <span className="text-[9.5px] leading-tight text-muted-foreground line-clamp-1">
                    {cfg.desc}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Security Footer */}
        <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3 opacity-70" />
            <span>Strict Tenant Isolation</span>
          </span>
          <span className="opacity-70">Envelope v1.0</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


export function SiteHeader() {
  const { latestTelemetry } = useTelemetry()
  const activeUavId = latestTelemetry?.uav_id ?? "UAV-01"

  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height,3.25rem)] shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur-md supports-backdrop-filter:backdrop-blur-md transition-[width,height] ease-linear shadow-xs">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
            <Breadcrumb />
            <p className="truncate text-[10px] tracking-[0.14em] text-muted-foreground font-mono leading-none">
              <span className="font-bold text-primary">{activeUavId}</span> · ROTAX 914 F · PROPULSION GCS
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ConnectionBadge />
            <TenantRoleSwitcher />
            <SecurityPostureDialog />
            <AlertBadge />
            <AudioToggle />
            <JargonGuideDialog />
            <ExportDialog />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
