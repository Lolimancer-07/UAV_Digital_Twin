"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  CloudRain,
  Compass,
  Crosshair,
  Eye,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Navigation2,
  Plane,
  Radar,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wind,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FlirHudOverlay } from "@/components/flir-hud-overlay"
import type {
  MissionCommandRecoverySite,
  MissionCommandState,
} from "@/lib/telemetry/types"

interface TacticalMissionMapProps {
  route: MissionCommandState["route"]
  selectedSiteId: string
  onSelectSite: (siteId: string) => void
  isSafeReturnActive: boolean
  healthIndex?: number
  currentRpm?: number
  targetRpm?: number
}

// Great-circle distance helper (in nautical miles)
function getDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3440.065 // Nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Tactical Web Audio Synthesizer (zero dependencies, low-latency audio cues)
function playTacticalSound(type: "click" | "engage" | "alert", soundEnabled: boolean) {
  if (!soundEnabled || typeof window === "undefined") return
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === "click") {
      osc.type = "sine"
      osc.frequency.setValueAtTime(800, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.06)
      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.06)
    } else if (type === "engage") {
      osc.type = "sine"
      osc.frequency.setValueAtTime(520, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.22)
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
    } else if (type === "alert") {
      osc.type = "triangle"
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.22)
    }
  } catch {
    // AudioContext blocked before first user gesture, safely ignore
  }
}

