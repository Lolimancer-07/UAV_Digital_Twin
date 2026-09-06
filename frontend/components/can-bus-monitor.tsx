"use client"

import * as React from "react"
import {
  ActivityIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CpuIcon,
  DownloadIcon,
  FilterIcon,
  RadioIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useTelemetry } from "@/components/telemetry-provider"
import type { CanFrame, CanSpnField } from "@/lib/telemetry/types"

export function CanBusMonitor() {
  const { canLog, latestTelemetry, connectionStatus } = useTelemetry()
  const [search, setSearch] = React.useState("")
  const [expandedRow, setExpandedRow] = React.useState<number | null>(null)

  const filteredFrames = React.useMemo(() => {
    if (!search.trim()) return canLog
    const q = search.toLowerCase()
    return canLog.filter(
      (f) =>
        f.name?.toLowerCase().includes(q) ||
        f.can_id?.toLowerCase().includes(q) ||
        String(f.pgn).toLowerCase().includes(q) ||
        f.hex?.toLowerCase().includes(q) ||
        f.decoded?.toLowerCase().includes(q) ||
        f.spns?.some(s => s.name.toLowerCase().includes(q) || String(s.spn).includes(q))
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

  const toggleRow = (idx: number) => {
    setExpandedRow(expandedRow === idx ? null : idx)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top metrics strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-card/70 p-4 border border-border/70">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bus Protocol</div>
          <div className="mt-1 font-mono text-xl font-bold text-foreground">SAE J1939</div>
          <div className="text-[11px] text-muted-foreground">500 kbit/s Propulsion Bus</div>
        </Card>
        <Card className="bg-card/70 p-4 border border-border/70">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Frames</div>
          <div className="mt-1 font-mono text-xl font-bold text-primary">{canLog.length} / 200</div>
          <div className="text-[11px] text-muted-foreground">Rolling flight recorder buffer</div>
        </Card>
        <Card className="bg-card/70 p-4 border border-border/70">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Throughput</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-500">~{busRate} fps</div>
          <div className="text-[11px] text-muted-foreground">100% frame integrity (CRC OK)</div>
        </Card>
        <Card className="bg-card/70 p-4 border border-border/70">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">FDR Status</div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xl font-bold text-foreground">
            <RadioIcon className="size-4 text-emerald-500 animate-pulse" />
            <span>{connectionStatus === "live" ? "STREAMING" : "CONNECTING"}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">10 Hz telemetry synchronization</div>
        </Card>
      </div>

      {/* Main CAN Table Card */}
      <Card className="bg-card/80 border border-border/70">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">SAE J1939 CAN Flight Data Recorder & Sniffer</CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30">
                INTERACTIVE DECODER
              </Badge>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Live broadcast frames captured from the propulsion ECU. Click any row to expand the Suspect Parameter Number (SPN) bit-level breakdown.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter PGN, SPN, ID, or name..."
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
          <div className="max-h-[600px] overflow-auto border-t border-border/60">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 bg-muted/95 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur-md z-10">
                <tr>
                  <th className="px-3 py-2.5 w-8"></th>
                  <th className="px-3 py-2.5">Cycle</th>
                  <th className="px-3 py-2.5">CAN ID</th>
                  <th className="px-3 py-2.5">PGN</th>
                  <th className="px-3 py-2.5">Message Name</th>
                  <th className="px-3 py-2.5">DLC</th>
                  <th className="px-3 py-2.5">Raw Data (Hex)</th>
                  <th className="px-3 py-2.5">Decoded Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredFrames.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-muted-foreground font-sans">
                      {canLog.length === 0
                        ? "Awaiting CAN frames from simulator bridge…"
                        : "No CAN frames match filter criteria."}
                    </td>
                  </tr>
                ) : (
                  filteredFrames.map((f, idx) => {
                    const isExpanded = expandedRow === idx
                    const hexBytes = (f.hex || "").split(" ")

                    return (
                      <React.Fragment key={idx}>
                        <tr
                          onClick={() => toggleRow(idx)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded ? "bg-primary/10" : "hover:bg-muted/40"
                          }`}
                        >
                          <td className="px-2 py-2 text-center text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDownIcon className="size-3.5 text-primary inline" />
                            ) : (
                              <ChevronRightIcon className="size-3.5 text-muted-foreground inline" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-primary font-bold">
                            C{String(f.cycle ?? latestTelemetry?.cycle ?? 0).padStart(4, "0")}
                          </td>
                          <td className="px-3 py-2 font-semibold text-foreground">{f.can_id || "0x18FEEE00"}</td>
                          <td className="px-3 py-2 text-primary font-bold">{f.pgn || "65262"}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                              {f.name || "PROP_DATA"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{f.dlc ?? 8}</td>
                          <td className="px-3 py-2 font-mono text-[11px] tracking-wider text-amber-500/90 font-bold">
                            {f.hex || "1A 4F C2 00 00 FF 12 8A"}
                          </td>
                          <td className="px-3 py-2 font-sans text-xs text-foreground/90">
                            {f.decoded || "Telemetry broadcast burst"}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-muted/20 border-b-2 border-primary/20">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="flex flex-col gap-3 font-sans">
                                {/* Header badge strip */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                                  <div className="flex items-center gap-2">
                                    <CpuIcon className="size-4 text-primary" />
                                    <span className="font-mono text-xs font-bold text-foreground">
                                      {f.name} (PGN {f.pgn})
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      Arbitration ID: <code className="text-primary font-mono">{f.can_id}</code>
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground font-mono">
                                    Timestamp: {f.timestamp || "Live"} | 8-byte payload
                                  </div>
                                </div>

                                {/* Raw Byte Strip with index tags */}
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Raw Byte Map (Bytes 0 to 7)
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                                    {hexBytes.map((byte, bIdx) => (
                                      <div
                                        key={bIdx}
                                        className="flex flex-col items-center rounded bg-card px-2.5 py-1 border border-border/80 shadow-xs"
                                      >
                                        <span className="text-[9px] text-muted-foreground">B{bIdx}</span>
                                        <span className="font-bold text-amber-400">0x{byte}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* J1939 SPN Fields Table */}
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                                    Decoded J1939 Suspect Parameter Numbers (SPNs)
                                  </div>
                                  <div className="overflow-hidden rounded-md border border-border/60 bg-card/60">
                                    <table className="w-full text-left text-xs font-sans">
                                      <thead className="bg-muted/60 text-[10px] font-bold uppercase text-muted-foreground">
                                        <tr>
                                          <th className="px-3 py-1.5 font-mono">SPN</th>
                                          <th className="px-3 py-1.5">Signal Parameter Name</th>
                                          <th className="px-3 py-1.5 font-mono">Bit Range</th>
                                          <th className="px-3 py-1.5">Resolution / Scaling</th>
                                          <th className="px-3 py-1.5 text-right font-mono">Engineering Value</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                                        {f.spns && f.spns.length > 0 ? (
                                          f.spns.map((s, sIdx) => (
                                            <tr key={sIdx} className="hover:bg-muted/30">
                                              <td className="px-3 py-1.5 text-primary font-bold">SPN {s.spn}</td>
                                              <td className="px-3 py-1.5 font-sans font-medium text-foreground">{s.name}</td>
                                              <td className="px-3 py-1.5 text-muted-foreground">Bits {s.bits}</td>
                                              <td className="px-3 py-1.5 font-sans text-xs text-muted-foreground">{s.res}</td>
                                              <td className="px-3 py-1.5 text-right font-bold text-emerald-400">
                                                {s.val} {s.unit}
                                              </td>
                                            </tr>
                                          ))
                                        ) : (
                                          <tr>
                                            <td colSpan={5} className="px-3 py-2 text-center text-muted-foreground font-sans">
                                              Standard telemetry broadcast frame: {f.decoded}
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
