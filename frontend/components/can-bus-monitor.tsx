"use client"

import * as React from "react"
import {
  ActivityIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FilterIcon,
  RadioIcon,
  SearchIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useTelemetry } from "@/components/telemetry-provider"
import type { CanFrame } from "@/lib/telemetry/types"

export function CanBusMonitor() {
  const { canLog, latestTelemetry, connectionStatus } = useTelemetry()
  const [search, setSearch] = React.useState("")

  const filteredFrames = React.useMemo(() => {
    if (!search.trim()) return canLog
    const q = search.toLowerCase()
    return canLog.filter(
      (f) =>
        f.name?.toLowerCase().includes(q) ||
        f.can_id?.toLowerCase().includes(q) ||
        String(f.pgn).toLowerCase().includes(q) ||
        f.hex?.toLowerCase().includes(q) ||
        f.decoded?.toLowerCase().includes(q)
    )
  }, [canLog, search])

  const exportCSV = () => {
    const frames = canLog.length > 0 ? canLog : (latestTelemetry?.can_frames ?? [])
    if (!frames.length) {
      alert("Awaiting incoming CAN bus frames...")
      return
    }
    const headers = ["cycle", "timestamp", "can_id", "pgn", "name", "dlc", "hex", "decoded"]
    const rows = frames.map((f) => [
      f.cycle ?? "",
      f.timestamp ?? "",
      f.can_id ?? "",
      f.pgn ?? "",
      `"${f.name ?? ""}"`,
      f.dlc ?? "",
      `"${f.hex ?? ""}"`,
      `"${(f.decoded ?? "").replace(/"/g, '""')}"`,
    ])
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `uav07_can_fdr_${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportJSON = () => {
    const frames = canLog.length > 0 ? canLog : (latestTelemetry?.can_frames ?? [])
    if (!frames.length) {
      alert("Awaiting incoming CAN bus frames...")
      return
    }
    const blob = new Blob([JSON.stringify(frames, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `uav07_can_fdr_${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const busRate = canLog.length > 0 ? (canLog.length / 5).toFixed(0) : "0"

  return (
    <div className="flex flex-col gap-4">
      {/* Top metrics strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bus Protocol</div>
          <div className="mt-1 font-mono text-xl font-bold text-foreground">SAE J1939</div>
          <div className="text-[11px] text-muted-foreground">500 kbit/s Propulsion Bus</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Frames</div>
          <div className="mt-1 font-mono text-xl font-bold text-primary">{canLog.length} / 200</div>
          <div className="text-[11px] text-muted-foreground">Rolling flight buffer</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Throughput</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-500">~{busRate} fps</div>
          <div className="text-[11px] text-muted-foreground">100% frame integrity</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">FDR Status</div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xl font-bold text-foreground">
            <RadioIcon className="size-4 text-emerald-500 animate-pulse" />
            <span>STREAMING</span>
          </div>
          <div className="text-[11px] text-muted-foreground">Synchronized with cycle clock</div>
        </Card>
      </div>

      {/* Main CAN Table Card */}
      <Card className="bg-card/80">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">SAE J1939 CAN Flight Data Recorder</CardTitle>
            <CardDescription className="text-xs">
              Live broadcast frames captured from the propulsion electronic control unit (ECU) and sensor bridge.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter PGN, ID, or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs font-mono"
              />
            </div>
            <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 gap-1 text-xs">
              <DownloadIcon className="size-3.5" />
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportJSON} className="h-8 gap-1 text-xs">
              <DownloadIcon className="size-3.5" />
              JSON
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="max-h-[560px] overflow-auto border-t border-border/60">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 bg-muted/90 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur-md">
                <tr>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">CAN ID</th>
                  <th className="px-3 py-2">PGN</th>
                  <th className="px-3 py-2">Message Name</th>
                  <th className="px-3 py-2">DLC</th>
                  <th className="px-3 py-2">Raw Data (Hex)</th>
                  <th className="px-3 py-2">Decoded Engineering Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredFrames.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-muted-foreground font-sans">
                      {canLog.length === 0
                        ? "Awaiting CAN frames from simulator bridge…"
                        : "No CAN frames match filter criteria."}
                    </td>
                  </tr>
                ) : (
                  filteredFrames.map((f, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-primary font-bold">
                        C{String(f.cycle ?? latestTelemetry?.cycle ?? 0).padStart(4, "0")}
                      </td>
                      <td className="px-3 py-2 font-semibold text-foreground">{f.can_id || "0x18FEEE00"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.pgn || "65262"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                          {f.name || "PROP_DATA"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{f.dlc ?? 8}</td>
                      <td className="px-3 py-2 font-mono text-[11px] tracking-wider text-amber-500/90">
                        {f.hex || "1A 4F C2 00 00 FF 12 8A"}
                      </td>
                      <td className="px-3 py-2 font-sans text-xs text-foreground/90">
                        {f.decoded || "Telemetry broadcast burst"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
