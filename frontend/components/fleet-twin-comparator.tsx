"use client"

import * as React from "react"
import {
  Scale,
  ArrowRightLeft,
  Activity,
  Flame,
  Gauge,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
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

const UAV_COLORS: Record<string, string> = {
  "UAV-01": "#10b981",
  "UAV-02": "#38bdf8",
  "UAV-03": "#f59e0b",
  "UAV-04": "#ef4444",
  "UAV-05": "#a78bfa",
}

const AIRFRAME_PHYSICS_SPECS: Record<
  string,
  {
    totalFlightHours: number
    overhaulHistory: string
    weibullBeta: number
    oilPressure: number
    vibrationRms: number
    coolingEfficiency: number
    notes: string
  }
> = {
  "UAV-01": {
    totalFlightHours: 214,
    overhaulHistory: "Standard 200h inspection cleared; fresh synthetic oil",
    weibullBeta: 1.12,
    oilPressure: 49.2,
    vibrationRms: 0.38,
    coolingEfficiency: 96.2,
    notes: "Nominal baseline airframe. Excellent thermal dissipation across all 4 cylinders.",
  },
  "UAV-02": {
    totalFlightHours: 348,
    overhaulHistory: "300h top-end service; minor exhaust valve carbon cleaning",
    weibullBeta: 1.34,
    oilPressure: 47.8,
    vibrationRms: 0.44,
    coolingEfficiency: 93.0,
    notes: "Slight thermal bias on cylinder #3 (+4°C), within normal operational limits.",
  },
  "UAV-03": {
    totalFlightHours: 412,
    overhaulHistory: "Spark plug gap adjustment; fuel filter replaced at 400h",
    weibullBeta: 1.82,
    oilPressure: 44.1,
    vibrationRms: 0.62,
    coolingEfficiency: 86.5,
    notes: "Mid-life degradation profile. Higher vibration harmonics under high manifold boost.",
  },
  "UAV-04": {
    totalFlightHours: 492,
    overhaulHistory: "Overdue for 500h TBO factory rebuild; valve spring fatigue detected",
    weibullBeta: 2.76,
    oilPressure: 38.6,
    vibrationRms: 1.15,
    coolingEfficiency: 74.0,
    notes: "High wear phase. Elevated cylinder head temperature risk and reduced compression ratio.",
  },
  "UAV-05": {
    totalFlightHours: 26,
    overhaulHistory: "Fresh depot delivery; new Rotax 914 F turbocharged core",
    weibullBeta: 1.04,
    oilPressure: 51.4,
    vibrationRms: 0.28,
    coolingEfficiency: 98.8,
    notes: "Peak condition airframe. Tight tolerances, maximum volumetric efficiency.",
  },
}

export function FleetTwinComparator({
  fleetList,
  activeUavId,
  onSelectUav,
}: {
  fleetList: FleetItem[]
  activeUavId: string
  onSelectUav: (uavId: string) => void
}) {
  const [uavAId, setUavAId] = React.useState<string>(activeUavId)
  const [uavBId, setUavBId] = React.useState<string>(() => {
    const alternate = fleetList.find((u) => u.uav_id !== activeUavId)
    return alternate?.uav_id ?? "UAV-05"
  })

  const prevActiveUavRef = React.useRef(activeUavId)

  // Keep uavA in sync ONLY when activeUavId changes externally
  React.useEffect(() => {
    if (prevActiveUavRef.current !== activeUavId) {
      prevActiveUavRef.current = activeUavId
      setUavAId(activeUavId)
      setUavBId((prevB) =>
        prevB === activeUavId
          ? fleetList.find((u) => u.uav_id !== activeUavId)?.uav_id ?? "UAV-05"
          : prevB
      )
    }
  }, [activeUavId, fleetList])

  const handleSwap = () => {
    setUavAId(uavBId)
    setUavBId(uavAId)
  }

  const uavA = fleetList.find((u) => u.uav_id === uavAId) || fleetList[0]
  const uavB = fleetList.find((u) => u.uav_id === uavBId) || fleetList[1] || fleetList[0]

  const specA = AIRFRAME_PHYSICS_SPECS[uavA.uav_id] || AIRFRAME_PHYSICS_SPECS["UAV-01"]
  const specB = AIRFRAME_PHYSICS_SPECS[uavB.uav_id] || AIRFRAME_PHYSICS_SPECS["UAV-05"]

  // Deltas (A - B)
  const deltaHealth = uavA.health - uavB.health
  const deltaRul = uavA.rul - uavB.rul
  const deltaMissionP = uavA.mission_probability - uavB.mission_probability
  const deltaHours = specA.totalFlightHours - specB.totalFlightHours
  const deltaOilP = specA.oilPressure - specB.oilPressure
  const deltaVibe = specA.vibrationRms - specB.vibrationRms
  const deltaCooling = specA.coolingEfficiency - specB.coolingEfficiency

  const colorA = UAV_COLORS[uavA.uav_id] ?? "#10b981"
  const colorB = UAV_COLORS[uavB.uav_id] ?? "#38bdf8"



  return (
    <Card className="border-border/80 bg-card/85 shadow-lg backdrop-blur-md overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500 opacity-90" />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary shadow-xs">
              <Scale className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-bold tracking-wide text-foreground">
                  A/B DIGITAL TWIN DIFFERENTIAL INSPECTOR
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px] border-primary/40 text-primary">
                  SIDE-BY-SIDE PARAMETRIC ANALYSIS
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Comparative physical twin diagnostics, degradation gradients, and thermodynamic margin deltas between any two airframes.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSwap}
              className="h-8 gap-1.5 text-xs font-mono font-medium hover:bg-muted/60"
            >
              <ArrowRightLeft className="size-3.5" />
              <span>SWAP AIRFRAMES</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {/* Airframe Selectors Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Airframe A Header Card */}
          <div
            className="rounded-xl border p-3.5 transition-all bg-card/60"
            style={{ borderColor: `${colorA}60`, background: `${colorA}08` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-muted-foreground">
                REFERENCE AIRFRAME A
              </span>
              <div className="flex items-center gap-1.5">
                {uavA.uav_id === activeUavId ? (
                  <Badge className="font-mono text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    LIVE PRIMARY
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelectUav(uavA.uav_id)}
                    className="h-5 px-1.5 text-[9px] font-mono text-primary hover:bg-primary/10"
                  >
                    MAKE PRIMARY
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: colorA }} />
                <select
                  aria-label="Select Reference Airframe A"
                  value={uavAId}
                  onChange={(e) => setUavAId(e.target.value)}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {fleetList.map((u) => (
                    <option key={`a-${u.uav_id}`} value={u.uav_id} disabled={u.uav_id === uavBId}>
                      {u.uav_id} — {u.call_sign} ({u.mission})
                    </option>
                  ))}
                </select>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]" style={{ color: colorA, borderColor: colorA }}>
                {uavA.condition}
              </Badge>
            </div>
          </div>

          {/* Airframe B Header Card */}
          <div
            className="rounded-xl border p-3.5 transition-all bg-card/60"
            style={{ borderColor: `${colorB}60`, background: `${colorB}08` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-muted-foreground">
                COMPARATIVE AIRFRAME B
              </span>
              <div className="flex items-center gap-1.5">
                {uavB.uav_id === activeUavId ? (
                  <Badge className="font-mono text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    LIVE PRIMARY
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelectUav(uavB.uav_id)}
                    className="h-5 px-1.5 text-[9px] font-mono text-primary hover:bg-primary/10"
                  >
                    MAKE PRIMARY
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: colorB }} />
                <select
                  aria-label="Select Comparative Airframe B"
                  value={uavBId}
                  onChange={(e) => setUavBId(e.target.value)}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {fleetList.map((u) => (
                    <option key={`b-${u.uav_id}`} value={u.uav_id} disabled={u.uav_id === uavAId}>
                      {u.uav_id} — {u.call_sign} ({u.mission})
                    </option>
                  ))}
                </select>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]" style={{ color: colorB, borderColor: colorB }}>
                {uavB.condition}
              </Badge>
            </div>
          </div>
        </div>

        {/* Parametric Delta Comparison Table */}
        <div className="rounded-xl border border-border/70 bg-background/50 overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] border-b border-border/60 bg-muted/30 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
            <span>Parametric Metric</span>
            <span className="text-right" style={{ color: colorA }}>
              {uavA.uav_id}
            </span>
            <span className="text-center text-foreground">Variance (Δ)</span>
            <span className="text-right" style={{ color: colorB }}>
              {uavB.uav_id}
            </span>
          </div>

          <div className="divide-y divide-border/40 font-mono text-xs">
            {/* Health Index */}
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] items-center px-3 py-2 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-emerald-400" />
                <span className="font-semibold text-foreground">Engine Health Index</span>
              </div>
              <div className="text-right font-bold" style={{ color: colorA }}>
                {uavA.health.toFixed(1)}%
              </div>
              <div className="text-center">
                <span
                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    deltaHealth > 0
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : deltaHealth < 0
                      ? "bg-destructive/15 text-destructive border border-destructive/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {deltaHealth > 0 ? `+${deltaHealth.toFixed(1)}%` : `${deltaHealth.toFixed(1)}%`}
                </span>
              </div>
              <div className="text-right font-bold" style={{ color: colorB }}>
                {uavB.health.toFixed(1)}%
              </div>
            </div>

            {/* Predicted RUL */}
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] items-center px-3 py-2 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-2">
                <Gauge className="size-3.5 text-sky-400" />
                <span className="font-semibold text-foreground">Predicted RUL</span>
              </div>
              <div className="text-right font-bold" style={{ color: colorA }}>
                {uavA.rul} cycles
              </div>
              <div className="text-center">
                <span
                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    deltaRul > 0
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : deltaRul < 0
                      ? "bg-destructive/15 text-destructive border border-destructive/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {deltaRul > 0 ? `+${deltaRul} cyc` : `${deltaRul} cyc`}
                </span>
              </div>
              <div className="text-right font-bold" style={{ color: colorB }}>
                {uavB.rul} cycles
              </div>
            </div>

            {/* Mission Completion Probability */}
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] items-center px-3 py-2 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-2">
                <Zap className="size-3.5 text-amber-400" />
                <span className="font-semibold text-foreground">Mission Go Probability</span>
              </div>
              <div className="text-right font-bold" style={{ color: colorA }}>
                {uavA.mission_probability.toFixed(1)}%
              </div>
              <div className="text-center">
                <span
                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    deltaMissionP > 0
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : deltaMissionP < 0
                      ? "bg-destructive/15 text-destructive border border-destructive/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {deltaMissionP > 0 ? `+${deltaMissionP.toFixed(1)}%` : `${deltaMissionP.toFixed(1)}%`}
                </span>
              </div>
              <div className="text-right font-bold" style={{ color: colorB }}>
                {uavB.mission_probability.toFixed(1)}%
              </div>
            </div>

            {/* Cylinder Head Temp */}
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] items-center px-3 py-2 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-2">
                <Flame className="size-3.5 text-rose-400" />
                <span className="font-semibold text-foreground">CHT Core Temperature</span>
              </div>
              <div className="text-right font-bold" style={{ color: colorA }}>
                {uavA.cht ?? 375}°C
              </div>
              <div className="text-center text-[10px] text-muted-foreground">
                Δ {Math.abs((uavA.cht ?? 375) - (uavB.cht ?? 375))}°C
              </div>
              <div className="text-right font-bold" style={{ color: colorB }}>
                {uavB.cht ?? 375}°C
              </div>
            </div>

            {/* Oil Pressure */}
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] items-center px-3 py-2 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-2">
                <Gauge className="size-3.5 text-indigo-400" />
                <span className="font-semibold text-foreground">Lube Oil Pressure</span>
              </div>
              <div className="text-right font-bold" style={{ color: colorA }}>
                {specA.oilPressure.toFixed(1)} psi
              </div>
              <div className="text-center text-[10px] text-muted-foreground">
                Δ {deltaOilP >= 0 ? `+${deltaOilP.toFixed(1)}` : deltaOilP.toFixed(1)} psi
              </div>
              <div className="text-right font-bold" style={{ color: colorB }}>
                {specB.oilPressure.toFixed(1)} psi
              </div>
            </div>

            {/* Total Flight Hours */}
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] items-center px-3 py-2 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-cyan-400" />
                <span className="font-semibold text-foreground">Airframe Flight Hours</span>
              </div>
              <div className="text-right font-bold" style={{ color: colorA }}>
                {specA.totalFlightHours} hrs
              </div>
              <div className="text-center text-[10px] text-muted-foreground">
                {deltaHours > 0 ? `+${deltaHours}h aging` : `${deltaHours}h fresher`}
              </div>
              <div className="text-right font-bold" style={{ color: colorB }}>
                {specB.totalFlightHours} hrs
              </div>
            </div>

            {/* Weibull Hazard Shape */}
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr] items-center px-3 py-2 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-3.5 text-violet-400" />
                <span className="font-semibold text-foreground">Weibull Shape Factor (β)</span>
              </div>
              <div className="text-right font-bold" style={{ color: colorA }}>
                β={specA.weibullBeta.toFixed(2)}
              </div>
              <div className="text-center text-[10px] text-muted-foreground">
                {specA.weibullBeta < specB.weibullBeta ? "A lower hazard" : "B lower hazard"}
              </div>
              <div className="text-right font-bold" style={{ color: colorB }}>
                β={specB.weibullBeta.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* AI Differential Physics Diagnosis */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-wider">
            <Sparkles className="size-4" />
            <span>AI Physical Twin Variance Assessment ({uavA.uav_id} vs {uavB.uav_id})</span>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed font-sans">
            {deltaHealth >= 15
              ? `${uavA.uav_id} maintains a substantial +${deltaHealth.toFixed(
                  0
                )}% health advantage over ${uavB.uav_id}. ${specA.notes} Meanwhile, ${
                  uavB.uav_id
                } demonstrates ${specB.notes.toLowerCase()}`
              : deltaHealth <= -15
              ? `${uavB.uav_id} holds a +${Math.abs(deltaHealth).toFixed(
                  0
                )}% health margin over ${uavA.uav_id}. ${specB.notes} ${uavA.uav_id} exhibits ${specA.notes.toLowerCase()}`
              : `Both airframes ${uavA.uav_id} and ${uavB.uav_id} operate in comparable wear regimes with a minor ${Math.abs(
                  deltaHealth
                ).toFixed(1)}% delta. ${specA.notes}`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px] font-mono text-muted-foreground border-t border-primary/20">
            <div>
              <span className="font-bold text-foreground">{uavA.uav_id} Maintenance: </span>
              <span>{specA.overhaulHistory}</span>
            </div>
            <div>
              <span className="font-bold text-foreground">{uavB.uav_id} Maintenance: </span>
              <span>{specB.overhaulHistory}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