export function TacticalMissionMap({
  route,
  selectedSiteId,
  onSelectSite,
  isSafeReturnActive,
  healthIndex = 85,
  currentRpm = 1400,
  targetRpm = 1200,
}: TacticalMissionMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  // View presentation mode: 'tactical' (2D map) | 'profile' (Vertical Glideslope) | 'split' | 'flir'
  const [viewMode, setViewMode] = React.useState<"tactical" | "profile" | "split" | "flir">("tactical")

  // Zoom and Pan state
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 })

  // Interactive Tactical Toggles
  const [showRings, setShowRings] = React.useState(true)
  const [showSafeRadius, setShowSafeRadius] = React.useState(true)
  const [showDeadStick, setShowDeadStick] = React.useState(true)
  const [showCorridor, setShowCorridor] = React.useState(true)
  const [showContours, setShowContours] = React.useState(true)
  const [showHazards, setShowHazards] = React.useState(true)
  const [threatAvoidance, setThreatAvoidance] = React.useState(true)
  const [soundEnabled, setSoundEnabled] = React.useState(false)

  // Emergency Engine-Out (Dead-Stick) What-If Toggle
  const [engineOutSim, setEngineOutSim] = React.useState(false)

  // Fullscreen container expansion
  const [isMaximized, setIsMaximized] = React.useState(false)

  // Historical flight breadcrumbs (accumulate live positions)
  const [breadcrumbs, setBreadcrumbs] = React.useState<Array<{ lat: number; lon: number }>>([])

  React.useEffect(() => {
    const lat = route.position.latitude
    const lon = route.position.longitude
    setBreadcrumbs((prev) => {
      const last = prev[prev.length - 1]
      if (last && Math.abs(last.lat - lat) < 0.0002 && Math.abs(last.lon - lon) < 0.0002) {
        return prev
      }
      return [...prev.slice(-45), { lat, lon }]
    })
  }, [route.position.latitude, route.position.longitude])

  // Play sound when safe return is actively engaged
  React.useEffect(() => {
    if (isSafeReturnActive) {
      playTacticalSound("engage", soundEnabled)
    }
  }, [isSafeReturnActive, soundEnabled])

  // Coordinate projection bounds
  const allPoints = [...route.waypoints, ...route.recovery_sites, route.position]
  const lats = allPoints.map((p) => p.latitude)
  const lons = allPoints.map((p) => p.longitude)
  const minLat = Math.min(...lats) - 0.035
  const maxLat = Math.max(...lats) + 0.035
  const minLon = Math.min(...lons) - 0.035
  const maxLon = Math.max(...lons) + 0.035
  const latSpan = Math.max(0.01, maxLat - minLat)
  const lonSpan = Math.max(0.01, maxLon - minLon)

  const mapWidth = 740
  const mapHeight = 400
  const padding = 45

  const projectX = (lon: number) =>
    padding + ((lon - minLon) / lonSpan) * (mapWidth - padding * 2)
  const projectY = (lat: number) =>
    mapHeight - padding - ((lat - minLat) / latSpan) * (mapHeight - padding * 2)

  // Current aircraft projected point
  const uavX = projectX(route.position.longitude)
  const uavY = projectY(route.position.latitude)

  // Active recovery site
  const activeSite =
    route.recovery_sites.find((s) => s.id === selectedSiteId) ??
    route.recovery_sites[0]

  const siteX = activeSite ? projectX(activeSite.longitude) : uavX
  const siteY = activeSite ? projectY(activeSite.latitude) : uavY

  // Calculate live return metrics
  const directDistanceNm = activeSite
    ? getDistanceNm(
        route.position.latitude,
        route.position.longitude,
        activeSite.latitude,
        activeSite.longitude
      )
    : 0

  // Threat Avoidance Waypoint: Dog-leg North to safely skirt Restricted R-304
  const doglegWp = {
    name: "DL-NORTH",
    latitude: 26.818,
    longitude: 78.115,
  }
  const doglegX = projectX(doglegWp.longitude)
  const doglegY = projectY(doglegWp.latitude)

  const distToDogleg = getDistanceNm(
    route.position.latitude,
    route.position.longitude,
    doglegWp.latitude,
    doglegWp.longitude
  )
  const distDoglegToSite = activeSite
    ? getDistanceNm(
        doglegWp.latitude,
        doglegWp.longitude,
        activeSite.latitude,
        activeSite.longitude
      )
    : 0

  const avoidanceDistanceNm = distToDogleg + distDoglegToSite
  const liveDistanceNm = threatAvoidance ? avoidanceDistanceNm : directDistanceNm

  const speedKts = Math.max(20, route.position.ground_speed_kts || 58)
  const etaMinutes = (liveDistanceNm / speedKts) * 60
  const etaMinutesFormatted = `${Math.floor(etaMinutes)}m ${Math.floor(
    (etaMinutes % 1) * 60
  )}s`

  // Current Altitude & Glideslope Calculations
  const currentAltitudeFt = 3000 // Standard cruising altitude (ft AGL)
  const siteElevations: Record<string, number> = {
    HOME: 1250,
    ECHO: 1420,
    FOXTROT: 980,
  }
  const targetRunwayElevationFt = (activeSite ? siteElevations[activeSite.id] : undefined) ?? 1420
  const altitudeDeltaFt = Math.max(0, currentAltitudeFt - targetRunwayElevationFt)
  // Optimal 3.0° descent slope: 1 NM distance ≈ 318 ft descent
  const requiredGlideSlopeDeg = liveDistanceNm > 0 ? ((altitudeDeltaFt / (liveDistanceNm * 6076.12)) * (180 / Math.PI)) : 3.0
  const requiredFpm = liveDistanceNm > 0 ? (altitudeDeltaFt / etaMinutes) : 450

  // Dead-Stick (Unpowered Glide) calculation: L/D ratio approx 10:1 (Rotax 914 pusher configuration)
  const deadStickRangeNm = (currentAltitudeFt / 6076.12) * 10
  const deadStickRadiusPixels = Math.max(20, deadStickRangeNm * 12)
  const isGlideCapable = liveDistanceNm <= deadStickRangeNm

  // Dynamic safe radius calculation (adjusted by health index)
  const dynamicSafeRadiusNm = route.safe_radius_nm * (healthIndex / 100)
  const safeRadiusPixels = Math.max(30, Math.min(190, dynamicSafeRadiusNm * 0.75))

  // Tactical Wind Vector Simulation (Wind from 235° at 14 kts)
  const windDirectionDeg = 235
  const windSpeedKts = 14
  const runwayHeadingDeg = activeSite?.id === "FOXTROT" ? 180 : 90
  const windAngleDiffRad = ((windDirectionDeg - runwayHeadingDeg) * Math.PI) / 180
  const headwindComponent = Math.round(windSpeedKts * Math.cos(windAngleDiffRad))
  const crosswindComponent = Math.round(Math.abs(windSpeedKts * Math.sin(windAngleDiffRad)))

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom((prev) => Math.max(0.7, Math.min(2.5, prev + zoomDelta)))
  }

  const centerOnUav = () => {
    setPan({ x: 0, y: 0 })
    setZoom(1.15)
  }

  const resetView = () => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
  }

  return (
    <div
      className={`relative flex flex-col rounded-2xl border border-border/80 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden select-none transition-all duration-300 ${
        isMaximized ? "fixed inset-4 z-50 shadow-[0_0_80px_rgba(0,0,0,0.8)]" : ""
      }`}
    >
      {/* ── TOP TACTICAL HUD OVERLAY BAR ─────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
          <Badge
            variant="outline"
            className="border-cyan-400/40 bg-slate-900/85 backdrop-blur-md font-mono text-[10px] text-cyan-300 px-2 py-0.5 shadow-sm"
          >
            <Radar className="size-3 text-cyan-400 animate-pulse mr-1" />
            10 HZ TACTICAL GNSS
          </Badge>

          {isSafeReturnActive ? (
            <Badge
              variant="outline"
              className="border-emerald-500/50 bg-emerald-500/20 backdrop-blur-md font-mono text-[10px] text-emerald-300 font-bold px-2.5 py-0.5 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            >
              <ShieldCheck className="size-3 text-emerald-400 mr-1" />
              SAFE RETURN ACTIVE → {activeSite?.name.toUpperCase()}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 backdrop-blur-md font-mono text-[10px] text-amber-300 px-2 py-0.5"
            >
              CORRIDOR MONITORING
            </Badge>
          )}

          {/* Engine State Indicator */}
          <button
            onClick={() => setEngineOutSim(!engineOutSim)}
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] border transition-all pointer-events-auto flex items-center gap-1 ${
              engineOutSim
                ? "bg-red-500/20 border-red-500/60 text-red-300 animate-pulse"
                : "bg-slate-900/80 border-white/10 text-slate-300 hover:border-cyan-400/50"
            }`}
            title="Toggle Engine Out / Dead-Stick unpowered glide simulation"
          >
            <AlertTriangle className={`size-3 ${engineOutSim ? "text-red-400" : "text-amber-400"}`} />
            {engineOutSim ? "SIMULATED FLAMEOUT (0 RPM)" : "POWERED (1200 RPM)"}
          </button>
        </div>

        {/* View Mode Switcher & Tools */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Audio Annunciation Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSoundEnabled(!soundEnabled)
              playTacticalSound("click", !soundEnabled)
            }}
            className={`size-7 rounded-lg border ${
              soundEnabled
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                : "border-white/10 bg-slate-900/80 text-slate-400 hover:text-slate-200"
            }`}
            title={soundEnabled ? "Tactical Audio: ON" : "Tactical Audio: OFF"}
          >
            {soundEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          </Button>

          {/* View Mode Selector (including FLIR HUD) */}
          <div className="flex items-center rounded-lg border border-white/10 bg-slate-900/85 p-0.5 backdrop-blur-md font-mono text-[10px]">
            <button
              onClick={() => {
                setViewMode("tactical")
                playTacticalSound("click", soundEnabled)
              }}
              className={`px-2 py-1 rounded-md transition-all ${
                viewMode === "tactical"
                  ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              2D MAP
            </button>
            <button
              onClick={() => {
                setViewMode("profile")
                playTacticalSound("click", soundEnabled)
              }}
              className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                viewMode === "profile"
                  ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="size-3" /> GLIDE PROFILE
            </button>
            <button
              onClick={() => {
                setViewMode("split")
                playTacticalSound("click", soundEnabled)
              }}
              className={`px-2 py-1 rounded-md transition-all ${
                viewMode === "split"
                  ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              SPLIT
            </button>
            <button
              onClick={() => {
                setViewMode("flir")
                playTacticalSound("engage", soundEnabled)
              }}
              className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                viewMode === "flir"
                  ? "bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-400/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye className="size-3" /> FLIR HUD
            </button>
          </div>

          {/* Maximize Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMaximized(!isMaximized)}
            className="size-7 rounded-lg border border-white/10 bg-slate-900/80 text-slate-300 hover:text-white"
            title={isMaximized ? "Exit Fullscreen" : "Maximize Tactical Map"}
          >
            {isMaximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* ── MAIN CONTENT CONTAINER (2D MAP / GLIDE PROFILE / FLIR HUD) ───── */}
      <div className={`relative flex flex-col ${isMaximized ? "flex-1" : ""}`}>
        {/* FLIR HUD PILOT POV MODE */}
        {viewMode === "flir" && (
          <FlirHudOverlay
            uavHeadingDeg={route.position.heading_deg}
            groundSpeedKts={speedKts}
            altitudeFt={currentAltitudeFt}
            activeSite={activeSite}
            liveDistanceNm={liveDistanceNm}
            isSafeReturnActive={isSafeReturnActive}
            onClose={() => setViewMode("tactical")}
          />
        )}

        {/* 2D TACTICAL MAP CANVAS */}
        {(viewMode === "tactical" || viewMode === "split") && (
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className={`relative w-full overflow-hidden cursor-grab ${
              viewMode === "split" ? "h-[270px]" : "h-[390px]"
            } ${isDragging ? "cursor-grabbing" : ""}`}
          >
            <svg
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              className="size-full transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: `${uavX}px ${uavY}px`,
              }}
            >
              <defs>
                {/* Tactical Grid Pattern */}
                <pattern id="tac-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(56, 189, 248, 0.07)" strokeWidth="0.8" />
                  <circle cx="15" cy="15" r="0.6" fill="rgba(56, 189, 248, 0.15)" />
                </pattern>

                {/* Powerplant Safe Radius Glow */}
                <radialGradient id="safe-cone" r="1">
                  <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.22" />
                  <stop offset="70%" stopColor="rgb(6, 182, 212)" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="rgb(6, 182, 212)" stopOpacity="0" />
                </radialGradient>

                {/* Dead-stick unpowered glide gradient */}
                <radialGradient id="glide-cone" r="1">
                  <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity="0.20" />
                  <stop offset="80%" stopColor="rgb(245, 158, 11)" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="rgb(245, 158, 11)" stopOpacity="0" />
                </radialGradient>

                {/* Restricted Airspace Diagonal Hatch */}
                <pattern id="danger-stripes" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(239, 68, 68, 0.35)" strokeWidth="2.5" />
                </pattern>

                {/* Convective weather pattern */}
                <radialGradient id="storm-radar" r="1">
                  <stop offset="0%" stopColor="rgba(168, 85, 247, 0.35)" />
                  <stop offset="60%" stopColor="rgba(59, 130, 246, 0.2)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>

                {/* Safe Return Trajectory Pulse Gradient */}
                <linearGradient id="rtb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="50%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>

                {/* Marker Glow Filter */}
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Background Grid */}
              <rect width={mapWidth} height={mapHeight} fill="#060c18" />
              <rect width={mapWidth} height={mapHeight} fill="url(#tac-grid)" />

              {/* Simulated Topography & Terrain Contours */}
              {showContours && (
                <g opacity="0.14" stroke="rgba(56, 189, 248, 0.6)" fill="none" strokeWidth="1">
                  <ellipse cx={mapWidth * 0.45} cy={mapHeight * 0.35} rx="120" ry="70" strokeDasharray="3 4" />
                  <ellipse cx={mapWidth * 0.45} cy={mapHeight * 0.35} rx="180" ry="110" strokeDasharray="4 6" />
                  <ellipse cx={mapWidth * 0.7} cy={mapHeight * 0.6} rx="90" ry="50" strokeDasharray="2 4" />
                  <path d="M 50 350 Q 250 280 450 320 T 700 240" strokeWidth="1.2" strokeOpacity="0.6" />
                </g>
              )}

              {/* Tactical Hazards: Restricted Airspace & Storm Cell */}
              {showHazards && (
                <g>
                  {/* Restricted Area R-304 */}
                  <polygon
                    points="420,70 510,85 490,165 390,140"
                    fill="url(#danger-stripes)"
                    stroke="rgba(239, 68, 68, 0.75)"
                    strokeWidth="1.2"
                    strokeDasharray="4 2"
                  />
                  <text
                    x="425"
                    y="115"
                    fill="#f87171"
                    fontSize="7"
                    fontFamily="monospace"
                    fontWeight="bold"
                    letterSpacing="0.05em"
                  >
                    RESTRICTED R-304
                  </text>

                  {/* Convective Storm Cell */}
                  <circle cx="560" cy="270" r="46" fill="url(#storm-radar)" />
                  <circle cx="560" cy="270" r="46" fill="none" stroke="rgba(168, 85, 247, 0.4)" strokeDasharray="2 3" strokeWidth="0.8" />
                  <text
                    x="530"
                    y="273"
                    fill="#c084fc"
                    fontSize="6.5"
                    fontFamily="monospace"
                  >
                    TURBULENCE CELL
                  </text>
                </g>
              )}

              {/* Range Distance Rings from UAV */}
              {showRings && (
                <g opacity="0.2" stroke="rgba(148, 163, 184, 0.4)" fill="none" strokeWidth="0.8">
                  <circle cx={uavX} cy={uavY} r="50" strokeDasharray="2 4" />
                  <circle cx={uavX} cy={uavY} r="100" strokeDasharray="2 4" />
                  <circle cx={uavX} cy={uavY} r="150" strokeDasharray="2 4" />
                  <text x={uavX + 52} y={uavY - 3} fill="rgba(148, 163, 184, 0.6)" fontSize="7" fontFamily="monospace">
                    5 NM
                  </text>
                  <text x={uavX + 102} y={uavY - 3} fill="rgba(148, 163, 184, 0.6)" fontSize="7" fontFamily="monospace">
                    10 NM
                  </text>
                </g>
              )}

              {/* Dead-Stick Glide Footprint (Unpowered Glide Cone) */}
              {showDeadStick && (
                <g>
                  <circle cx={uavX} cy={uavY} r={deadStickRadiusPixels} fill="url(#glide-cone)" />
                  <circle
                    cx={uavX}
                    cy={uavY}
                    r={deadStickRadiusPixels}
                    fill="none"
                    stroke={engineOutSim ? "#ef4444" : "#f59e0b"}
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                    opacity="0.8"
                  />
                  <text
                    x={uavX + deadStickRadiusPixels - 20}
                    y={uavY + 12}
                    fill={engineOutSim ? "#f87171" : "#fbbf24"}
                    fontSize="6.5"
                    fontFamily="monospace"
                  >
                    DEAD-STICK ({deadStickRangeNm.toFixed(1)} NM)
                  </text>
                </g>
              )}

              {/* Powerplant Safe Radius Bubble (Adjusted by Health Index) */}
              {showSafeRadius && !engineOutSim && (
                <g>
                  <circle cx={uavX} cy={uavY} r={safeRadiusPixels} fill="url(#safe-cone)" />
                  <circle
                    cx={uavX}
                    cy={uavY}
                    r={safeRadiusPixels}
                    fill="none"
                    stroke="rgb(52, 211, 153)"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    opacity="0.6"
                  />
                </g>
              )}

              {/* Planned Mission Route Corridor */}
              {showCorridor && (
                <g>
                  <polyline
                    points={route.waypoints
                      .map((w) => `${projectX(w.longitude)},${projectY(w.latitude)}`)
                      .join(" ")}
                    fill="none"
                    stroke="rgba(56, 189, 248, 0.35)"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                  />
                </g>
              )}

              {/* Live Breadcrumb Trail */}
              {breadcrumbs.length > 1 && (
                <polyline
                  points={breadcrumbs.map((b) => `${projectX(b.lon)},${projectY(b.lat)}`).join(" ")}
                  fill="none"
                  stroke="rgb(6, 182, 212)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              )}

              {/* ── REAL-TIME SAFE RETURN DIVERSION TRAJECTORY ───────────────── */}
              {activeSite && (
                <g>
                  {threatAvoidance ? (
                    // DYNAMIC THREAT-AVOIDANCE DOG-LEG PATH
                    <g>
                      <polyline
                        points={`${uavX},${uavY} ${doglegX},${doglegY} ${siteX},${siteY}`}
                        fill="none"
                        stroke={engineOutSim ? (isGlideCapable ? "#f59e0b" : "#ef4444") : "url(#rtb-grad)"}
                        strokeWidth={isSafeReturnActive ? "3.5" : "2"}
                        strokeDasharray={isSafeReturnActive ? "6 3" : "4 4"}
                        className={isSafeReturnActive ? "animate-[pulse_1.5s_infinite]" : ""}
                      />

                      {/* Dog-leg Avoidance Waypoint Tag */}
                      <g transform={`translate(${doglegX}, ${doglegY})`}>
                        <circle cx="0" cy="0" r="4.5" fill="#10b981" />
                        <circle cx="0" cy="0" r="9" fill="none" stroke="#34d399" strokeWidth="1" strokeDasharray="2 2" />
                        <rect x="-35" y="-18" width="70" height="14" rx="3" fill="#020617" stroke="#10b981" strokeWidth="0.8" opacity="0.9" />
                        <text x="0" y="-8" fill="#34d399" fontSize="7" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          DL-NORTH (+1.8NM BUF)
                        </text>
                      </g>

                      {/* Avoidance Midpoint ETA Tag */}
                      <g transform={`translate(${(doglegX + siteX) / 2} ${(doglegY + siteY) / 2 - 12})`}>
                        <rect
                          x="-50"
                          y="-9"
                          width="100"
                          height="18"
                          rx="4"
                          fill="#020617"
                          stroke={isSafeReturnActive ? "#10b981" : "#06b6d4"}
                          strokeWidth="0.8"
                          opacity="0.95"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fill={isSafeReturnActive ? "#34d399" : "#38bdf8"}
                          fontSize="8"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          AVOID · {avoidanceDistanceNm.toFixed(1)} NM ({etaMinutesFormatted})
                        </text>
                      </g>
                    </g>
                  ) : (
                    // DIRECT STRAIGHT-LINE PATH
                    <g>
                      <line
                        x1={uavX}
                        y1={uavY}
                        x2={siteX}
                        y2={siteY}
                        stroke={engineOutSim ? (isGlideCapable ? "#f59e0b" : "#ef4444") : "url(#rtb-grad)"}
                        strokeWidth={isSafeReturnActive ? "3.5" : "2"}
                        strokeDasharray={isSafeReturnActive ? "6 3" : "4 4"}
                        className={isSafeReturnActive ? "animate-[pulse_1.5s_infinite]" : ""}
                      />

                      <g transform={`translate(${(uavX + siteX) / 2} ${(uavY + siteY) / 2 - 12})`}>
                        <rect
                          x="-48"
                          y="-9"
                          width="96"
                          height="18"
                          rx="4"
                          fill="#020617"
                          stroke={isSafeReturnActive ? "#10b981" : "#06b6d4"}
                          strokeWidth="0.8"
                          opacity="0.95"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fill={isSafeReturnActive ? "#34d399" : "#38bdf8"}
                          fontSize="8"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          DIRECT · {directDistanceNm.toFixed(1)} NM ({etaMinutesFormatted})
                        </text>
                      </g>
                    </g>
                  )}
                </g>
              )}

              {/* Planned Waypoint Markers */}
              {route.waypoints.map((wp, idx) => {
                const wx = projectX(wp.longitude)
                const wy = projectY(wp.latitude)
                return (
                  <g key={`wp-${wp.id}-${idx}`}>
                    <circle cx={wx} cy={wy} r="4" fill="#38bdf8" opacity="0.8" />
                    <circle cx={wx} cy={wy} r="1.5" fill="#ffffff" />
                    <text
                      x={wx + 7}
                      y={wy - 5}
                      fill="#94a3b8"
                      fontSize="8.5"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {wp.name}
                    </text>
                  </g>
                )
              })}

              {/* Recovery Airstrips / Divert Sites (Interactive Clickable) */}
              {route.recovery_sites.map((site) => {
                const sx = projectX(site.longitude)
                const sy = projectY(site.latitude)
                const isSelected = site.id === selectedSiteId
                const siteDist = getDistanceNm(
                  route.position.latitude,
                  route.position.longitude,
                  site.latitude,
                  site.longitude
                )
                const siteGlideOk = siteDist <= deadStickRangeNm

                return (
                  <g
                    key={`site-${site.id}`}
                    onClick={() => {
                      onSelectSite(site.id)
                      playTacticalSound("click", soundEnabled)
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Selection pulse ring */}
                    {isSelected && (
                      <circle
                        cx={sx}
                        cy={sy}
                        r="14"
                        fill="none"
                        stroke={engineOutSim ? (siteGlideOk ? "#f59e0b" : "#ef4444") : "#10b981"}
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                        className="animate-spin"
                      />
                    )}

                    {/* Runway Strip Representation */}
                    <g transform={`translate(${sx} ${sy}) rotate(${site.id === "FOXTROT" ? 90 : 0})`}>
                      <rect
                        x="-10"
                        y="-3"
                        width="20"
                        height="6"
                        rx="1"
                        fill={isSelected ? "#10b981" : "#f59e0b"}
                        stroke="#ffffff"
                        strokeWidth="0.8"
                        className="group-hover:scale-125 transition-transform"
                      />
                      <line x1="-8" y1="0" x2="8" y2="0" stroke="#ffffff" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
                    </g>

                    {/* Site Label with Distance and Glide badge */}
                    <g transform={`translate(${sx + 8} ${sy + 10})`}>
                      <rect
                        x="-2"
                        y="-8"
                        width="70"
                        height="15"
                        rx="3"
                        fill="#090d16"
                        stroke={isSelected ? "#10b981" : "#334155"}
                        strokeWidth="0.8"
                        opacity="0.9"
                      />
                      <text
                        x="2"
                        y="2.5"
                        fill={isSelected ? "#34d399" : "#e2e8f0"}
                        fontSize="7.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {site.id} · {siteDist.toFixed(1)} NM
                      </text>
                    </g>
                  </g>
                )
              })}

              {/* ── REAL-TIME AIRCRAFT MARKER WITH LIVE HEADING ──────────────── */}
              <g transform={`translate(${uavX} ${uavY}) rotate(${route.position.heading_deg})`}>
                {/* Dynamic radar thrust pulse */}
                <circle cx="0" cy="0" r="16" fill="rgba(6, 182, 212, 0.15)" className="animate-ping" />
                <circle cx="0" cy="0" r="12" fill="none" stroke="#06b6d4" strokeWidth="1" opacity="0.6" />

                {/* Aircraft Jet Silhouette */}
                <path
                  d="M 0 -14 L 4 -3 L 14 3 L 14 6 L 3 4 L 2 10 L 6 13 L 6 15 L 0 13 L -6 15 L -6 13 L -2 10 L -3 4 L -14 6 L -14 3 L -4 -3 Z"
                  fill="#38bdf8"
                  stroke="#ffffff"
                  strokeWidth="1"
                  filter="url(#glow)"
                />
              </g>

              {/* Aircraft Live Info Tag */}
              <g transform={`translate(${uavX + 16} ${uavY - 8})`}>
                <rect
                  x="-2"
                  y="-10"
                  width="100"
                  height="22"
                  rx="4"
                  fill="#020617"
                  stroke="#06b6d4"
                  strokeWidth="1"
                  opacity="0.95"
                />
                <text x="4" y="0" fill="#38bdf8" fontSize="8" fontFamily="monospace" fontWeight="bold">
                  UAV-07 · {speedKts.toFixed(0)} KT
                </text>
                <text x="4" y="9" fill="#94a3b8" fontSize="7" fontFamily="monospace">
                  HDG {route.position.heading_deg.toFixed(0)}° · 3,000 FT
                </text>
              </g>
            </svg>

            {/* ── MAP CONTROL TOOLBAR (RIGHT SIDE) ─────────────────────────── */}
            <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-1.5 bg-slate-900/85 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                className="size-7 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
                title="Zoom In"
              >
                <ZoomIn className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoom((z) => Math.max(0.7, z - 0.2))}
                className="size-7 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
                title="Zoom Out"
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={centerOnUav}
                className="size-7 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-slate-800"
                title="Center on Aircraft"
              >
                <Crosshair className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={resetView}
                className="size-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Reset Map View"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>

            {/* ── BOTTOM LEFT TACTICAL STATUS STRIP ──────────────────────────── */}
            <div className="absolute left-3 bottom-3 z-20 flex flex-wrap items-center gap-2 text-[9px] font-mono bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-300">
              <div className="flex items-center gap-1">
                <span className={`size-2 rounded-full ${engineOutSim ? "bg-red-400" : "bg-emerald-400"}`} />
                <span>
                  {engineOutSim
                    ? `GLIDE CONE: ${deadStickRangeNm.toFixed(1)} NM`
                    : `SAFE RANGE: ${dynamicSafeRadiusNm.toFixed(0)} NM`}
                </span>
              </div>
              <span className="text-slate-600">·</span>
              <div className="flex items-center gap-1">
                <Wind className="size-3 text-cyan-400" />
                <span>WIND {windDirectionDeg}° @ {windSpeedKts} KT</span>
              </div>
              <span className="text-slate-600">·</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-400">RWY ALIGN:</span>
                <span className={headwindComponent >= 0 ? "text-emerald-400" : "text-amber-400"}>
                  {headwindComponent >= 0 ? `+${headwindComponent}KT HEAD` : `${headwindComponent}KT TAIL`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── VERTICAL GLIDE PROFILE & TERRAIN ELEVATION CROSS-SECTION ───────── */}
        {(viewMode === "profile" || viewMode === "split") && (
          <div className="border-t border-white/10 bg-slate-950/95 p-3.5 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ArrowDownRight className="size-4 text-cyan-400" />
                <span className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Vertical Descent Profile & Glide Slope (UAV → {activeSite?.name})
                </span>
              </div>

              {/* Descent Telemetry Badges */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                <span className="bg-slate-900 border border-white/10 px-2 py-0.5 rounded text-slate-300">
                  ALTITUDE: <strong className="text-cyan-300">3,000 FT AGL</strong>
                </span>
                <span className="bg-slate-900 border border-white/10 px-2 py-0.5 rounded text-slate-300">
                  RUNWAY ELEV: <strong className="text-emerald-300">{targetRunwayElevationFt} FT MSL</strong>
                </span>
                <span className="bg-slate-900 border border-white/10 px-2 py-0.5 rounded text-slate-300">
                  DESCENT RATE: <strong className="text-amber-300">-{requiredFpm.toFixed(0)} FPM</strong>
                </span>
                <span className="bg-slate-900 border border-white/10 px-2 py-0.5 rounded text-slate-300">
                  SLOPE: <strong className="text-cyan-300">{requiredGlideSlopeDeg.toFixed(1)}°</strong>
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold border ${
                    isGlideCapable
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      : "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  }`}
                >
                  {isGlideCapable ? "GLIDE RECOVERY CAPABLE" : "REQUIRES EXTENDED POWER"}
                </span>
              </div>
            </div>

            {/* SVG Elevation Cross-Section */}
            <div className="relative h-[130px] w-full rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
              <svg viewBox="0 0 700 130" className="size-full" preserveAspectRatio="none">
                <defs>
                  {/* Terrain Elevation Gradient */}
                  <linearGradient id="terrain-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(51, 65, 85, 0.7)" />
                    <stop offset="100%" stopColor="rgba(15, 23, 42, 0.95)" />
                  </linearGradient>
                </defs>

                {/* Altitude Grid Lines */}
                <line x1="40" y1="20" x2="680" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <text x="35" y="23" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">
                  3500 FT
                </text>

                <line x1="40" y1="55" x2="680" y2="55" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <text x="35" y="58" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">
                  2000 FT
                </text>

                <line x1="40" y1="90" x2="680" y2="90" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <text x="35" y="93" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">
                  1000 FT
                </text>

                {/* Terrain Mountain Profile */}
                <path
                  d="M 40 120 L 120 110 L 220 95 L 340 75 L 430 85 L 530 105 L 640 115 L 680 115 L 680 130 L 40 130 Z"
                  fill="url(#terrain-grad)"
                  stroke="#475569"
                  strokeWidth="1"
                />
                <text x="340" y="70" fill="#94a3b8" fontSize="7" fontFamily="monospace" textAnchor="middle">
                  Alpha Ridge (1,840 FT MSL)
                </text>

                {/* Minimum Safe Altitude (MSA) clearance floor */}
                <line x1="40" y1="62" x2="680" y2="62" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.6" />
                <text x="670" y="60" fill="#f87171" fontSize="7" fontFamily="monospace" textAnchor="end">
                  MSA (2,100 FT)
                </text>

                {/* Ideal 3.0° Glideslope descent line */}
                <line x1="70" y1="30" x2="640" y2="114" stroke="#10b981" strokeWidth="2" strokeDasharray="5 3" />

                {/* UAV Position Marker on Glideslope */}
                <g transform="translate(70, 30)">
                  <circle cx="0" cy="0" r="10" fill="rgba(6,182,212,0.25)" className="animate-ping" />
                  <circle cx="0" cy="0" r="4" fill="#38bdf8" />
                  <text x="8" y="-4" fill="#38bdf8" fontSize="8" fontFamily="monospace" fontWeight="bold">
                    UAV-07 (3,000 FT)
                  </text>
                </g>

                {/* Destination Runway Marker on Ground */}
                <g transform="translate(640, 114)">
                  <rect x="-14" y="-3" width="28" height="6" fill="#10b981" rx="1" />
                  <text x="0" y="-8" fill="#34d399" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                    {activeSite?.name} ({targetRunwayElevationFt} FT)
                  </text>
                </g>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM TACTICAL TOOLBAR & LAYER CONTROLS ─────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-900/90 px-3 py-2 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-400 font-semibold text-[10px] uppercase mr-1">LAYERS:</span>
          <button
            onClick={() => setShowRings(!showRings)}
            className={`px-2 py-0.5 rounded border text-[10px] transition-all ${
              showRings
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                : "border-white/10 bg-transparent text-slate-500"
            }`}
          >
            RINGS
          </button>
          <button
            onClick={() => setShowSafeRadius(!showSafeRadius)}
            className={`px-2 py-0.5 rounded border text-[10px] transition-all ${
              showSafeRadius
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-transparent text-slate-500"
            }`}
          >
            SAFE RADIUS
          </button>
          <button
            onClick={() => setShowDeadStick(!showDeadStick)}
            className={`px-2 py-0.5 rounded border text-[10px] transition-all ${
              showDeadStick
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-white/10 bg-transparent text-slate-500"
            }`}
          >
            DEAD-STICK
          </button>
          <button
            onClick={() => setShowHazards(!showHazards)}
            className={`px-2 py-0.5 rounded border text-[10px] transition-all ${
              showHazards
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-white/10 bg-transparent text-slate-500"
            }`}
          >
            HAZARDS
          </button>
          <button
            onClick={() => {
              setThreatAvoidance(!threatAvoidance)
              playTacticalSound("click", soundEnabled)
            }}
            className={`px-2 py-0.5 rounded border text-[10px] transition-all font-bold ${
              threatAvoidance
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-transparent text-slate-500"
            }`}
            title="Auto-plan avoidance route around Restricted Airspace R-304"
          >
            {threatAvoidance ? "✓ AVOID THREATS" : "DIRECT ROUTE"}
          </button>
        </div>

        {/* Selected Divert Summary Tag */}
        <div className="flex items-center gap-2 text-slate-400">
          <span>ROUTING:</span>
          <strong className={threatAvoidance ? "text-emerald-400" : "text-cyan-400"}>
            {threatAvoidance ? "AVOIDANCE DOG-LEG" : "DIRECT"}
          </strong>
          <span className="text-slate-600">|</span>
          <span>DIST:</span>
          <strong className="text-cyan-400">{liveDistanceNm.toFixed(1)} NM</strong>
          <span className="text-slate-600">|</span>
          <span>ETA:</span>
          <strong className="text-cyan-400">{etaMinutesFormatted}</strong>
        </div>
      </div>
    </div>
  )
}
