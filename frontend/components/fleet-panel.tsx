"use client"

import * as React from "react"
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Cpu,
  Gauge,
  Plane,
  Radar,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
} from "recharts"
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

const FLEET_GEOLOCATIONS: Record<
  string,
  { lat: number; lon: number; hdg: number; speed: number; alt: number; role: string }
> = {
  "UAV-01": { lat: 26.756, lon: 78.118, hdg: 64,  speed: 58, alt: 3000, role: "Active Patrol" },
  "UAV-02": { lat: 26.812, lon: 78.208, hdg: 120, speed: 62, alt: 3500, role: "Route Survey"  },
  "UAV-03": { lat: 26.706, lon: 78.026, hdg: 0,   speed: 0,  alt: 1250, role: "Base Standby"  },
  "UAV-04": { lat: 26.698, lon: 78.018, hdg: 0,   speed: 0,  alt: 1250, role: "Hangar Maint." },
  "UAV-05": { lat: 26.830, lon: 78.060, hdg: 210, speed: 74, alt: 4200, role: "Deep Strike"   },
}

const DEFAULT_FLEET: FleetItem[] = [
  { uav_id:"UAV-01", call_sign:"ALPHA-01",   mission:"ISR-LOITER",   health:94, rul:142, condition:"EXCELLENT", fault_count:0, alert:"NOMINAL",  status_color:"ok",   status_dot:"🟢", is_active:true,  mission_probability:92.0, rpm:4802, cht:382 },
  { uav_id:"UAV-02", call_sign:"ALPHA-02",   mission:"ROUTE-SURVEY", health:87, rul:112, condition:"GOOD",      fault_count:0, alert:"NOMINAL",  status_color:"ok",   status_dot:"🟢", is_active:false, mission_probability:88.0, rpm:4395, cht:378 },
  { uav_id:"UAV-03", call_sign:"BRAVO-01",   mission:"HOT-STANDBY",  health:78, rul:52,  condition:"FAIR",      fault_count:1, alert:"WARNING",  status_color:"warn", status_dot:"🟡", is_active:false, mission_probability:74.0, rpm:0,    cht:120 },
  { uav_id:"UAV-04", call_sign:"BRAVO-02",   mission:"MAINTENANCE",  health:68, rul:18,  condition:"CRITICAL",  fault_count:2, alert:"CRITICAL", status_color:"crit", status_dot:"🔴", is_active:false, mission_probability:45.0, rpm:0,    cht:85  },
  { uav_id:"UAV-05", call_sign:"CHARLIE-01", mission:"DEEP-STRIKE",  health:99, rul:162, condition:"EXCELLENT", fault_count:0, alert:"NOMINAL",  status_color:"ok",   status_dot:"🟢", is_active:false, mission_probability:97.0, rpm:4820, cht:379 },
]

const UAV_COLORS: Record<string, string> = {
  "UAV-01": "#10b981",
  "UAV-02": "#38bdf8",
  "UAV-03": "#f59e0b",
  "UAV-04": "#ef4444",
  "UAV-05": "#a78bfa",
}

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border/80 bg-card/95 shadow-2xl p-3 text-xs font-mono backdrop-blur-md">
      {label && <p className="font-bold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => {
        const bulletColor =
          (p.stroke && typeof p.stroke === "string" && !p.stroke.startsWith("url"))
            ? p.stroke
            : (p.color && typeof p.color === "string" && !p.color.startsWith("url"))
            ? p.color
            : (typeof p.fill === "string" && !p.fill.startsWith("url"))
            ? p.fill
            : UAV_COLORS[p.dataKey] ?? "#38bdf8"
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="size-2 rounded-full shrink-0" style={{ background: bulletColor }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-bold text-foreground">{p.value}{p.unit ?? ""}</span>
          </div>
        )
      })}
    </div>
  )
}

