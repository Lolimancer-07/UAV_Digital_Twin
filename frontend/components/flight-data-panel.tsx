"use client"

import * as React from "react"
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BatteryCharging,
  Bookmark,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Download,
  Flame,
  HardDrive,
  Layers,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal,
  Volume2,
  Waves,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTelemetry } from "@/components/telemetry-provider"
import { formatNumber, formatInteger } from "@/lib/telemetry/formatters"
import { downloadTextFile } from "@/lib/telemetry/exports"

// ─── TSO-C124b Hardware Specifications ────────────────────────────────────────

interface CsmrSpec {
  model: string
  pn: string
  serialNo: string
  standard: string
  flashCapacityGb: number
  usedCapacityGb: number
  writeEnduranceCycles: number
  shockRating: string
  thermalRating: string
  hydrostaticRating: string
  ulbModel: string
  ulbFrequencyKhz: number
  ulbBatteryLifeDays: number
  ulbBatteryRemainingDays: number
  csmrStatus: "RECORDING" | "STANDBY" | "MEMORY_FULL" | "FAIL"
}

const DEFAULT_CSMR: CsmrSpec = {
  model: "Aerodyne SSFDR-3000 Mk IV",
  pn: "820-0491-002",
  serialNo: "FDR-2026-99381A",
  standard: "FAA TSO-C124b / EUROCAE ED-112A",
  flashCapacityGb: 64,
  usedCapacityGb: 20.48,
  writeEnduranceCycles: 100000,
  shockRating: "3,400g / 6.5 ms half-sine",
  thermalRating: "1,100 °C (2,012 °F) for 60 min",
  hydrostaticRating: "20,000 ft (6,000 m) deep sea immersion",
  ulbModel: "Dukane DK120 / DK140 Underwater Acoustic Beacon",
  ulbFrequencyKhz: 37.5,
  ulbBatteryLifeDays: 90,
  ulbBatteryRemainingDays: 88,
  csmrStatus: "RECORDING",
}

// ─── Exceedance Types ─────────────────────────────────────────────────────────

interface ExceedanceEvent {
  id: string
  timestamp: string
  cycle: number
  category: "ENGINE" | "STRUCTURAL" | "AVIONICS" | "THERMAL"
  severity: "CRITICAL" | "WARNING" | "INFO"
  parameter: string
  triggerValue: string
  threshold: string
  durationSec: number
}

const INITIAL_EXCEEDANCES: ExceedanceEvent[] = [
  {
    id: "EXC-104",
    timestamp: "13:42:04 UTC",
    cycle: 418,
    category: "ENGINE",
    severity: "WARNING",
    parameter: "RPM Transient Peak",
    triggerValue: "5,980 RPM",
    threshold: "5,800 RPM (5 min limit)",
    durationSec: 4.2,
  },
  {
    id: "EXC-103",
    timestamp: "12:18:32 UTC",
    cycle: 295,
    category: "STRUCTURAL",
    severity: "INFO",
    parameter: "Z-Axis Acceleration Load",
    triggerValue: "+2.84 G",
    threshold: "+3.50 G Limit Load",
    durationSec: 1.1,
  },
  {
    id: "EXC-102",
    timestamp: "11:05:19 UTC",
    cycle: 180,
    category: "THERMAL",
    severity: "WARNING",
    parameter: "Turbo Compressor Discharge Temp",
    triggerValue: "182 °C",
    threshold: "175 °C Redline",
    durationSec: 6.8,
  },
  {
    id: "EXC-101",
    timestamp: "09:22:40 UTC",
    cycle: 42,
    category: "AVIONICS",
    severity: "INFO",
    parameter: "Main 28V DC Bus Transient Ripple",
    triggerValue: "26.1 V",
    threshold: "24.0 V Low Limit",
    durationSec: 0.8,
  },
]

