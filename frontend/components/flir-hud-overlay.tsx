"use client"

import * as React from "react"
import {
  Crosshair,
  Eye,
  Maximize2,
  Minimize2,
  Scan,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MissionCommandRecoverySite } from "@/lib/telemetry/types"

interface FlirHudOverlayProps {
  uavHeadingDeg: number
  groundSpeedKts: number
  altitudeFt?: number
  activeSite?: MissionCommandRecoverySite
  liveDistanceNm: number
  isSafeReturnActive: boolean
  onClose?: () => void
}

type ColorMode = "green" | "white" | "amber"

export function FlirHudOverlay({
  uavHeadingDeg,
  groundSpeedKts,
  altitudeFt = 3000,
  activeSite,
  liveDistanceNm,
  isSafeReturnActive,
  onClose,
}: FlirHudOverlayProps) {
  const [colorMode, setColorMode] = React.useState<ColorMode>("green")
  const [pitch, setPitch] = React.useState(-2.5) // Slight nose-down descent
  const [roll, setRoll] = React.useState(1.8) // Slight right bank
  const [fovZoom, setFovZoom] = React.useState<"1X" | "2X" | "4X">("2X")
  const [sensorMode, setSensorMode] = React.useState<"EO" | "MWIR" | "LWIR">("MWIR")

  // Color mode theme tokens
  const theme = {
    green: {
      bg: "bg-[#03120b]",
      hudColor: "#22c55e",
      hudGlow: "rgba(34, 197, 94, 0.4)",
      borderColor: "border-green-500/40",
      accent: "text-green-400",
      targetColor: "#4ade80",
    },
    white: {
      bg: "bg-[#0d1117]",
      hudColor: "#e2e8f0",
      hudGlow: "rgba(226, 232, 240, 0.4)",
      borderColor: "border-slate-400/40",
      accent: "text-slate-200",
      targetColor: "#f8fafc",
    },
    amber: {
      bg: "bg-[#180e03]",
      hudColor: "#f59e0b",
      hudGlow: "rgba(245, 158, 11, 0.4)",
      borderColor: "border-amber-500/40",
      accent: "text-amber-400",
      targetColor: "#fbbf24",
    },
  }[colorMode]

  // Dynamic compass ribbon calculation
  const compassRange = 40 // +/- 20 degrees shown
  const startHeading = Math.round((uavHeadingDeg - compassRange / 2 + 360) % 360)

  // Slant range to runway in feet
  const slantRangeFt = Math.round(
    Math.sqrt(Math.pow(liveDistanceNm * 6076.12, 2) + Math.pow(altitudeFt, 2))
  )

  return (
    <div
      className={`relative h-[390px] w-full overflow-hidden select-none font-mono ${theme.bg} text-slate-100 flex flex-col justify-between p-3`}
    >
      {/* ── CRT FLIR Scanlines & Vignette Overlay ─────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)",
          backgroundSize: "100% 3px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_90px_rgba(0,0,0,0.85)]" />

      {/* ── TOP HUD HEADER: SENSOR & COMPASS ───────────────────────────── */}
      <div className="relative z-20 flex items-start justify-between gap-2">
        {/* Left Sensor Telemetry */}
        <div className="flex flex-col gap-0.5 text-[9px]">
          <div className="flex items-center gap-1.5 font-bold" style={{ color: theme.hudColor }}>
            <span className="size-1.5 rounded-full animate-ping" style={{ backgroundColor: theme.hudColor }} />
            <span>GIMBAL 01 · {sensorMode}</span>
            <span className="opacity-60">|</span>
            <span>MAG {fovZoom}</span>
          </div>
          <div className="opacity-75 text-[8px]" style={{ color: theme.hudColor }}>
            DEPRESSION: {pitch.toFixed(1)}° · AZIMUTH: +0.4°
          </div>
          <div className="opacity-60 text-[8px]" style={{ color: theme.hudColor }}>
            UTC {new Date().toISOString().slice(11, 19)}Z
          </div>
        </div>

        {/* Center Compass Ribbon */}
        <div className="flex flex-col items-center">
          <div
            className="flex items-center gap-4 px-3 py-1 rounded border backdrop-blur-sm"
            style={{
              borderColor: `${theme.hudColor}40`,
              backgroundColor: `${theme.hudColor}10`,
              color: theme.hudColor,
            }}
          >
            <span className="text-[8px] opacity-60">
              {String((startHeading + 10) % 360).padStart(3, "0")}
            </span>
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-bold tracking-widest">
                {String(Math.round(uavHeadingDeg)).padStart(3, "0")}°
              </span>
              <div
                className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[5px]"
                style={{ borderTopColor: theme.hudColor }}
              />
            </div>
            <span className="text-[8px] opacity-60">
              {String((startHeading + 30) % 360).padStart(3, "0")}
            </span>
          </div>
        </div>

        {/* Right HUD Controls */}
        <div className="flex items-center gap-1.5">
          {/* Color Mode Switcher */}
          <div
            className="flex items-center rounded border p-0.5 text-[8px]"
            style={{
              borderColor: `${theme.hudColor}40`,
              backgroundColor: `${theme.hudColor}10`,
            }}
          >
            <button
              onClick={() => setColorMode("green")}
              className={`px-1.5 py-0.5 rounded ${
                colorMode === "green" ? "bg-green-500 text-black font-bold" : "text-slate-400"
              }`}
            >
              NVG
            </button>
            <button
              onClick={() => setColorMode("white")}
              className={`px-1.5 py-0.5 rounded ${
                colorMode === "white" ? "bg-slate-200 text-black font-bold" : "text-slate-400"
              }`}
            >
              W-HOT
            </button>
            <button
              onClick={() => setColorMode("amber")}
              className={`px-1.5 py-0.5 rounded ${
                colorMode === "amber" ? "bg-amber-400 text-black font-bold" : "text-slate-400"
              }`}
            >
              AMBER
            </button>
          </div>

          {/* Sensor FOV Switcher */}
          <button
            onClick={() =>
              setFovZoom((z) => (z === "1X" ? "2X" : z === "2X" ? "4X" : "1X"))
            }
            className="px-1.5 py-0.5 rounded border text-[9px] font-bold transition-all"
            style={{
              borderColor: `${theme.hudColor}40`,
              color: theme.hudColor,
              backgroundColor: `${theme.hudColor}10`,
            }}
            title="Toggle Sensor FOV Zoom"
          >
            {fovZoom}
          </button>
        </div>
      </div>

      {/* ── CENTER HUD DISPLAY: PITCH LADDER, HORIZON & TARGETING RETICLE ── */}
      <div className="relative flex-1 flex items-center justify-center">
        {/* Synthetic Horizon & Pitch Ladder SVG */}
        <svg
          viewBox="0 0 500 240"
          className="w-full h-full max-w-[540px] pointer-events-none"
          style={{
            transform: `rotate(${-roll}deg)`,
            transition: "transform 0.2s ease-out",
          }}
        >
          {/* Artificial Horizon Center Zero Line */}
          <g transform={`translate(250, ${120 - pitch * 6})`}>
            {/* Left Horizon Wing */}
            <line x1="-120" y1="0" x2="-35" y2="0" stroke={theme.hudColor} strokeWidth="1.5" />
            <line x1="-35" y1="0" x2="-35" y2="6" stroke={theme.hudColor} strokeWidth="1.5" />

            {/* Center Aircraft Reference Symbol (Flight Director) */}
            <circle cx="0" cy="0" r="3.5" fill="none" stroke={theme.hudColor} strokeWidth="1.2" />
            <line x1="-10" y1="0" x2="-4" y2="0" stroke={theme.hudColor} strokeWidth="1.2" />
            <line x1="4" y1="0" x2="10" y2="0" stroke={theme.hudColor} strokeWidth="1.2" />
            <line x1="0" y1="-10" x2="0" y2="-4" stroke={theme.hudColor} strokeWidth="1.2" />

            {/* Right Horizon Wing */}
            <line x1="35" y1="0" x2="120" y2="0" stroke={theme.hudColor} strokeWidth="1.5" />
            <line x1="35" y1="0" x2="35" y2="6" stroke={theme.hudColor} strokeWidth="1.5" />
          </g>

          {/* +10° Pitch Ladder (Climb) */}
          <g transform={`translate(250, ${120 - (pitch + 10) * 6})`}>
            <line x1="-60" y1="0" x2="-25" y2="0" stroke={theme.hudColor} strokeWidth="1.2" />
            <line x1="-60" y1="0" x2="-60" y2="5" stroke={theme.hudColor} strokeWidth="1.2" />
            <text x="-70" y="3" fill={theme.hudColor} fontSize="8" fontFamily="monospace" textAnchor="end">
              +10
            </text>

            <line x1="25" y1="0" x2="60" y2="0" stroke={theme.hudColor} strokeWidth="1.2" />
            <line x1="60" y1="0" x2="60" y2="5" stroke={theme.hudColor} strokeWidth="1.2" />
            <text x="70" y="3" fill={theme.hudColor} fontSize="8" fontFamily="monospace">
              +10
            </text>
          </g>

          {/* -10° Pitch Ladder (Descent, Dashed) */}
          <g transform={`translate(250, ${120 - (pitch - 10) * 6})`}>
            <line x1="-60" y1="0" x2="-25" y2="0" stroke={theme.hudColor} strokeWidth="1.2" strokeDasharray="5 3" />
            <line x1="-60" y1="0" x2="-60" y2="-5" stroke={theme.hudColor} strokeWidth="1.2" />
            <text x="-70" y="3" fill={theme.hudColor} fontSize="8" fontFamily="monospace" textAnchor="end">
              -10
            </text>

            <line x1="25" y1="0" x2="60" y2="0" stroke={theme.hudColor} strokeWidth="1.2" strokeDasharray="5 3" />
            <line x1="60" y1="0" x2="60" y2="-5" stroke={theme.hudColor} strokeWidth="1.2" />
            <text x="70" y="3" fill={theme.hudColor} fontSize="8" fontFamily="monospace">
              -10
            </text>
          </g>

          {/* ── RUNWAY THRESHOLD TARGET LOCK RETICLE ─────────────────────── */}
          <g transform="translate(250, 142)">
            {/* Pulsing Target Bracket Box */}
            <rect
              x="-24"
              y="-14"
              width="48"
              height="28"
              fill="none"
              stroke={theme.targetColor}
              strokeWidth="1.2"
              strokeDasharray="8 4"
              className="animate-pulse"
            />
            {/* Corner Brackets */}
            <path
              d="M -24 -6 L -24 -14 L -16 -14 M 16 -14 L 24 -14 L 24 -6 M -24 6 L -24 14 L -16 14 M 16 14 L 24 14 L 24 6"
              fill="none"
              stroke={theme.targetColor}
              strokeWidth="1.8"
            />
            {/* Center Runway Dot */}
            <circle cx="0" cy="0" r="2" fill={theme.targetColor} />

            {/* Lock Designation Tag */}
            <text
              x="0"
              y="-18"
              fill={theme.targetColor}
              fontSize="7.5"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="middle"
            >
              TRK: {activeSite?.name.toUpperCase()} (RWY 09)
            </text>
            <text
              x="0"
              y="23"
              fill={theme.targetColor}
              fontSize="7"
              fontFamily="monospace"
              textAnchor="middle"
            >
              LRF {liveDistanceNm.toFixed(1)} NM · {slantRangeFt} FT
            </text>
          </g>
        </svg>

        {/* Left Side: Airspeed Tape */}
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col items-end gap-1 px-2 py-3 rounded border backdrop-blur-sm"
          style={{
            borderColor: `${theme.hudColor}40`,
            backgroundColor: `${theme.hudColor}10`,
            color: theme.hudColor,
          }}
        >
          <span className="text-[7.5px] font-bold opacity-60">AIRSPEED</span>
          <span className="text-sm font-bold tracking-wider">{Math.round(groundSpeedKts)}</span>
          <span className="text-[8px] opacity-75">KTS</span>
          <div className="w-8 h-0.5 mt-0.5 opacity-40" style={{ backgroundColor: theme.hudColor }} />
          <span className="text-[7px] opacity-60">TAS: {Math.round(groundSpeedKts * 1.05)}</span>
        </div>

        {/* Right Side: Altitude Tape */}
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-start gap-1 px-2 py-3 rounded border backdrop-blur-sm"
          style={{
            borderColor: `${theme.hudColor}40`,
            backgroundColor: `${theme.hudColor}10`,
            color: theme.hudColor,
          }}
        >
          <span className="text-[7.5px] font-bold opacity-60">ALTITUDE</span>
          <span className="text-sm font-bold tracking-wider">{altitudeFt}</span>
          <span className="text-[8px] opacity-75">FT AGL</span>
          <div className="w-8 h-0.5 mt-0.5 opacity-40" style={{ backgroundColor: theme.hudColor }} />
          <span className="text-[7px] opacity-60">MSL: {altitudeFt + 1250}</span>
        </div>
      </div>

      {/* ── BOTTOM HUD TELEMETRY STRIP ──────────────────────────────────── */}
      <div
        className="relative z-20 flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-[9px]"
        style={{ borderColor: `${theme.hudColor}30`, color: theme.hudColor }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Scan className="size-3 opacity-75" />
            <span>OPTICAL TRACK: <strong className="font-bold">LOCKED</strong></span>
          </div>
          <span>·</span>
          <span>SINK: <strong className="font-bold">-480 FPM</strong></span>
          <span>·</span>
          <span>GLIDESLOPE: <strong className="font-bold">3.1° NOMINAL</strong></span>
        </div>

        <div className="flex items-center gap-2">
          {isSafeReturnActive ? (
            <Badge
              variant="outline"
              className="font-mono text-[8.5px] px-2 py-0 border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold animate-pulse"
            >
              APPROACH GUIDANCE ENGAGED
            </Badge>
          ) : (
            <span className="opacity-70 text-[8px]">PILOT POV SENSOR STANDBY</span>
          )}
        </div>
      </div>
    </div>
  )
}
