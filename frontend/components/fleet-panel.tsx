"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Crosshair,
  Flame,
  Gauge,
  Layers,
  Navigation,
  Plane,
  Radar,
  Radio,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"

interface FleetItem {
  uav_id: string
  call_sign: string
  mission: string
  health: number
  rul: number
  condition: string
  fault_count: number
  alert: string
  status_color: string
  status_dot: string
  is_active: boolean
  mission_probability: number
  rpm?: number
  cht?: number
}

// Fixed geospatial deployments for fleet radar visualization
const FLEET_GEOLOCATIONS: Record<
  string,
  { lat: number; lon: number; hdg: number; speed: number; alt: number; role: string }
> = {
  "UAV-01": { lat: 26.756, lon: 78.118, hdg: 64, speed: 58, alt: 3000, role: "Active Patrol" },
  "UAV-02": { lat: 26.812, lon: 78.208, hdg: 120, speed: 62, alt: 3500, role: "Route Survey" },
  "UAV-03": { lat: 26.706, lon: 78.026, hdg: 0, speed: 0, alt: 1250, role: "Base Standby" },
  "UAV-04": { lat: 26.698, lon: 78.018, hdg: 0, speed: 0, alt: 1250, role: "Hangar Maint." },
}

const DEFAULT_FLEET: FleetItem[] = [
  {
    uav_id: "UAV-01",
    call_sign: "ALPHA-01",
    mission: "ISR-LOITER",
    health: 94,
    rul: 142,
    condition: "EXCELLENT",
    fault_count: 0,
    alert: "NOMINAL",
    status_color: "ok",
    status_dot: "🟢",
    is_active: true,
    mission_probability: 92.0,
    rpm: 1402,
    cht: 382,
  },
  {
    uav_id: "UAV-02",
    call_sign: "ALPHA-02",
    mission: "ROUTE-SURVEY",
    health: 87,
    rul: 112,
    condition: "GOOD",
    fault_count: 0,
    alert: "NOMINAL",
    status_color: "ok",
    status_dot: "🟢",
    is_active: false,
    mission_probability: 88.0,
    rpm: 1395,
    cht: 378,
  },
  {
    uav_id: "UAV-03",
    call_sign: "BRAVO-01",
    mission: "HOT-STANDBY",
    health: 78,
    rul: 52,
    condition: "FAIR",
    fault_count: 1,
    alert: "WARNING",
    status_color: "warn",
    status_dot: "🟡",
    is_active: false,
    mission_probability: 74.0,
    rpm: 0,
    cht: 120,
  },
  {
    uav_id: "UAV-04",
    call_sign: "BRAVO-02",
    mission: "MAINTENANCE",
    health: 68,
    rul: 18,
    condition: "CRITICAL",
    fault_count: 2,
    alert: "CRITICAL",
    status_color: "crit",
    status_dot: "🔴",
    is_active: false,
    mission_probability: 45.0,
    rpm: 0,
    cht: 85,
  },
]