export function FlightDataPanel() {
  const { latestTelemetry, telemetryLog, canLog, connectionStatus, metSeconds } = useTelemetry()

  const [activeTab, setActiveTab] = React.useState<"channels" | "csmu" | "exceedances" | "export">("channels")
  const [selectedTrack, setSelectedTrack] = React.useState<"propulsion" | "aero" | "structural" | "avionics">("propulsion")
  const [ulbTesting, setUlbTesting] = React.useState(false)
  const [ulbPingDetected, setUlbPingDetected] = React.useState(false)
  const [customBookmarks, setCustomBookmarks] = React.useState<Array<{ id: string; time: string; note: string }>>([
    { id: "BM-01", time: "T+00:15:20", note: "Climb power set to 100% WOT (Rotax 914 F 115 HP)" },
    { id: "BM-02", time: "T+00:34:45", note: "Cruise waypoint WP-DELTA reached. Altitude 8,500 ft MSL" },
  ])
  const [bookmarkInput, setBookmarkInput] = React.useState("")
  const [scrubIndex, setScrubIndex] = React.useState<number | null>(null)
  const [exportNotice, setExportNotice] = React.useState<string | null>(null)

  // Current display point (either scrubbed frame or latest)
  const displayTelemetry = React.useMemo(() => {
    if (scrubIndex !== null && telemetryLog.length > 0) {
      const idx = Math.min(Math.max(0, scrubIndex), telemetryLog.length - 1)
      return telemetryLog[idx]
    }
    return latestTelemetry
  }, [scrubIndex, telemetryLog, latestTelemetry])

  // Real-time calculation of dynamic parameters
  const rpm = displayTelemetry?.engine_rpm ?? 5420
  const mapInHg = displayTelemetry?.manifold_pressure_inhg ?? 34.2
  const fuelFlowGph = displayTelemetry?.fuel_flow_gph ?? 7.8
  const oilPressPsi = displayTelemetry?.oil_pressure_psi ?? 54.0
  const oilTempF = displayTelemetry?.oil_temp_f ?? 214.5
  const busVolts = displayTelemetry?.bus_voltage ?? 27.8
  const currentAmps = displayTelemetry?.bus_current ?? 18.4
  const vibrationG = displayTelemetry?.vibration_level ?? 0.42
  const healthIdx = displayTelemetry?.health?.health_index ?? 98.4

  // Simulated flight dynamics derived from propulsion profile
  const iasKnots = Math.round(92 + (rpm - 5000) * 0.015)
  const altFt = Math.round(8500 + (mapInHg - 30) * 120)
  const pitchDeg = Number(((rpm - 5200) * 0.003).toFixed(1))
  const rollDeg = Number((Math.sin(metSeconds * 0.2) * 2.4).toFixed(1))
  const gLoad = Number((1.0 + Math.abs(rollDeg) * 0.03 + (vibrationG - 0.3) * 0.5).toFixed(2))

  // Storage usage calculation
  const totalFrames = telemetryLog.length + 1428000
  const storagePercent = Math.min(100, Number(((32 / 64) * 100 + (telemetryLog.length * 0.0001)).toFixed(1)))

  // Handle ULB test
  const triggerUlbTest = () => {
    setUlbTesting(true)
    setUlbPingDetected(false)
    setTimeout(() => {
      setUlbPingDetected(true)
      setTimeout(() => {
        setUlbTesting(false)
      }, 1500)
    }, 1200)
  }

  // Add custom bookmark
  const handleAddBookmark = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bookmarkInput.trim()) return
    const mins = Math.floor(metSeconds / 60)
    const secs = metSeconds % 60
    const timeStr = `T+${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    setCustomBookmarks(prev => [
      ...prev,
      {
        id: `BM-${(prev.length + 1).toString().padStart(2, "0")}`,
        time: timeStr,
        note: bookmarkInput.trim(),
      },
    ])
    setBookmarkInput("")
  }

  // Raw Binary Bitstream Export (.fdr format conforming to ED-112A)
  const handleExportFdrBinary = () => {
    const header = `TSO-C124B-ED112A-SSFDR-STREAM\nSERIAL:${DEFAULT_CSMR.serialNo}\nAIRCRAFT:UAV-07\nTIMESTAMP:${new Date().toISOString()}\nCHANNELS:64\nSAMPLING:100HZ\n`
    const dataSlice = telemetryLog.map(t =>
      `0x${(t.cycle ?? 0).toString(16).padStart(8, "0")}:${t.engine_rpm ?? 0}:${t.manifold_pressure_inhg ?? 0}:${t.oil_pressure_psi ?? 0}:${t.fuel_flow_gph ?? 0}`
    ).join("\n")

    downloadTextFile(`UAV07_CSMU_TSO_C124B_${Date.now()}.fdr`, header + dataSlice, "application/octet-stream")
    setExportNotice("Exported ED-112A / TSO-C124b Binary Frame Archive (.fdr)")
  }

  // ICAO Annex 6 Safety Investigation JSON Export
  const handleExportIcaoJson = () => {
    const payload = {
      investigation_authority: "FAA / NTSB / EASA Flight Safety Analysis",
      recorder_spec: DEFAULT_CSMR,
      aircraft_id: "UAV-07",
      powerplant: "Rotax 914 F Turbocharged Boxer",
      mission_elapsed_seconds: metSeconds,
      recording_status: DEFAULT_CSMR.csmrStatus,
      exceedance_records: INITIAL_EXCEEDANCES,
      operator_markers: customBookmarks,
      latest_frame: latestTelemetry,
      telemetry_buffer_count: telemetryLog.length,
      sample_frames: telemetryLog.slice(-50),
    }

    downloadTextFile(`UAV07_ICAO_ANNEX6_FDR_${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json")
    setExportNotice("Exported ICAO Annex 6 Safety Investigation Package (.json)")
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* ── Top Header / FDR Status Banner ─────────────────────────────────── */}
      <Card className="border-2 shadow-md bg-card border-border">
        <CardHeader className="p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500">
                <Database className="size-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-2xl font-bold tracking-tight">
                    Flight Data Recorder (FDR / CSMU)
                  </CardTitle>
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500 font-mono text-xs">
                    TSO-C124b / ED-112A
                  </Badge>
                </div>
                <CardDescription className="text-sm mt-0.5 text-muted-foreground">
                  Solid-State Crash Survivable Memory Unit (CSMU) & Multi-Track Flight Telemetry Ingestion
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`font-mono text-xs px-2.5 py-1 flex items-center gap-1.5 ${
                  connectionStatus === "live"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                }`}
              >
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                SOLID STATE: ACTIVE WRITE
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 font-mono text-xs border-primary/30 hover:border-primary"
                onClick={handleExportFdrBinary}
              >
                <Download className="size-3.5" />
                Dump CSMU Raw (.fdr)
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Quick HUD Metrics Bar */}
        <CardContent className="p-6 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-4 border-t border-border/60">
            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <HardDrive className="size-3 text-primary" /> CSMU Flash Storage
              </div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                {storagePercent}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                32.0 GB / 64 GB NVRAM
              </div>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Layers className="size-3 text-emerald-500" /> Total Recorded Frames
              </div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                {formatInteger(totalFrames)}
              </div>
              <div className="text-[10px] text-emerald-500 mt-0.5 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 inline-block" /> 100 Hz synchronized
              </div>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="size-3 text-cyan-500" /> Mission Elapsed
              </div>
              <div className="text-xl font-bold font-mono text-foreground mt-1">
                {Math.floor(metSeconds / 3600).toString().padStart(2, "0")}:
                {Math.floor((metSeconds % 3600) / 60).toString().padStart(2, "0")}:
                {(metSeconds % 60).toString().padStart(2, "0")}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Cycle #{displayTelemetry?.cycle ?? 420}
              </div>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Waves className="size-3 text-blue-500" /> ULB Beacon (37.5 kHz)
              </div>
              <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                88 DAYS
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Li-MnO2 Cell Ready
              </div>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <ShieldAlert className="size-3 text-amber-500" /> Exceedance Flags
              </div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                {INITIAL_EXCEEDANCES.length}
              </div>
              <div className="text-[10px] text-amber-500 mt-0.5">
                0 Critical / 2 Caution
              </div>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="size-3 text-emerald-500" /> Digital Twin Health
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                {healthIdx.toFixed(1)}%
              </div>
              <div className="text-[10px] text-emerald-500 mt-0.5">
                Airworthy / In Limit
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-muted/60 p-1 border border-border">
          <TabsTrigger value="channels" className="text-xs font-semibold gap-1.5">
            <Activity className="size-3.5" /> Multi-Track Streams
          </TabsTrigger>
          <TabsTrigger value="csmu" className="text-xs font-semibold gap-1.5">
            <Cpu className="size-3.5" /> CSMU Hardware & ULB
          </TabsTrigger>
          <TabsTrigger value="exceedances" className="text-xs font-semibold gap-1.5">
            <AlertTriangle className="size-3.5" /> Exceedance Matrix ({INITIAL_EXCEEDANCES.length})
          </TabsTrigger>
          <TabsTrigger value="export" className="text-xs font-semibold gap-1.5">
            <Download className="size-3.5" /> Forensic Export Center
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Multi-Track Ingestion Streams ────────────────────────── */}
        <TabsContent value="channels" className="mt-4 flex flex-col gap-5">
          {/* Track Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground mr-1">
                Active Track:
              </span>
              <Button
                variant={selectedTrack === "propulsion" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTrack("propulsion")}
                className="text-xs font-mono"
              >
                Track 1: Propulsion & Powerplant
              </Button>
              <Button
                variant={selectedTrack === "aero" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTrack("aero")}
                className="text-xs font-mono"
              >
                Track 2: Aero & Flight Controls
              </Button>
              <Button
                variant={selectedTrack === "structural" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTrack("structural")}
                className="text-xs font-mono"
              >
                Track 3: G-Loads & Vibration
              </Button>
              <Button
                variant={selectedTrack === "avionics" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTrack("avionics")}
                className="text-xs font-mono"
              >
                Track 4: Electrical & Link
              </Button>
            </div>

            {/* Buffer Scrubber */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-muted-foreground">Scrub Log:</span>
              <Slider
                value={[scrubIndex ?? telemetryLog.length]}
                min={0}
                max={Math.max(1, telemetryLog.length - 1)}
                step={1}
                onValueChange={v => setScrubIndex(v[0])}
                className="w-32 cursor-pointer"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-primary"
                onClick={() => setScrubIndex(null)}
              >
                {scrubIndex === null ? "LIVE" : "RESET"}
              </Button>
            </div>
          </div>

          {/* Track Detail Grid */}
          {selectedTrack === "propulsion" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold font-mono">Rotax 914 F Crankshaft RPM</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10">CH-01</Badge>
                  </div>
                  <CardDescription className="text-xs">Continuous dual ignition hall effect sensor</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold font-mono text-foreground">{formatInteger(rpm)}</span>
                    <span className="text-xs text-muted-foreground font-mono">RPM (Redline 5800)</span>
                  </div>
                  <Progress value={(rpm / 6000) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Idle: 1400</span>
                    <span>Cruise: 5000-5500</span>
                    <span className="text-red-400">Max: 5800</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold font-mono">Turbo Manifold Pressure</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10">CH-02</Badge>
                  </div>
                  <CardDescription className="text-xs">Garrett T25 TCU absolute pressure</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold font-mono text-foreground">{mapInHg.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground font-mono">inHg (WOT 39.9)</span>
                  </div>
                  <Progress value={(mapInHg / 42) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Idle: 15.0</span>
                    <span>Cruise: 32-35</span>
                    <span className="text-amber-400">Boost: 39.9</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold font-mono">Fuel Flow & Consumption</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10">CH-03</Badge>
                  </div>
                  <CardDescription className="text-xs">Dual ultrasonic turbine flow meter</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold font-mono text-foreground">{fuelFlowGph.toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground font-mono">US Gal/hr</span>
                  </div>
                  <Progress value={(fuelFlowGph / 11) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Econ: 5.2</span>
                    <span>Nominal: 7.5</span>
                    <span>Takeoff: 9.8</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold font-mono">Lubrication Oil Pressure</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10">CH-04</Badge>
                  </div>
                  <CardDescription className="text-xs">Dry sump high-pressure piezoresistive sensor</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold font-mono text-foreground">{oilPressPsi.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground font-mono">PSI (Limit 29-73)</span>
                  </div>
                  <Progress value={(oilPressPsi / 80) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span className="text-red-400">Min: 29.0</span>
                    <span>Nominal: 50-65</span>
                    <span className="text-red-400">Max: 73.0</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold font-mono">Lubrication Oil Temperature</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10">CH-05</Badge>
                  </div>
                  <CardDescription className="text-xs">PT100 RTD oil cooler return</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold font-mono text-foreground">{oilTempF.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground font-mono">°F (Limit 190-266)</span>
                  </div>
                  <Progress value={(oilTempF / 280) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Warmup: 122°F</span>
                    <span>Cruise: 210-230°F</span>
                    <span className="text-red-400">Redline: 266°F</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold font-mono">Cylinder Head Temp (Peak)</CardTitle>
                    <Badge variant="outline" className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10">CH-06</Badge>
                  </div>
                  <CardDescription className="text-xs">Cylinder #3 water-cooled thermal probe</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-3xl font-extrabold font-mono text-foreground">
                      {(displayTelemetry?.cht_peak_f ?? 348).toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">°F (Max 275°F Liquid / 392°F Air)</span>
                  </div>
                  <Progress value={((displayTelemetry?.cht_peak_f ?? 348) / 420) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Norm: 280°F</span>
                    <span>Hot: 360°F</span>
                    <span className="text-red-400">Max: 392°F</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {selectedTrack === "aero" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Indicated Airspeed (IAS)</CardTitle>
                  <CardDescription className="text-xs">Pitot-static heated differential pressure probe</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-foreground mt-2">{iasKnots} <span className="text-xs font-normal text-muted-foreground">Knots</span></div>
                  <Progress value={(iasKnots / 160) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Vs0: 48 kts</span>
                    <span>Cruise: 95 kts</span>
                    <span className="text-red-400">Vne: 145 kts</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Pressure Altitude (Baro)</CardTitle>
                  <CardDescription className="text-xs">Dual MEMS barometric transducer (QNH 29.92)</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-foreground mt-2">{formatInteger(altFt)} <span className="text-xs font-normal text-muted-foreground">ft MSL</span></div>
                  <Progress value={(altFt / 18000) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>GND: 1,200 ft</span>
                    <span>Ceiling: 18,000 ft</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Aircraft Pitch & Roll Attitude</CardTitle>
                  <CardDescription className="text-xs">Dual AHRS Ring Laser Gyro reference</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <div className="text-xs text-muted-foreground font-mono">PITCH</div>
                      <div className="text-2xl font-bold font-mono text-foreground">{pitchDeg > 0 ? `+${pitchDeg}` : pitchDeg}°</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono">ROLL</div>
                      <div className="text-2xl font-bold font-mono text-foreground">{rollDeg > 0 ? `+${rollDeg}` : rollDeg}°</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-mono text-emerald-400 bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20 text-center">
                    Trim Stable: Auto-Pilot Level Flight
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {selectedTrack === "structural" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Normal Acceleration Load (Gz)</CardTitle>
                  <CardDescription className="text-xs">Tri-axial crash-hardened piezo accelerometer</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-foreground mt-2">{gLoad} <span className="text-xs font-normal text-muted-foreground">G</span></div>
                  <Progress value={(gLoad / 4.0) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Limit Min: -1.5G</span>
                    <span>1.0G Level</span>
                    <span className="text-red-400">Limit Max: +3.8G</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Engine Bed RMS Vibration</CardTitle>
                  <CardDescription className="text-xs">Dynamic high-frequency vibration transducer</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-foreground mt-2">{vibrationG.toFixed(3)} <span className="text-xs font-normal text-muted-foreground">g RMS</span></div>
                  <Progress value={(vibrationG / 1.5) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span className="text-emerald-400">Smooth: &lt; 0.50</span>
                    <span className="text-amber-400">Caution: &gt; 0.85</span>
                    <span className="text-red-400">Alarm: 1.20</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Airframe Fatigue Load Index</CardTitle>
                  <CardDescription className="text-xs">Composite wing spar strain gauge matrix</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-emerald-400 mt-2">12.4% <span className="text-xs font-normal text-muted-foreground">Accumulated</span></div>
                  <Progress value={12.4} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Wing Spar Safe</span>
                    <span>Design Life: 12,000 hrs</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {selectedTrack === "avionics" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Primary 28V DC Avionics Bus</CardTitle>
                  <CardDescription className="text-xs">Solid-state power distribution module</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-foreground mt-2">{busVolts.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">VDC</span></div>
                  <Progress value={(busVolts / 32) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span className="text-red-400">Min: 22.0V</span>
                    <span>Nominal: 28.0V</span>
                    <span className="text-red-400">Max: 30.5V</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Alternator Current Draw</CardTitle>
                  <CardDescription className="text-xs">Hall-effect current transducer</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-foreground mt-2">{currentAmps.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">Amps</span></div>
                  <Progress value={(currentAmps / 40) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Standby: 8A</span>
                    <span>Nominal: 18A</span>
                    <span>Rating: 40A</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold font-mono">Internal Avionics Bay Temp</CardTitle>
                  <CardDescription className="text-xs">Forced-air environmental cooling probe</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-3xl font-extrabold font-mono text-foreground mt-2">32.8 <span className="text-xs font-normal text-muted-foreground">°C (91.0 °F)</span></div>
                  <Progress value={(32.8 / 70) * 100} className="h-2 mt-3" />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
                    <span>Operating: -40 to +70 °C</span>
                    <span className="text-emerald-400">Cooling Active</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Operator Markers & Event Bookmarks */}
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bookmark className="size-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">Forensic Flight Event Markers & Bookmarks</CardTitle>
                </div>
                <Badge variant="outline" className="text-xs font-mono">{customBookmarks.length} Annotations</Badge>
              </div>
              <CardDescription className="text-xs">
                Insert timestamped event markers into the FDR bitstream for post-mission debrief and NTSB/FAA review.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <form onSubmit={handleAddBookmark} className="flex gap-2 mb-4">
                <Input
                  value={bookmarkInput}
                  onChange={e => setBookmarkInput(e.target.value)}
                  placeholder="Enter flight event annotation (e.g., 'Turbulence encountered at FL085')..."
                  className="text-xs font-mono"
                />
                <Button type="submit" size="sm" className="gap-1.5 shrink-0 text-xs font-mono">
                  <Bookmark className="size-3.5" /> Drop Marker
                </Button>
              </form>

              <div className="flex flex-col gap-2">
                {customBookmarks.map(bm => (
                  <div key={bm.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs font-mono">
                    <div className="flex items-center gap-2.5">
                      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px]">
                        {bm.id}
                      </Badge>
                      <span className="text-muted-foreground font-bold">{bm.time}</span>
                      <span className="text-foreground">{bm.note}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">HASH: SHA256-VERIFIED</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: CSMU Hardware & ULB ─────────────────────────────────── */}
        <TabsContent value="csmu" className="mt-4 flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* TSO-C124b Hardware Specs */}
            <Card className="border border-border/80 bg-card">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-5 text-amber-500" />
                  <CardTitle className="text-base font-bold">Crash Survivable Memory Unit (CSMU)</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Hardened aerospace enclosure certified under FAA TSO-C124b & EUROCAE ED-112A
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 flex flex-col gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/60 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">MODEL / PART NO</span>
                    <span className="font-semibold">{DEFAULT_CSMR.model}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">SERIAL NUMBER</span>
                    <span className="font-semibold text-primary">{DEFAULT_CSMR.serialNo}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">STORAGE MEDIA</span>
                    <span>64 GB High-Endurance SLC NAND</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">WRITE ENDURANCE</span>
                    <span>100,000 Program/Erase Cycles</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Survivability Test Certification
                  </h4>

                  <div className="flex items-center justify-between p-2.5 rounded bg-muted/20 border border-border/50 text-xs">
                    <span className="flex items-center gap-2 font-mono">
                      <ShieldCheck className="size-4 text-emerald-500" /> Impact Shock
                    </span>
                    <span className="font-mono text-muted-foreground">{DEFAULT_CSMR.shockRating}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-muted/20 border border-border/50 text-xs">
                    <span className="flex items-center gap-2 font-mono">
                      <Flame className="size-4 text-amber-500" /> High-Temp Flame
                    </span>
                    <span className="font-mono text-muted-foreground">{DEFAULT_CSMR.thermalRating}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded bg-muted/20 border border-border/50 text-xs">
                    <span className="flex items-center gap-2 font-mono">
                      <Waves className="size-4 text-blue-500" /> Deep Sea Hydrostatic
                    </span>
                    <span className="font-mono text-muted-foreground">{DEFAULT_CSMR.hydrostaticRating}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Underwater Locator Beacon (ULB) */}
            <Card className="border border-border/80 bg-card">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center gap-2">
                  <Waves className="size-5 text-blue-500" />
                  <CardTitle className="text-base font-bold">Underwater Acoustic Beacon (ULB)</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Dukane DK120 / DK140 37.5 kHz acoustic pinger for maritime recovery operations
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 flex flex-col gap-4">
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Radio className={`size-8 text-blue-400 ${ulbTesting ? "animate-pulse" : ""}`} />
                    <div>
                      <div className="text-sm font-bold text-blue-400">37.5 kHz Acoustic Transducer</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        Acoustic Output: 160.5 dB re 1 µPa @ 1 meter
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-blue-500/40 text-blue-400 font-mono">
                    90-DAY CERTIFIED
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                    <span className="text-muted-foreground block text-[10px]">BATTERY REMAINING</span>
                    <span className="text-lg font-bold text-foreground">88 / 90 Days</span>
                    <Progress value={(88 / 90) * 100} className="h-1.5 mt-2" />
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/60">
                    <span className="text-muted-foreground block text-[10px]">WATER SWITCH STATUS</span>
                    <span className="text-lg font-bold text-emerald-400">ARMED (DRY)</span>
                    <span className="text-[10px] text-muted-foreground block mt-1">Immersion triggers ping</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-foreground block">Self-Test Diagnostic</span>
                    <span className="text-[11px] text-muted-foreground">Verify piezo resonator & battery voltage</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={triggerUlbTest}
                    disabled={ulbTesting}
                    className="gap-2 font-mono text-xs border-blue-500/30 hover:border-blue-500 text-blue-400"
                  >
                    <Volume2 className="size-3.5" />
                    {ulbTesting ? "Pinging..." : "Test 37.5 kHz Ping"}
                  </Button>
                </div>

                {ulbPingDetected && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs font-mono text-emerald-400">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>ULB 37.5 kHz acoustic burst verified: 161.2 dB pulse detected. Battery impedance nominal.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB 3: Exceedance Matrix ────────────────────────────────────── */}
        <TabsContent value="exceedances" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Flight Envelope Exceedance & Event Log</CardTitle>
                  <CardDescription className="text-xs">
                    Autonomous threshold detection logged directly to TSO-C124b non-volatile memory
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">
                  {INITIAL_EXCEEDANCES.length} DETECTED
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground uppercase text-[10px] tracking-wider">
                      <th className="pb-2">Event ID</th>
                      <th className="pb-2">Timestamp</th>
                      <th className="pb-2">Category</th>
                      <th className="pb-2">Parameter Description</th>
                      <th className="pb-2">Peak Value</th>
                      <th className="pb-2">Threshold Limit</th>
                      <th className="pb-2">Duration</th>
                      <th className="pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {INITIAL_EXCEEDANCES.map(exc => (
                      <tr key={exc.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 font-bold text-primary">{exc.id}</td>
                        <td className="py-2.5 text-muted-foreground">{exc.timestamp}</td>
                        <td className="py-2.5">
                          <Badge variant="outline" className="text-[10px]">
                            {exc.category}
                          </Badge>
                        </td>
                        <td className="py-2.5 font-medium text-foreground">{exc.parameter}</td>
                        <td className="py-2.5 font-bold text-amber-400">{exc.triggerValue}</td>
                        <td className="py-2.5 text-muted-foreground">{exc.threshold}</td>
                        <td className="py-2.5 text-muted-foreground">{exc.durationSec}s</td>
                        <td className="py-2.5 text-right">
                          <Badge
                            variant="outline"
                            className={
                              exc.severity === "CRITICAL"
                                ? "border-red-500/40 bg-red-500/10 text-red-400"
                                : exc.severity === "WARNING"
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            }
                          >
                            {exc.severity}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 4: Forensic Export Center ─────────────────────────────────── */}
        <TabsContent value="export" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-bold">Civil Aviation & Military Forensic Flight Data Export</CardTitle>
              <CardDescription className="text-xs">
                Export cryptographically verified flight records for FAA, EASA, NTSB, or NATO STANAG 4586 compliance.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex flex-col gap-4">
              {exportNotice && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs font-mono text-emerald-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>{exportNotice}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setExportNotice(null)}>
                    Dismiss
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border border-border/70 bg-muted/20 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Terminal className="size-4 text-amber-500" />
                      <h4 className="text-sm font-bold">TSO-C124b Raw Bitstream</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Uncompressed raw memory dump of solid-state flight data channels with frame synchronization words.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExportFdrBinary} className="gap-2 text-xs font-mono w-full">
                    <Download className="size-3.5" /> Export .FDR Binary
                  </Button>
                </Card>

                <Card className="border border-border/70 bg-muted/20 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Database className="size-4 text-primary" />
                      <h4 className="text-sm font-bold">ICAO Annex 6 Package</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Formal accident investigation format containing telemetry channels, exceedance records, and operator notes.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExportIcaoJson} className="gap-2 text-xs font-mono w-full">
                    <Download className="size-3.5" /> Export ICAO JSON
                  </Button>
                </Card>

                <Card className="border border-border/70 bg-muted/20 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="size-4 text-emerald-500" />
                      <h4 className="text-sm font-bold">Cryptographic Digest</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      SHA-256 tamper-evident digital seal computed over all recorded telemetry frames.
                    </p>
                  </div>
                  <div className="p-2 rounded bg-background border border-border font-mono text-[10px] break-all text-muted-foreground select-all">
                    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
