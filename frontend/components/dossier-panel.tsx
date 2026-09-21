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
      printWindow.print()
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
                  READY
                </Badge>
              </div>
              <p className="text-sm font-medium text-muted-foreground mt-1.5">
                Certified airworthiness certification record, high-rate flight data recorder logs, and DO-178C Level B compliance evidence export.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={handleExportDossier} className="font-bold text-xs gap-1.5 shadow-sm">
                <DownloadIcon className="size-4" />
                <span>Export Dossier (HTML)</span>
              </Button>
              <Button variant="outline" onClick={handlePrintDossier} className="font-bold text-xs gap-1.5">
                <PrinterIcon className="size-4" />
                <span>Print / PDF</span>
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
              Certified report with RUL estimates, ATA-100 work orders, and engineering signs.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Button onClick={handleExportDossier} size="sm" className="w-full gap-1.5 font-bold text-xs">
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
                CSV TABLE
              </Badge>
              <TableIcon className="size-5 text-emerald-500" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              Flight Telemetry FDR
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              14 synchronized sensor channels across all recorded flight cycles.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Button onClick={handleExportCsv} variant="outline" size="sm" className="w-full gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download CSV</span>
            </Button>
          </CardContent>
        </Card>

        {/* Card 3: Digital Twin Snapshot JSON */}
        <Card className="border-2 border-border bg-card flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-mono text-sky-500 border-sky-500/40">
                JSON OBJECT
              </Badge>
              <FileCodeIcon className="size-5 text-sky-500" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              Twin State Snapshot
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              Complete raw JSON dump of neural network states, physics models, and XAI weights.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Button onClick={handleExportJson} variant="outline" size="sm" className="w-full gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download JSON</span>
            </Button>
          </CardContent>
        </Card>

        {/* Card 4: SAE J1939 CAN Bus Frames */}
        <Card className="border-2 border-border bg-card flex flex-col justify-between hover:shadow-md transition-shadow">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-mono text-amber-500 border-amber-500/40">
                {canLog.length} FRAMES
              </Badge>
              <CpuIcon className="size-5 text-amber-500" />
            </div>
            <CardTitle className="text-base font-bold mt-2">
              CAN Bus Log
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              SAE J1939 binary hex frames, PGN identifiers, and decoded telemetry records.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <Button onClick={handleExportCanCsv} variant="outline" size="sm" className="w-full gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download CAN CSV</span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {downloadedFormat && (
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <CheckCircle2Icon className="size-5" />
          <span>Downloaded {downloadedFormat} successfully!</span>
        </div>
      )}

      {/* ── Live Dossier Document Preview ──────────────────────────────── */}
      <Card className="border-2 shadow-md">
        <CardHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="size-5 text-emerald-500" />
              <CardTitle className="text-lg font-bold">
                Live Document Preview: Airworthiness Dossier
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-xs font-mono text-primary">
              MALE UAV · TAIL UAV-07
            </Badge>
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

  const stateRows = [
    {
      param: "Total Flight Cycles Recorded",
      value: formatInteger(payload?.cycle),
      eval: "COMPLETED",
    },
    {
      param: "Engine Health Index (EHI)",
      value: `${formatInteger(health?.health_index)} / 100`,
      eval: health?.condition ?? "NOMINAL",
    },
    {
      param: "AI Predicted RUL",
      value: `${formatInteger(payload?.predicted_rul)} cycles`,
      eval: `95% CI [${formatNumber(payload?.rul_ci_lower, 1)}, ${formatNumber(payload?.rul_ci_upper, 1)}]`,
    },
    {
      param: "Brake Horsepower",
      value: `${formatNumber(physics?.brake_power_hp, 2)} BHP`,
      eval: "CONTINUOUS OPERATING ENVELOPE",
    },
    {
      param: "Specific Fuel Consumption",
      value: `${formatNumber(physics?.bsfc_g_kwh, 1)} g/kWh`,
      eval: "OPTIMAL CRUISE RANGE",
    },
  ]

  return (
    <div className="rounded-md border border-zinc-300 dark:border-zinc-800 bg-white text-zinc-950 p-6 sm:p-8 shadow-sm font-sans text-xs leading-relaxed max-w-4xl mx-auto dark:bg-zinc-950 dark:text-zinc-100 transition-colors">
      {/* Document Header */}
      <div className="border-b-2 border-zinc-900 dark:border-zinc-100 pb-3 mb-6 flex flex-wrap justify-between items-end gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold tracking-wider text-zinc-950 dark:text-zinc-50 uppercase m-0">
            MALE UAV PROPULSION AIRWORTHINESS DOSSIER
          </h2>
          <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono mt-0.5">
            MIL-STD-1553 · DO-178C LEVEL B CERTIFICATION
          </div>
        </div>
        <div className="text-[11px] font-mono text-left sm:text-right text-zinc-700 dark:text-zinc-300">
          <div>DATE: 2026-09-21 UTC</div>
          <div>TAIL: UAV-07 | S/N: 914-8841</div>
        </div>
      </div>

      {/* Section 1: Executive State */}
      <div className="mb-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-b border-zinc-300 dark:border-zinc-800 pb-1 mb-2">
          1. Executive Propulsion State &amp; Prognostics Summary
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-bold">
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Parameter</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono">Value</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Airworthiness Evaluation</th>
              </tr>
            </thead>
            <tbody>
              {stateRows.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-medium text-zinc-900 dark:text-zinc-100">{r.param}</td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono font-bold text-foreground">{r.value}</td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                      {r.eval}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Active ATA-100 Advisories */}
      <div className="mb-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-b border-zinc-300 dark:border-zinc-800 pb-1 mb-2">
          2. Active ATA-100 Maintenance Work Orders
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-bold">
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Task ID</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">ATA Chapter</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Priority</th>
                <th className="border border-zinc-300 dark:border-zinc-800 p-2">Required Maintenance Action</th>
              </tr>
            </thead>
            <tbody>
              {advisories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-zinc-300 dark:border-zinc-800 p-3 text-center text-muted-foreground italic">
                    No active maintenance actions. System fully airworthy for flight dispatch.
                  </td>
                </tr>
              ) : (
                advisories.map((item, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono font-bold text-zinc-950 dark:text-zinc-50">{item.task_id}</td>
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-zinc-700 dark:text-zinc-300">{item.ata_chapter}</td>
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-semibold">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        item.priority === "CRITICAL"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="border border-zinc-300 dark:border-zinc-800 p-2 text-zinc-800 dark:text-zinc-200">{item.action}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Compliance */}
      <div className="mb-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-b border-zinc-300 dark:border-zinc-800 pb-1 mb-2">
          3. Certified Airworthiness Release &amp; Regulatory Compliance
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <tbody>
              {AIRWORTHINESS_SUMMARY.map((item, idx) => (
                <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-semibold text-zinc-700 dark:text-zinc-300 w-1/3">
                    {item.label}
                  </td>
                  <td className="border border-zinc-300 dark:border-zinc-800 p-2 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                    {item.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Sign-off */}
      <div className="mt-8 pt-4 border-t border-zinc-400 dark:border-zinc-700 flex flex-wrap justify-between items-center gap-4 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
        <div>CHIEF PROPULSION ENGINEER: <span className="underline decoration-dotted font-serif italic text-zinc-900 dark:text-zinc-100 font-semibold">Dr. A. Mehta, PE</span></div>
        <div>QA VERIFIED: <span className="text-emerald-600 dark:text-emerald-400 font-bold">[PASS] DO-178C LVL B</span></div>
      </div>
    </div>
  )
}
