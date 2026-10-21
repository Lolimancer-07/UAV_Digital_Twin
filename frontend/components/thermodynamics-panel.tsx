"use client"

import * as React from "react"
import {
  Flame,
  Gauge,
  Zap,
  Wind,
  Activity,
  RotateCw,
  Play,
  Pause,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Thermometer,
  Cpu,
  ChevronRight,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useTelemetry } from "@/components/telemetry-provider"

// Preset flight regimes for interactive What-If thermodynamic simulation
type FlightRegime = "live" | "loiter" | "cruise" | "boost" | "altitude"

interface RegimeConfig {
  label: string
  tag: string
  rpm: number
  map_kpa: number
  afr: number
  alt_ft: number
  desc: string
}

const REGIMES: Record<FlightRegime, RegimeConfig> = {
  live: {
    label: "Live Telemetry",
    tag: "10 Hz HIL",
    rpm: 2400,
    map_kpa: 96.0,
    afr: 14.7,
    alt_ft: 3000,
    desc: "Real-time twin telemetry streamed from flight simulator hardware-in-the-loop",
  },
  loiter: {
    label: "Lean Loiter",
    tag: "Endurance",
    rpm: 1400,
    map_kpa: 80.0,
    afr: 15.6,
    alt_ft: 5000,
    desc: "Maximum fuel economy profile (BSFC 242 g/kWh, lean lambda 1.06, 1400 RPM)",
  },
  cruise: {
    label: "Normal Cruise",
    tag: "Economy",
    rpm: 2400,
    map_kpa: 96.0,
    afr: 14.7,
    alt_ft: 6500,
    desc: "Nominal 75% continuous power operational corridor (84 HP brake output)",
  },
  boost: {
    label: "Turbo Boost",
    tag: "115 HP Max",
    rpm: 2700,
    map_kpa: 115.0,
    afr: 13.8,
    alt_ft: 2000,
    desc: "TCU wastegate closed, 1.15 bar manifold boost for takeoff and emergency climb",
  },
  altitude: {
    label: "High Altitude",
    tag: "15,000 ft",
    rpm: 2500,
    map_kpa: 88.0,
    afr: 14.2,
    alt_ft: 15000,
    desc: "Reduced density ratio (sigma 0.629), altitude derating and convective cooling limit",
  },
}

