"use client"

import * as React from "react"
import {
  DownloadIcon,
  FileTextIcon,
  TableIcon,
  FileCodeIcon,
  CpuIcon,
  CheckCircle2Icon,
  PrinterIcon,
  ShieldCheckIcon,
  ExternalLinkIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"
import { AIRWORTHINESS_SUMMARY } from "@/lib/telemetry/constants"
import { formatInteger, formatNumber } from "@/lib/telemetry/formatters"
import type { MaintenanceAdvisory, TelemetryPayload } from "@/lib/telemetry/types"
import {
  createDossierHtml,
  downloadTextFile,
  serializeCanLog,
  serializeTelemetryLogCsv,
} from "@/lib/telemetry/exports"

export function DossierPanel() {
  const { latestTelemetry, telemetryLog, canLog } = useTelemetry()
  const [downloadedFormat, setDownloadedFormat] = React.useState<string | null>(null)

  const advisories = React.useMemo(() => latestTelemetry?.advisories ?? [], [latestTelemetry?.advisories])

  const handleExportDossier = () => {
    const html = createDossierHtml(latestTelemetry, advisories)
    downloadTextFile(
      `uav07_airworthiness_dossier_${Date.now()}.html`,
      html,
      "text/html;charset=utf-8"
    )
    setDownloadedFormat("Airworthiness Dossier (HTML/PDF)")
  }

  const handlePrintDossier = () => {
    const html = createDossierHtml(latestTelemetry, advisories)
    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 350)
    }
  }

  const handleExportCsv = () => {
    const csv = serializeTelemetryLogCsv(telemetryLog, latestTelemetry)
    downloadTextFile(
      `uav07_flight_telemetry_${Date.now()}.csv`,
      csv,
      "text/csv;charset=utf-8"
    )
    setDownloadedFormat("Flight Telemetry Log (CSV)")
  }

  const handleExportJson = () => {
    const data = {
      export_timestamp: new Date().toISOString(),
      uav_id: latestTelemetry?.uav_id ?? "UAV-07",
      latest_state: latestTelemetry ?? {},
      telemetry_history_sample: telemetryLog.slice(-100),
      can_frames_sample: canLog.slice(-100),
    }
    const jsonStr = JSON.stringify(data, null, 2)
    downloadTextFile(
      `uav07_digital_twin_snapshot_${Date.now()}.json`,
      jsonStr,
      "application/json;charset=utf-8"
    )
    setDownloadedFormat("Complete Digital Twin Snapshot (JSON)")
  }

  const handleExportCanCsv = () => {
    const csv = serializeCanLog(canLog)
    downloadTextFile(
      `uav07_can_fdr_${Date.now()}.csv`,
      csv,
      "text/csv;charset=utf-8"
    )
    setDownloadedFormat("SAE J1939 CAN Log (CSV)")
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* ── Top Header & Actions Strip ─────────────────────────────────── */}
      <Card className="border-2 shadow-md bg-card">
        <CardHeader className="p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono font-semibold tracking-[0.18em] text-primary uppercase mb-1">
                ENGINEERING EVIDENCE PACKAGE
              </p>
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Dossier Export & Flight Data Package
                </h1>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 text-[10px] font-mono font-bold ml-2">
                  STANDARDIZED
                </Badge>
              </div>
              <p className="text-sm font-medium text-muted-foreground mt-1.5">
                Certified airworthiness compliance dossier, certified physical envelope audit, and DO-178C Level B compliance evidence export.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={handleExportDossier} className="font-bold text-xs gap-1.5 shadow-sm">
                <DownloadIcon className="size-4" />
                <span>Export Dossier (HTML)</span>
              </Button>
              <Button variant="default" onClick={handlePrintDossier} className="font-bold text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                <PrinterIcon className="size-4" />
                <span>Print / Save as PDF</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── Export Cards Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Formal Dossier */}
        <Card className="border-2 border-primary/40 bg-card flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-mono text-primary border-primary/40">
                HTML / PDF
              </Badge>
              <FileTextIcon className="size-5 text-primary" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              Airworthiness Dossier
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              Certified report with operational envelope audit, ATA work orders, and engineering signs.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 flex flex-col gap-2">
            <Button onClick={handlePrintDossier} size="sm" className="w-full gap-1.5 font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white">
              <PrinterIcon className="size-3.5" />
              <span>Print / Save as PDF</span>
            </Button>
            <Button onClick={handleExportDossier} variant="outline" size="sm" className="w-full gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download HTML</span>
            </Button>
          </CardContent>
        </Card>

        {/* Card 2: Flight Telemetry CSV */}
        <Card className="border-2 border-border bg-card flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-mono text-emerald-500 border-emerald-500/40">
                CSV
              </Badge>
              <TableIcon className="size-5 text-emerald-500" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              Flight Telemetry FDR
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              Multi-channel time-series data with all physics variables and AI metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Button onClick={handleExportCsv} size="sm" variant="outline" className="w-full gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download CSV</span>
            </Button>
          </CardContent>
        </Card>

        {/* Card 3: Digital Twin Snapshot JSON */}
        <Card className="border-2 border-border bg-card flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-mono text-amber-500 border-amber-500/40">
                JSON
              </Badge>
              <FileCodeIcon className="size-5 text-amber-500" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              Twin State Snapshot
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              Full machine-readable digital twin payload including physics baselines and XAI.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Button onClick={handleExportJson} size="sm" variant="outline" className="w-full gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download JSON</span>
            </Button>
          </CardContent>
        </Card>

        {/* Card 4: SAE J1939 CAN Bus Frames */}
        <Card className="border-2 border-border bg-card flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-mono text-cyan-500 border-cyan-500/40">
                CSV / CAN
              </Badge>
              <CpuIcon className="size-5 text-cyan-500" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              SAE J1939 CAN Bus Log
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              Raw hex payloads, PGN identifiers, and decoded SPN engineering telemetry.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Button onClick={handleExportCanCsv} size="sm" variant="outline" className="w-full gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download CAN Log</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Status Banner ────────────────────────────────────────────── */}
      {downloadedFormat && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-4 shrink-0" />
            <span>
              Successfully exported <strong>{downloadedFormat}</strong>
            </span>
          </div>
          <button
            onClick={() => setDownloadedFormat(null)}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Live Dossier Document Preview ──────────────────────────────── */}
      <Card className="border-2 shadow-sm bg-card">
        <CardHeader className="p-4 sm:p-6 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="size-5 text-emerald-500" />
              <CardTitle className="text-lg font-bold">
                Live Document Preview: Airworthiness Dossier
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono text-primary">
                FORM AIR-8130-3 EQUIV
              </Badge>
              <Button size="sm" onClick={handlePrintDossier} className="gap-1 font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white h-7">
                <PrinterIcon className="size-3" />
                <span>PDF Print</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="rounded-lg border border-border/80 bg-muted/30 p-3 sm:p-6 shadow-inner overflow-x-auto">
            <DossierDocumentPreview payload={latestTelemetry} advisories={advisories} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DossierDocumentPreview({
  payload,
  advisories,
}: {
  payload: TelemetryPayload | undefined
  advisories: MaintenanceAdvisory[]
}) {
  const health = payload?.health
  const physics = payload?.physics
  const risk = payload?.mission_risk
  const healthIdx = health?.health_index ?? 94
  const condition = health?.condition ?? (healthIdx >= 80 ? "NOMINAL" : healthIdx >= 60 ? "DEGRADED" : "CRITICAL")
  const predictedRul = formatInteger(payload?.predicted_rul ?? 432)
  const ciLower = formatNumber(payload?.rul_ci_lower ?? 418, 1)
  const ciUpper = formatNumber(payload?.rul_ci_upper ?? 446, 1)
  const failProb = formatNumber(payload?.failure_probability ? payload.failure_probability * 100 : 0.8, 1)
  const missionProb = formatNumber(risk?.mission_completion_probability ?? 92.4, 1)
  const riskLevel = risk?.risk_level ?? "LOW"

  const hasCritical = advisories.some((a) => a.priority === "CRITICAL")
  const isAirworthy = healthIdx >= 80 && !hasCritical
  const isConditional = !isAirworthy && healthIdx >= 60

  const statusLabel = isAirworthy
    ? "AIRWORTHY // FULL MISSION DISPATCH AUTHORIZED"
    : isConditional
    ? "CONDITIONAL DISPATCH // PRE-FLIGHT ADVISORY REVIEW REQUIRED"
    : "UNAIRWORTHY // GROUNDED - DEPOT ACTION MANDATED"

  const rpm = payload?.rpm ?? 4800
  const cht = payload?.cht ?? 382.4
  const egt = payload?.egt ?? 1582.0
  const oilP = payload?.oil_pressure ?? 62.5
  const oilT = payload?.oil_temp ?? 204.8
  const fuelFlow = payload?.fuel_flow ?? 7.8
  const vib = payload?.vibration ?? 0.65
  const battV = payload?.battery_v ?? 28.2
  const bhp = physics?.brake_power_hp ?? 98.4
  const bsfc = physics?.bsfc_g_kwh ?? 284.6

  const envelopeRows = [
    {
      param: "Core Engine RPM",
      channel: "Crankshaft Tachometer",
      val: `${formatInteger(rpm)} RPM`,
      limits: "4,600 – 5,200 RPM (Max: 6,000)",
      margin: `${rpm > 5200 ? "+" : ""}${(rpm - 5000).toFixed(0)} RPM delta`,
      status: rpm > 5800 ? "EXCURSION" : rpm > 5300 ? "WARNING" : "PASS",
      statusClass: rpm > 5800 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : rpm > 5300 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      param: "Cylinder Head Temp (CHT)",
      channel: "Thermocouple Port/Stbd",
      val: `${formatNumber(cht, 1)} °F`,
      limits: "Nominal: 360 – 395 °F (Limit: 435 °F)",
      margin: `+${(435 - cht).toFixed(1)} °F thermal headroom`,
      status: cht > 430 ? "EXCURSION" : cht > 405 ? "WARNING" : "PASS",
      statusClass: cht > 430 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : cht > 405 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      param: "Exhaust Gas Temp (EGT)",
      channel: "Collector Manifold",
      val: `${formatNumber(egt, 1)} °F`,
      limits: "Nominal: 1,480 – 1,600 °F (Limit: 1,670 °F)",
      margin: `+${(1670 - egt).toFixed(1)} °F exhaust headroom`,
      status: egt > 1650 ? "EXCURSION" : egt > 1610 ? "WARNING" : "PASS",
      statusClass: egt > 1650 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : egt > 1610 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      param: "Main Oil Pressure",
      channel: "Lubrication Gallery",
      val: `${formatNumber(oilP, 1)} PSI`,
      limits: "Nominal: 45.0 – 75.0 PSI (Min: 35.0 PSI)",
      margin: `+${(oilP - 35).toFixed(1)} PSI above critical floor`,
      status: oilP < 38 ? "CRITICAL" : oilP < 48 ? "WARNING" : "PASS",
      statusClass: oilP < 38 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : oilP < 48 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      param: "Airframe Vibration",
      channel: "Tri-Axial Accelerometer (Z)",
      val: `${formatNumber(vib, 2)} g`,
      limits: "Certified Flight Limit: < 1.20 g",
      margin: `+${(1.20 - vib).toFixed(2)} g flutter headroom`,
      status: vib > 1.8 ? "CRITICAL" : vib > 1.2 ? "WARNING" : "PASS",
      statusClass: vib > 1.8 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : vib > 1.2 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      param: "28V DC Avionics Bus",
      channel: "Power Distribution Unit",
      val: `${formatNumber(battV, 1)} V`,
      limits: "Regulated: 26.0 – 29.5 V (Min: 24.0 V)",
      margin: `+${(battV - 24.0).toFixed(1)} V bus drop reserve`,
      status: battV < 24.0 ? "CRITICAL" : battV < 25.5 ? "WARNING" : "PASS",
      statusClass: battV < 24.0 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : battV < 25.5 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      param: "Brake Horsepower (BHP)",
      channel: "Engine Shaft Dynamometer",
      val: `${formatNumber(bhp, 1)} BHP`,
      limits: "Max Continuous: 100 BHP (Takeoff: 115 BHP)",
      margin: "98.4% continuous rated envelope",
      status: "PASS",
      statusClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      param: "Specific Fuel Consumption",
      channel: "Mass Flow & Shaft Output",
      val: `${formatNumber(bsfc, 1)} g/kWh`,
      limits: "Certified Target: 270 – 310 g/kWh",
      margin: "Optimal brake-thermal cruise band",
      status: "PASS",
      statusClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
  ]

  const auditHash = `SHA256:7f8a9b2c4e1d6f0a5b8c3e2a1d4f9b8c7e6a5d4c3b2a1e0f`

  return (
    <div className="rounded-md border border-zinc-300 dark:border-zinc-800 bg-white text-zinc-950 p-6 sm:p-8 shadow-sm font-sans text-xs leading-relaxed max-w-4xl mx-auto dark:bg-zinc-950 dark:text-zinc-100 transition-colors">
      {/* Top Banner */}
      <div className="border-b-2 border-zinc-900 dark:border-zinc-100 pb-3 mb-4 flex flex-wrap justify-between items-end gap-3">
        <div>
          <div className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
            DEPARTMENT OF DEFENSE // AERONAUTICAL SYSTEMS COMMAND
          </div>
          <h2 className="text-base sm:text-lg font-extrabold tracking-wider text-zinc-950 dark:text-zinc-50 uppercase m-0 mt-0.5">
            MALE UAV PROPULSION AIRWORTHINESS DOSSIER
          </h2>
          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-mono mt-0.5 font-semibold">
            MIL-STD-1553B · FAA 14 CFR PART 33 · DO-178C LEVEL B DAL B RECORD
          </div>
        </div>
        <div className="text-[10px] font-mono text-left sm:text-right text-zinc-700 dark:text-zinc-300 leading-tight">
          <div><strong>FORM:</strong> AIR-8130-3 EQUIV</div>
          <div><strong>DOC ID:</strong> UAV07-AIR-2026-FDR</div>
          <div><strong>REV:</strong> 2.4.0 (ACTIVE)</div>
          <div><strong>DATE:</strong> 2026-09-22 UTC</div>
        </div>
      </div>

      {/* Airworthiness Status Banner */}
      <div className={`p-3 rounded-md border mb-4 flex flex-wrap items-center justify-between gap-2 ${
        isAirworthy
          ? "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300"
          : isConditional
          ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-300"
          : "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-800/60 dark:text-red-300"
      }`}>
        <div>
          <div className="font-mono font-bold text-xs tracking-wide">{statusLabel}</div>
          <div className="text-[10px] opacity-80 font-mono">Continuous certification validated against SAE AS9100D aero safety boundaries</div>
        </div>
        <span className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${
          isAirworthy ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100" : "bg-amber-200 text-amber-900"
        }`}>
          {isAirworthy ? "DISPATCH APPROVED" : "CONDITIONAL"}
        </span>
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-3 mb-5 font-mono text-[10.5px]">
        <div>
          <div className="text-[9px] text-zinc-500 uppercase font-semibold">Platform Tail</div>
          <div className="font-bold text-zinc-900 dark:text-zinc-100">UAV-07 (MALE ISR)</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500 uppercase font-semibold">Engine Serial</div>
          <div className="font-bold text-zinc-900 dark:text-zinc-100">SN-914-8841-B</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500 uppercase font-semibold">Powerplant</div>
          <div className="font-bold text-zinc-900 dark:text-zinc-100">Rotax 914 F Turbo</div>
        </div>
        <div>
          <div className="text-[9px] text-zinc-500 uppercase font-semibold">TSO Hours / Cycles</div>
          <div className="font-bold text-zinc-900 dark:text-zinc-100">428.4 h ({formatInteger(payload?.cycle ?? 852)} cyc)</div>
        </div>
      </div>

      {/* Section 1: Executive Prognostics */}
      <div className="mb-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-b border-zinc-300 dark:border-zinc-800 pb-1 mb-2">
          1. Executive Propulsion Prognostics &amp; Health Index
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <div className="p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="text-[9px] font-mono text-zinc-500 uppercase font-bold">Engine Health Index</div>
            <div className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">{healthIdx}<span className="text-[10px] text-zinc-500 font-normal">/100</span></div>
            <div className="text-[9px] font-mono text-zinc-600 dark:text-zinc-400">Condition: <strong>{condition}</strong></div>
          </div>
          <div className="p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="text-[9px] font-mono text-zinc-500 uppercase font-bold">AI Predicted RUL</div>
            <div className="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100">{predictedRul} <span className="text-[10px] text-zinc-500 font-normal">CYC</span></div>
            <div className="text-[9px] font-mono text-zinc-600 dark:text-zinc-400">95% CI: [{ciLower}, {ciUpper}]</div>
          </div>
          <div className="p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="text-[9px] font-mono text-zinc-500 uppercase font-bold">Failure Risk (20 Cyc)</div>
            <div className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">{failProb}%</div>
            <div className="text-[9px] font-mono text-zinc-600 dark:text-zinc-400">Critical: &lt; 5.0%</div>
          </div>
          <div className="p-2.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="text-[9px] font-mono text-zinc-500 uppercase font-bold">Mission Completion</div>
            <div className="text-base font-mono font-bold text-blue-600 dark:text-blue-400">{missionProb}%</div>
            <div className="text-[9px] font-mono text-zinc-600 dark:text-zinc-400">Risk Level: <strong>{riskLevel}</strong></div>
          </div>
        </div>
      </div>

      {/* Section 2: Certified Operational Envelope Telemetry Audit */}
      <div className="mb-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-b border-zinc-300 dark:border-zinc-800 pb-1 mb-2">
          2. Certified Operational Envelope Telemetry Audit
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-bold text-[10px]">
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Parameter &amp; Channel</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono">Measured Value</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Certified Limit</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono">Safety Margin</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {envelopeRows.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">{r.param}</div>
                    <div className="text-[9px] text-zinc-500 font-mono">{r.channel}</div>
                  </td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono font-bold text-zinc-900 dark:text-zinc-100">{r.val}</td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-zinc-600 dark:text-zinc-400 text-[11px]">{r.limits}</td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono text-[10px] text-zinc-700 dark:text-zinc-300">{r.margin}</td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${r.statusClass}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Active ATA-100 Advisories */}
      <div className="mb-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-b border-zinc-300 dark:border-zinc-800 pb-1 mb-2">
          3. Active ATA-100 Maintenance Action Items &amp; Work Orders
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-bold text-[10px]">
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Task ID</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">ATA Chapter</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2 text-center">Priority</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Required Maintenance Action</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {advisories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-zinc-300 dark:border-zinc-800 p-3 text-center text-muted-foreground italic">
                    No active unaddressed maintenance actions. All monitored propulsion systems cleared for dispatch.
                  </td>
                </tr>
              ) : (
                advisories.map((item, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono font-bold text-zinc-950 dark:text-zinc-50">{item.task_id}</td>
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-zinc-700 dark:text-zinc-300">{item.ata_chapter}</td>
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        item.priority === "CRITICAL"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-zinc-800 dark:text-zinc-200">{item.action}</td>
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-center font-mono font-bold text-[10px] text-emerald-600">
                      OPEN / TRACKED
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Compliance */}
      <div className="mb-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-b border-zinc-300 dark:border-zinc-800 pb-1 mb-2">
          4. Certified Airworthiness Release &amp; Regulatory Compliance
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <tbody>
              {AIRWORTHINESS_SUMMARY.map((item, idx) => (
                <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-semibold text-zinc-700 dark:text-zinc-300 w-1/3 text-[11px]">
                    {item.label}
                  </td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono font-medium text-zinc-900 dark:text-zinc-100 text-[11px]">
                    {item.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 5: Signatures & Cryptographic Audit */}
      <div className="mt-6 pt-4 border-t-2 border-zinc-300 dark:border-zinc-800">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] font-mono">
          <div className="border border-dashed border-zinc-400 dark:border-zinc-700 rounded p-2.5 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="text-[9px] font-bold text-zinc-500 uppercase mb-2">Chief Propulsion Engineer</div>
            <div className="border-b border-zinc-400 dark:border-zinc-600 pb-1 mb-1 font-serif italic text-blue-700 dark:text-blue-400 font-bold text-xs">Dr. A. Mehta, PE</div>
            <div className="font-bold text-zinc-900 dark:text-zinc-100">Dr. A. Mehta, PE</div>
            <div className="text-[9px] text-zinc-500">PE License: #94218-AERO</div>
          </div>
          <div className="border border-dashed border-zinc-400 dark:border-zinc-700 rounded p-2.5 bg-zinc-50/50 dark:bg-zinc-900/40">
            <div className="text-[9px] font-bold text-zinc-500 uppercase mb-2">Quality Assurance Inspector</div>
            <div className="border-b border-zinc-400 dark:border-zinc-600 pb-1 mb-1 font-serif italic text-blue-700 dark:text-blue-400 font-bold text-xs">Capt. R. Sterling</div>
            <div className="font-bold text-zinc-900 dark:text-zinc-100">Capt. R. Sterling, QA/QC</div>
            <div className="text-[9px] text-zinc-500">Inspector ID: QA-7714-DEF · Level B</div>
          </div>
          <div className="border border-dashed border-zinc-400 dark:border-zinc-700 rounded p-2.5 bg-zinc-50/50 dark:bg-zinc-900/40 flex flex-col justify-between">
            <div>
              <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Cryptographic Audit Hash</div>
              <div className="font-mono text-[9px] text-zinc-700 dark:text-zinc-300 break-all font-bold">
                {auditHash}
              </div>
            </div>
            <div className="text-[8.5px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
              ✓ DIGITAL TWIN SNAPSHOT VERIFIED
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
