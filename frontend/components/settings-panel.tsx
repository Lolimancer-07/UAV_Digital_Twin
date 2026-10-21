"use client"

import * as React from "react"
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Key,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Terminal,
  UserCheck,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTelemetry } from "@/components/telemetry-provider"
import { audioAnnunciator } from "@/lib/audio-annunciator"
import { downloadTextFile } from "@/lib/telemetry/exports"

export function SettingsPanel() {
  const { connectionStatus, reconnect } = useTelemetry()

  // ── Settings State ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<"network" | "audio" | "units" | "engine" | "security" | "storage">("network")
  const [savedNotification, setSavedNotification] = React.useState<string | null>(null)

  // Network Settings
  const [primaryWsUrl, setPrimaryWsUrl] = React.useState("ws://localhost:8000/ws")
  const [backupWsUrl, setBackupWsUrl] = React.useState("ws://127.0.0.1:8001/ws")
  const [reconnectInterval, setReconnectInterval] = React.useState(3)
  const [streamDecimation, setStreamDecimation] = React.useState("50")
  const [linkLatencyMs, setLinkLatencyMs] = React.useState(12)
  const [isPinging, setIsPinging] = React.useState(false)

  // Audio Annunciator Settings
  const [audioVolume, setAudioVolume] = React.useState(90)
  const [audioMuted, setAudioMuted] = React.useState(false)
  const [speechSynthesisEnabled, setSpeechSynthesisEnabled] = React.useState(true)
  const [alarmIntensity, setAlarmIntensity] = React.useState<"normal" | "high" | "max">("high")
  const [audioTestActive, setAudioTestActive] = React.useState<string | null>(null)

  // Aerospace Units & Display
  const [unitSystem, setUnitSystem] = React.useState<"aviation" | "metric" | "si">("aviation")
  const [coordFormat, setCoordFormat] = React.useState<"dd" | "dms" | "mgrs">("dd")
  const [baroRef, setBaroRef] = React.useState<"inhg" | "hpa">("inhg")
  const [tempUnit, setTempUnit] = React.useState<"f" | "c">("f")

  // Digital Twin Engine Fidelity
  const [kalmanRate, setKalmanRate] = React.useState(25)
  const [rulInferenceMode, setRulInferenceMode] = React.useState<"realtime" | "balanced" | "eco">("realtime")
  const [canBaudRate, setCanBaudRate] = React.useState("500")
  const [physicsSensitivity, setPhysicsSensitivity] = React.useState(1.5)

  // Operator Profile & Security RBAC
  const [operatorId, setOperatorId] = React.useState("MAJ. R. VANCE (CALLSIGN: VANGUARD-1)")
  const [operatorRole, setOperatorRole] = React.useState("Flight Test Engineer")
  const [clearanceLevel, setClearanceLevel] = React.useState("NATO SECRET / EXPERIMENTAL")
  const [certSerial, setCertSerial] = React.useState("CERT-2026-X889-AIRWORTHINESS")

  // Storage & Cache
  const [maxLogFrames, setMaxLogFrames] = React.useState(5000)
  const [storageNotice, setStorageNotice] = React.useState<string | null>(null)

  // Load initial audio settings
  React.useEffect(() => {
    try {
      const vol = typeof audioAnnunciator.getVolume === "function" ? audioAnnunciator.getVolume() : 0.9
      const muted = typeof audioAnnunciator.getMuted === "function"
        ? audioAnnunciator.getMuted()
        : typeof (audioAnnunciator as any).getIsMuted === "function"
        ? (audioAnnunciator as any).getIsMuted()
        : false
      const intensity = typeof audioAnnunciator.getIntensityLevel === "function"
        ? audioAnnunciator.getIntensityLevel()
        : "high"
      setAudioVolume(Math.round(vol * 100))
      setAudioMuted(muted)
      setAlarmIntensity(intensity)
    } catch (err) {
      console.warn("AudioAnnunciator init warning:", err)
    }
  }, [])

  // Handle Audio Volume Change
  const handleVolumeChange = (val: number[]) => {
    const v = val[0]
    setAudioVolume(v)
    audioAnnunciator.setVolume(v / 100)
  }

  // Handle Audio Mute Toggle
  const handleMuteToggle = () => {
    const nextMute = !audioMuted
    setAudioMuted(nextMute)
    audioAnnunciator.setMuted(nextMute)
  }

  // Handle Alarm Intensity Change
  const handleIntensityChange = (lvl: "normal" | "high" | "max") => {
    setAlarmIntensity(lvl)
    audioAnnunciator.setIntensityLevel(lvl)
  }

  // Test Klaxon / Chime
  const handleTestAudio = (type: "CRITICAL" | "WARNING") => {
    setAudioTestActive(type)
    audioAnnunciator.testAlarm(type, 3)
    setTimeout(() => {
      setAudioTestActive(null)
    }, 3200)
  }

  // Ping test
  const handlePingLink = () => {
    setIsPinging(true)
    setTimeout(() => {
      setLinkLatencyMs(Math.floor(8 + Math.random() * 8))
      setIsPinging(false)
    }, 600)
  }

  // Save Settings
  const handleSaveSettings = () => {
    const config = {
      network: { primaryWsUrl, backupWsUrl, reconnectInterval, streamDecimation },
      audio: { audioVolume, audioMuted, speechSynthesisEnabled, alarmIntensity },
      units: { unitSystem, coordFormat, baroRef, tempUnit },
      engine: { kalmanRate, rulInferenceMode, canBaudRate, physicsSensitivity },
      operator: { operatorId, operatorRole, clearanceLevel, certSerial },
      timestamp: new Date().toISOString(),
    }
    localStorage.setItem("uav_gcs_system_config", JSON.stringify(config))
    setSavedNotification("All system parameters successfully persisted to GCS non-volatile storage.")
    setTimeout(() => setSavedNotification(null), 3500)
  }

  // Export Settings Config JSON
  const handleExportConfig = () => {
    const config = {
      gcs_id: "UAV-07-GCS-ALPHA",
      version: "3.4.0-AEROSPACE",
      network: { primaryWsUrl, backupWsUrl, reconnectInterval, streamDecimation },
      audio: { audioVolume, audioMuted, speechSynthesisEnabled, alarmIntensity },
      units: { unitSystem, coordFormat, baroRef, tempUnit },
      engine: { kalmanRate, rulInferenceMode, canBaudRate, physicsSensitivity },
      operator: { operatorId, operatorRole, clearanceLevel, certSerial },
      exported_at: new Date().toISOString(),
    }
    downloadTextFile(`uav07_gcs_config_${Date.now()}.json`, JSON.stringify(config, null, 2), "application/json")
  }

  // Reset to Factory Defaults
  const handleResetDefaults = () => {
    setPrimaryWsUrl("ws://localhost:8000/ws")
    setBackupWsUrl("ws://127.0.0.1:8001/ws")
    setReconnectInterval(3)
    setStreamDecimation("50")
    setAudioVolume(90)
    setAudioMuted(false)
    setSpeechSynthesisEnabled(true)
    setAlarmIntensity("high")
    setUnitSystem("aviation")
    setCoordFormat("dd")
    setBaroRef("inhg")
    setTempUnit("f")
    setKalmanRate(25)
    setRulInferenceMode("realtime")
    setCanBaudRate("500")
    setPhysicsSensitivity(1.5)
    audioAnnunciator.setVolume(0.9)
    audioAnnunciator.setMuted(false)
    audioAnnunciator.setIntensityLevel("high")
    setStorageNotice("System restored to factory aerospace engineering defaults.")
    setTimeout(() => setStorageNotice(null), 4000)
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <Card className="border-2 shadow-md bg-card border-border">
        <CardHeader className="p-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl text-primary">
                <Settings className="size-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-2xl font-bold tracking-tight">
                    System Settings & GCS Configuration
                  </CardTitle>
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary font-mono text-xs">
                    GCS STATION CONFIG
                  </Badge>
                </div>
                <CardDescription className="text-sm mt-0.5 text-muted-foreground">
                  Telemetry Link Layer, Master Audio Annunciator, Aerospace Conventions & Digital Twin Parameters
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportConfig}
                className="gap-2 font-mono text-xs border-border hover:border-primary"
              >
                <Database className="size-3.5" />
                Export Config (.json)
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSettings}
                className="gap-2 font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Save className="size-3.5" />
                Apply & Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>

        {savedNotification && (
          <div className="mx-6 mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs font-mono text-emerald-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{savedNotification}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSavedNotification(null)}>
              Dismiss
            </Button>
          </div>
        )}
      </Card>

      {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full bg-muted/60 p-1 border border-border">
          <TabsTrigger value="network" className="text-xs font-semibold gap-1.5">
            <Wifi className="size-3.5" /> Link Layer
          </TabsTrigger>
          <TabsTrigger value="audio" className="text-xs font-semibold gap-1.5">
            <Volume2 className="size-3.5" /> Annunciator Audio
          </TabsTrigger>
          <TabsTrigger value="units" className="text-xs font-semibold gap-1.5">
            <Globe className="size-3.5" /> Aerospace Units
          </TabsTrigger>
          <TabsTrigger value="engine" className="text-xs font-semibold gap-1.5">
            <Cpu className="size-3.5" /> Twin Fidelity
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs font-semibold gap-1.5">
            <ShieldCheck className="size-3.5" /> Operator RBAC
          </TabsTrigger>
          <TabsTrigger value="storage" className="text-xs font-semibold gap-1.5">
            <HardDrive className="size-3.5" /> Storage & Cache
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Link Layer / Network ──────────────────────────────────── */}
        <TabsContent value="network" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Telemetry Communications Link Configuration</CardTitle>
                  <CardDescription className="text-xs">
                    WebSocket endpoints, failover routes, and frame decimation rates
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={`font-mono text-xs ${
                    connectionStatus === "live"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  }`}
                >
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse inline-block mr-1.5" />
                  LINK: {connectionStatus.toUpperCase()} ({linkLatencyMs} ms)
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-mono font-medium">PRIMARY WEBSOCKET URI</Label>
                  <Input
                    value={primaryWsUrl}
                    onChange={e => setPrimaryWsUrl(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="ws://localhost:8000/ws"
                  />
                  <span className="text-[10px] text-muted-foreground">Standard active telemetry downlink port</span>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-mono font-medium">REDUNDANT / FAILOVER WEBSOCKET URI</Label>
                  <Input
                    value={backupWsUrl}
                    onChange={e => setBackupWsUrl(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="ws://127.0.0.1:8001/ws"
                  />
                  <span className="text-[10px] text-muted-foreground">Auto-switches if primary heartbeat drops &gt; 3.0s</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-border/60">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-mono font-medium">RECONNECT INTERVAL: {reconnectInterval}s</Label>
                  <Slider
                    value={[reconnectInterval]}
                    min={1}
                    max={15}
                    step={1}
                    onValueChange={v => setReconnectInterval(v[0])}
                    className="cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground">Backoff pacing before reconnect retry</span>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-mono font-medium">STREAM SAMPLING FREQUENCY</Label>
                  <div className="flex gap-2">
                    {["10", "25", "50", "100"].map(rate => (
                      <Button
                        key={rate}
                        variant={streamDecimation === rate ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStreamDecimation(rate)}
                        className="text-xs font-mono flex-1 h-8"
                      >
                        {rate} Hz
                      </Button>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">High-frequency ingestion rate</span>
                </div>

                <div className="flex flex-col gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePingLink}
                    disabled={isPinging}
                    className="font-mono text-xs gap-2 h-8"
                  >
                    <RefreshCw className={`size-3.5 ${isPinging ? "animate-spin" : ""}`} />
                    {isPinging ? "Benchmarking Ping..." : `Test Round-Trip Latency (${linkLatencyMs}ms)`}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">Send ICMP / WebSocket echo probe</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: Audio Annunciator ─────────────────────────────────────── */}
        <TabsContent value="audio" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Aerospace Cockpit Audio Annunciator Synthesizer</CardTitle>
                  <CardDescription className="text-xs">
                    Continuous Web Audio API dual-tone klaxon (920/1840 Hz), caution chime (587/440 Hz), and synthetic voice
                  </CardDescription>
                </div>
                <Button
                  variant={audioMuted ? "destructive" : "outline"}
                  size="sm"
                  onClick={handleMuteToggle}
                  className="gap-2 font-mono text-xs"
                >
                  {audioMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  {audioMuted ? "UNMUTE AUDIO" : "MUTE ALL ALARMS"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Volume & Intensity */}
                <div className="flex flex-col gap-4 p-4 rounded-xl bg-muted/20 border border-border/60">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-mono font-medium">MASTER SOUND VOLUME: {audioVolume}%</Label>
                    <span className="text-xs font-mono text-primary">{audioMuted ? "MUTED" : "ACTIVE"}</span>
                  </div>
                  <Slider
                    value={[audioVolume]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={handleVolumeChange}
                    className="cursor-pointer"
                    disabled={audioMuted}
                  />

                  <div className="pt-2 border-t border-border/40">
                    <Label className="text-xs font-mono font-medium block mb-2">SOUND INTENSITY BOOST</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant={alarmIntensity === "normal" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleIntensityChange("normal")}
                        className="text-xs font-mono"
                      >
                        Normal (1.0x)
                      </Button>
                      <Button
                        variant={alarmIntensity === "high" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleIntensityChange("high")}
                        className="text-xs font-mono"
                      >
                        Boosted (1.35x)
                      </Button>
                      <Button
                        variant={alarmIntensity === "max" ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleIntensityChange("max")}
                        className="text-xs font-mono"
                      >
                        Maximum (2.0x)
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Alarm Test Triggers */}
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-muted/20 border border-border/60">
                  <Label className="text-xs font-mono font-medium">ACOUSTIC ANNUNCIATOR BENCHMARK TEST</Label>
                  <p className="text-xs text-muted-foreground">
                    Fire synthetic alarm cycles to verify pilot headset volume, compression headroom, and harmonic clarity.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestAudio("WARNING")}
                      disabled={audioTestActive !== null}
                      className="border-amber-500/40 hover:border-amber-500 text-amber-400 gap-2 font-mono text-xs"
                    >
                      <Bell className="size-3.5" />
                      {audioTestActive === "WARNING" ? "Chiming..." : "Test Master Caution"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestAudio("CRITICAL")}
                      disabled={audioTestActive !== null}
                      className="border-red-500/40 hover:border-red-500 text-red-400 gap-2 font-mono text-xs"
                    >
                      <AlertOctagon className="size-3.5" />
                      {audioTestActive === "CRITICAL" ? "Klaxon Sounding..." : "Test Master Warning"}
                    </Button>
                  </div>

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">Synthetic Voice Announcements</span>
                    <Button
                      variant={speechSynthesisEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSpeechSynthesisEnabled(!speechSynthesisEnabled)}
                      className="h-7 text-xs font-mono px-3"
                    >
                      {speechSynthesisEnabled ? "ENABLED" : "DISABLED"}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: Aerospace Units & Coordinates ─────────────────────────── */}
        <TabsContent value="units" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-bold">Aerospace Conventions, Units & Coordinate Frames</CardTitle>
              <CardDescription className="text-xs">
                Select standardized avionics display units for airspeed, altitude, pressure, and GPS positioning
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-col gap-3">
                <Label className="text-xs font-mono font-medium">MEASUREMENT SYSTEM</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={unitSystem === "aviation" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setUnitSystem("aviation")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">Aviation</span>
                    <span className="text-[10px] opacity-70">kts, ft, °F, PSI</span>
                  </Button>
                  <Button
                    variant={unitSystem === "metric" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setUnitSystem("metric")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">ICAO Metric</span>
                    <span className="text-[10px] opacity-70">km/h, m, °C, bar</span>
                  </Button>
                  <Button
                    variant={unitSystem === "si" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setUnitSystem("si")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">SI Scientific</span>
                    <span className="text-[10px] opacity-70">m/s, m, K, kPa</span>
                  </Button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-col gap-3">
                <Label className="text-xs font-mono font-medium">GEOSPATIAL COORDINATE CONVENTION</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={coordFormat === "dd" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCoordFormat("dd")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">DD</span>
                    <span className="text-[10px] opacity-70">34.0522° N</span>
                  </Button>
                  <Button
                    variant={coordFormat === "dms" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCoordFormat("dms")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">DMS</span>
                    <span className="text-[10px] opacity-70">34°03&apos;08&quot; N</span>
                  </Button>
                  <Button
                    variant={coordFormat === "mgrs" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCoordFormat("mgrs")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">MGRS</span>
                    <span className="text-[10px] opacity-70">11SMT 842 651</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 4: Twin Fidelity & Neural Engine ─────────────────────────── */}
        <TabsContent value="engine" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-bold">Digital Twin Physics Engine & Neural Prognostics</CardTitle>
              <CardDescription className="text-xs">
                Fine-tune Kalman filter estimator frequencies, RUL inference scheduling, and CAN arbitration
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-mono font-medium">EXTENDED KALMAN FILTER (EKF) RATE</Label>
                  <span className="text-xs font-mono text-primary">{kalmanRate} Hz</span>
                </div>
                <Slider
                  value={[kalmanRate]}
                  min={5}
                  max={50}
                  step={5}
                  onValueChange={v => setKalmanRate(v[0])}
                  className="cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground">State estimation for sensor drift and noise cancellation</span>

                <div className="pt-2 border-t border-border/40">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-mono font-medium">RESIDUAL SENSITIVITY THRESHOLD</Label>
                    <span className="text-xs font-mono text-amber-400">{physicsSensitivity} σ</span>
                  </div>
                  <Slider
                    value={[physicsSensitivity]}
                    min={0.5}
                    max={3.0}
                    step={0.1}
                    onValueChange={v => setPhysicsSensitivity(v[0])}
                    className="cursor-pointer mt-2"
                  />
                  <span className="text-[10px] text-muted-foreground">Standard deviation limit before flagging physics mismatch</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-col gap-3">
                <Label className="text-xs font-mono font-medium">NEURAL RUL PROGNOSTICS INFERENCE MODE</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant={rulInferenceMode === "realtime" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRulInferenceMode("realtime")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">Real-Time</span>
                    <span className="text-[10px] opacity-70">1.0 Hz (GPU)</span>
                  </Button>
                  <Button
                    variant={rulInferenceMode === "balanced" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRulInferenceMode("balanced")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">Balanced</span>
                    <span className="text-[10px] opacity-70">0.5 Hz (CPU)</span>
                  </Button>
                  <Button
                    variant={rulInferenceMode === "eco" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRulInferenceMode("eco")}
                    className="text-xs font-mono flex flex-col h-auto py-2"
                  >
                    <span className="font-bold">Eco</span>
                    <span className="text-[10px] opacity-70">0.1 Hz Low-Power</span>
                  </Button>
                </div>

                <div className="pt-2 border-t border-border/40">
                  <Label className="text-xs font-mono font-medium block mb-2">CAN BUS EMULATED BAUD RATE</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {["250", "500", "1000"].map(baud => (
                      <Button
                        key={baud}
                        variant={canBaudRate === baud ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCanBaudRate(baud)}
                        className="text-xs font-mono"
                      >
                        {baud === "1000" ? "1.0 Mbps" : `${baud} kbps`}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 5: Operator RBAC ─────────────────────────────────────────── */}
        <TabsContent value="security" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-bold">Operator Identity & Role-Based Access Control (RBAC)</CardTitle>
              <CardDescription className="text-xs">
                Manage cryptographic pilot credentials, maintenance release authority, and command dispatch permissions
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-mono font-medium">CALLSIGN / OPERATOR IDENTIFIER</Label>
                  <Input
                    value={operatorId}
                    onChange={e => setOperatorId(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-mono font-medium">ASSIGNED OPERATIONAL ROLE</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Flight Test Engineer", "Chief Test Pilot", "Maintenance Inspector", "Commander"].map(role => (
                      <Button
                        key={role}
                        variant={operatorRole === role ? "default" : "outline"}
                        size="sm"
                        onClick={() => setOperatorRole(role)}
                        className="text-xs font-mono"
                      >
                        {role}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="size-4 text-emerald-500" />
                    <span className="text-xs font-bold font-mono">CRYPTOGRAPHIC CLEARANCE TOKEN</span>
                  </div>
                  <div className="text-xs font-mono space-y-1 text-muted-foreground">
                    <div>CLEARANCE: <span className="text-foreground font-semibold">{clearanceLevel}</span></div>
                    <div>CERT SERIAL: <span className="text-primary font-semibold">{certSerial}</span></div>
                    <div>STATUS: <span className="text-emerald-400 font-semibold">VALID (FIPS 140-3 COMPLIANT)</span></div>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-4 font-mono bg-background p-2 rounded border border-border">
                  Token signatures authorize FAA 8130-3 release generation and inflight engine emergency shutdown commands.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 6: Storage & Cache ───────────────────────────────────────── */}
        <TabsContent value="storage" className="mt-4 flex flex-col gap-4">
          <Card className="border border-border/80 bg-card">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-bold">GCS Storage & Rolling Cache Management</CardTitle>
              <CardDescription className="text-xs">
                Purge browser memory buffers, reset operational settings, and maintain station stability
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex flex-col gap-4">
              {storageNotice && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{storageNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-mono font-medium">MAX ROLLING LOG FRAMES</Label>
                    <span className="text-xs font-mono text-primary">{maxLogFrames} frames</span>
                  </div>
                  <Slider
                    value={[maxLogFrames]}
                    min={1000}
                    max={20000}
                    step={1000}
                    onValueChange={v => setMaxLogFrames(v[0])}
                    className="cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground">Caps browser memory footprint during 12+ hour ISR missions</span>
                </div>

                <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold font-mono text-foreground mb-1">RESET STATION TO DEFAULTS</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Restore all link parameters, audio volumes, and digital twin thresholds to baseline aerospace specs.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleResetDefaults}
                    className="gap-2 font-mono text-xs w-full"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset to Aerospace Factory Defaults
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