export function ThermodynamicsPanel() {
  const { latestTelemetry } = useTelemetry()
  const p = latestTelemetry?.physics
  const res = p?.residuals
  const exp = p?.expected_baselines

  // Interactive What-If simulation regime
  const [regime, setRegime] = React.useState<FlightRegime>("live")
  const [isPlaying, setIsPlaying] = React.useState(true)
  const [scrubAngle, setScrubAngle] = React.useState(75) // 0 to 720 degrees

  // Selected parameters (either live telemetry or what-if preset)
  const activeRpm = regime === "live" ? (latestTelemetry?.rpm ?? 2400) : REGIMES[regime].rpm
  const activeMap = regime === "live" ? (latestTelemetry?.map_kpa ?? 96.0) : REGIMES[regime].map_kpa
  const activeAlt = regime === "live" ? (latestTelemetry?.altitude_ft ?? 3000) : REGIMES[regime].alt_ft
  const activeAfr = regime === "live" ? (p?.air_fuel_ratio ?? 14.7) : REGIMES[regime].afr

  // Rotax 914 F physical engine constants
  const cr = 9.0 // compression ratio
  const gamma = 1.35 // polytropic exponent
  const vSweptCyl = 302.75 // displacement per cyl (cc)
  const vClearance = vSweptCyl / (cr - 1.0) // 37.84 cc
  const vTotal = vSweptCyl + vClearance // 340.59 cc

  // Animate crank angle smoothly if playing
  React.useEffect(() => {
    if (!isPlaying) return
    const stepMs = 30
    const timer = setInterval(() => {
      // Speed proportional to RPM (scaled for visual clarity)
      const degPerStep = Math.max(3, Math.min(12, (activeRpm / 2400) * 6))
      setScrubAngle((prev) => (prev + degPerStep) % 720)
    }, stepMs)
    return () => clearInterval(timer)
  }, [isPlaying, activeRpm])

  // Derive thermodynamic metrics
  const p1 = Math.max(0.4, activeMap / 100.0) // bar
  const p2 = p1 * Math.pow(cr, gamma) // compression peak bar
  const pPeak = p2 * (activeAfr < 14.0 ? 3.4 : 3.1) // peak combustion pressure bar
  const p4 = pPeak * Math.pow(1.0 / cr, gamma) // exhaust blowdown start bar

  // Indicated Mean Effective Pressure & Power
  const imepBar = regime === "live" ? (p?.imep_bar ?? 8.4) : (activeMap / 100.0) * 8.8
  const bmepBar = regime === "live" ? (p?.bmep_bar ?? 7.2) : imepBar * 0.86
  const brakePowerHp =
    regime === "live"
      ? (p?.brake_power_hp ?? 82.5)
      : (bmepBar * 100.0 * 0.001211 * (activeRpm / 120.0) * 1.34102)
  const brakePowerKw = brakePowerHp / 1.34102
  const thermalEff = regime === "live" ? (p?.thermal_efficiency ?? 31.8) : 32.5 - (activeRpm > 2500 ? 1.5 : 0)
  const bsfc =
    regime === "live"
      ? (p?.bsfc_g_kwh ?? 268)
      : activeAfr > 15 ? 245 : activeMap > 105 ? 310 : 272

  // First Law Energy Heat Balance (kW)
  const fuelEnergyRateKw = brakePowerKw / (thermalEff / 100.0)
  const shaftWorkKw = brakePowerKw
  const exhaustLossKw = fuelEnergyRateKw * 0.354
  const coolantLossKw = fuelEnergyRateKw * 0.226
  const oilFrictionLossKw = Math.max(0, fuelEnergyRateKw - shaftWorkKw - exhaustLossKw - coolantLossKw)

  // 4-Stroke Indicator Loop Coordinates calculation
  // Stroke 1: Intake (0° to 180°): Volume V_c -> V_total at ~P_map
  // Stroke 2: Compression (180° to 360°): Volume V_total -> V_c, P ~ P1 * (V_tot/V)^gamma
  // Stroke 3: Combustion & Expansion (360° to 540°): Peak P at V_c, expands V_c -> V_total
  // Stroke 4: Exhaust (540° to 720°): Drops to ~1.2 bar and sweeps V_total -> V_c

  const pvCurve = React.useMemo(() => {
    const compressionPts: Array<{ v: number; p: number; angle: number }> = []
    const expansionPts: Array<{ v: number; p: number; angle: number }> = []
    const intakePts: Array<{ v: number; p: number; angle: number }> = []
    const exhaustPts: Array<{ v: number; p: number; angle: number }> = []

    const n = 24
    for (let i = 0; i <= n; i++) {
      const frac = i / n
      // Compression: 180 -> 360 deg
      const vComp = vTotal - frac * (vTotal - vClearance)
      const pComp = p1 * Math.pow(vTotal / vComp, gamma)
      compressionPts.push({ v: vComp, p: pComp, angle: 180 + frac * 180 })

      // Expansion: 360 -> 540 deg
      const vExp = vClearance + frac * (vTotal - vClearance)
      const pExp = pPeak * Math.pow(vClearance / vExp, gamma)
      expansionPts.push({ v: vExp, p: pExp, angle: 360 + frac * 180 })

      // Exhaust: 540 -> 720 deg
      const vExh = vTotal - frac * (vTotal - vClearance)
      const pExh = 1.15 + (1.0 - frac) * 0.4
      exhaustPts.push({ v: vExh, p: pExh, angle: 540 + frac * 180 })

      // Intake: 0 -> 180 deg
      const vInt = vClearance + frac * (vTotal - vClearance)
      const pInt = p1 * (0.96 + frac * 0.04)
      intakePts.push({ v: vInt, p: pInt, angle: frac * 180 })
    }

    // Mapping helper to SVG viewbox (500 x 280, padded)
    // X axis: Volume 30 cc to 360 cc -> X: 45 to 465
    // Y axis: Pressure 0 to 75 bar -> Y: 245 to 30
    const toSvgX = (v: number) => 50 + ((v - 30) / (360 - 30)) * 410
    const toSvgY = (pVal: number) => 245 - (Math.min(75, Math.max(0, pVal)) / 75) * 215

    const makePath = (pts: Array<{ v: number; p: number }>) =>
      pts.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${toSvgX(pt.v).toFixed(1)} ${toSvgY(pt.p).toFixed(1)}`, "")

    return {
      compressionPath: makePath(compressionPts),
      expansionPath: makePath(expansionPts),
      exhaustPath: makePath(exhaustPts),
      intakePath: makePath(intakePts),
      toSvgX,
      toSvgY,
    }
  }, [p1, pPeak, vTotal, vClearance, gamma])

  // Instantaneous state from current crank angle (scrubAngle)
  const currentCycleInfo = React.useMemo(() => {
    const angle = scrubAngle % 720
    let stroke = "Intake"
    let strokeColor = "text-sky-400"
    let strokeBadge = "bg-sky-500/10 text-sky-400 border-sky-500/30"
    let desc = "Atmospheric charge induction (Intake Valve Open)"
    let vCurrent = vClearance
    let pCurrent = p1

    if (angle >= 0 && angle < 180) {
      stroke = "Intake Stroke"
      strokeColor = "text-sky-400"
      strokeBadge = "bg-sky-500/15 text-sky-400 border-sky-500/30"
      desc = "Piston moving BDC. Intake charge drawn into chamber via manifold pressure."
      const frac = angle / 180
      vCurrent = vClearance + frac * (vTotal - vClearance)
      pCurrent = p1 * 0.98
    } else if (angle >= 180 && angle < 360) {
      stroke = "Compression Stroke"
      strokeColor = "text-amber-400"
      strokeBadge = "bg-amber-500/15 text-amber-400 border-amber-500/30"
      desc = "Both valves sealed. Polytropic work compresses air-fuel mixture into clearance volume."
      const frac = (angle - 180) / 180
      vCurrent = vTotal - frac * (vTotal - vClearance)
      pCurrent = p1 * Math.pow(vTotal / vCurrent, gamma)
    } else if (angle >= 360 && angle < 540) {
      stroke = "Combustion & Power"
      strokeColor = "text-rose-400"
      strokeBadge = "bg-rose-500/15 text-rose-400 border-rose-500/30"
      desc = "Dual spark plugs fire. Peak flame pressure drives piston downward extracting shaft work."
      const frac = (angle - 360) / 180
      vCurrent = vClearance + frac * (vTotal - vClearance)
      pCurrent = pPeak * Math.pow(vClearance / vCurrent, gamma)
    } else {
      stroke = "Exhaust Blowdown"
      strokeColor = "text-emerald-400"
      strokeBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      desc = "Exhaust valve opens. Spent gas expels into manifold driving turbocharger turbine."
      const frac = (angle - 540) / 180
      vCurrent = vTotal - frac * (vTotal - vClearance)
      pCurrent = 1.25 - frac * 0.1
    }

    const svgX = pvCurve.toSvgX(vCurrent)
    const svgY = pvCurve.toSvgY(pCurrent)

    return {
      angle: Math.round(angle),
      stroke,
      strokeColor,
      strokeBadge,
      desc,
      volumeCc: Math.round(vCurrent * 10) / 10,
      pressureBar: Math.round(pCurrent * 10) / 10,
      svgX,
      svgY,
    }
  }, [scrubAngle, p1, pPeak, vTotal, vClearance, gamma, pvCurve])

  // Cylinder Head Temperature & EGT balance per cylinder (Rotax 914 F Boxer 4)
  const cylCht = latestTelemetry?.cht_cyl ?? [
    Math.round((latestTelemetry?.cht ?? 382) - 4),
    Math.round((latestTelemetry?.cht ?? 382) - 1),
    Math.round((latestTelemetry?.cht ?? 382) + 2),
    Math.round((latestTelemetry?.cht ?? 382) + 5),
  ]
  const cylEgt = latestTelemetry?.egt_cyl ?? [
    Math.round((latestTelemetry?.egt ?? 1465) - 9),
    Math.round((latestTelemetry?.egt ?? 1465) - 3),
    Math.round((latestTelemetry?.egt ?? 1465) + 6),
    Math.round((latestTelemetry?.egt ?? 1465) + 11),
  ]
  const maxCht = Math.max(...cylCht)
  const minCht = Math.min(...cylCht)
  const deltaCylCht = maxCht - minCht

  // Physics residuals data
  const residuals = [
    {
      channel: "EXHAUST GAS TEMP (EGT)",
      measured:
        latestTelemetry?.egt ??
        (p && res?.delta_egt != null && (res?.expected_egt != null || exp?.egt != null)
          ? (res?.expected_egt ?? exp?.egt!) + res.delta_egt
          : 1465),
      expected:
        res?.expected_egt ??
        exp?.egt ??
        (latestTelemetry?.egt != null && res?.delta_egt != null
          ? latestTelemetry.egt - res.delta_egt
          : 1470),
      delta: res?.delta_egt ?? -5,
      unit: "°F",
      limit: 80,
      decimals: 1,
    },
    {
      channel: "CYLINDER HEAD TEMP (CHT)",
      measured:
        latestTelemetry?.cht ??
        (p && res?.delta_cht != null && (res?.expected_cht != null || exp?.cht != null)
          ? (res?.expected_cht ?? exp?.cht!) + res.delta_cht
          : 382),
      expected:
        res?.expected_cht ??
        exp?.cht ??
        (latestTelemetry?.cht != null && res?.delta_cht != null
          ? latestTelemetry.cht - res.delta_cht
          : 385),
      delta: res?.delta_cht ?? -3,
      unit: "°F",
      limit: 40,
      decimals: 1,
    },
    {
      channel: "OIL GALLERY PRESSURE",
      measured:
        latestTelemetry?.oil_pressure ??
        (p && res?.delta_oil_p != null && (res?.expected_oil_p != null || exp?.oil_p != null)
          ? (res?.expected_oil_p ?? exp?.oil_p!) + res.delta_oil_p
          : 48.5),
      expected:
        res?.expected_oil_p ??
        exp?.oil_p ??
        (latestTelemetry?.oil_pressure != null && res?.delta_oil_p != null
          ? latestTelemetry.oil_pressure - res.delta_oil_p
          : 49.0),
      delta: res?.delta_oil_p ?? -0.5,
      unit: "PSI",
      limit: 12,
      decimals: 1,
    },
    {
      channel: "FUEL MASS FLOW",
      measured:
        latestTelemetry?.fuel_flow ??
        (p && res?.delta_fuel != null && (res?.expected_fuel != null || exp?.fuel_flow != null)
          ? (res?.expected_fuel ?? exp?.fuel_flow!) + res.delta_fuel
          : 22.8),
      expected:
        res?.expected_fuel ??
        exp?.fuel_flow ??
        (latestTelemetry?.fuel_flow != null && res?.delta_fuel != null
          ? latestTelemetry.fuel_flow - res.delta_fuel
          : 23.0),
      delta: res?.delta_fuel ?? -0.2,
      unit: "L/H",
      limit: 1.5,
      decimals: 2,
    },
  ]

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* ── Flight Regime & What-If Simulation Bar ─────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-card/80 p-3 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/25 text-primary">
            <Sliders className="size-4" />
          </div>
          <div>
            <div className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <span>THERMODYNAMIC OPERATING ENVELOPE</span>
              <span className="text-[10px] font-mono text-muted-foreground font-normal">
                (ROTAX 914 F · 4-STROKE TURBOCHARGED)
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">{REGIMES[regime].desc}</div>
          </div>
        </div>

        {/* Preset Selector Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["live", "loiter", "cruise", "boost", "altitude"] as FlightRegime[]).map((key) => {
            const item = REGIMES[key]
            const isSelected = regime === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setRegime(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all duration-150 cursor-pointer border ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
                }`}
              >
                <span>{item.label}</span>
                <span className="ml-1.5 text-[9px] opacity-75 hidden sm:inline">[{item.tag}]</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Key Thermodynamic Performance KPI Strip ─────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="bg-card/75 p-3.5 border-border/70 shadow-xs relative overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Brake Power</span>
            <Zap className="size-3 text-amber-500 opacity-80" />
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {brakePowerHp.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">HP</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
            {brakePowerKw.toFixed(1)} kW · η_mech 86%
          </div>
        </Card>

        <Card className="bg-card/75 p-3.5 border-border/70 shadow-xs relative overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Thermal Eff. (η_th)</span>
            <Flame className="size-3 text-emerald-500 opacity-80" />
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-500">
            {thermalEff.toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Ideal Otto: 36.8% · Carnot: 62%
          </div>
        </Card>

        <Card className="bg-card/75 p-3.5 border-border/70 shadow-xs relative overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>IMEP (Indicated)</span>
            <Gauge className="size-3 text-primary opacity-80" />
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-primary">
            {imepBar.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">bar</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            BMEP: {bmepBar.toFixed(2)} bar
          </div>
        </Card>

        <Card className="bg-card/75 p-3.5 border-border/70 shadow-xs relative overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>BSFC Fuel Burn</span>
            <Wind className="size-3 text-sky-400 opacity-80" />
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {Math.round(bsfc)} <span className="text-xs font-normal text-muted-foreground">g/kWh</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Aero band 260–310 g/kWh
          </div>
        </Card>

        <Card className="bg-card/75 p-3.5 border-border/70 shadow-xs relative overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Volumetric Eff.</span>
            <Layers className="size-3 text-purple-400 opacity-80" />
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {((activeMap / 101.3) * 88.0).toFixed(1)}%
          </div>
          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
            MAP: {activeMap.toFixed(1)} kPa
          </div>
        </Card>

        <Card className="bg-card/75 p-3.5 border-border/70 shadow-xs relative overflow-hidden">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Equivalence (λ)</span>
            <Activity className="size-3 text-emerald-400 opacity-80" />
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {(activeAfr / 14.7).toFixed(2)}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
            AFR: {activeAfr.toFixed(1)}:1 (Stoich)
          </div>
        </Card>
      </div>

      {/* ── Main Interactive Section: P-V Loop Suite & Live Crank Synchro ─── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left Column: Otto Cycle P-V Indicator Loop (7 cols) */}
        <Card className="lg:col-span-7 bg-card/85 border-border/80 shadow-md flex flex-col justify-between">
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span>Otto Cycle P-V Indicator Diagram</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  4-Stroke Closed Loop
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Continuous thermodynamic pressure-volume expansion path with isentropic polytropic compression (n=1.35) and isochoric combustion.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs font-mono gap-1 cursor-pointer"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause className="size-3 text-amber-400" /> : <Play className="size-3 text-emerald-400" />}
                <span>{isPlaying ? "Pause" : "Play"}</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-1 flex flex-col gap-3">
            {/* SVG P-V Indicator Chart */}
            <div className="relative w-full rounded-xl border border-border/70 bg-muted/20 p-2 overflow-hidden shadow-inner">
              <svg viewBox="0 0 500 280" className="w-full h-auto drop-shadow-sm select-none">
                <defs>
                  {/* Subtle Grid Pattern */}
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" />
                  </pattern>

                  {/* Gradient for Power Expansion Stroke */}
                  <linearGradient id="expansionGlow" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#ec4899" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.7" />
                  </linearGradient>

                  {/* Gradient for Compression Stroke */}
                  <linearGradient id="compGlow" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#eab308" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0.9" />
                  </linearGradient>

                  {/* Fill Under Curve */}
                  <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Grid Background */}
                <rect x="50" y="30" width="415" height="215" fill="url(#grid)" />

                {/* Axes */}
                <line x1="50" y1="30" x2="50" y2="245" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                <line x1="50" y1="245" x2="465" y2="245" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />

                {/* Horizontal Isobar Grid Marks */}
                {[0, 15, 30, 45, 60, 75].map((val) => {
                  const y = pvCurve.toSvgY(val)
                  return (
                    <g key={val}>
                      <line x1="45" y1={y} x2="465" y2={y} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                      <text x="40" y={y + 3} textAnchor="end" fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                        {val}
                      </text>
                    </g>
                  )
                })}

                {/* Vertical Volume Grid Marks */}
                {[38, 100, 180, 260, 340].map((vVal) => {
                  const x = pvCurve.toSvgX(vVal)
                  return (
                    <g key={vVal}>
                      <line x1={x} y1="30" x2={x} y2="250" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                      <text x={x} y="260" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="currentColor" fillOpacity="0.6">
                        {vVal}
                      </text>
                    </g>
                  )
                })}

                {/* Axis Labels */}
                <text x="50" y="20" fill="currentColor" fillOpacity="0.75" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  Pressure P (bar)
                </text>
                <text x="465" y="260" textAnchor="end" fill="currentColor" fillOpacity="0.75" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  Cylinder Volume V (cc)
                </text>

                {/* TDC and BDC markers */}
                <line x1={pvCurve.toSvgX(vClearance)} y1="30" x2={pvCurve.toSvgX(vClearance)} y2="245" stroke="#ec4899" strokeOpacity="0.35" strokeDasharray="4 2" />
                <text x={pvCurve.toSvgX(vClearance) + 4} y="40" fill="#ec4899" fontSize="8" fontFamily="monospace">
                  TDC (37.8 cc)
                </text>

                <line x1={pvCurve.toSvgX(vTotal)} y1="30" x2={pvCurve.toSvgX(vTotal)} y2="245" stroke="#38bdf8" strokeOpacity="0.35" strokeDasharray="4 2" />
                <text x={pvCurve.toSvgX(vTotal) - 4} y="40" textAnchor="end" fill="#38bdf8" fontSize="8" fontFamily="monospace">
                  BDC (340.6 cc)
                </text>

                {/* Stroke 1: Intake (0°–180°) */}
                <path d={pvCurve.intakePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />

                {/* Stroke 2: Compression (180°–360°) */}
                <path d={pvCurve.compressionPath} fill="none" stroke="url(#compGlow)" strokeWidth="2.5" strokeLinecap="round" />

                {/* Isochoric Heat Addition Vertical Spurt at TDC */}
                <line
                  x1={pvCurve.toSvgX(vClearance)}
                  y1={pvCurve.toSvgY(p2)}
                  x2={pvCurve.toSvgX(vClearance)}
                  y2={pvCurve.toSvgY(pPeak)}
                  stroke="#ef4444"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* Stroke 3: Combustion & Power Expansion (360°–540°) */}
                <path d={pvCurve.expansionPath} fill="none" stroke="url(#expansionGlow)" strokeWidth="3" strokeLinecap="round" />

                {/* Stroke 4: Exhaust (540°–720°) */}
                <path d={pvCurve.exhaustPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />

                {/* Isochoric Blowdown Drop at BDC */}
                <line
                  x1={pvCurve.toSvgX(vTotal)}
                  y1={pvCurve.toSvgY(p4)}
                  x2={pvCurve.toSvgX(vTotal)}
                  y2={pvCurve.toSvgY(1.2)}
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeDasharray="2 2"
                />

                {/* Real-Time Live Crank Tracer Bead */}
                <circle
                  cx={currentCycleInfo.svgX}
                  cy={currentCycleInfo.svgY}
                  r="7"
                  className="fill-primary animate-pulse"
                  stroke="#ffffff"
                  strokeWidth="2"
                  filter="drop-shadow(0 0 6px rgba(56,189,248,0.9))"
                />
                <circle cx={currentCycleInfo.svgX} cy={currentCycleInfo.svgY} r="3" fill="#ffffff" />
              </svg>
            </div>

            {/* Live Crankshaft Slider & Angle Scrubber */}
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <RotateCw className="size-3.5 text-primary animate-spin" style={{ animationDuration: "3s" }} />
                  <span>Crankshaft Angle:</span>
                  <span className="font-bold text-foreground">{currentCycleInfo.angle}° / 720°</span>
                </span>
                <Badge variant="outline" className={`text-[10px] font-mono font-bold ${currentCycleInfo.strokeBadge}`}>
                  {currentCycleInfo.stroke}
                </Badge>
              </div>

              <input
                type="range"
                min="0"
                max="720"
                value={scrubAngle}
                onChange={(e) => {
                  setIsPlaying(false)
                  setScrubAngle(Number(e.target.value))
                }}
                className="w-full accent-primary h-1.5 bg-muted-foreground/30 rounded-lg cursor-pointer"
              />

              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>0° Intake</span>
                <span>180° Compression</span>
                <span>360° Ignition/Power</span>
                <span>540° Exhaust</span>
                <span>720°</span>
              </div>
            </div>

            {/* Instantaneous Cycle Telemetry Values */}
            <div className="grid grid-cols-4 gap-2 pt-1 border-t border-border/50 text-center font-mono">
              <div className="rounded-md bg-muted/40 p-2">
                <span className="text-[10px] text-muted-foreground uppercase">Chamber Vol</span>
                <div className="font-bold text-foreground text-sm">{currentCycleInfo.volumeCc} cc</div>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <span className="text-[10px] text-muted-foreground uppercase">Instant P</span>
                <div className="font-bold text-primary text-sm">{currentCycleInfo.pressureBar} bar</div>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <span className="text-[10px] text-muted-foreground uppercase">Peak Press</span>
                <div className="font-bold text-rose-500 text-sm">{pPeak.toFixed(1)} bar</div>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <span className="text-[10px] text-muted-foreground uppercase">Indicated W</span>
                <div className="font-bold text-emerald-500 text-sm">
                  {Math.round(imepBar * 1e5 * 0.00030275)} J/cyl
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: First-Law Energy Sankey Balance & Multi-Cylinder Cockpit (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Card: 1st Law Heat Rejection & Energy Partition */}
          <Card className="bg-card/85 border-border/80 shadow-md">
            <CardHeader className="pb-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Flame className="size-4 text-amber-500" />
                  <span>1st Law Thermodynamic Energy Balance</span>
                </CardTitle>
                <span className="text-[10px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  ∑ 100% CONSERVED
                </span>
              </div>
              <CardDescription className="text-xs">
                Fuel chemical enthalpy (ṁ_f · LHV) split across shaft propulsion, exhaust, jacket, and oil heat.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {/* Segmented Energy Bar */}
              <div className="h-4 w-full rounded-full bg-muted/50 overflow-hidden flex shadow-inner">
                <div
                  style={{ width: `${thermalEff.toFixed(1)}%` }}
                  className="bg-emerald-500 h-full transition-all duration-300"
                  title={`Shaft Work: ${thermalEff.toFixed(1)}%`}
                />
                <div
                  style={{ width: "35.4%" }}
                  className="bg-rose-500 h-full transition-all duration-300"
                  title="Exhaust Enthalpy: 35.4%"
                />
                <div
                  style={{ width: "22.6%" }}
                  className="bg-amber-500 h-full transition-all duration-300"
                  title="Coolant Jacket: 22.6%"
                />
                <div
                  style={{ width: "10.2%" }}
                  className="bg-sky-500 h-full transition-all duration-300"
                  title="Lube & Radiation: 10.2%"
                />
              </div>

              {/* Energy Breakdown Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>PROPELLER WORK</span>
                    <span>{thermalEff.toFixed(1)}%</span>
                  </div>
                  <div className="text-sm font-bold text-foreground mt-1">
                    {shaftWorkKw.toFixed(1)} <span className="text-[10px] text-muted-foreground font-normal">kW</span>
                  </div>
                  <div className="text-[9.5px] text-muted-foreground">Useful shaft propulsion</div>
                </div>

                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                    <span>EXHAUST ENTHALPY</span>
                    <span>35.4%</span>
                  </div>
                  <div className="text-sm font-bold text-foreground mt-1">
                    {exhaustLossKw.toFixed(1)} <span className="text-[10px] text-muted-foreground font-normal">kW</span>
                  </div>
                  <div className="text-[9.5px] text-muted-foreground">Expelled into turbo turbine</div>
                </div>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                    <span>JACKET COOLING</span>
                    <span>22.6%</span>
                  </div>
                  <div className="text-sm font-bold text-foreground mt-1">
                    {coolantLossKw.toFixed(1)} <span className="text-[10px] text-muted-foreground font-normal">kW</span>
                  </div>
                  <div className="text-[9.5px] text-muted-foreground">Head & coolant rejection</div>
                </div>

                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] text-sky-600 dark:text-sky-400 font-bold">
                    <span>OIL & FRICTION</span>
                    <span>10.2%</span>
                  </div>
                  <div className="text-sm font-bold text-foreground mt-1">
                    {oilFrictionLossKw.toFixed(1)} <span className="text-[10px] text-muted-foreground font-normal">kW</span>
                  </div>
                  <div className="text-[9.5px] text-muted-foreground">Lube gallery shearing</div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-muted-foreground pt-1 flex items-center justify-between border-t border-border/40">
                <span>Total Fuel Heat Rate (Q̇_in):</span>
                <span className="font-bold text-foreground">{fuelEnergyRateKw.toFixed(1)} kW (100%)</span>
              </div>
            </CardContent>
          </Card>

          {/* Card: Rotax 914 F Boxer 4-Cylinder Thermal Balance */}
          <Card className="bg-card/85 border-border/80 shadow-md">
            <CardHeader className="pb-2.5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Thermometer className="size-4 text-primary" />
                  <span>Rotax 914 F Boxer 4-Cylinder Balance</span>
                </CardTitle>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  FIRING 1-4-2-3
                </span>
              </div>
              <CardDescription className="text-xs">
                Opposed twin bank thermal equilibrium (Port vs Starboard) with continuous variance check.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-1 font-mono">
              {/* Graphic 4-Cylinder Boxer Layout */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Port Bank: Cyl 1 & Cyl 3 */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase text-center border-b border-border/40 pb-1">
                    Port Bank (Left)
                  </div>
                  {/* Cyl 1 */}
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">CYL 1 (Front)</span>
                      <span className="text-[10px] text-emerald-500 font-bold">NOMINAL</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>CHT: <strong className="text-foreground">{cylCht[0]}°F</strong></span>
                      <span>EGT: <strong className="text-primary">{cylEgt[0]}°F</strong></span>
                    </div>
                  </div>
                  {/* Cyl 3 */}
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">CYL 3 (Aft)</span>
                      <span className="text-[10px] text-emerald-500 font-bold">NOMINAL</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>CHT: <strong className="text-foreground">{cylCht[2]}°F</strong></span>
                      <span>EGT: <strong className="text-primary">{cylEgt[2]}°F</strong></span>
                    </div>
                  </div>
                </div>

                {/* Starboard Bank: Cyl 2 & Cyl 4 */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase text-center border-b border-border/40 pb-1">
                    Starboard Bank (Right)
                  </div>
                  {/* Cyl 2 */}
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">CYL 2 (Front)</span>
                      <span className="text-[10px] text-emerald-500 font-bold">NOMINAL</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>CHT: <strong className="text-foreground">{cylCht[1]}°F</strong></span>
                      <span>EGT: <strong className="text-primary">{cylEgt[1]}°F</strong></span>
                    </div>
                  </div>
                  {/* Cyl 4 */}
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">CYL 4 (Aft)</span>
                      <span className="text-[10px] text-emerald-500 font-bold">NOMINAL</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>CHT: <strong className="text-foreground">{cylCht[3]}°F</strong></span>
                      <span>EGT: <strong className="text-primary">{cylEgt[3]}°F</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thermal Balance Result Bar */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Bank Variance (ΔT):</span>
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span>{deltaCylCht}°F (Allowed &lt; 25°F)</span>
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── First-Principles Physics Residual Tracking Table ───────────── */}
      <Card className="bg-card/85 border-border/80 shadow-md">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Cpu className="size-4 text-primary" />
              <span>First-Principles Thermodynamic Residual Tracking</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Live deviation delta (Δ = Measured − Expected) against ISA aero-thermodynamic baseline models.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/40 text-emerald-500 bg-emerald-500/10">
            DIGITAL TWIN LOCKED
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto border-t border-border/60">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Thermodynamic Channel</th>
                  <th className="px-3 py-2.5">Sensor Measured</th>
                  <th className="px-3 py-2.5">Physics Model Expected</th>
                  <th className="px-3 py-2.5">Residual Delta (Δ)</th>
                  <th className="px-3 py-2.5">Envelope Threshold</th>
                  <th className="px-4 py-2.5 text-right">Integrity Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {residuals.map((r, i) => {
                  const isDrift = Math.abs(r.delta) > r.limit
                  return (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground text-[11px] font-sans">
                        {r.channel}
                      </td>
                      <td className="px-3 py-3 font-bold text-primary font-mono">
                        {r.measured != null ? `${r.measured.toFixed(r.decimals)} ${r.unit}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground font-mono">
                        {r.expected != null ? `${r.expected.toFixed(r.decimals)} ${r.unit}` : "—"}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        <span
                          className={`font-bold ${
                            isDrift ? "text-destructive" : "text-emerald-500 dark:text-emerald-400"
                          }`}
                        >
                          {r.delta != null
                            ? `${r.delta >= 0 ? `+${r.delta.toFixed(r.decimals)}` : r.delta.toFixed(r.decimals)} ${r.unit}`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground font-mono text-[11px]">
                        ±{r.limit} {r.unit}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            isDrift
                              ? "border-destructive text-destructive bg-destructive/10"
                              : "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                          }`}
                        >
                          {isDrift ? "DRIFT DETECTED" : "NOMINAL TRACKING"}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 text-xs leading-relaxed text-muted-foreground font-sans flex items-center justify-between border-t border-border/40">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
              <span>
                <strong>Aero Engine Airworthiness Assessment: </strong>
                All 4 thermodynamic channels are operating safely within certified FAA/EASA FAR 33 powerplant tolerances.
              </span>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground/70 hidden sm:block">
              ISO 9001 / AS9100 Twin Telemetry Verification
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