export function FleetPanel() {
  const { latestTelemetry, sendCommand } = useTelemetry()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])
  const [switchingToId, setSwitchingToId] = React.useState<string | null>(null)
  const [filterMode, setFilterMode] = React.useState<"ALL" | "AIRBORNE" | "STANDBY">("ALL")
  const [chartView, setChartView] = React.useState<"bar" | "radar">("bar")
  const [trendMetric, setTrendMetric] = React.useState<"Health" | "RPM" | "CHT">("Health")
  const [trendType, setTrendType] = React.useState<"line" | "area">("area")

  // Simulated 30-tick time-series per UAV — seeded noise so each airframe has a realistic trajectory
  const trendData = React.useMemo(() => {
    const TICKS = 30
    // baselines per UAV per metric
    const bases: Record<string, { Health: number; RPM: number; CHT: number }> = {
      "UAV-01": { Health: 94,  RPM: 4802, CHT: 382 },
      "UAV-02": { Health: 87,  RPM: 4395, CHT: 378 },
      "UAV-03": { Health: 78,  RPM: 0,    CHT: 120 },
      "UAV-04": { Health: 68,  RPM: 0,    CHT: 85  },
      "UAV-05": { Health: 99,  RPM: 4820, CHT: 379 },
    }
    // degradation per tick
    const degradation: Record<string, { Health: number; RPM: number; CHT: number }> = {
      "UAV-01": { Health: 0.05,  RPM: 2,    CHT: 0.3  },
      "UAV-02": { Health: 0.08,  RPM: 3,    CHT: 0.4  },
      "UAV-03": { Health: 0.12,  RPM: 0,    CHT: 0.0  },
      "UAV-04": { Health: 0.20,  RPM: 0,    CHT: 0.0  },
      "UAV-05": { Health: 0.03,  RPM: 2.5,  CHT: 0.25 },
    }
    // simple seeded pseudo-random (deterministic for SSR consistency)
    let seed = 42
    const rnd = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff }

    return Array.from({ length: TICKS }, (_, i) => {
      const row: Record<string, number | string> = { tick: i + 1 }
      for (const [id, base] of Object.entries(bases)) {
        const noise = (rnd() - 0.5) * (id === "UAV-03" || id === "UAV-04" ? 0.5 : 2.5)
        const metric = trendMetric
        const v = base[metric] - degradation[id][metric] * i + noise
        row[id] = parseFloat(Math.max(0, v).toFixed(2))
      }
      return row
    })
  }, [trendMetric])

  const rawFleet = latestTelemetry?.fleet_status as FleetItem[] | undefined
  const fleetList = rawFleet && rawFleet.length > 0 ? rawFleet : DEFAULT_FLEET

  const activeUavId = latestTelemetry?.uav_id ?? "UAV-01"

  const handleSelectUav = (uavId: string) => {
    if (uavId === activeUavId) return
    setSwitchingToId(uavId)
    sendCommand({ command: "select_uav", uav_id: uavId })
    setTimeout(() => setSwitchingToId(null), 600)
  }

  const dispatchableCount  = fleetList.filter((u) => u.health >= 50).length
  const fleetReadinessPct  = Math.round((dispatchableCount / fleetList.length) * 100)
  const meanHealth         = Math.round(fleetList.reduce((acc, u) => acc + u.health, 0) / fleetList.length)
  const aogCount           = fleetList.filter((u) => u.alert === "CRITICAL" || u.health < 50).length
  const airborneCount      = fleetList.filter((u) => (u.rpm ?? 0) > 100).length

  const filteredFleet = fleetList.filter((u) => {
    if (filterMode === "AIRBORNE") return (u.rpm ?? 0) > 100
    if (filterMode === "STANDBY")  return (u.rpm ?? 0) <= 100
    return true
  })

  const minLat = 26.68; const maxLat = 26.85
  const minLon = 78.00; const maxLon = 78.23
  const mapWidth = 600; const mapHeight = 240; const pad = 35
  const projectX = (lon: number) => pad + ((lon - minLon) / (maxLon - minLon)) * (mapWidth - pad * 2)
  const projectY = (lat: number) => mapHeight - pad - ((lat - minLat) / (maxLat - minLat)) * (mapHeight - pad * 2)

  const barData = fleetList.map((u) => ({
    name: u.uav_id,
    Health: u.health,
    RUL: u.rul,
    "Mission %": u.mission_probability,
    fill: UAV_COLORS[u.uav_id] ?? "#94a3b8",
  }))

  const radarData = [
    { metric: "Health",      ...Object.fromEntries(fleetList.map((u) => [u.uav_id, u.health])) },
    { metric: "RUL / 2",    ...Object.fromEntries(fleetList.map((u) => [u.uav_id, Math.min(100, u.rul / 2)])) },
    { metric: "Mission %",  ...Object.fromEntries(fleetList.map((u) => [u.uav_id, u.mission_probability])) },
    { metric: "No Faults",  ...Object.fromEntries(fleetList.map((u) => [u.uav_id, u.fault_count === 0 ? 100 : Math.max(0, 100 - u.fault_count * 30)])) },
    { metric: "Airborne",   ...Object.fromEntries(fleetList.map((u) => [u.uav_id, (u.rpm ?? 0) > 100 ? 100 : 20])) },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Readiness</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-500">{fleetReadinessPct}%</div>
          <div className="text-[11px] text-muted-foreground">{dispatchableCount} of {fleetList.length} mission-ready</div>
        </Card>
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Twins</div>
          <div className="mt-1 font-mono text-2xl font-bold text-primary">{fleetList.length} Synced</div>
          <div className="text-[11px] text-muted-foreground">Live multi-node MQTT bridge</div>
        </Card>
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Mean Health</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">{meanHealth} / 100</div>
          <div className="text-[11px] text-muted-foreground">Fleet Weibull distribution</div>
        </Card>
        <Card className="bg-card/70 p-4 border-border/80 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AOG / Airborne</div>
          <div className="mt-1 font-mono text-2xl font-bold">
            <span className="text-destructive">{aogCount}</span>
            <span className="text-muted-foreground text-base"> / </span>
            <span className="text-emerald-500">{airborneCount}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">AOG grounded / active airborne</div>
        </Card>
      </div>

      {/* Radar Map */}
      <Card className="border-border/80 bg-slate-950 text-slate-100 shadow-lg overflow-hidden">
        <CardHeader className="p-3.5 border-b border-white/10 bg-slate-900/60 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Radar className="size-4 text-cyan-400 animate-pulse" />
            <div>
              <CardTitle className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Theater Swarm Formation Radar — Click airframe to switch active twin
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-400">
                5-node distributed Rotax 914 F digital twins — UAV-05 CHARLIE-01 now operational.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300 font-mono text-[10px]">
            ACTIVE: {activeUavId}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full h-[240px] bg-slate-950 overflow-hidden">
            <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="size-full">
              <defs>
                <pattern id="rdr-grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(56,189,248,0.08)" strokeWidth="0.8" />
                </pattern>
                <radialGradient id="rdr-center" r="1">
                  <stop offset="0%"   stopColor="rgba(6,182,212,0.15)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
              <rect width={mapWidth} height={mapHeight} fill="#050a14" />
              <rect width={mapWidth} height={mapHeight} fill="url(#rdr-grid)" />
              <circle cx={mapWidth/2} cy={mapHeight/2} r="80"  fill="url(#rdr-center)" stroke="rgba(56,189,248,0.20)" strokeWidth="0.8" strokeDasharray="3 3" />
              <circle cx={mapWidth/2} cy={mapHeight/2} r="160" fill="none"               stroke="rgba(56,189,248,0.12)" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="0" y1={mapHeight/2} x2={mapWidth} y2={mapHeight/2} stroke="rgba(56,189,248,0.08)" />
              <line x1={mapWidth/2} y1="0"  x2={mapWidth/2} y2={mapHeight}  stroke="rgba(56,189,248,0.08)" />
              <g transform={`translate(${projectX(78.026)}, ${projectY(26.706)})`}>
                <rect x="-6" y="-6" width="12" height="12" rx="2" fill="#0284c7" stroke="#ffffff" strokeWidth="1" />
                <text x="8" y="3" fill="#94a3b8" fontSize="8" fontFamily="monospace">HOME BASE</text>
              </g>
              {fleetList.map((uav) => {
                const geo = FLEET_GEOLOCATIONS[uav.uav_id] ?? { lat:26.75, lon:78.1, hdg:0, speed:0, alt:0, role:"Standby" }
                const x = projectX(geo.lon)
                const y = projectY(geo.lat)
                const isSelected = uav.uav_id === activeUavId
                const dotColor = UAV_COLORS[uav.uav_id] ?? "#94a3b8"
                return (
                  <g key={`radar-${uav.uav_id}`} onClick={() => handleSelectUav(uav.uav_id)} className="cursor-pointer group">
                    {isSelected && (
                      <circle cx={x} cy={y} r="18" fill={`${dotColor}22`} stroke={dotColor}
                        strokeWidth="1.2" strokeDasharray="3 2" className="animate-spin" />
                    )}
                    <g transform={`translate(${x}, ${y}) rotate(${geo.hdg})`}>
                      <path d="M 0 -11 L 3 -2 L 10 2 L 10 4 L 2 3 L 1 7 L 4 9 L 4 11 L 0 9 L -4 11 L -4 9 L -1 7 L -2 3 L -10 4 L -10 2 L -3 -2 Z"
                        fill={isSelected ? dotColor : uav.health >= 70 ? "#38bdf8" : "#f59e0b"}
                        stroke="#ffffff" strokeWidth="0.8" className="group-hover:scale-125 transition-transform" />
                    </g>
                    <g transform={`translate(${x + 10}, ${y - 4})`}>
                      <rect x="-2" y="-8" width="88" height="16" rx="3"
                        fill="#020617" stroke={isSelected ? dotColor : "#334155"} strokeWidth="0.8" opacity="0.92" />
                      <text x="3" y="3" fill={isSelected ? dotColor : "#e2e8f0"} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                        {uav.uav_id} ({uav.health}%)
                      </text>
                    </g>
                  </g>
                )
              })}
            </svg>
            <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1.5 text-[9px] font-mono bg-slate-900/90 border border-white/10 rounded px-2 py-1 text-slate-300">
              <span className="size-2 rounded-full bg-violet-400 animate-pulse" />
              <span>5 NODES SYNCHRONIZED — UAV-05 ONLINE</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Airframe Cards */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plane className="size-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-wide text-foreground">FLEET DIGITAL TWIN AIRFRAMES</h3>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-background/60 p-0.5 font-mono text-[10px]">
            {(["ALL", "AIRBORNE", "STANDBY"] as const).map((mode) => {
              const label = mode === "ALL" ? `ALL (${fleetList.length})`
                : mode === "AIRBORNE" ? `AIRBORNE (${airborneCount})`
                : `STANDBY (${fleetList.length - airborneCount})`
              return (
                <button key={mode} onClick={() => setFilterMode(mode)}
                  className={`px-2 py-0.5 rounded transition-all ${filterMode === mode ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"}`}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {filteredFleet.map((uav) => {
            const isSelected  = uav.uav_id === activeUavId
            const isSwitching = switchingToId === uav.uav_id
            const accent = UAV_COLORS[uav.uav_id] ?? "#94a3b8"
            return (
              <Card key={uav.uav_id}
                onClick={() => handleSelectUav(uav.uav_id)}
                className={`flex flex-col justify-between transition-all duration-200 cursor-pointer ${isSelected ? "shadow-md ring-2" : "bg-card/80 hover:bg-card hover:shadow-sm"}`}
                style={isSelected ? { borderColor:`${accent}cc`, background:`${accent}08`, "--tw-ring-color":`${accent}44` } as React.CSSProperties : {}}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="font-mono text-xs font-bold"
                      style={isSelected ? { borderColor:accent, color:accent, background:`${accent}18` } : {}}>
                      {uav.uav_id}
                    </Badge>
                    <Badge variant={uav.alert === "CRITICAL" ? "destructive" : "outline"}
                      className={`text-[10px] ${uav.alert==="WARNING" ? "border-amber-500 text-amber-500" : uav.alert==="NOMINAL" ? "border-emerald-500 text-emerald-500" : ""}`}>
                      {uav.status_dot} {uav.alert}
                    </Badge>
                  </div>
                  <CardTitle className="mt-2 text-sm font-semibold flex items-center justify-between">
                    <span>{uav.call_sign}</span>
                    {uav.uav_id === "UAV-05" && !isSelected && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 border-violet-500/50 text-violet-400">NEW</Badge>
                    )}
                    {isSelected && (
                      <span className="text-[10px] font-mono font-bold animate-pulse" style={{ color:accent }}>[ACTIVE TWIN]</span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">{uav.mission}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <div className="flex justify-between text-[10px] font-mono mb-1">
                      <span className="text-muted-foreground uppercase">Health</span>
                      <span className="font-bold" style={{ color: uav.health>70 ? "#10b981" : uav.health>40 ? "#f59e0b" : "#ef4444" }}>{uav.health}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width:`${uav.health}%`, background: uav.health>70 ? "#10b981" : uav.health>40 ? "#f59e0b" : "#ef4444" }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">RUL</span>
                      <div className="text-sm font-bold text-foreground">{uav.rul} cyc</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase">Mission P</span>
                      <div className="text-sm font-bold" style={{ color:accent }}>{uav.mission_probability}%</div>
                    </div>
                    <div className="col-span-2 border-t border-border/30 pt-1 text-[10px] text-muted-foreground flex justify-between">
                      <span>Cond: <strong className="text-foreground">{uav.condition}</strong></span>
                      {uav.fault_count > 0 && (
                        <Badge variant="destructive" className="text-[9px] h-4 px-1">{uav.fault_count} FAULT{uav.fault_count>1?"S":""}</Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant={isSelected ? "default" : "outline"}
                    disabled={isSelected || isSwitching}
                    onClick={(e) => { e.stopPropagation(); handleSelectUav(uav.uav_id) }}
                    className="w-full text-xs font-semibold font-mono transition-all"
                    style={isSelected ? { background:accent, border:`1px solid ${accent}` } : {}}>
                    {isSwitching ? "CONNECTING TWIN..." : isSelected ? "✓ ACTIVE DIGITAL TWIN" : "SWITCH DIGITAL TWIN"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Cardinal Heading Compass + Flight Vector Chart */}
      <Card className="border-border/80 bg-card/80 shadow-md overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Radar className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold tracking-wide">CARDINAL HEADING COMPASS — FLIGHT VECTOR ANALYSIS</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Directional heading vectors for all 5 airframes on a cardinal compass, alongside speed and altitude profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* SVG Cardinal Compass Rose */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground self-start">
                Cardinal Compass — UAV Heading Vectors
              </p>
              <div className="relative w-full max-w-[320px] mx-auto">
                <svg viewBox="0 0 320 320" className="w-full h-auto">
                  <defs>
                    <radialGradient id="cmp-bg" cx="50%" cy="50%" r="50%">
                      <stop offset="0%"   stopColor="hsl(var(--muted)/0.4)" />
                      <stop offset="100%" stopColor="hsl(var(--background)/0.2)" />
                    </radialGradient>
                    {fleetList.map((u) => (
                      <marker key={`arr-${u.uav_id}`}
                        id={`cmp-arrow-${u.uav_id}`}
                        markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                        <path d="M0,0 L0,6 L6,3 z" fill={UAV_COLORS[u.uav_id]} />
                      </marker>
                    ))}
                  </defs>

                  {/* Outer bezel */}
                  <circle cx="160" cy="160" r="148" fill="hsl(var(--card)/0.8)" stroke="hsl(var(--border))" strokeWidth="2" />
                  <circle cx="160" cy="160" r="140" fill="url(#cmp-bg)" />

                  {/* Concentric rings */}
                  {[105, 70, 35].map((r) => (
                    <circle key={r} cx="160" cy="160" r={r} fill="none"
                      stroke="hsl(var(--border)/0.6)" strokeWidth="0.7" strokeDasharray="3 4" />
                  ))}

                  {/* Cardinal cross lines */}
                  <line x1="160" y1="20"  x2="160" y2="300" stroke="hsl(var(--border)/0.5)" strokeWidth="0.8" />
                  <line x1="20"  y1="160" x2="300" y2="160" stroke="hsl(var(--border)/0.5)" strokeWidth="0.8" />
                  {/* Intercardinal lines */}
                  {[45, 135, 225, 315].map((deg) => {
                    const r = 140
                    const rad = (deg - 90) * Math.PI / 180
                    return (
                      <line key={deg}
                        x1={160 + Math.cos(rad) * 20} y1={160 + Math.sin(rad) * 20}
                        x2={160 + Math.cos(rad) * r}  y2={160 + Math.sin(rad) * r}
                        stroke="hsl(var(--border)/0.3)" strokeWidth="0.6" strokeDasharray="2 5" />
                    )
                  })}

                  {/* Degree tick marks every 30° */}
                  {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => {
                    const rad = (deg - 90) * Math.PI / 180
                    const r1 = 132; const r2 = 140
                    return (
                      <line key={`tick-${deg}`}
                        x1={160 + Math.cos(rad) * r1} y1={160 + Math.sin(rad) * r1}
                        x2={160 + Math.cos(rad) * r2} y2={160 + Math.sin(rad) * r2}
                        stroke="hsl(var(--muted-foreground)/0.6)" strokeWidth="1.2" />
                    )
                  })}

                  {/* Cardinal labels */}
                  {[
                    { label: "N",   deg: 0   },
                    { label: "NE",  deg: 45  },
                    { label: "E",   deg: 90  },
                    { label: "SE",  deg: 135 },
                    { label: "S",   deg: 180 },
                    { label: "SW",  deg: 225 },
                    { label: "W",   deg: 270 },
                    { label: "NW",  deg: 315 },
                  ].map(({ label, deg }) => {
                    const rad = (deg - 90) * Math.PI / 180
                    const r   = label.length === 1 ? 152 : 150
                    const isCardinal = label.length === 1
                    return (
                      <text key={`cdir-${deg}`}
                        x={160 + Math.cos(rad) * r}
                        y={160 + Math.sin(rad) * r + 3}
                        textAnchor="middle"
                        fontSize={isCardinal ? 11 : 8}
                        fontFamily="monospace"
                        fontWeight={isCardinal ? "bold" : "normal"}
                        fill={label === "N" ? "#ef4444" : "hsl(var(--muted-foreground))"}
                      >{label}</text>
                    )
                  })}

                  {/* UAV heading vectors */}
                  {fleetList.map((uav) => {
                    const geo = FLEET_GEOLOCATIONS[uav.uav_id] ?? { hdg: 0, speed: 0 }
                    const rad    = (geo.hdg - 90) * Math.PI / 180
                    const speed  = geo.speed ?? 0
                    const vecLen = Math.max(20, Math.min(108, speed * 1.6)) // scale to compass
                    const x2     = 160 + Math.cos(rad) * vecLen
                    const y2     = 160 + Math.sin(rad) * vecLen
                    const accent = UAV_COLORS[uav.uav_id]
                    const isSelected = uav.uav_id === activeUavId
                    return (
                      <g key={`cv-${uav.uav_id}`} className="cursor-pointer" onClick={() => handleSelectUav(uav.uav_id)}>
                        {/* glow for selected */}
                        {isSelected && (
                          <line x1="160" y1="160" x2={x2} y2={y2}
                            stroke={accent} strokeWidth="8" strokeOpacity="0.15" strokeLinecap="round" />
                        )}
                        <line x1="160" y1="160" x2={x2} y2={y2}
                          stroke={accent} strokeWidth={isSelected ? 2.5 : 1.8} strokeLinecap="round"
                          markerEnd={`url(#cmp-arrow-${uav.uav_id})`} />
                        {/* dot at origin */}
                        <circle cx="160" cy="160" r={isSelected ? 5 : 3.5} fill={accent} fillOpacity="0.9" />
                        {/* label at tip */}
                        <text x={x2 + Math.cos(rad) * 12} y={y2 + Math.sin(rad) * 12 + 3}
                          textAnchor="middle" fontSize="7" fontFamily="monospace" fontWeight="bold"
                          fill={accent}>{uav.uav_id}</text>
                      </g>
                    )
                  })}

                  {/* Centre hub */}
                  <circle cx="160" cy="160" r="7" fill="hsl(var(--background))" stroke="hsl(var(--border))" strokeWidth="1.5" />
                  <circle cx="160" cy="160" r="3" fill="hsl(var(--primary))" />
                </svg>
              </div>

              {/* Heading legend */}
              <div className="flex flex-wrap gap-3 justify-center text-[10px] font-mono w-full">
                {fleetList.map((u) => {
                  const geo = FLEET_GEOLOCATIONS[u.uav_id] ?? { hdg: 0, speed: 0, alt: 0 }
                  return (
                    <div key={u.uav_id}
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => handleSelectUav(u.uav_id)}>
                      <span className="size-2.5 rounded-full" style={{ background: UAV_COLORS[u.uav_id] }} />
                      <span className="text-foreground font-bold">{u.uav_id}</span>
                      <span className="text-muted-foreground">{geo.hdg}°</span>
                      <span className="text-muted-foreground">· {geo.speed} kt</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Flight Vector Bar Chart: Heading / Speed / Altitude */}
            <div className="flex flex-col gap-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Flight Vector Parameters — Heading (°) · Speed (kt) · Altitude (ft MSL)
              </p>

              {/* Speed Chart */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-mono">Airspeed (knots)</p>
                <div className="h-[110px] w-full">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height={110}>
                      <BarChart
                        data={fleetList.map((u) => ({
                          name: u.uav_id,
                          Speed: FLEET_GEOLOCATIONS[u.uav_id]?.speed ?? 0,
                          fill: UAV_COLORS[u.uav_id],
                        }))}
                        barSize={28}
                        margin={{ top: 2, right: 8, left: 0, bottom: 2 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis width={32} tick={{ fontSize: 8, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="Speed" name="Speed (kt)" radius={[4, 4, 0, 0]}>
                          {fleetList.map((u) => <Cell key={u.uav_id} fill={UAV_COLORS[u.uav_id]} fillOpacity={0.85} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[110px] w-full animate-pulse bg-muted/20 rounded" />
                  )}
                </div>
              </div>

              {/* Altitude Chart */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-mono">Altitude (ft MSL)</p>
                <div className="h-[110px] w-full">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height={110}>
                      <BarChart
                        data={fleetList.map((u) => ({
                          name: u.uav_id,
                          Altitude: FLEET_GEOLOCATIONS[u.uav_id]?.alt ?? 0,
                          fill: UAV_COLORS[u.uav_id],
                        }))}
                        barSize={28}
                        margin={{ top: 2, right: 8, left: 0, bottom: 2 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis width={36} tick={{ fontSize: 8, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="Altitude" name="Alt (ft)" radius={[4, 4, 0, 0]}>
                          {fleetList.map((u) => <Cell key={u.uav_id} fill={UAV_COLORS[u.uav_id]} fillOpacity={0.70} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[110px] w-full animate-pulse bg-muted/20 rounded" />
                  )}
                </div>
              </div>

              {/* Heading Chart */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-mono">True Heading (degrees °)</p>
                <div className="h-[110px] w-full">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height={110}>
                      <BarChart
                        data={fleetList.map((u) => ({
                          name: u.uav_id,
                          Heading: FLEET_GEOLOCATIONS[u.uav_id]?.hdg ?? 0,
                          fill: UAV_COLORS[u.uav_id],
                        }))}
                        barSize={28}
                        margin={{ top: 2, right: 8, left: 0, bottom: 2 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis width={32} domain={[0, 360]} ticks={[0, 90, 180, 270, 360]}
                          tick={{ fontSize: 8, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="Heading" name="Heading (°)" radius={[4, 4, 0, 0]}>
                          {fleetList.map((u) => <Cell key={u.uav_id} fill={UAV_COLORS[u.uav_id]} fillOpacity={0.60} stroke={UAV_COLORS[u.uav_id]} strokeWidth={1} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[110px] w-full animate-pulse bg-muted/20 rounded" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Time-Series Trend Graph ─────────────────────────────────────── */}
      <Card className="border-border/80 bg-card/80 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold tracking-wide">
                MULTI-UAV TIME-SERIES TREND GRAPH
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Metric selector */}
              <div className="flex items-center gap-1 text-[10px] font-mono">
                {(["Health", "RPM", "CHT"] as const).map((m) => (
                  <button key={m} onClick={() => setTrendMetric(m)}
                    className={`px-2 py-0.5 rounded transition-all border ${
                      trendMetric === m
                        ? "border-primary bg-primary/15 text-primary font-bold"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}>{m}</button>
                ))}
              </div>
              {/* Chart type selector */}
              <div className="flex items-center gap-1 text-[10px] font-mono">
                {(["line", "area"] as const).map((t) => (
                  <button key={t} onClick={() => setTrendType(t)}
                    className={`px-2 py-0.5 rounded transition-all border ${
                      trendType === t
                        ? "border-primary bg-primary/15 text-primary font-bold"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}>{t.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
          <CardDescription className="text-xs">
            {trendMetric === "Health" ? "Engine health index degradation over 30 mission ticks for all 5 airframes."
              : trendMetric === "RPM" ? "Engine RPM envelope over 30 mission ticks — standby UAVs show 0 RPM."
              : "Cylinder head temperature (CHT °C) across 30 mission ticks per airframe."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {mounted ? (
            <ResponsiveContainer width="100%" height={280}>
              {trendType === "line" ? (
                <LineChart data={trendData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="tick"
                    tick={{ fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }}
                    label={{ value: "Mission Tick", position: "insideBottomRight", offset: -4, fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    width={38}
                    domain={trendMetric === "Health" ? [0, 100] : trendMetric === "RPM" ? [0, 6000] : [0, 500]}
                    tick={{ fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                  <Legend wrapperStyle={{ fontSize: "10px", fontFamily: "monospace", color: "hsl(var(--muted-foreground))" }} />
                  {trendMetric === "Health" && (
                    <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1}
                      label={{ value: "WARN", position: "right", fontSize: 8, fill: "#f59e0b" }} />
                  )}
                  {fleetList.map((u) => (
                    <Line
                      key={u.uav_id}
                      type="monotone"
                      dataKey={u.uav_id}
                      name={`${u.uav_id} (${u.call_sign})`}
                      stroke={UAV_COLORS[u.uav_id]}
                      strokeWidth={u.uav_id === activeUavId ? 2.5 : 1.5}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      strokeDasharray={u.uav_id === activeUavId ? undefined : undefined}
                    />
                  ))}
                </LineChart>
              ) : (
                <AreaChart data={trendData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                  <defs>
                    {fleetList.map((u) => (
                      <linearGradient key={`tg-${u.uav_id}`} id={`tg-${u.uav_id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={UAV_COLORS[u.uav_id]} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={UAV_COLORS[u.uav_id]} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="tick"
                    tick={{ fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }}
                    label={{ value: "Mission Tick", position: "insideBottomRight", offset: -4, fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    width={38}
                    domain={trendMetric === "Health" ? [0, 100] : trendMetric === "RPM" ? [0, 6000] : [0, 500]}
                    tick={{ fontSize: 9, fontFamily: "monospace", fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip content={<ChartTooltipContent />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                  <Legend wrapperStyle={{ fontSize: "10px", fontFamily: "monospace", color: "hsl(var(--muted-foreground))" }} />
                  {trendMetric === "Health" && (
                    <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1}
                      label={{ value: "WARN", position: "right", fontSize: 8, fill: "#f59e0b" }} />
                  )}
                  {fleetList.map((u) => (
                    <Area
                      key={u.uav_id}
                      type="monotone"
                      dataKey={u.uav_id}
                      name={`${u.uav_id} (${u.call_sign})`}
                      stroke={UAV_COLORS[u.uav_id]}
                      strokeWidth={u.uav_id === activeUavId ? 2.5 : 1.5}
                      fill={`url(#tg-${u.uav_id})`}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] w-full animate-pulse bg-muted/20 rounded-lg flex items-center justify-center text-xs font-mono text-muted-foreground">
              INITIALIZING TELEMETRY TELEMETRIC CHART…
            </div>
          )}

          {/* Fleet mini legend with current values */}
          <div className="mt-3 grid grid-cols-5 gap-2">
            {fleetList.map((u) => {
              const last = trendData[trendData.length - 1]
              const val  = (last?.[u.uav_id] ?? 0) as number
              const unit = trendMetric === "Health" ? "%" : trendMetric === "RPM" ? " rpm" : " °C"
              return (
                <div key={u.uav_id}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-border/60 bg-muted/20 p-2 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => handleSelectUav(u.uav_id)}
                >
                  <span className="size-2.5 rounded-full" style={{ background: UAV_COLORS[u.uav_id] }} />
                  <span className="text-[9px] font-bold font-mono text-foreground">{u.uav_id}</span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: UAV_COLORS[u.uav_id] }}>
                    {val.toFixed(1)}{unit}
                  </span>
                  <span className="text-[8px] text-muted-foreground font-mono">{u.call_sign}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Charts */}
      <Card className="border-border/80 bg-card/80 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold tracking-wide">MULTI-UAV FLEET COMPARISON</CardTitle>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono">
              <button onClick={() => setChartView("bar")}
                className={`px-2.5 py-1 rounded-md border transition-all ${chartView==="bar" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground"}`}>
                BAR CHART
              </button>
              <button onClick={() => setChartView("radar")}
                className={`px-2.5 py-1 rounded-md border transition-all ${chartView==="radar" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground"}`}>
                SPIDER CHART
              </button>
            </div>
          </div>
          <CardDescription className="text-xs">
            Side-by-side Health, RUL, and Mission Probability comparison across all {fleetList.length} airframes including the new UAV-05 CHARLIE-01.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {chartView === "bar" ? (
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Engine Health Index (%)</p>
                <div className="h-[160px] w-full">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={barData} barSize={32} margin={{ top:4, right:8, left:4, bottom:4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis dataKey="name" tick={{ fontSize:10, fontFamily:"monospace", fill:"hsl(var(--muted-foreground))" }} />
                        <YAxis width={34} domain={[0,100]} tick={{ fontSize:9, fontFamily:"monospace", fill:"hsl(var(--muted-foreground))" }} />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
                        <Bar dataKey="Health" name="Health Index" radius={[4,4,0,0]} unit="%">
                          {barData.map((entry) => <Cell key={entry.name} fill={entry.fill} fillOpacity={0.85} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[160px] w-full animate-pulse bg-muted/20 rounded" />
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Predicted RUL (cycles) vs Mission Completion Probability (%)</p>
                <div className="h-[180px] w-full">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={barData} barGap={4} barCategoryGap="30%" margin={{ top:4, right:8, left:4, bottom:4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                        <XAxis dataKey="name" tick={{ fontSize:10, fontFamily:"monospace", fill:"hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="left" width={34} tick={{ fontSize:9, fontFamily:"monospace", fill:"hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="right" width={34} orientation="right" domain={[0,100]} tick={{ fontSize:9, fontFamily:"monospace", fill:"hsl(var(--muted-foreground))" }} />
                        <Tooltip content={<ChartTooltipContent />} cursor={{ fill:"rgba(255,255,255,0.04)" }} />
                        <Legend wrapperStyle={{ fontSize:"10px", fontFamily:"monospace", paddingTop:"8px", color:"hsl(var(--muted-foreground))" }} />
                        <Bar yAxisId="left"  dataKey="RUL"       name="RUL (cycles)"  radius={[4,4,0,0]}>
                          {barData.map((e) => <Cell key={`rul-${e.name}`} fill={e.fill} fillOpacity={0.75} />)}
                        </Bar>
                        <Bar yAxisId="right" dataKey="Mission %" name="Mission Prob %" radius={[4,4,0,0]}>
                          {barData.map((e) => <Cell key={`mp-${e.name}`} fill={e.fill} fillOpacity={0.40} stroke={e.fill} strokeWidth={1} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[180px] w-full animate-pulse bg-muted/20 rounded" />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 px-1 pt-1">
                {fleetList.map((u) => (
                  <div key={u.uav_id} className="flex items-center gap-1.5 text-[11px] font-mono cursor-pointer hover:opacity-80"
                    onClick={() => handleSelectUav(u.uav_id)}>
                    <span className="size-3 rounded-sm" style={{ background: UAV_COLORS[u.uav_id] }} />
                    <span className="font-bold text-foreground">{u.uav_id}</span>
                    <span className="text-muted-foreground">({u.call_sign})</span>
                    {u.uav_id === "UAV-05" && <Badge variant="outline" className="text-[8px] px-1 py-0 border-violet-500/50 text-violet-400 h-4">NEW</Badge>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Multi-Dimensional Fleet Spider Radar Chart (all axes 0–100)
              </p>
              <div className="h-[340px] w-full">
                {mounted ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <RadarChart data={radarData} margin={{ top:10, right:30, left:30, bottom:10 }}>
                      <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.6} />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize:10, fontFamily:"monospace", fill:"hsl(var(--muted-foreground))" }} />
                      <PolarRadiusAxis domain={[0,100]} tick={{ fontSize:8 }} />
                      {fleetList.map((u) => (
                        <RechartsRadar key={u.uav_id}
                          name={`${u.uav_id} (${u.call_sign})`}
                          dataKey={u.uav_id}
                          stroke={UAV_COLORS[u.uav_id]}
                          fill={UAV_COLORS[u.uav_id]}
                          fillOpacity={0.12}
                          strokeWidth={u.uav_id === activeUavId ? 2.5 : 1.5}
                        />
                      ))}
                      <Legend wrapperStyle={{ fontSize:"10px", fontFamily:"monospace", color:"hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<ChartTooltipContent />} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[340px] w-full animate-pulse bg-muted/20 rounded" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground text-center font-mono mt-1">
                Metrics: Health · RUL/2 (scaled to 100) · Mission Probability · Fault Score · Airborne Status
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telemetry Matrix Table */}
      <Card className="border-border/80 bg-card/80 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold tracking-wide">CROSS-AIRFRAME TELEMETRY MATRIX</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">WEIBULL FLEET PROFILING</Badge>
          </div>
          <CardDescription className="text-xs">
            Side-by-side parametric health and thermodynamic telemetry across all {fleetList.length} active airframe slots.
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
                  <th className="px-3 py-2 text-right">Mission P</th>
                  <th className="px-3 py-2">Condition</th>
                  <th className="px-3 py-2">Alert</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {fleetList.map((uav) => {
                  const isSelected = uav.uav_id === activeUavId
                  const accent = UAV_COLORS[uav.uav_id] ?? "#94a3b8"
                  return (
                    <tr key={`matrix-${uav.uav_id}`}
                      className={`transition-colors cursor-pointer hover:bg-muted/20 ${isSelected ? "font-bold" : ""}`}
                      style={isSelected ? { background:`${accent}12` } : {}}
                      onClick={() => handleSelectUav(uav.uav_id)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background:accent, ...(isSelected ? { boxShadow:`0 0 6px ${accent}` } : {}) }} />
                          <span style={isSelected ? { color:accent } : {}}>{uav.uav_id}</span>
                          {uav.uav_id === "UAV-05" && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-violet-500/50 text-violet-400 ml-1 h-4">NEW</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{uav.call_sign}</td>
                      <td className="px-3 py-2.5 text-foreground">{uav.mission}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${uav.health>70 ? "text-emerald-500" : uav.health>40 ? "text-amber-500" : "text-destructive"}`}>
                        {uav.health}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-foreground">{uav.rul} cyc</td>
                      <td className="px-3 py-2.5 text-right font-bold" style={{ color:accent }}>{uav.mission_probability}%</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{uav.condition}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                          uav.alert==="CRITICAL" ? "border-destructive text-destructive"
                            : uav.alert==="WARNING" ? "border-amber-500 text-amber-500"
                            : "border-emerald-500 text-emerald-500"
                        }`}>{uav.alert}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isSelected ? (
                          <span className="text-[10px] font-bold" style={{ color:accent }}>CONNECTED</span>
                        ) : (
                          <Button variant="ghost" size="sm"
                            onClick={(e) => { e.stopPropagation(); handleSelectUav(uav.uav_id) }}
                            className="h-6 text-[10px] px-2 font-mono text-primary hover:bg-primary/10">
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

      {/* ── DIGITAL TWIN MODEL ACCURACY & BENCHMARK BOX (BOTTOM) ─────────── */}
      <Card className="border-border/80 bg-card/85 shadow-lg backdrop-blur-md overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-primary via-emerald-500 to-cyan-500 opacity-90" />
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary shadow-xs">
                <Cpu className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-sm font-bold tracking-wide text-foreground">
                    DIGITAL TWIN MODEL ACCURACY & INFERENCE BENCHMARK
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/50 bg-emerald-500/10 text-emerald-500">
                    ENSEMBLE ACCURACY: 96.4%
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px] border-primary/40 text-primary">
                    WEIBULL · LSTM · XGB ENSEMBLE
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Real-time validation scores, residual drift metrics, and per-airframe predictive accuracy across all {fleetList.length} operational digital twins.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className="flex items-center gap-1 rounded bg-muted/60 border border-border px-2 py-1 text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                CALIBRATION: VERIFIED (p=0.94)
              </span>
              <span className="rounded bg-muted/60 border border-border px-2 py-1 text-muted-foreground">
                LATENCY: 12.4ms
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 flex flex-col gap-5">
          {/* Top 4 KPI metric cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase">
                <span>Ensemble Accuracy</span>
                <ShieldCheck className="size-3.5 text-emerald-500" />
              </div>
              <div className="my-1 text-2xl font-bold font-mono text-emerald-500">96.4%</div>
              <div className="text-[10px] text-muted-foreground font-mono">Weighted F1 & ROC-AUC score</div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase">
                <span>RUL Predictor MAE</span>
                <TrendingUp className="size-3.5 text-primary" />
              </div>
              <div className="my-1 text-2xl font-bold font-mono text-primary">±4.2 cyc</div>
              <div className="text-[10px] text-muted-foreground font-mono">95% Confidence Band [3.8, 4.6]</div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase">
                <span>Anomaly Detection</span>
                <Gauge className="size-3.5 text-cyan-400" />
              </div>
              <div className="my-1 text-2xl font-bold font-mono text-cyan-400">97.6%</div>
              <div className="text-[10px] text-muted-foreground font-mono">Precision: 98.1% · Recall: 96.9%</div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase">
                <span>Physics Twin Corr.</span>
                <CheckCircle2 className="size-3.5 text-violet-400" />
              </div>
              <div className="my-1 text-2xl font-bold font-mono text-violet-400">0.982 R²</div>
              <div className="text-[10px] text-muted-foreground font-mono">Otto-Cycle thermodynamic fit</div>
            </div>
          </div>

          {/* Per-Airframe Accuracy Table */}
          <div className="rounded-xl border border-border/70 bg-background/50 p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Per-Airframe Multi-Model Predictive Accuracy Matrix
              </p>
              <span className="text-[10px] font-mono text-muted-foreground">Click airframe row to sync twin</span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_75px] gap-x-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/40">
              <span>Airframe</span>
              <span>RUL Predictor</span>
              <span>Anomaly Detect</span>
              <span>Health Index</span>
              <span>Mission Prob</span>
              <span className="text-right">Score</span>
            </div>

            {/* Per-UAV accuracy rows */}
            {[
              { id:"UAV-01", cs:"ALPHA-01",   rul:94.2, ano:97.1, hi:95.8, mp:92.4, overall:94.9 },
              { id:"UAV-02", cs:"ALPHA-02",   rul:91.7, ano:96.3, hi:93.2, mp:89.8, overall:92.8 },
              { id:"UAV-03", cs:"BRAVO-01",   rul:88.4, ano:94.8, hi:90.1, mp:85.3, overall:89.7 },
              { id:"UAV-04", cs:"BRAVO-02",   rul:82.9, ano:93.2, hi:86.5, mp:79.1, overall:85.4 },
              { id:"UAV-05", cs:"CHARLIE-01", rul:96.1, ano:98.2, hi:97.3, mp:95.6, overall:96.8 },
            ].map((row) => {
              const accent = UAV_COLORS[row.id] ?? "#94a3b8"
              const isSelected = row.id === activeUavId
              const metrics = [
                { key:"rul", val:row.rul, label:"RUL" },
                { key:"ano", val:row.ano, label:"Anom" },
                { key:"hi",  val:row.hi,  label:"Health" },
                { key:"mp",  val:row.mp,  label:"Mission" },
              ]
              return (
                <div key={`acc-bot-${row.id}`}
                  className={`grid grid-cols-[100px_1fr_1fr_1fr_1fr_75px] gap-x-3 items-center py-2 px-2.5 rounded-lg transition-all cursor-pointer ${
                    isSelected ? "ring-1 shadow-xs" : "hover:bg-muted/20"
                  }`}
                  style={isSelected ? { background:`${accent}0f`, outline: `1px solid ${accent}66` } : {}}
                  onClick={() => handleSelectUav(row.id)}
                >
                  {/* UAV ID */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background:accent }} />
                      <span className="text-[11px] font-bold font-mono" style={{ color: isSelected ? accent : undefined }}>
                        {row.id}
                      </span>
                      {row.id === "UAV-05" && (
                        <Badge variant="outline" className="text-[7px] px-1 py-0 h-3 border-violet-500/50 text-violet-400">NEW</Badge>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground font-mono pl-3.5">{row.cs}</span>
                  </div>

                  {/* 4 accuracy bars */}
                  {metrics.map((m) => {
                    const color = m.val >= 95 ? "#10b981" : m.val >= 88 ? "#38bdf8" : m.val >= 80 ? "#f59e0b" : "#ef4444"
                    return (
                      <div key={m.key} className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-[9px] font-mono">
                          <span className="text-muted-foreground">{m.label}</span>
                          <span className="font-bold" style={{ color }}>{m.val}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${m.val}%`,
                              background: `linear-gradient(90deg, ${color}99, ${color})`,
                              boxShadow: isSelected ? `0 0 6px ${color}80` : undefined,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}

                  {/* Overall score badge */}
                  <div className="text-right font-mono">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      row.overall >= 95 ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30" :
                      row.overall >= 90 ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" :
                      "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}>
                      {row.overall}%
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Fleet average row */}
            <div className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_75px] gap-x-3 items-center pt-2.5 border-t border-border/50 font-mono text-[10px]">
              <div>
                <span className="font-bold text-foreground">FLEET AVG</span>
              </div>
              {[
                { val: (94.2+91.7+88.4+82.9+96.1)/5, label:"RUL" },
                { val: (97.1+96.3+94.8+93.2+98.2)/5, label:"Anom" },
                { val: (95.8+93.2+90.1+86.5+97.3)/5, label:"Health" },
                { val: (92.4+89.8+85.3+79.1+95.6)/5, label:"Mission" },
              ].map((m, i) => {
                const avg = parseFloat(m.val.toFixed(1))
                const color = avg >= 95 ? "#10b981" : avg >= 88 ? "#38bdf8" : avg >= 80 ? "#f59e0b" : "#ef4444"
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="font-bold" style={{ color }}>{avg}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${avg}%`,
                          background: `linear-gradient(90deg, ${color}cc, ${color})`,
                          boxShadow: `0 0 6px ${color}60`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="text-right">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/30">
                  92.0%
                </span>
              </div>
            </div>
          </div>

          {/* Model Architecture Info Footnote */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="text-[10px] font-bold text-primary mb-0.5">LSTM RUL NETWORK</div>
              <p className="text-[10px] text-muted-foreground leading-normal">
                128 hidden units · 30-step sequence length · Trained on 120k degradation cycles.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="text-[10px] font-bold text-emerald-400 mb-0.5">ISOLATION DETECTOR</div>
              <p className="text-[10px] text-muted-foreground leading-normal">
                Unsupervised anomaly scoring · 200 trees · Contamination rate: 0.01 · &lt;1ms latency.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="text-[10px] font-bold text-cyan-400 mb-0.5">OTTO-CYCLE TWIN</div>
              <p className="text-[10px] text-muted-foreground leading-normal">
                1st-principles thermodynamics · Volumetric efficiency & heat rejection solver.
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="text-[10px] font-bold text-violet-400 mb-0.5">WEIBULL HAZARD</div>
              <p className="text-[10px] text-muted-foreground leading-normal">
                Dynamic shape β: 1.05–2.85 · Characteristic life η: 260h · B10 failure life.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
