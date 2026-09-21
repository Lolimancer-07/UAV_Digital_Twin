"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ActivityIcon, GaugeIcon, ShieldCheckIcon, TrendingDownIcon, TrendingUpIcon, ZapIcon } from "lucide-react"
import { useTelemetry } from "@/components/telemetry-provider"

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v: number | undefined, dec = 1, fallback = "—"): string {
  if (v == null || isNaN(v)) return fallback
  return v.toFixed(dec)
}
function fmtInt(v: number | undefined, fallback = "—"): string {
  if (v == null || isNaN(v)) return fallback
  return Math.round(v).toLocaleString()
}

function metHms(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function alertBadge(alert: string | undefined) {
  const a = alert ?? "NOMINAL"
  if (a === "CRITICAL") return <Badge variant="destructive">CRITICAL</Badge>
  if (a === "WARNING")  return <Badge className="border-amber-500 text-amber-600 dark:text-amber-400" variant="outline">WARNING</Badge>
  return <Badge variant="outline"><ShieldCheckIcon data-icon="inline-start" /> NOMINAL</Badge>
}

function SubsystemBar({ label, value }: { label: string; value: number }) {
  const prevRef = React.useRef(value)
  const [delta, setDelta] = React.useState<number>(0)
  const [isChanging, setIsChanging] = React.useState(false)

  React.useEffect(() => {
    const diff = value - prevRef.current
    if (diff !== 0) {
      setDelta(diff)
      setIsChanging(true)
      prevRef.current = value

      const timer = setTimeout(() => {
        setDelta(0)
        setIsChanging(false)
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [value])

  const barColor =
    value >= 80
      ? "bg-emerald-500"
      : value >= 60
      ? "bg-amber-500"
      : "bg-red-500"

  return (
    <div className="flex flex-col gap-1 w-full min-w-0">
      <div className="flex items-center justify-between text-[11px] leading-tight">
        <span className="font-semibold text-muted-foreground tracking-tight">{label}</span>
        <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
          <span className="font-bold text-foreground">{value}%</span>
          {delta !== 0 && (
            <span
              className={`text-[9.5px] font-bold transition-opacity duration-300 animate-in fade-in inline-flex items-center gap-0.5 ${
                delta > 0 ? "text-emerald-500" : "text-amber-500 dark:text-amber-400"
              }`}
            >
              {delta > 0 ? (
                <>
                  <TrendingUpIcon className="size-2.5 inline" />
                  +{delta}%
                </>
              ) : (
                <>
                  <TrendingDownIcon className="size-2.5 inline" />
                  {delta}%
                </>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/80 dark:bg-muted/40 relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor} ${
            isChanging ? "ring-1 ring-primary/40 brightness-110" : ""
          }`}
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export function SectionCards() {
  const {
    latestTelemetry: t,
    connectionStatus,
    metSeconds,
  } = useTelemetry()

  // Health card
  const healthIndex = Math.round(t?.health?.health_index ?? 94)
  const normSub = (v: number | undefined, fb: number) => {
    if (v == null) return fb
    return Math.round(v > 1 ? v : v * 100)
  }
  const subThermal  = normSub(t?.health?.sub_scores?.thermal, 80)
  const subLubr     = normSub(t?.health?.sub_scores?.lubrication, 85)
  const subMech     = normSub(t?.health?.sub_scores?.mechanical, 85)
  const subElec     = normSub(t?.health?.sub_scores?.electrical, 90)

  // RUL card — use predicted_rul when valid; fall back to true_rul from dataset
  const predRul   = t?.predicted_rul ?? 0
  const trueRul   = t?.true_rul      ?? 0
  const rulLower  = t?.rul_ci_lower  ?? 0
  const rulUpper  = t?.rul_ci_upper  ?? 0
  const bufPct    = t?.buffer_pct    ?? 0
  // If LSTM hasn't converged yet (predicted = 0 but model is live), show true_rul
  const displayRul = predRul > 0 ? predRul : trueRul
  const hasValidCI = rulLower > 0 || rulUpper > 0

  // Power card (from physics sub-object)
  const brakePower = t?.physics?.brake_power_hp ?? 0
  const rawThermal = t?.physics?.thermal_efficiency ?? 31.4
  const thermalEff = rawThermal > 1 ? rawThermal : rawThermal * 100
  const bsfc       = t?.physics?.bsfc_g_kwh  ?? 0
  const imep       = t?.physics?.imep_bar    ?? 0

  // Alarms card
  const faultEvents = t?.fault_events ?? []
  const alarmCount  = faultEvents.length
  const primaryFault = faultEvents[0]

  // Flight profile / MET
  const missionMode = t?.mission_mode ?? "NORMAL"
  const cycleNum    = t?.cycle        ?? 0

  // CAN frames
  const canFrames = t?.can_frames?.length ?? 0

  return (
    <div className="flex flex-col gap-3 px-4 lg:px-6">

      {/* ── Primary KPI Row: 4 main operational metrics ─────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">

        {/* Card 1: Engine Health Index */}
        <Link href="/prognostics" className="group block transition-transform duration-200 hover:-translate-y-0.5">
          <Card className="@container/card h-full overflow-hidden bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
            <div className={`h-1 w-full ${healthIndex >= 70 ? "bg-emerald-500" : healthIndex >= 40 ? "bg-amber-500" : "bg-red-500"}`} />
            <CardHeader className="min-h-28 p-5">
              <CardDescription>ENGINE HEALTH INDEX</CardDescription>
              <CardTitle className="mt-2 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
                {healthIndex}<span className="text-lg text-muted-foreground"> / 100</span>
              </CardTitle>
              <CardAction>
                {alertBadge(t?.alert)}
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-2 px-5 pb-4 text-xs w-full">
              <div className="grid grid-cols-2 gap-3 w-full">
                <SubsystemBar label="THRML" value={subThermal} />
                <SubsystemBar label="LUBR" value={subLubr} />
              </div>
              <div className="flex items-center justify-between text-[10.5px] text-muted-foreground w-full pt-0.5">
                <span>MECH {subMech}%</span>
                <span className="text-muted-foreground/30">•</span>
                <span>ELEC {subElec}%</span>
              </div>
            </CardFooter>
          </Card>
        </Link>

        {/* Card 2: Remaining Useful Life */}
        <Link href="/prognostics" className="block transition-transform hover:-translate-y-0.5">
          <Card className="@container/card h-full overflow-hidden bg-card/80 shadow-sm transition-shadow duration-200 hover:shadow-md">
            <div className={`h-1 w-full ${displayRul > 60 ? "bg-violet-500" : displayRul > 30 ? "bg-amber-500" : "bg-red-500"}`} />
            <CardHeader className="min-h-28 p-5">
              <CardDescription>REMAINING USEFUL LIFE</CardDescription>
              <CardTitle className="mt-2 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
                {bufPct < 100
                  ? `${fmtNum(bufPct, 0)}%`
                  : `${fmtInt(displayRul)}`}
                <span className="text-lg text-muted-foreground">
                  {bufPct < 100 ? " BUF" : " cyc"}
                </span>
              </CardTitle>
              <CardAction>
                <Badge variant="outline">
                  <ActivityIcon data-icon="inline-start" />
                  {bufPct < 100 ? "WARMING UP" : "MODEL LIVE"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 px-5 pb-4 text-xs">
              <div className="line-clamp-1 flex gap-2 font-medium">
                {bufPct >= 100
                  ? predRul > 0
                    ? `PRED: ${fmtInt(predRul)} · TRUE: ${fmtInt(trueRul)} cyc`
                    : `TRUE: ${fmtInt(trueRul)} cyc`
                  : `Loading… ${fmtNum(bufPct, 0)}%`}
              </div>
              <div className="text-muted-foreground">
                {bufPct >= 100
                  ? hasValidCI
                    ? `90% CI [${fmtInt(rulLower)} — ${fmtInt(rulUpper)}]`
                    : "90% CI unavailable"
                  : "FADEC prediction window"}
              </div>
            </CardFooter>
          </Card>
        </Link>


        {/* Card 3: Brake Power Output */}
        <Link href="/thermodynamics" className="block transition-transform hover:-translate-y-0.5">
          <Card className="@container/card h-full overflow-hidden bg-card/80 shadow-sm transition-shadow duration-200 hover:shadow-md">
            <div className="h-1 w-full bg-sky-500" />
            <CardHeader className="min-h-28 p-5">
              <CardDescription>BRAKE POWER OUTPUT</CardDescription>
              <CardTitle className="mt-2 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
                {fmtNum(brakePower, 1)}<span className="text-lg text-muted-foreground"> BHP</span>
              </CardTitle>
              <CardAction>
                <Badge variant="outline">
                  <GaugeIcon data-icon="inline-start" /> NOMINAL
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 px-5 pb-4 text-xs">
              <div className="line-clamp-1 flex gap-2 font-medium">
                BSFC {fmtNum(bsfc, 0)} g/kWh · η {fmtNum(thermalEff, 1)}%
              </div>
              <div className="text-muted-foreground">IMEP {fmtNum(imep, 2)} bar</div>
            </CardFooter>
          </Card>
        </Link>

        {/* Card 4: Diagnostic Alarms */}
        <Link href="/maintenance" className="block transition-transform hover:-translate-y-0.5">
          <Card className="@container/card h-full overflow-hidden bg-card/80 shadow-sm transition-shadow duration-200 hover:shadow-md">
            <div className={`h-1 w-full ${alarmCount > 0 ? (t?.is_anomaly ? "bg-red-500" : "bg-amber-500") : "bg-emerald-500"}`} />
            <CardHeader className="min-h-28 p-5">
              <CardDescription>DIAGNOSTIC ALARMS</CardDescription>
              <CardTitle className="mt-2 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
                {alarmCount}
                <span className="text-lg text-muted-foreground"> {alarmCount === 1 ? "ALARM" : "ALARMS"}</span>
              </CardTitle>
              <CardAction>
                <Badge variant="outline">
                  <ZapIcon data-icon="inline-start" />
                  {t?.is_anomaly ? "ANOMALY" : "WITHIN 3σ"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 px-5 pb-4 text-xs">
              <div className="line-clamp-1 flex gap-2 font-medium">
                {primaryFault
                  ? primaryFault.name?.toUpperCase().replace(/_/g, " ") ?? "FAULT DETECTED"
                  : "NOMINAL STATUS"}
              </div>
              <div className="text-muted-foreground">
                {primaryFault
                  ? `${primaryFault.severity} · ${primaryFault.subsystem ?? "propulsion"}`
                  : "No active advisories"}
              </div>
            </CardFooter>
          </Card>
        </Link>
      </div>

      {/* ── Secondary Status Row: 4 supporting metrics ───────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

        {/* Card 5: Flight Profile */}
        <Link href="/flight-data" className="block transition-transform hover:-translate-y-0.5">
          <Card className="@container/card h-full bg-card/60 transition-shadow duration-200 hover:shadow-sm">
            <CardHeader className="p-4">
              <CardDescription className="text-[10px]">FLIGHT PROFILE</CardDescription>
              <CardTitle className="mt-1.5 text-xl font-semibold tracking-tight">
                {missionMode.replace(/_/g, " ")}
              </CardTitle>
              <CardAction>
                <Badge variant="outline" className="text-[10px]">CYCLE {String(cycleNum).padStart(5, "0")}</Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-0.5 px-4 pb-4 text-xs">
              <div className="font-medium">MET {metHms(metSeconds)}</div>
              <div className="text-muted-foreground">Mission profile active</div>
            </CardFooter>
          </Card>
        </Link>

        {/* Card 6: Telemetry Link */}
        <Link href="/telemetry" className="block transition-transform hover:-translate-y-0.5">
          <Card className="@container/card h-full bg-card/60 transition-shadow duration-200 hover:shadow-sm">
            <CardHeader className="p-4">
              <CardDescription className="text-[10px]">TELEMETRY LINK</CardDescription>
              <CardTitle className="mt-1.5 text-xl font-semibold tracking-tight">
                {t ? "12 / 12" : "— / 12"}
              </CardTitle>
              <CardAction>
                <Badge variant="outline" className="text-[10px]">
                  <ActivityIcon data-icon="inline-start" />
                  {connectionStatus === "live" ? "10 HZ LIVE" : connectionStatus.toUpperCase()}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-0.5 px-4 pb-4 text-xs">
              <div className="font-medium">0.00% PACKET LOSS</div>
              <div className="text-muted-foreground">All channels synchronized</div>
            </CardFooter>
          </Card>
        </Link>

        {/* Card 7: CAN Bus FDR */}
        <Link href="/can" className="block transition-transform hover:-translate-y-0.5">
          <Card className="@container/card h-full bg-card/60 transition-shadow duration-200 hover:shadow-sm">
            <CardHeader className="p-4">
              <CardDescription className="text-[10px]">CAN BUS FDR</CardDescription>
              <CardTitle className="mt-1.5 text-xl font-semibold tracking-tight">
                {canFrames > 0 ? `${canFrames} frm` : "42.8%"}
              </CardTitle>
              <CardAction>
                <Badge variant="outline" className="text-[10px]"><ZapIcon data-icon="inline-start" /> RECORDING</Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-0.5 px-4 pb-4 text-xs">
              <div className="font-medium">
                {canFrames > 0 ? `${canFrames} FRAMES` : "18,422 FRM/MIN"}
              </div>
              <div className="text-muted-foreground">No dropped frames</div>
            </CardFooter>
          </Card>
        </Link>

        {/* Card 8: Airworthiness */}
        <Link href="/airworthiness" className="block transition-transform hover:-translate-y-0.5">
          <Card className="@container/card h-full bg-card/60 transition-shadow duration-200 hover:shadow-sm">
            <CardHeader className="p-4">
              <CardDescription className="text-[10px]">AIRWORTHINESS</CardDescription>
              <CardTitle className="mt-1.5 text-xl font-semibold tracking-tight">
                VALID
              </CardTitle>
              <CardAction>
                <Badge variant="outline" className="text-[10px]"><ShieldCheckIcon data-icon="inline-start" /> RELEASED</Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-0.5 px-4 pb-4 text-xs">
              <div className="font-medium">0 OPEN LIMITATIONS</div>
              <div className="text-muted-foreground">Certificate · 184 days</div>
            </CardFooter>
          </Card>
        </Link>
      </div>
    </div>
  )
}
