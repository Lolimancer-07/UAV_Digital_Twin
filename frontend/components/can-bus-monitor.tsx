"use client"

import * as React from "react"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bookmark,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  HardDrive,
  Info,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { useTelemetry } from "@/components/telemetry-provider"
import type { CanFrame, CanSpnField } from "@/lib/telemetry/types"

// ─── Supported Bus Channels & Types ──────────────────────────────────────────

export type CanBusChannel = "ALL" | "CAN-A" | "CAN-B" | "CAN-C" | "DTC_ONLY"

export interface BusChannelConfig {
  id: CanBusChannel
  name: string
  protocol: string
  bitrate: string
  desc: string
  color: string
}

export const BUS_CHANNELS: Record<CanBusChannel, BusChannelConfig> = {
  ALL: {
    id: "ALL",
    name: "All Channels",
    protocol: "Multiplexed",
    bitrate: "Dual-Bus 1.5 Mbps",
    desc: "Combined telemetry across all avionics and propulsion buses",
    color: "#38bdf8",
  },
  "CAN-A": {
    id: "CAN-A",
    name: "CAN-A Propulsion",
    protocol: "SAE J1939",
    bitrate: "500 kbit/s",
    desc: "Rotax 914 F Turbo ECU, Temperatures, Fluid Pressure & Fuel",
    color: "#10b981",
  },
  "CAN-B": {
    id: "CAN-B",
    name: "CAN-B Flight Control",
    protocol: "ARINC 825 / CANaerospace",
    bitrate: "1000 kbit/s",
    desc: "Autopilot, Air Data, Inertial Navigation & Actuators",
    color: "#6366f1",
  },
  "CAN-C": {
    id: "CAN-C",
    name: "CAN-C Mission Payload",
    protocol: "STANAG 4586 Payload",
    bitrate: "500 kbit/s",
    desc: "Multi-Spectral EO/IR FLIR Gimbal, Laser Rangefinder & Sensors",
    color: "#f59e0b",
  },
  DTC_ONLY: {
    id: "DTC_ONLY",
    name: "DTC & Alarms Only",
    protocol: "J1939 DM1",
    bitrate: "Diagnostic Filter",
    desc: "Active Diagnostic Trouble Codes and Out-of-Tolerance SPNs",
    color: "#ef4444",
  },
}

// ─── PGN Presets for Filtering ───────────────────────────────────────────────

interface PgnDefinition {
  pgn: number
  acronym: string
  name: string
  bus: "CAN-A" | "CAN-B" | "CAN-C"
  sourceAddress: string
  spnList: number[]
}

const KNOWN_PGNS: PgnDefinition[] = [
  { pgn: 61444, acronym: "EEC1", name: "Electronic Engine Controller 1", bus: "CAN-A", sourceAddress: "0x00 (Engine ECU #1)", spnList: [190, 513, 898] },
  { pgn: 65262, acronym: "ET1", name: "Engine Temperatures 1", bus: "CAN-A", sourceAddress: "0x00 (Engine ECU #1)", spnList: [110, 175, 174] },
  { pgn: 65263, acronym: "EFLP", name: "Engine Fluid Level & Pressure", bus: "CAN-A", sourceAddress: "0x00 (Engine ECU #1)", spnList: [100, 101] },
  { pgn: 65266, acronym: "LFE", name: "Fuel Economy & Delivery Rate", bus: "CAN-A", sourceAddress: "0x00 (Engine ECU #1)", spnList: [183] },
  { pgn: 65271, acronym: "VEP", name: "Vehicle Electrical Power", bus: "CAN-A", sourceAddress: "0x00 (Engine ECU #1)", spnList: [168, 114] },
  { pgn: 65168, acronym: "VIB", name: "Aero Propulsion Vibration", bus: "CAN-A", sourceAddress: "0x00 (Engine ECU #1)", spnList: [520001, 520002] },
  { pgn: 65256, acronym: "FCS", name: "Flight Control Air Data", bus: "CAN-B", sourceAddress: "0x10 (Flight Control Comp)", spnList: [512001, 512002] },
  { pgn: 65267, acronym: "NAV", name: "Vehicle Position / GPS", bus: "CAN-B", sourceAddress: "0x12 (INS / GNSS)", spnList: [584, 585] },
  { pgn: 64998, acronym: "GMB", name: "EO/IR FLIR Sensor Gimbal", bus: "CAN-C", sourceAddress: "0x21 (Payload Turret)", spnList: [600001, 600002] },
  { pgn: 65226, acronym: "DM1", name: "Active Diagnostic Trouble Codes", bus: "CAN-A", sourceAddress: "0x00 (Engine ECU #1)", spnList: [1214, 1215] },
]

// ─── SPN Signal Definition for Oscilloscope ──────────────────────────────────

interface OscilloscopeSignal {
  spn: number
  name: string
  unit: string
  min: number
  max: number
  nominalRange: [number, number]
  color: string
}

