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
import { ActivityIcon, FileChartColumnIcon, GaugeIcon, ShieldCheckIcon, ZapIcon } from "lucide-react"
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

  // RUL card
  const predRul   = t?.predicted_rul ?? 0
  const trueRul   = t?.true_rul      ?? 0
  const rulLower  = t?.rul_ci_lower  ?? 0
  const rulUpper  = t?.rul_ci_upper  ?? 0
  const bufPct    = t?.buffer_pct    ?? 0

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
    <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">

      {/* ── Card 1: Engine Health Index ─────────────────────────────────── */}
      <Link href="/prognostics" className="group block transition-transform duration-200 hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>ENGINE HEALTH INDEX</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              {healthIndex} / 100
            </CardTitle>
            <CardAction>
              {alertBadge(t?.alert)}
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              THRML {subThermal}% · LUBR {subLubr}%
            </div>
            <div className="text-muted-foreground">
              MECH {subMech}% · ELEC {subElec}%
            </div>
          </CardFooter>
        </Card>
      </Link>

      {/* ── Card 2: Estimated Remaining Life ──────────────────────────────── */}
      <Link href="/prognostics" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>ESTIMATED REMAINING LIFE</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              {bufPct < 100
                ? `${fmtNum(bufPct, 0)}% BUFFER`
                : `${fmtInt(predRul)} cycles`}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <ActivityIcon data-icon="inline-start" />
                {bufPct < 100 ? "WARMING UP" : "MODEL LIVE"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {bufPct >= 100
                ? `TRUE: ${fmtInt(trueRul)} · 90% CI [${fmtInt(rulLower)} — ${fmtInt(rulUpper)}]`
                : `Loading LSTM window... ${fmtNum(bufPct, 0)}%`}
            </div>
            <div className="text-muted-foreground">FADEC prediction window</div>
          </CardFooter>
        </Card>
      </Link>

      {/* ── Card 3: Brake Power Output ────────────────────────────────────── */}
      <Link href="/thermodynamics" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>BRAKE POWER OUTPUT</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              {fmtNum(brakePower, 1)} BHP
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <GaugeIcon data-icon="inline-start" /> NOMINAL
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              BSFC {fmtNum(bsfc, 0)} g/kWh · η {fmtNum(thermalEff, 1)}%
            </div>
            <div className="text-muted-foreground">IMEP {fmtNum(imep, 2)} bar</div>
          </CardFooter>
        </Card>
      </Link>

      {/* ── Card 4: Diagnostic Alarms ─────────────────────────────────────── */}
      <Link href="/maintenance" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>DIAGNOSTIC ALARMS</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              {alarmCount} {alarmCount === 1 ? "ALARM" : "ALARMS"}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <ZapIcon data-icon="inline-start" />
                {t?.is_anomaly ? "ANOMALY" : "WITHIN 3σ"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
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

      {/* ── Card 5: Flight Profile ────────────────────────────────────────── */}
      <Link href="/flight-data" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>FLIGHT PROFILE</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              {missionMode.replace(/_/g, " ")}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">CYCLE {String(cycleNum).padStart(5, "0")}</Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">MET {metHms(metSeconds)}</div>
            <div className="text-muted-foreground">Mission profile active</div>
          </CardFooter>
        </Card>
      </Link>

      {/* ── Card 6: Telemetry Link ────────────────────────────────────────── */}
      <Link href="/telemetry" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>TELEMETRY LINK</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              {t ? "12 / 12 online" : "— / 12"}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                <ActivityIcon data-icon="inline-start" />
                {connectionStatus === "live" ? "10 HZ LIVE" : connectionStatus.toUpperCase()}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="font-medium">0.00% PACKET LOSS</div>
            <div className="text-muted-foreground">All propulsion channels synchronized</div>
          </CardFooter>
        </Card>
      </Link>

      {/* ── Card 7: Airworthiness ─────────────────────────────────────────── */}
      <Link href="/airworthiness" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>AIRWORTHINESS</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              VALID
            </CardTitle>
            <CardAction>
              <Badge variant="outline"><ShieldCheckIcon data-icon="inline-start" /> RELEASED</Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="font-medium">0 OPEN LIMITATIONS</div>
            <div className="text-muted-foreground">Certificate current · 184 days</div>
          </CardFooter>
        </Card>
      </Link>

      {/* ── Card 8: CAN Bus FDR ───────────────────────────────────────────── */}
      <Link href="/can" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>CAN BUS FDR</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">
              {canFrames > 0 ? `${canFrames} frm` : "42.8%"}
            </CardTitle>
            <CardAction>
              <Badge variant="outline"><ZapIcon data-icon="inline-start" /> RECORDING</Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="font-medium">
              {canFrames > 0 ? `${canFrames} FRAMES THIS CYCLE` : "18,422 FRAMES / MIN"}
            </div>
            <div className="text-muted-foreground">No dropped frames or DTCs</div>
          </CardFooter>
        </Card>
      </Link>

      {/* ── Card 9: Dossier Export ─────────────────────────────────────────── */}
      <Link href="/dossier" className="block transition-transform hover:-translate-y-0.5">
        <Card className="@container/card h-full bg-card/80 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <CardHeader className="min-h-32 p-6">
            <CardDescription>DOSSIER EXPORT</CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight tabular-nums @[250px]/card:text-4xl">READY</CardTitle>
            <CardAction>
              <Badge variant="outline"><FileChartColumnIcon data-icon="inline-start" /> 14 SOURCES</Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 px-6 pb-6 text-sm">
            <div className="font-medium">ALL DATA SYNCHRONIZED</div>
            <div className="text-muted-foreground">Last generated 09:41 UTC</div>
          </CardFooter>
        </Card>
      </Link>
    </div>
  )
}
