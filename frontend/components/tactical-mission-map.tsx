"use client"

import * as React from "react"
import {
  Compass,
  Crosshair,
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
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

  // Zoom and Pan state
  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 })

  // Layer toggles
  const [showRings, setShowRings] = React.useState(true)
  const [showSafeRadius, setShowSafeRadius] = React.useState(true)
  const [showCorridor, setShowCorridor] = React.useState(true)
  const [showContours, setShowContours] = React.useState(true)

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

  // Coordinate projection bounds
  const allPoints = [...route.waypoints, ...route.recovery_sites, route.position]
  const lats = allPoints.map((p) => p.latitude)
  const lons = allPoints.map((p) => p.longitude)
  const minLat = Math.min(...lats) - 0.03
  const maxLat = Math.max(...lats) + 0.03
  const minLon = Math.min(...lons) - 0.03
  const maxLon = Math.max(...lons) + 0.03
  const latSpan = Math.max(0.01, maxLat - minLat)
  const lonSpan = Math.max(0.01, maxLon - minLon)

  const mapWidth = 720
  const mapHeight = 420
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
  const liveDistanceNm = activeSite
    ? getDistanceNm(
        route.position.latitude,
        route.position.longitude,
        activeSite.latitude,
        activeSite.longitude
      )
    : 0

  const speedKts = Math.max(20, route.position.ground_speed_kts || 58)
  const etaMinutes = (liveDistanceNm / speedKts) * 60
  const etaMinutesFormatted = `${Math.floor(etaMinutes)}m ${Math.floor(
    (etaMinutes % 1) * 60
  )}s`

  // Dynamic safe radius calculation (adjusted by health index)
  const dynamicSafeRadiusNm = (route.safe_radius_nm * (healthIndex / 100))
  const safeRadiusPixels = Math.max(30, Math.min(180, dynamicSafeRadiusNm * 0.75))

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
    <div className="relative flex flex-col rounded-2xl border border-border/80 bg-slate-950 text-slate-100 shadow-xl overflow-hidden select-none">
      {/* ── TOP TACTICAL HUD OVERLAY BAR ─────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Badge
            variant="outline"
            className="border-cyan-400/40 bg-slate-900/80 backdrop-blur-md font-mono text-[10px] text-cyan-300 px-2 py-0.5 shadow-sm"
          >
            <Radar className="size-3 text-cyan-400 animate-pulse mr-1" />
            LIVE TACTICAL GNSS
          </Badge>

          {isSafeReturnActive ? (
            <Badge
              variant="outline"
              className="border-emerald-500/50 bg-emerald-500/20 backdrop-blur-md font-mono text-[10px] text-emerald-300 font-bold px-2 py-0.5 animate-pulse"
            >
              <ShieldCheck className="size-3 text-emerald-400 mr-1" />
              SAFE RETURN ENGAGED → {activeSite?.name.toUpperCase()}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 backdrop-blur-md font-mono text-[10px] text-amber-300 px-2 py-0.5"
            >
              MONITORING FLIGHT CORRIDOR
            </Badge>
          )}
        </div>

        {/* Live Vector Readout */}
        <div className="flex items-center gap-2 pointer-events-auto text-[10px] font-mono bg-slate-900/85 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1">
          <span className="text-slate-400">DIVERT:</span>
          <span className="font-bold text-emerald-400">{activeSite?.id} ({liveDistanceNm.toFixed(1)} NM)</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">ETA:</span>
          <span className="font-bold text-cyan-400">{etaMinutesFormatted}</span>
        </div>
      </div>

      {/* ── TACTICAL MAP CANVAS (SVG) ────────────────────────────────────── */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`relative h-[380px] w-full overflow-hidden cursor-grab ${
          isDragging ? "cursor-grabbing" : ""
        }`}
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

          {/* Powerplant Safe Radius Bubble */}
          {showSafeRadius && (
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
                stroke="rgba(56, 189, 248, 0.4)"
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
              {/* Pulsing corridor glow line */}
              <line
                x1={uavX}
                y1={uavY}
                x2={siteX}
                y2={siteY}
                stroke="url(#rtb-grad)"
                strokeWidth={isSafeReturnActive ? "3.5" : "2"}
                strokeDasharray={isSafeReturnActive ? "6 3" : "4 4"}
                className={isSafeReturnActive ? "animate-[pulse_1.5s_infinite]" : ""}
              />

              {/* Waypoint Midpoint ETA Tag */}
              <g transform={`translate(${(uavX + siteX) / 2} ${(uavY + siteY) / 2 - 12})`}>
                <rect
                  x="-42"
                  y="-8"
                  width="84"
                  height="16"
                  rx="4"
                  fill="#020617"
                  stroke={isSafeReturnActive ? "#10b981" : "#06b6d4"}
                  strokeWidth="0.8"
                  opacity="0.9"
                />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fill={isSafeReturnActive ? "#34d399" : "#38bdf8"}
                  fontSize="8"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {liveDistanceNm.toFixed(1)} NM · {etaMinutesFormatted}
                </text>
              </g>
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

            return (
              <g
                key={`site-${site.id}`}
                onClick={() => onSelectSite(site.id)}
                className="cursor-pointer group"
              >
                {/* Selection pulse ring */}
                {isSelected && (
                  <circle
                    cx={sx}
                    cy={sy}
                    r="12"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    className="animate-spin"
                  />
                )}

                {/* Runway airfield symbol */}
                <rect
                  x={sx - 5}
                  y={sy - 5}
                  width="10"
                  height="10"
                  rx="2"
                  fill={isSelected ? "#10b981" : "#f59e0b"}
                  stroke="#ffffff"
                  strokeWidth="1"
                  className="group-hover:scale-125 transition-transform"
                />

                {/* Site Label with Distance */}
                <g transform={`translate(${sx + 8} ${sy + 10})`}>
                  <rect
                    x="-2"
                    y="-8"
                    width="62"
                    height="14"
                    rx="3"
                    fill="#090d16"
                    stroke={isSelected ? "#10b981" : "#334155"}
                    strokeWidth="0.8"
                    opacity="0.9"
                  />
                  <text
                    x="2"
                    y="2"
                    fill={isSelected ? "#34d399" : "#e2e8f0"}
                    fontSize="7.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {site.id} ({site.distance_nm.toFixed(1)}nm)
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
              width="95"
              height="20"
              rx="4"
              fill="#020617"
              stroke="#06b6d4"
              strokeWidth="1"
              opacity="0.92"
            />
            <text x="4" y="-1" fill="#38bdf8" fontSize="8" fontFamily="monospace" fontWeight="bold">
              UAV-07 · {speedKts.toFixed(0)} KT
            </text>
            <text x="4" y="7" fill="#94a3b8" fontSize="7" fontFamily="monospace">
              HDG {route.position.heading_deg.toFixed(0)}° · 3.0k FT
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

        {/* ── BOTTOM LEFT LEGEND & STATS ─────────────────────────────────── */}
        <div className="absolute left-3 bottom-3 z-20 flex flex-wrap items-center gap-1.5 text-[9px] font-mono bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-300">
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-400" />
            <span>SAFE RADIUS: {dynamicSafeRadiusNm.toFixed(0)} NM</span>
          </div>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-cyan-400" />
            <span>LIVE POSITION: {route.position.latitude.toFixed(3)}, {route.position.longitude.toFixed(3)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