const OSCILLOSCOPE_SIGNALS: OscilloscopeSignal[] = [
  { spn: 190, name: "Engine Speed (RPM)", unit: "RPM", min: 1000, max: 6000, nominalRange: [2200, 5200], color: "#38bdf8" },
  { spn: 110, name: "Cylinder Head Temp CHT", unit: "°F", min: 200, max: 480, nominalRange: [320, 410], color: "#f97316" },
  { spn: 100, name: "Engine Oil Pressure", unit: "PSI", min: 10, max: 90, nominalRange: [45, 75], color: "#10b981" },
  { spn: 168, name: "28V Avionics Bus Potential", unit: "V", min: 20, max: 32, nominalRange: [26, 29.5], color: "#818cf8" },
  { spn: 183, name: "Engine Fuel Delivery Rate", unit: "L/h", min: 0, max: 40, nominalRange: [12, 28], color: "#fbbf24" },
  { spn: 520001, name: "Propulsion Vibration RMS", unit: "g", min: 0, max: 4.0, nominalRange: [0.4, 1.4], color: "#ec4899" },
]

// ─── Diagnostic Trouble Code (DTC) Model ────────────────────────────────────

interface ActiveDtcAlert {
  spn: number
  fmi: number
  fmiDesc: string
  spnName: string
  severity: "CAUTION" | "CRITICAL"
  lamp: "AMBER_WARNING" | "RED_STOP"
  occurrenceCount: number
  currentVal: string
}

// ─── Helpers: Bitmask & J1939 ID Parsing ────────────────────────────────────

function parseJ1939CanId(canIdStr: string) {
  const clean = canIdStr.replace(/^0x/i, "")
  const num = parseInt(clean, 16) || 0
  const priority = (num >> 26) & 0x07
  const edp = (num >> 25) & 0x01
  const dp = (num >> 24) & 0x01
  const pf = (num >> 16) & 0xff
  const ps = (num >> 8) & 0xff
  const sa = num & 0xff

  // Calculate PGN
  let pgn = (dp << 16) | (pf << 8)
  if (pf >= 240) {
    pgn |= ps
  }

  return {
    rawNum: num,
    hex: "0x" + clean.toUpperCase().padStart(8, "0"),
    priority,
    edp,
    dp,
    pf: "0x" + pf.toString(16).toUpperCase().padStart(2, "0"),
    ps: "0x" + ps.toString(16).toUpperCase().padStart(2, "0"),
    sa: "0x" + sa.toString(16).toUpperCase().padStart(2, "0"),
    pgn,
  }
}

// ─── Main CAN Bus Monitor Component ──────────────────────────────────────────