export function FleetPanel() {
  const { latestTelemetry, sendCommand } = useTelemetry()
  const [switchingToId, setSwitchingToId] = React.useState<string | null>(null)
  const [filterMode, setFilterMode] = React.useState<"ALL" | "AIRBORNE" | "STANDBY">("ALL")

  const rawFleet = latestTelemetry?.fleet_status as FleetItem[] | undefined
  const fleetList = rawFleet && rawFleet.length > 0 ? rawFleet : DEFAULT_FLEET

  // Single source of truth for active UAV ID
  const activeUavId = latestTelemetry?.uav_id ?? "UAV-01"

  const handleSelectUav = (uavId: string) => {
    if (uavId === activeUavId) return
    setSwitchingToId(uavId)
    sendCommand({
      command: "select_uav",
      uav_id: uavId,
    })
    setTimeout(() => {
      setSwitchingToId(null)
    }, 600)
  }

  const dispatchableCount = fleetList.filter((u) => u.health >= 50).length
  const fleetReadinessPct = Math.round((dispatchableCount / fleetList.length) * 100)
  const meanHealth = Math.round(fleetList.reduce((acc, u) => acc + u.health, 0) / fleetList.length)
  const aogCount = fleetList.filter((u) => u.alert === "CRITICAL" || u.health < 50).length

  // Filtered airframes
  const filteredFleet = fleetList.filter((u) => {
    if (filterMode === "AIRBORNE") return u.uav_id === "UAV-01" || u.uav_id === "UAV-02"
    if (filterMode === "STANDBY") return u.uav_id === "UAV-03" || u.uav_id === "UAV-04"
    return true
  })

  // Swarm Radar Map projection
  const minLat = 26.68
  const maxLat = 26.83
  const minLon = 78.0
  const maxLon = 78.23
  const mapWidth = 600
  const mapHeight = 240
  const pad = 35

  const projectX = (lon: number) => pad + ((lon - minLon) / (maxLon - minLon)) * (mapWidth - pad * 2)
  const projectY = (lat: number) => mapHeight - pad - ((lat - minLat) / (maxLat - minLat)) * (mapHeight - pad * 2)

  return (
    <div className="flex flex-col gap-5">
      {/* ── Top Fleet KPI Summary Strip ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Readiness</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-500">{fleetReadinessPct}%</div>
          <div className="text-[11px] text-muted-foreground">{dispatchableCount} of {fleetList.length} airframes mission-ready</div>
        </Card>
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Digital Twins</div>
          <div className="mt-1 font-mono text-2xl font-bold text-primary">{fleetList.length} Synced</div>
          <div className="text-[11px] text-muted-foreground">Live multi-node MQTT bridge</div>
        </Card>
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Mean Health</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">{meanHealth} / 100</div>
          <div className="text-[11px] text-muted-foreground">Fleet Weibull distribution</div>
        </Card>
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AOG Warnings</div>
          <div className="mt-1 font-mono text-2xl font-bold text-destructive">{aogCount} Unit{aogCount === 1 ? "" : "s"}</div>
          <div className="text-[11px] text-muted-foreground">Requires maintenance intervention</div>
        </Card>
      </div>

      {/* ── Interactive Swarm Formation Radar Map ─────────────────────── */}
      <Card className="border-border/80 bg-slate-950 text-slate-100 shadow-lg overflow-hidden">
        <CardHeader className="p-3.5 border-b border-white/10 bg-slate-900/60 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Radar className="size-4 text-cyan-400 animate-pulse" />
            <div>
              <CardTitle className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Theater Swarm Formation Radar (Click airframe to switch active twin)
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-400">
                Live spatial tracking of 4 distributed Rotax 914 F digital twin nodes across the corridor.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
              ACTIVE: {activeUavId}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0 relative">
          <div className="relative w-full h-[220px] bg-slate-950 overflow-hidden">
            <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="size-full">
              <defs>
                <pattern id="fleet-grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="0.8" />
                </pattern>
                <radialGradient id="fleet-center" r="1">
                  <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>

              <rect width={mapWidth} height={mapHeight} fill="#050a14" />
              <rect width={mapWidth} height={mapHeight} fill="url(#fleet-grid)" />

              {/* Theater Range Rings */}
              <circle cx={mapWidth / 2} cy={mapHeight / 2} r="80" fill="url(#fleet-center)" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" strokeDasharray="3 3" />
              <circle cx={mapWidth / 2} cy={mapHeight / 2} r="150" fill="none" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="0" y1={mapHeight / 2} x2={mapWidth} y2={mapHeight / 2} stroke="rgba(56, 189, 248, 0.08)" />
              <line x1={mapWidth / 2} y1="0" x2={mapWidth / 2} y2={mapHeight} stroke="rgba(56, 189, 248, 0.08)" />

              {/* Home Base Anchor */}
              <g transform={`translate(${projectX(78.026)}, ${projectY(26.706)})`}>
                <rect x="-6" y="-6" width="12" height="12" rx="2" fill="#0284c7" stroke="#ffffff" strokeWidth="1" />
                <text x="8" y="3" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                  HOME BASE
                </text>
              </g>

              {/* Plot All 4 UAV Airframes */}
              {fleetList.map((uav) => {
                const geo = FLEET_GEOLOCATIONS[uav.uav_id] ?? { lat: 26.75, lon: 78.1, hdg: 0, speed: 0, alt: 0, role: "Standby" }
                const x = projectX(geo.lon)
                const y = projectY(geo.lat)
                const isSelected = uav.uav_id === activeUavId

                return (
                  <g
                    key={`radar-${uav.uav_id}`}
                    onClick={() => handleSelectUav(uav.uav_id)}
                    className="cursor-pointer group"
                  >
                    {/* Active Halo */}
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={y}
                        r="18"
                        fill="rgba(16, 185, 129, 0.15)"
                        stroke="#10b981"
                        strokeWidth="1.2"
                        strokeDasharray="3 2"
                        className="animate-spin"
                      />
                    )}

                    {/* Aircraft Symbol with Heading Rotation */}
                    <g transform={`translate(${x}, ${y}) rotate(${geo.hdg})`}>
                      <path
                        d="M 0 -11 L 3 -2 L 10 2 L 10 4 L 2 3 L 1 7 L 4 9 L 4 11 L 0 9 L -4 11 L -4 9 L -1 7 L -2 3 L -10 4 L -10 2 L -3 -2 Z"
                        fill={isSelected ? "#10b981" : uav.health >= 70 ? "#38bdf8" : "#f59e0b"}
                        stroke="#ffffff"
                        strokeWidth="0.8"
                        className="group-hover:scale-125 transition-transform"
                      />
                    </g>

                    {/* Callsign & Role Tag */}
                    <g transform={`translate(${x + 10}, ${y - 4})`}>
                      <rect
                        x="-2"
                        y="-8"
                        width="80"
                        height="16"
                        rx="3"
                        fill="#020617"
                        stroke={isSelected ? "#10b981" : "#334155"}
                        strokeWidth="0.8"
                        opacity="0.92"
                      />
                      <text
                        x="3"
                        y="3"
                        fill={isSelected ? "#34d399" : "#e2e8f0"}
                        fontSize="7.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {uav.uav_id} ({uav.health}%)
                      </text>
                    </g>
                  </g>
                )
              })}
            </svg>

            {/* Radar Quick Controls */}
            <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1.5 text-[9px] font-mono bg-slate-900/90 border border-white/10 rounded px-2 py-1 text-slate-300">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>4 NODES SYNCHRONIZED</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Fleet Airframe Cards Grid ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plane className="size-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-wide text-foreground">
              FLEET DIGITAL TWIN AIRFRAMES
            </h3>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-background/60 p-0.5 font-mono text-[10px]">
            <button
              onClick={() => setFilterMode("ALL")}
              className={`px-2 py-0.5 rounded transition-all ${
                filterMode === "ALL" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
              }`}
            >
              ALL (4)
            </button>
            <button
              onClick={() => setFilterMode("AIRBORNE")}
              className={`px-2 py-0.5 rounded transition-all ${
                filterMode === "AIRBORNE" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
              }`}
            >
              AIRBORNE (2)
            </button>
            <button
              onClick={() => setFilterMode("STANDBY")}
              className={`px-2 py-0.5 rounded transition-all ${
                filterMode === "STANDBY" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
              }`}
            >
              STANDBY / MAINT (2)
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filteredFleet.map((uav) => {
            // Strict single selection check
            const isSelected = uav.uav_id === activeUavId
            const isSwitching = switchingToId === uav.uav_id

            return (
              <Card
                key={uav.uav_id}
                className={`flex flex-col justify-between transition-all duration-200 ${
                  isSelected
                    ? "border-emerald-500/80 bg-emerald-500/5 shadow-md ring-2 ring-emerald-500/40"
                    : "bg-card/80 hover:bg-card hover:shadow-sm"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={`font-mono text-xs font-bold ${
                        isSelected
                          ? "border-emerald-500 text-emerald-500 bg-emerald-500/10"
                          : "text-primary border-border"
                      }`}
                    >
                      {uav.uav_id}
                    </Badge>
                    <Badge
                      variant={
                        uav.alert === "CRITICAL"
                          ? "destructive"
                          : uav.alert === "WARNING"
                          ? "outline"
                          : "outline"
                      }
                      className={`text-[10px] ${
                        uav.alert === "WARNING"
                          ? "border-amber-500 text-amber-500"
                          : uav.alert === "NOMINAL"
                          ? "border-emerald-500 text-emerald-500"
                          : ""
                      }`}
                    >
                      {uav.status_dot} {uav.alert}
                    </Badge>
                  </div>
                  <CardTitle className="mt-2 text-sm font-semibold flex items-center justify-between">
                    <span>{uav.call_sign}</span>
                    {isSelected && (
                      <span className="text-[10px] font-mono text-emerald-500 font-bold animate-pulse">
                        [ACTIVE TWIN]
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">{uav.mission}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">Health</span>
                      <div
                        className={`text-base font-bold ${
                          uav.health > 70
                            ? "text-emerald-500"
                            : uav.health > 40
                            ? "text-amber-500"
                            : "text-destructive"
                        }`}
                      >
                        {uav.health}%
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">RUL</span>
                      <div className="text-base font-bold text-foreground">{uav.rul} cycles</div>
                    </div>
                    <div className="col-span-2 border-t border-border/30 pt-1 text-[11px] text-muted-foreground flex justify-between">
                      <span>
                        Condition: <strong className="text-foreground">{uav.condition}</strong>
                      </span>
                      <span>
                        Mission: <strong className="text-foreground">{uav.mission_probability}%</strong>
                      </span>
                    </div>
                  </div>

                  {uav.fault_count > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="destructive" className="text-[9px]">
                        {uav.fault_count} ACTIVE FAULT{uav.fault_count > 1 ? "S" : ""}
                      </Badge>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    disabled={isSelected || isSwitching}
                    onClick={() => handleSelectUav(uav.uav_id)}
                    className={`w-full text-xs font-semibold font-mono transition-all ${
                      isSelected
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-default"
                        : "hover:border-primary/50"
                    }`}
                  >
                    {isSwitching
                      ? "CONNECTING TWIN..."
                      : isSelected
                      ? "✓ ACTIVE DIGITAL TWIN"
                      : "SWITCH DIGITAL TWIN"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── Cross-Airframe Comparative Telemetry Matrix ───────────────── */}
      <Card className="border-border/80 bg-card/80 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold tracking-wide">
                CROSS-AIRFRAME TELEMETRY MATRIX
              </CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              WEIBULL FLEET PROFILING
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Side-by-side parametric health and thermodynamic telemetry across the active airframe pool.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-muted/40 border-y border-border/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Airframe</th>
                  <th className="px-3 py-2">Callsign</th>
                  <th className="px-3 py-2">Mission Role</th>
                  <th className="px-3 py-2 text-right">Health</th>
                  <th className="px-3 py-2 text-right">Predicted RUL</th>
                  <th className="px-3 py-2">Condition</th>
                  <th className="px-3 py-2">Alert Level</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {fleetList.map((uav) => {
                  const isSelected = uav.uav_id === activeUavId
                  return (
                    <tr
                      key={`matrix-${uav.uav_id}`}
                      className={`transition-colors ${
                        isSelected ? "bg-emerald-500/10 font-bold" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-3 py-2.5 flex items-center gap-1.5">
                        <span
                          className={`size-2 rounded-full ${
                            isSelected ? "bg-emerald-500 animate-ping" : "bg-slate-400"
                          }`}
                        />
                        <span className={isSelected ? "text-emerald-500 font-bold" : "text-foreground"}>
                          {uav.uav_id}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{uav.call_sign}</td>
                      <td className="px-3 py-2.5 text-foreground">{uav.mission}</td>
                      <td
                        className={`px-3 py-2.5 text-right font-bold ${
                          uav.health > 70
                            ? "text-emerald-500"
                            : uav.health > 40
                            ? "text-amber-500"
                            : "text-destructive"
                        }`}
                      >
                        {uav.health}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-foreground">{uav.rul} cyc</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{uav.condition}</td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 ${
                            uav.alert === "CRITICAL"
                              ? "border-destructive text-destructive"
                              : uav.alert === "WARNING"
                              ? "border-amber-500 text-amber-500"
                              : "border-emerald-500 text-emerald-500"
                          }`}
                        >
                          {uav.alert}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isSelected ? (
                          <span className="text-[10px] text-emerald-500 font-bold">CONNECTED</span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSelectUav(uav.uav_id)}
                            className="h-6 text-[10px] px-2 font-mono text-primary hover:bg-primary/10"
                          >
                            CONNECT
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
