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
import {
  createDossierHtml,
  downloadTextFile,
  serializeCanLog,
  serializeTelemetryLogCsv,
} from "@/lib/telemetry/exports"

export function DossierPanel() {
  const { latestTelemetry, telemetryLog, canLog } = useTelemetry()
  const [downloadedFormat, setDownloadedFormat] = React.useState<string | null>(null)

  const advisories = latestTelemetry?.advisories ?? []
  const dossierHtml = React.useMemo(
    () => createDossierHtml(latestTelemetry, advisories),
    [latestTelemetry, advisories]
  )

  const handleExportDossier = () => {
    downloadTextFile(
      `uav07_airworthiness_dossier_${Date.now()}.html`,
      dossierHtml,
      "text/html;charset=utf-8"
    )
    setDownloadedFormat("Airworthiness Dossier (HTML/PDF)")
  }

  const handlePrintDossier = () => {
    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(dossierHtml)
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
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Propulsion Airworthiness Dossier & Flight Data Export
                </h1>
              </div>
              <p className="text-sm font-medium text-muted-foreground mt-1">
                Official airworthiness certification record, high-rate flight data recorder logs, and DO-178C Level B compliance export.
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
        <CardContent className="p-6">
          <div className="rounded-lg border border-border/80 bg-white dark:bg-zinc-950 p-6 shadow-inner overflow-x-auto">
            <iframe
              srcDoc={dossierHtml}
              title="Airworthiness Dossier Preview"
              className="w-full min-h-[600px] border-0 rounded"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