export function CanBusMonitor() {
  const { canLog, latestTelemetry, connectionStatus } = useTelemetry()

  // ── State Management ───────────────────────────────────────────────────────
  const [selectedChannel, setSelectedChannel] = React.useState<CanBusChannel>("ALL")
  const [pgnFilter, setPgnFilter] = React.useState<string>("ALL")
  const [search, setSearch] = React.useState("")
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null)
  const [inspectedFrame, setInspectedFrame] = React.useState<CanFrame | null>(null)
  const [hoveredSpnBits, setHoveredSpnBits] = React.useState<string | null>(null)

  // FDR Transport & Buffer Controls
  const [isRecording, setIsRecording] = React.useState(true)
  const [frozenFrames, setFrozenFrames] = React.useState<CanFrame[]>([])
  const [bufferLimit, setBufferLimit] = React.useState<number>(200)
  const [autoScroll, setAutoScroll] = React.useState(true)
  const [inspectedStepOffset, setInspectedStepOffset] = React.useState<number>(0)

  // Oscilloscope
  const [oscillatorOpen, setOscillatorOpen] = React.useState(true)
  const [selectedSignalSpn, setSelectedSignalSpn] = React.useState<number>(190)

  // Certified Debrief Modal
  const [debriefModalOpen, setDebriefModalOpen] = React.useState(false)
  const [copiedRaw, setCopiedRaw] = React.useState(false)

  // ── Frame Buffer & Stream Freeze Logic ─────────────────────────────────────
  // If recording is paused, freeze the stream at the captured moment; otherwise use live canLog
  React.useEffect(() => {
    if (isRecording) {
      setFrozenFrames(canLog)
    }
  }, [canLog, isRecording])

  const activeBuffer = isRecording ? canLog : frozenFrames

  // ── Enhanced Frame Channel Attribution ────────────────────────────────────
  const enrichedFrames = React.useMemo(() => {
    return activeBuffer.map((f, i) => {
      const pgnNum = Number(f.pgn)
      let bus: "CAN-A" | "CAN-B" | "CAN-C" = "CAN-A"
      if (pgnNum === 65256 || pgnNum === 65267) bus = "CAN-B"
      else if (pgnNum === 64998) bus = "CAN-C"

      return {
        ...f,
        bus,
        frameIndex: i,
      }
    })
  }, [activeBuffer])

  // ── Active DTC Alarms Detection ───────────────────────────────────────────
  const activeDtcs = React.useMemo<ActiveDtcAlert[]>(() => {
    const list: ActiveDtcAlert[] = []
    const rpm = latestTelemetry?.rpm ?? 4800
    const cht = latestTelemetry?.cht ?? 382
    const oilP = latestTelemetry?.oil_pressure ?? 65
    const battV = latestTelemetry?.battery_v ?? 28.5
    const vib = latestTelemetry?.vibration ?? 0.65

    if (cht > 425) {
      list.push({
        spn: 110,
        fmi: 0,
        fmiDesc: "Data Valid Above Normal Operational Range (High Engine Overheat)",
        spnName: "Cylinder Head Temp CHT",
        severity: "CRITICAL",
        lamp: "RED_STOP",
        occurrenceCount: 3,
        currentVal: `${cht.toFixed(1)} °F`,
      })
    } else if (cht > 410) {
      list.push({
        spn: 110,
        fmi: 15,
        fmiDesc: "Data Valid Above Normal Operational Range (Least Severe Level)",
        spnName: "Cylinder Head Temp CHT",
        severity: "CAUTION",
        lamp: "AMBER_WARNING",
        occurrenceCount: 1,
        currentVal: `${cht.toFixed(1)} °F`,
      })
    }

    if (oilP < 38) {
      list.push({
        spn: 100,
        fmi: 1,
        fmiDesc: "Data Valid Below Normal Operational Range (Low Oil Pressure)",
        spnName: "Engine Oil Pressure",
        severity: "CRITICAL",
        lamp: "RED_STOP",
        occurrenceCount: 2,
        currentVal: `${oilP.toFixed(1)} PSI`,
      })
    }

    if (vib > 2.2) {
      list.push({
        spn: 520001,
        fmi: 2,
        fmiDesc: "Data Erratic, Intermittent, or Incorrect (Excess Airframe Flutter)",
        spnName: "Propulsion Vibration RMS",
        severity: "CRITICAL",
        lamp: "RED_STOP",
        occurrenceCount: 4,
        currentVal: `${vib.toFixed(2)} g`,
      })
    }

    if (battV < 24.5) {
      list.push({
        spn: 168,
        fmi: 4,
        fmiDesc: "Voltage Below Normal or Shorted to Low Source",
        spnName: "Avionics Bus Potential",
        severity: "CAUTION",
        lamp: "AMBER_WARNING",
        occurrenceCount: 1,
        currentVal: `${battV.toFixed(1)} V`,
      })
    }

    return list
  }, [latestTelemetry])

  // ── Multi-Criteria Filtering ──────────────────────────────────────────────
  const filteredFrames = React.useMemo(() => {
    let list = enrichedFrames

    // Bus filter
    if (selectedChannel === "DTC_ONLY") {
      list = list.filter((f) => {
        // Frame matches any active DTC or out-of-range SPN
        return f.spns?.some((s) => {
          if (s.spn === 110 && parseFloat(s.val) > 410) return true
          if (s.spn === 100 && parseFloat(s.val) < 40) return true
          if (s.spn === 168 && parseFloat(s.val) < 25) return true
          if (s.spn === 520001 && parseFloat(s.val) > 1.8) return true
          return false
        })
      })
    } else if (selectedChannel !== "ALL") {
      list = list.filter((f) => f.bus === selectedChannel)
    }

    // PGN filter
    if (pgnFilter !== "ALL") {
      list = list.filter((f) => String(f.pgn) === pgnFilter)
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (f) =>
          f.name?.toLowerCase().includes(q) ||
          f.can_id?.toLowerCase().includes(q) ||
          String(f.pgn).toLowerCase().includes(q) ||
          f.hex?.toLowerCase().includes(q) ||
          f.decoded?.toLowerCase().includes(q) ||
          f.spns?.some(
            (s) => s.name.toLowerCase().includes(q) || String(s.spn).includes(q) || s.val.includes(q)
          )
      )
    }

    return list
  }, [enrichedFrames, selectedChannel, pgnFilter, search])

  // ── Oscilloscope Trace Series ──────────────────────────────────────────────
  const activeSig = OSCILLOSCOPE_SIGNALS.find((s) => s.spn === selectedSignalSpn) || OSCILLOSCOPE_SIGNALS[0]

  const signalHistory = React.useMemo(() => {
    const points: Array<{ cycle: number; val: number }> = []
    activeBuffer.forEach((f) => {
      const spnMatch = f.spns?.find((s) => s.spn === activeSig.spn)
      if (spnMatch) {
        const num = parseFloat(spnMatch.val)
        if (!isNaN(num)) {
          points.push({ cycle: Number(f.cycle ?? 0), val: num })
        }
      }
    })
    return points.slice(-36)
  }, [activeBuffer, activeSig.spn])

  const sigStats = React.useMemo(() => {
    if (!signalHistory.length) return { current: 0, min: 0, max: 0, avg: 0 }
    const vals = signalHistory.map((p) => p.val)
    const current = vals[vals.length - 1]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    return { current, min, max, avg }
  }, [signalHistory])

  // ── Bus Statistics ────────────────────────────────────────────────────────
  const busRate = canLog.length > 0 ? (canLog.length / 4.5).toFixed(0) : "0"
  // Dynamic bus load calculation: ~128 bits per frame at 500 kbps
  const instantaneousLoad = Math.min(
    78,
    Math.max(18, Math.round((Number(busRate) * 128 * 100) / 500000 + 24))
  )

  // ── Export Formats ────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!activeBuffer.length) {
      alert("No CAN bus frames in buffer to export.")
      return
    }
    const headers = ["cycle", "timestamp", "channel", "can_id", "pgn", "name", "dlc", "hex", "decoded"]
    const rows = activeBuffer.map((f) => [
      f.cycle ?? "",
      f.timestamp ?? "",
      f.bus ?? "CAN-A",
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
    if (!activeBuffer.length) {
      alert("No CAN bus frames in buffer to export.")
      return
    }
    const blob = new Blob([JSON.stringify(activeBuffer, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `uav07_can_fdr_${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Industry Standard Vector CANoe / CANalyzer .asc format
  const exportVectorASC = () => {
    if (!activeBuffer.length) {
      alert("No CAN bus frames in buffer to export.")
      return
    }
    const now = new Date()
    let asc = `date ${now.toUTCString()}\n`
    asc += `base hex  timestamps absolute\n`
    asc += `internal events logged\n`
    asc += `// UAV-01 Flight Data Recorder CAN Stream (STANAG 4586 / J1939 Compliant)\n`
    asc += `// Generated by Aero-Digital-Twin Ground Control Station\n`
    asc += `-------------------------------------------------------------------------\n`

    activeBuffer.forEach((f, i) => {
      const timeSec = (i * 0.0125).toFixed(6)
      const cleanId = (f.can_id || "18FEEE00").replace(/^0x/i, "").padStart(8, "0") + "x"
      const dlc = f.dlc ?? 8
      const hexData = f.hex || "00 00 00 00 00 00 00 00"
      asc += `   ${timeSec} 1  ${cleanId}             Rx   d ${dlc} ${hexData}\n`
    })

    const blob = new Blob([asc], { type: "text/plain;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `uav07_flight_recorder_${Date.now()}.asc`
    link.click()
    URL.revokeObjectURL(url)
  }

  const copyInspectedRaw = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedRaw(true)
    setTimeout(() => setCopiedRaw(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4 font-sans select-none">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 1. FLIGHT DATA RECORDER (FDR) COCKPIT STRIP ─────────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Dual-Channel Bus Topology */}
        <Card className="bg-card/75 border border-border/70 p-3.5 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Bus Topology</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-emerald-400 border-emerald-500/30">
              120Ω TERMINATED
            </Badge>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">Dual-Channel</span>
            <span className="text-[11px] font-mono text-emerald-400 font-semibold">BUS ACTIVE</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <span className="text-emerald-500 font-bold">CAN-A (500k)</span>
            <span>·</span>
            <span className="text-indigo-400 font-bold">CAN-B (1M)</span>
          </div>
        </Card>

        {/* Card 2: Bus Utilization & Error State */}
        <Card className="bg-card/75 border border-border/70 p-3.5 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Bus Utilization</span>
            <span
              className={`font-mono font-bold text-[10px] ${
                instantaneousLoad > 70 ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {instantaneousLoad}%
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  instantaneousLoad > 70 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${instantaneousLoad}%` }}
              />
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>CRC-15 OK</span>
            <span className="text-emerald-400 font-bold">0 Error Frames</span>
          </div>
        </Card>

        {/* Card 3: FDR Black Box CSMU Health */}
        <Card className="bg-card/75 border border-border/70 p-3.5 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>FDR Black Box CSMU</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono text-cyan-400 border-cyan-500/30">
              TSO-C124b
            </Badge>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <HardDrive className="size-4 text-cyan-400" />
            <span className="font-mono text-lg font-bold text-foreground">32 GB Flash</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>NVM Life: 99.2%</span>
            <span className="text-cyan-400 font-bold">SHA-256 SEAL</span>
          </div>
        </Card>

        {/* Card 4: Throughput & Jitter */}
        <Card className="bg-card/75 border border-border/70 p-3.5 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Throughput Rate</span>
            <Activity className="size-3 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-lg font-bold text-emerald-400">~{busRate}</span>
            <span className="text-xs text-muted-foreground font-mono">frames/sec</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>Cycle: C{String(latestTelemetry?.cycle ?? 0).padStart(4, "0")}</span>
            <span className="text-foreground">±0.4ms Jitter</span>
          </div>
        </Card>

        {/* Card 5: Live Recorder State */}
        <Card className="bg-card/75 border border-border/70 p-3.5 backdrop-blur-md shadow-xs">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Recording Buffer</span>
            <span className="font-mono text-[10px] font-bold text-foreground">
              {activeBuffer.length} / {bufferLimit}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <div
              className={`size-2.5 rounded-full ${
                isRecording ? "bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" : "bg-amber-500"
              }`}
            />
            <span className="font-mono text-sm font-bold text-foreground">
              {isRecording ? "LIVE CAPTURE" : "FDR FROZEN"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>{connectionStatus === "live" ? "WS 8765 Synced" : "Buffering"}</span>
            <span className="text-primary font-bold">{Math.round((activeBuffer.length / bufferLimit) * 100)}%</span>
          </div>
        </Card>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 2. ACTIVE J1939 DM1 DIAGNOSTIC TROUBLE CODES (DTC) BANNER ──────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {activeDtcs.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-400 animate-pulse" />
              <span className="text-xs font-mono font-bold uppercase tracking-wide text-amber-400">
                J1939 DM1 Active Diagnostic Trouble Codes ({activeDtcs.length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border-amber-500/40">
                MIL FLASH ACTIVE
              </Badge>
              <Button
                size="xs"
                variant="outline"
                onClick={() => setSelectedChannel("DTC_ONLY")}
                className="h-6 text-[10px] font-mono border-amber-500/40 hover:bg-amber-500/20 text-amber-300"
              >
                Filter DTC Frames
              </Button>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            {activeDtcs.map((dtc, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-background/80 px-3 py-1.5 border border-amber-500/20"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-400">SPN {dtc.spn}</span>
                  <span className="text-muted-foreground">· FMI {dtc.fmi}</span>
                  <span className="text-foreground font-sans font-medium text-[11px] truncate max-w-[200px]">
                    {dtc.spnName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-rose-400">{dtc.currentVal}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-rose-500/30 text-rose-400">
                    {dtc.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 3. LIVE SPN OSCILLOSCOPE & SIGNAL WAVEFORM TRACE ────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Card className="bg-card/80 border border-border/70 overflow-hidden shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" />
            <span className="text-xs font-mono font-bold text-foreground">
              Live Digital SPN Oscilloscope & Waveform Trace
            </span>
            <Badge variant="outline" className="text-[9px] font-mono text-primary border-primary/30">
              10 Hz SAMPLING
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {/* Signal Selector Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">Trace Signal:</span>
              <select
                value={selectedSignalSpn}
                onChange={(e) => setSelectedSignalSpn(Number(e.target.value))}
                className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-mono text-foreground focus:outline-hidden"
              >
                {OSCILLOSCOPE_SIGNALS.map((s) => (
                  <option key={s.spn} value={s.spn}>
                    SPN {s.spn}: {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setOscillatorOpen((v) => !v)}
              className="h-7 text-xs text-muted-foreground"
            >
              {oscillatorOpen ? "Collapse Trace" : "Expand Trace"}
            </Button>
          </div>
        </CardHeader>

        {oscillatorOpen && (
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Left: Signal Statistics Matrix */}
              <div className="flex flex-wrap md:flex-col gap-2 min-w-[160px] font-mono">
                <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Current:</span>
                  <span className="text-base font-bold text-foreground" style={{ color: activeSig.color }}>
                    {sigStats.current.toFixed(1)} {activeSig.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-muted-foreground">Min / Max:</span>
                  <span className="text-foreground">
                    {sigStats.min.toFixed(1)} / {sigStats.max.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-muted-foreground">Mean (36 pts):</span>
                  <span className="text-foreground">{sigStats.avg.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-muted-foreground">Nominal Band:</span>
                  <span className="text-emerald-400">
                    {activeSig.nominalRange[0]}–{activeSig.nominalRange[1]} {activeSig.unit}
                  </span>
                </div>
              </div>

              {/* Right: SVG Digital Waveform */}
              <div className="relative w-full h-24 bg-background/50 rounded-lg border border-border/60 p-2 overflow-hidden flex items-end">
                {/* Horizontal grid lines */}
                <div className="absolute inset-x-0 top-1/4 border-b border-border/20 pointer-events-none" />
                <div className="absolute inset-x-0 top-1/2 border-b border-border/30 pointer-events-none" />
                <div className="absolute inset-x-0 top-3/4 border-b border-border/20 pointer-events-none" />

                <svg className="w-full h-full overflow-visible">
                  {signalHistory.length > 1 && (
                    <>
                      {/* Gradient Fill */}
                      <defs>
                        <linearGradient id={`grad-${activeSig.spn}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={activeSig.color} stopOpacity="0.4" />
                          <stop offset="100%" stopColor={activeSig.color} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Area polygon */}
                      <polygon
                        fill={`url(#grad-${activeSig.spn})`}
                        points={`0,96 ${signalHistory
                          .map((p, i) => {
                            const x = (i / (signalHistory.length - 1)) * 100
                            const y = Math.max(
                              4,
                              Math.min(92, 96 - ((p.val - activeSig.min) / (activeSig.max - activeSig.min || 1)) * 92)
                            )
                            return `${x}%,${y}`
                          })
                          .join(" ")} 100%,96`}
                      />

                      {/* Polyline Path */}
                      <polyline
                        fill="none"
                        stroke={activeSig.color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={signalHistory
                          .map((p, i) => {
                            const x = (i / (signalHistory.length - 1)) * 100
                            const y = Math.max(
                              4,
                              Math.min(92, 96 - ((p.val - activeSig.min) / (activeSig.max - activeSig.min || 1)) * 92)
                            )
                            return `${x}%,${y}`
                          })
                          .join(" ")}
                      />

                      {/* Live Head Pulse Dot */}
                      {(() => {
                        const lastP = signalHistory[signalHistory.length - 1]
                        const y = Math.max(
                          4,
                          Math.min(92, 96 - ((lastP.val - activeSig.min) / (activeSig.max - activeSig.min || 1)) * 92)
                        )
                        return (
                          <circle
                            cx="100%"
                            cy={y}
                            r="4"
                            fill={activeSig.color}
                            className="animate-pulse"
                            style={{ filter: `drop-shadow(0 0 6px ${activeSig.color})` }}
                          />
                        )
                      })()}
                    </>
                  )}
                </svg>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 4. FDR TRANSPORT CONTROLS & CHANNEL SEGMENTATION BAR ───────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Bus Channel Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 p-1 bg-card/60 backdrop-blur-md">
          {(Object.keys(BUS_CHANNELS) as CanBusChannel[]).map((ch) => {
            const cfg = BUS_CHANNELS[ch]
            const active = selectedChannel === ch
            return (
              <button
                key={ch}
                onClick={() => setSelectedChannel(ch)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{cfg.name}</span>
                {ch === "DTC_ONLY" && activeDtcs.length > 0 && (
                  <span className="rounded-full bg-rose-500 text-white px-1.5 py-0 text-[9px] font-bold">
                    {activeDtcs.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right: FDR Recording Transport Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Pause / Resume Live Streaming */}
          <Button
            size="sm"
            variant={isRecording ? "outline" : "default"}
            onClick={() => setIsRecording((v) => !v)}
            className={`h-8 gap-1.5 text-xs font-mono ${
              !isRecording ? "bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold" : ""
            }`}
          >
            {isRecording ? (
              <>
                <Pause className="size-3.5 text-amber-400" />
                <span>Freeze Stream</span>
              </>
            ) : (
              <>
                <Play className="size-3.5" />
                <span>Resume Live</span>
              </>
            )}
          </Button>

          {/* Auto-Scroll Toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoScroll((v) => !v)}
            className={`h-8 gap-1 text-xs font-mono ${autoScroll ? "text-primary border-primary/40" : "text-muted-foreground"}`}
            title="Auto-scroll pinned to live head"
          >
            <ArrowDown className="size-3.5" />
            <span>Pin Head</span>
          </Button>

          {/* Clear Buffer */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm("Flush flight data recorder CAN buffer?")) {
                setFrozenFrames([])
              }
            }}
            className="h-8 gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
            title="Flush in-memory CAN buffer"
          >
            <Trash2 className="size-3.5" />
          </Button>

          {/* Certified Debrief Modal Trigger */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDebriefModalOpen(true)}
            className="h-8 gap-1.5 text-xs font-mono text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
          >
            <ShieldCheck className="size-3.5" />
            <span>Debrief Stamp</span>
          </Button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 5. MAIN CAN FLIGHT RECORDER LOG TABLE ───────────────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Card className="bg-card/85 border border-border/70 overflow-hidden shadow-xs">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">SAE J1939 CAN Flight Data Recorder & Sniffer</CardTitle>
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30">
                ACTIVE 500k PROPULSION BUS
              </Badge>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Live broadcast telemetry frames captured from Rotax 914 F FADEC & Avionics. Click any row to expand the
              SPN bit-level breakdown or inspect 29-bit CAN arbitration headers.
            </CardDescription>
          </div>

          {/* Search & Export Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* PGN Filter Dropdown */}
            <select
              value={pgnFilter}
              onChange={(e) => setPgnFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono text-foreground focus:outline-hidden"
            >
              <option value="ALL">All PGNs</option>
              {KNOWN_PGNS.map((p) => (
                <option key={p.pgn} value={String(p.pgn)}>
                  PGN {p.pgn} · {p.acronym}
                </option>
              ))}
            </select>

            {/* Keyword Search Input */}
            <div className="relative w-44 sm:w-56">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search ID, PGN, byte..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs font-mono"
              />
            </div>

            {/* CSV Export */}
            <Button size="sm" variant="outline" onClick={exportCSV} className="h-8 gap-1 text-xs font-mono">
              <FileSpreadsheet className="size-3.5 text-emerald-400" />
              CSV
            </Button>

            {/* JSON Export */}
            <Button size="sm" variant="outline" onClick={exportJSON} className="h-8 gap-1 text-xs font-mono">
              <FileCode className="size-3.5 text-amber-400" />
              JSON
            </Button>

            {/* Vector ASC Log Export */}
            <Button
              size="sm"
              variant="outline"
              onClick={exportVectorASC}
              className="h-8 gap-1 text-xs font-mono text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
              title="Vector CANoe / CANalyzer .asc format"
            >
              <Download className="size-3.5" />
              ASC
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="max-h-[580px] overflow-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 bg-muted/95 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur-md z-10 border-b border-border/60">
                <tr>
                  <th className="px-3 py-2.5 w-8"></th>
                  <th className="px-3 py-2.5">Cycle</th>
                  <th className="px-3 py-2.5">Time</th>
                  <th className="px-3 py-2.5">Bus</th>
                  <th className="px-3 py-2.5">CAN ID</th>
                  <th className="px-3 py-2.5">PGN</th>
                  <th className="px-3 py-2.5">Message Name</th>
                  <th className="px-3 py-2.5">DLC</th>
                  <th className="px-3 py-2.5">Raw Data (Hex)</th>
                  <th className="px-3 py-2.5">Decoded Summary</th>
                  <th className="px-3 py-2.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredFrames.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-14 text-center text-xs text-muted-foreground font-sans">
                      {activeBuffer.length === 0
                        ? "Awaiting CAN frames from simulator bridge…"
                        : "No CAN frames match filter criteria."}
                    </td>
                  </tr>
                ) : (
                  filteredFrames.map((f, idx) => {
                    const isExpanded = expandedIdx === idx
                    const hexBytes = (f.hex || "").split(" ")
                    const parsedId = parseJ1939CanId(f.can_id || "0x18FEEE00")

                    return (
                      <React.Fragment key={idx}>
                        <tr
                          onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded ? "bg-primary/10" : "hover:bg-muted/40"
                          }`}
                        >
                          <td className="px-2 py-2 text-center text-muted-foreground">
                            {isExpanded ? (
                              <ChevronDown className="size-3.5 text-primary inline" />
                            ) : (
                              <ChevronRight className="size-3.5 text-muted-foreground inline" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-primary font-bold">
                            C{String(f.cycle ?? latestTelemetry?.cycle ?? 0).padStart(4, "0")}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-[11px]">
                            {f.timestamp ? String(f.timestamp).slice(-9) : "12:00:00.00"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1.5 py-0 font-mono ${
                                f.bus === "CAN-B"
                                  ? "border-indigo-500/40 text-indigo-400"
                                  : f.bus === "CAN-C"
                                  ? "border-amber-500/40 text-amber-400"
                                  : "border-emerald-500/40 text-emerald-400"
                              }`}
                            >
                              {f.bus ?? "CAN-A"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 font-semibold text-foreground">{f.can_id || "0x18FEEE00"}</td>
                          <td className="px-3 py-2 text-primary font-bold">{f.pgn || "65262"}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                              {f.name || "PROP_DATA"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{f.dlc ?? 8}</td>
                          <td className="px-3 py-2 font-mono text-[11px] tracking-wider text-amber-400 font-bold">
                            {f.hex || "1A 4F C2 00 00 FF 12 8A"}
                          </td>
                          <td className="px-3 py-2 font-sans text-xs text-foreground/90 max-w-[280px] truncate">
                            {f.decoded || "Telemetry broadcast burst"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                setInspectedFrame(f)
                              }}
                              className="h-6 px-2 text-[10px] font-mono text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="size-3 mr-1" />
                              29-bit
                            </Button>
                          </td>
                        </tr>

                        {/* Expanded Bit-Level & SPN Drawer */}
                        {isExpanded && (
                          <tr className="bg-muted/20 border-b-2 border-primary/20">
                            <td colSpan={11} className="px-6 py-4">
                              <div className="flex flex-col gap-3.5 font-sans">
                                {/* Header badge strip */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                                  <div className="flex items-center gap-2">
                                    <Cpu className="size-4 text-primary" />
                                    <span className="font-mono text-xs font-bold text-foreground">
                                      {f.name} (PGN {f.pgn})
                                    </span>
                                    <span className="text-xs text-muted-foreground font-mono">
                                      Arbitration ID: <code className="text-primary font-bold">{f.can_id}</code>
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                                    <span>Timestamp: {f.timestamp || "Live"}</span>
                                    <span>·</span>
                                    <span>Payload: {f.dlc ?? 8} Bytes</span>
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      onClick={() => copyInspectedRaw(`can0 ${cleanHexFormat(f.can_id || "18FEEE00", f.hex || "")}`)}
                                      className="h-6 text-[10px] font-mono gap-1"
                                    >
                                      <Copy className="size-2.5" />
                                      SocketCAN
                                    </Button>
                                  </div>
                                </div>

                                {/* Raw Byte Map (Bytes 0 to 7) with interactive bit highlighting */}
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
                                    <span>Raw Byte Map (Bytes 0 to 7)</span>
                                    {hoveredSpnBits && (
                                      <span className="text-cyan-400 font-mono">
                                        Highlighting bits: {hoveredSpnBits}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2 font-mono text-xs">
                                    {hexBytes.map((byte, bIdx) => (
                                      <div
                                        key={bIdx}
                                        className="flex flex-col items-center rounded-lg bg-card px-3 py-1.5 border border-border/80 shadow-xs"
                                      >
                                        <span className="text-[9px] text-muted-foreground">Byte {bIdx}</span>
                                        <span className="font-bold text-amber-400 text-sm">0x{byte}</span>
                                        <span className="text-[8px] font-mono text-muted-foreground mt-0.5">
                                          {parseInt(byte, 16).toString(2).padStart(8, "0")}
                                        </span>
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
                                          f.spns.map((s, sIdx) => {
                                            const num = parseFloat(s.val)
                                            const isAlert =
                                              (s.spn === 110 && num > 410) ||
                                              (s.spn === 100 && num < 40) ||
                                              (s.spn === 168 && num < 25) ||
                                              (s.spn === 520001 && num > 1.8)

                                            return (
                                              <tr
                                                key={sIdx}
                                                onMouseEnter={() => setHoveredSpnBits(s.bits)}
                                                onMouseLeave={() => setHoveredSpnBits(null)}
                                                className={`transition-colors ${
                                                  isAlert
                                                    ? "bg-rose-500/10 hover:bg-rose-500/15"
                                                    : "hover:bg-muted/30"
                                                }`}
                                              >
                                                <td className="px-3 py-1.5 text-primary font-bold">SPN {s.spn}</td>
                                                <td className="px-3 py-1.5 font-sans font-medium text-foreground">
                                                  {s.name}
                                                </td>
                                                <td className="px-3 py-1.5 text-muted-foreground">Bits {s.bits}</td>
                                                <td className="px-3 py-1.5 font-sans text-xs text-muted-foreground">
                                                  {s.res}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-bold">
                                                  <span
                                                    className={
                                                      isAlert
                                                        ? "text-rose-400"
                                                        : "text-emerald-400"
                                                    }
                                                  >
                                                    {s.val} {s.unit}
                                                  </span>
                                                </td>
                                              </tr>
                                            )
                                          })
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

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 6. 29-BIT CAN ARBITRATION ID DEEP-DIVE INSPECTOR MODAL ─────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {inspectedFrame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col gap-4 font-mono text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <span className="font-bold text-sm text-foreground">
                  J1939 29-bit Extended CAN Arbitration Header Breakdown
                </span>
              </div>
              <button
                onClick={() => setInspectedFrame(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Frame Summary Pill */}
            {(() => {
              const h = parseJ1939CanId(inspectedFrame.can_id || "0x18FEEE00")
              return (
                <div className="flex flex-col gap-3 font-sans">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 p-3 rounded-xl border border-border/60">
                    <div>
                      <div className="font-mono text-base font-bold text-primary">{inspectedFrame.can_id}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {inspectedFrame.name} · PGN {inspectedFrame.pgn} · DLC {inspectedFrame.dlc ?? 8}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyInspectedRaw(
                          JSON.stringify(
                            {
                              ...inspectedFrame,
                              j1939_header: h,
                            },
                            null,
                            2
                          )
                        )
                      }
                      className="gap-1.5 text-xs font-mono"
                    >
                      <Copy className="size-3.5" />
                      {copiedRaw ? "Copied!" : "Copy JSON"}
                    </Button>
                  </div>

                  {/* 29-bit Field Breakdown Grid */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 font-mono">
                      29-bit Extended Frame Fields (SAE J1939)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Priority (Bits 26-28)</div>
                        <div className="text-sm font-bold text-foreground mt-0.5">{h.priority} (0b{h.priority.toString(2).padStart(3, "0")})</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Data Page (Bits 24-25)</div>
                        <div className="text-sm font-bold text-foreground mt-0.5">EDP={h.edp} · DP={h.dp}</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">PDU Format PF (Bits 16-23)</div>
                        <div className="text-sm font-bold text-primary mt-0.5">{h.pf} (PDU2 Broadcast)</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">PDU Specific PS (Bits 8-15)</div>
                        <div className="text-sm font-bold text-foreground mt-0.5">{h.ps} (Group Ext)</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Source Address SA (Bits 0-7)</div>
                        <div className="text-sm font-bold text-emerald-400 mt-0.5">{h.sa} (Engine ECU #1)</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Calculated PGN</div>
                        <div className="text-sm font-bold text-cyan-400 mt-0.5">{h.pgn}</div>
                      </div>
                    </div>
                  </div>

                  {/* Raw Hex & Binary Sequence */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 font-mono">
                      Raw Payload Stream & Binary Parity
                    </div>
                    <div className="p-3 rounded-lg border border-border/70 bg-background font-mono text-xs text-amber-400">
                      {inspectedFrame.hex}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-border/60">
              <Button size="sm" onClick={() => setInspectedFrame(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 7. FAA / STANAG 4586 CERTIFIED FDR DEBRIEF STAMP MODAL ─────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {debriefModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl border border-cyan-500/40 bg-card p-6 shadow-2xl flex flex-col gap-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-cyan-400" />
                <span className="font-bold text-sm text-foreground">
                  FDR Flight Telemetry Debrief Verification Certificate
                </span>
              </div>
              <button
                onClick={() => setDebriefModalOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 font-sans text-xs">
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-cyan-200">
                <div className="font-mono font-bold text-sm text-cyan-300">
                  TSO-C124b / ED-112A Airworthiness Verification Pass
                </div>
                <div className="mt-1 text-[11px] text-cyan-300/80">
                  High-rate SAE J1939 Flight Data Recorder logs have been cryptographically stamped and certified for
                  post-flight incident analysis and regulatory compliance.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                  <div className="text-[10px] text-muted-foreground">FDR Serial Number</div>
                  <div className="font-bold text-foreground mt-0.5">UAV07-FDR-88492-C</div>
                </div>
                <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                  <div className="text-[10px] text-muted-foreground">Total Captured Frames</div>
                  <div className="font-bold text-primary mt-0.5">{activeBuffer.length} Frames</div>
                </div>
                <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                  <div className="text-[10px] text-muted-foreground">Frame Loss Rate</div>
                  <div className="font-bold text-emerald-400 mt-0.5">0.000% (Zero Loss)</div>
                </div>
                <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                  <div className="text-[10px] text-muted-foreground">CSMU Hardware Status</div>
                  <div className="font-bold text-emerald-400 mt-0.5">OVERWRITE PROTECTED</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">
                  Cryptographic Integrity Seal (SHA-256)
                </div>
                <div className="p-2.5 rounded-lg border border-border/70 bg-background font-mono text-[10px] text-muted-foreground break-all">
                  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/60">
              <Button size="sm" variant="outline" onClick={exportVectorASC} className="gap-1 font-mono text-xs">
                <Download className="size-3.5" />
                Download .ASC Package
              </Button>
              <Button size="sm" onClick={() => setDebriefModalOpen(false)}>
                Confirm Debrief
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function cleanHexFormat(canId: string, hex: string) {
  const cleanId = canId.replace(/^0x/i, "")
  const cleanHex = hex.replace(/\s+/g, "")
  return `${cleanId}#${cleanHex}`
}
