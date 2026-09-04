"use client"

import * as React from "react"
import {
  DownloadIcon,
  FileTextIcon,
  TableIcon,
  FileCodeIcon,
  CpuIcon,
  CheckCircle2Icon,
  ShieldCheckIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"
import {
  createDossierHtml,
  downloadTextFile,
  serializeCanLog,
  serializeTelemetryLogCsv,
} from "@/lib/telemetry/exports"

export function ExportDialog({ trigger }: { trigger?: React.ReactElement }) {
  const { latestTelemetry, telemetryLog, canLog } = useTelemetry()
  const [downloadedFormat, setDownloadedFormat] = React.useState<string | null>(null)

  const handleExportDossier = () => {
    const advisories = latestTelemetry?.advisories ?? []
    const html = createDossierHtml(latestTelemetry, advisories)
    downloadTextFile(`uav07_airworthiness_dossier_${Date.now()}.html`, html, "text/html;charset=utf-8")
    setDownloadedFormat("Airworthiness Dossier (HTML)")
  }

  const handleExportCsv = () => {
    const csv = serializeTelemetryLogCsv(telemetryLog, latestTelemetry)
    downloadTextFile(`uav07_telemetry_fdr_${Date.now()}.csv`, csv, "text/csv;charset=utf-8")
    setDownloadedFormat("Flight Telemetry Log (CSV)")
  }

  const handleExportJson = () => {
    const data = {
      export_timestamp: new Date().toISOString(),
      uav_id: latestTelemetry?.uav_id ?? "UAV-07",
      latest_state: latestTelemetry ?? {},
      telemetry_history_sample: telemetryLog.slice(-50),
      can_frames_sample: canLog.slice(-50),
    }
    const jsonStr = JSON.stringify(data, null, 2)
    downloadTextFile(`uav07_digital_twin_${Date.now()}.json`, jsonStr, "application/json;charset=utf-8")
    setDownloadedFormat("Complete Twin Snapshot (JSON)")
  }

  const handleExportCanCsv = () => {
    const csv = serializeCanLog(canLog)
    downloadTextFile(`uav07_can_fdr_${Date.now()}.csv`, csv, "text/csv;charset=utf-8")
    setDownloadedFormat("SAE J1939 CAN Frames (CSV)")
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          trigger ?? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 font-bold text-xs border-primary/50 text-primary hover:bg-primary/10 shadow-xs"
            >
              <DownloadIcon className="size-3.5" />
              <span>EXPORT</span>
            </Button>
          )
        }
      />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DownloadIcon className="size-5 text-primary" />
            <DialogTitle className="text-lg font-bold">
              Export Flight Data & Propulsion Dossier
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Export certified airworthiness documentation, high-rate flight data recorder (FDR) telemetry, and raw digital twin logs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Option 1: Formal Airworthiness Dossier */}
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-primary/10">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/20 p-2 text-primary shrink-0 mt-0.5">
                <FileTextIcon className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">
                    Formal Airworthiness Dossier
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono text-primary">
                    HTML / PDF
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Full certified report with executive summary, RUL prognostics, ATA-100 work orders, and compliance signature block.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={handleExportDossier} className="shrink-0 gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download</span>
            </Button>
          </div>

          {/* Option 2: Flight Telemetry FDR (CSV) */}
          <div className="rounded-lg border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-emerald-500/20 p-2 text-emerald-500 shrink-0 mt-0.5">
                <TableIcon className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">
                    Flight Telemetry Log (CSV)
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    CSV Table
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Full 14-channel sensor records, health index, RUL estimates, and anomaly flags across all cycles.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleExportCsv} className="shrink-0 gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download</span>
            </Button>
          </div>

          {/* Option 3: Full Digital Twin State (JSON) */}
          <div className="rounded-lg border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-sky-500/20 p-2 text-sky-500 shrink-0 mt-0.5">
                <FileCodeIcon className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">
                    Complete Twin State (JSON)
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    JSON Object
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Raw JSON snapshot of current physics state, XAI feature rankings, and telemetry buffers.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleExportJson} className="shrink-0 gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download</span>
            </Button>
          </div>

          {/* Option 4: SAE J1939 CAN Bus Frames (CSV) */}
          <div className="rounded-lg border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-amber-500/20 p-2 text-amber-500 shrink-0 mt-0.5">
                <CpuIcon className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">
                    SAE J1939 CAN Bus Log
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {canLog.length} Frames
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Raw binary hex frames, PGN identifiers, and decoded telemetry engineering values.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleExportCanCsv} className="shrink-0 gap-1.5 font-bold text-xs">
              <DownloadIcon className="size-3.5" />
              <span>Download</span>
            </Button>
          </div>

          {downloadedFormat && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-md p-2.5 mt-1">
              <CheckCircle2Icon className="size-4" />
              <span>Downloaded {downloadedFormat} successfully!</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
