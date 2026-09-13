"use client"

import * as React from "react"
import {
  SlidersHorizontalIcon,
  PlayIcon,
  RotateCcwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  MinusIcon,
  PlusIcon,
  SparklesIcon,
  GaugeIcon,
  CloudSunIcon,
  MountainIcon,
  FlameIcon,
  ActivityIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { useTelemetry } from "@/components/telemetry-provider"

interface WhatIfDialogProps {
  trigger?: React.ReactNode
  initialRpm?: number
}

export function WhatIfDialog({ trigger, initialRpm }: WhatIfDialogProps) {
  const { latestTelemetry, sendCommand } = useTelemetry()
  const [open, setOpen] = React.useState(false)

  // Simulation parameter states
  const [rpm, setRpm] = React.useState<number>(initialRpm ?? 2400)
  const [alt, setAlt] = React.useState<number>(3000)
  const [oat, setOat] = React.useState<number>(15)
  const [mapKpa, setMapKpa] = React.useState<number>(96)
  const [cooling, setCooling] = React.useState<number>(0)
  const [injOffset, setInjOffset] = React.useState<number>(0)

  const [isSimulating, setIsSimulating] = React.useState<boolean>(false)
  const [hasSimulated, setHasSimulated] = React.useState<boolean>(false)

  // Initialize once when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      if (initialRpm) {
        setRpm(initialRpm)
      } else if (latestTelemetry?.rpm) {
        setRpm(Math.round(latestTelemetry.rpm))
      } else {
        setRpm(2400)
      }

      if (latestTelemetry?.altitude_ft != null) {
        setAlt(Math.round(latestTelemetry.altitude_ft))
      } else {
        setAlt(3000)
      }

      if (latestTelemetry?.oat_c != null) {
        setOat(Math.round(latestTelemetry.oat_c))
      } else {
        setOat(15)
      }

      if (latestTelemetry?.map_kpa != null) {
        setMapKpa(Math.round(latestTelemetry.map_kpa))
      } else {
        setMapKpa(96)
      }

      setCooling(0)
      setInjOffset(0)
      setHasSimulated(false)
    }
  }

  // Reset to live baseline values
  const handleReset = () => {
    if (latestTelemetry) {
      setRpm(Math.round(latestTelemetry.rpm ?? 2400))
      setAlt(Math.round(latestTelemetry.altitude_ft ?? 3000))
      setOat(Math.round(latestTelemetry.oat_c ?? 15))
      setMapKpa(Math.round(latestTelemetry.map_kpa ?? 96))
    } else {
      setRpm(2400)
      setAlt(3000)
      setOat(15)
      setMapKpa(96)
    }
    setCooling(0)
    setInjOffset(0)
    setHasSimulated(false)
  }

  // Quick preset loader
  const applyPreset = (preset: {
    rpm?: number
    alt?: number
    oat?: number
    map?: number
    cooling?: number
    inj?: number
  }) => {
    if (preset.rpm !== undefined) setRpm(preset.rpm)
    if (preset.alt !== undefined) setAlt(preset.alt)
    if (preset.oat !== undefined) setOat(preset.oat)
    if (preset.map !== undefined) setMapKpa(preset.map)
    if (preset.cooling !== undefined) setCooling(preset.cooling)
    if (preset.inj !== undefined) setInjOffset(preset.inj)
  }

  // Send simulation command to backend
  const handleSimulate = () => {
    setIsSimulating(true)
    setHasSimulated(true)
    sendCommand({
      command: "whatif",
      params: {
        rpm: Number(rpm),
        altitude_ft: Number(alt),
        oat_c: Number(oat),
        ambient_temp_c: Number(oat),
        map_kpa: Number(mapKpa),
        cooling_degradation: Number(cooling) / 100,
        cooling_efficiency_pct: -Number(cooling),
        inj_timing_offset: Number(injOffset),
      },
    })
    setTimeout(() => setIsSimulating(false), 500)
  }

  // Baseline telemetry values
  const curRpm = Math.round(latestTelemetry?.rpm ?? 2400)
  const curCht = Math.round(latestTelemetry?.cht ?? 382)
  const curEgt = Math.round(latestTelemetry?.egt ?? 1465)
  const curHealth = Math.round(latestTelemetry?.health?.health_index ?? 92)
  const curRul = Math.round(latestTelemetry?.predicted_rul ?? 140)
  const curPower = Number((latestTelemetry?.physics?.brake_power_hp ?? 94.5).toFixed(1))

  // Instant client-side physics calculations for live slider feedback
  const rpmRatio = rpm / Math.max(200, curRpm)
  const thermalPenalty = 1.0 + (cooling / 100) * 0.5
  const deltaOat = oat - (latestTelemetry?.oat_c ?? 15)
  const estCht = Math.round(curCht * Math.pow(rpmRatio, 1.3) * thermalPenalty + deltaOat * 0.8)
  const estEgt = Math.round(curEgt * Math.pow(rpmRatio, 1.1) + injOffset * 8.0)
  const estPower = Number((curPower * Math.pow(rpmRatio, 1.2) * (mapKpa / 96.0)).toFixed(1))

  const curThermalLoad = (curCht / 380) * (curEgt / 1580)
  const cfThermalLoad = (estCht / 380) * (estEgt / 1580)
  const thermalRatio = curThermalLoad / Math.max(0.01, cfThermalLoad)
  const estRul = Math.round(Math.min(260, Math.max(0, curRul * Math.pow(thermalRatio, 1.5))))
  const estHealth = Math.round(
    Math.min(
      98,
      Math.max(
        10,
        curHealth +
          (estRul >= curRul
            ? Math.min(25, (estRul - curRul) * 0.5)
            : -Math.min(40, (curRul - estRul) * 0.8))
      )
    )
  )

  // Backend simulation result if available
  const res = latestTelemetry?.whatif_result as any
  const backendBase = res?.current || res?.baseline
  const backendCf = res?.counterfactual
  const backendDelta = res?.delta || res?.deltas

  const displayBase = {
    rpm: backendBase?.rpm != null ? Math.round(backendBase.rpm) : curRpm,
    cht: backendBase?.cht != null ? Math.round(backendBase.cht) : curCht,
    egt: backendBase?.egt != null ? Math.round(backendBase.egt) : curEgt,
    power: backendBase?.brake_power_hp != null ? Number(backendBase.brake_power_hp.toFixed(1)) : curPower,
    health: backendBase?.health != null ? Math.round(backendBase.health) : curHealth,
    rul: backendBase?.rul != null ? Math.round(backendBase.rul) : curRul,
  }

  const displayCf = {
    rpm: hasSimulated && backendCf?.rpm != null ? Math.round(backendCf.rpm) : rpm,
    cht: hasSimulated && backendCf?.cht != null ? Math.round(backendCf.cht) : estCht,
    egt: hasSimulated && backendCf?.egt != null ? Math.round(backendCf.egt) : estEgt,
    power: hasSimulated && backendCf?.brake_power_hp != null ? Number(backendCf.brake_power_hp.toFixed(1)) : estPower,
    health: hasSimulated && backendCf?.health != null ? Math.round(backendCf.health) : estHealth,
    rul: hasSimulated && backendCf?.rul != null ? Math.round(backendCf.rul) : estRul,
  }

  const deltaCht = displayCf.cht - displayBase.cht
  const deltaEgt = displayCf.egt - displayBase.egt
  const deltaHealth = displayCf.health - displayBase.health
  const deltaRul = displayCf.rul - displayBase.rul
  const deltaPower = Number((displayCf.power - displayBase.power).toFixed(1))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          trigger ? (
            <>{trigger}</>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <SlidersHorizontalIcon className="size-3.5" />
              <span>WHAT-IF</span>
            </Button>
          )
        }
      />
      <DialogContent className="max-w-4xl bg-card">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight">
                What-If Counterfactual Physics Simulator
              </DialogTitle>
              <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/40">
                FIRST-PRINCIPLES OTTO CYCLE
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="h-7 gap-1 text-xs"
                title="Reset all inputs to live telemetry"
              >
                <RotateCcwIcon className="size-3" />
                <span>Reset to Baseline</span>
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Adjust engine and environmental operating envelopes to project downstream thermodynamic stress, power output, and Remaining Useful Life (RUL).
          </DialogDescription>
        </DialogHeader>

        {/* ── Quick Scenario Presets ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
          <span className="font-semibold text-muted-foreground text-[11px] mr-1 flex items-center gap-1">
            <SparklesIcon className="size-3 text-primary" /> QUICK SCENARIOS:
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => applyPreset({ rpm: 2150 })}
            className="h-6 text-[11px] font-mono hover:bg-emerald-500/10 hover:text-emerald-500"
          >
            2150 RPM (Safe Descent)
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => applyPreset({ rpm: 2400, alt: 3000, oat: 15, cooling: 0 })}
            className="h-6 text-[11px] font-mono"
          >
            2400 RPM (Normal Cruise)
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => applyPreset({ rpm: 2550, map: 105 })}
            className="h-6 text-[11px] font-mono"
          >
            2550 RPM (Climb Power)
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => applyPreset({ oat: 40 })}
            className="h-6 text-[11px] font-mono hover:bg-amber-500/10 hover:text-amber-500"
          >
            Hot Day (+40°C OAT)
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => applyPreset({ cooling: 35 })}
            className="h-6 text-[11px] font-mono hover:bg-destructive/10 hover:text-destructive"
          >
            Degraded Cooling (35%)
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => applyPreset({ alt: 10000, map: 70 })}
            className="h-6 text-[11px] font-mono"
          >
            High Altitude (10,000 ft)
          </Button>
        </div>

        {/* ── Main Two-Column Layout ──────────────────────────────────── */}
        <div className="grid gap-4 py-1 md:grid-cols-12">
          {/* Left Column: 6 Parameter Controls (7 cols) */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-3.5 md:col-span-7">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <SlidersHorizontalIcon className="size-3.5 text-primary" /> Counterfactual Inputs
              </span>
              <span className="text-[10px] text-muted-foreground">
                Type directly or drag sliders
              </span>
            </div>

            <div className="space-y-3">
              {/* 1. Engine Speed (RPM) */}
              <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <GaugeIcon className="size-3.5 text-primary" /> Engine Speed (RPM)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setRpm((v) => Math.max(1000, v - 50))}
                      className="size-6 p-0 font-bold"
                      title="-50 RPM"
                    >
                      <MinusIcon className="size-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1000}
                      max={3000}
                      step={25}
                      value={rpm}
                      onChange={(e) => setRpm(Math.max(1000, Math.min(3000, Number(e.target.value) || 1000)))}
                      className="h-6 w-20 px-1 text-center font-mono text-xs font-bold text-primary"
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setRpm((v) => Math.min(3000, v + 50))}
                      className="size-6 p-0 font-bold"
                      title="+50 RPM"
                    >
                      <PlusIcon className="size-3" />
                    </Button>
                  </div>
                </div>
                <Slider
                  min={1000}
                  max={3000}
                  step={25}
                  value={rpm}
                  onValueChange={setRpm}
                  className="mt-1"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1000 RPM</span>
                  <span className="font-mono text-primary font-medium">Δ {rpm - curRpm > 0 ? `+${rpm - curRpm}` : rpm - curRpm} RPM vs Baseline</span>
                  <span>3000 RPM</span>
                </div>
              </div>

              {/* 2. Flight Altitude (ft) */}
              <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <MountainIcon className="size-3.5 text-primary" /> Altitude (ft MSL)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setAlt((v) => Math.max(0, v - 500))}
                      className="size-6 p-0 font-bold"
                      title="-500 ft"
                    >
                      <MinusIcon className="size-3" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      max={25000}
                      step={500}
                      value={alt}
                      onChange={(e) => setAlt(Math.max(0, Math.min(25000, Number(e.target.value) || 0)))}
                      className="h-6 w-24 px-1 text-center font-mono text-xs font-bold text-primary"
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setAlt((v) => Math.min(25000, v + 500))}
                      className="size-6 p-0 font-bold"
                      title="+500 ft"
                    >
                      <PlusIcon className="size-3" />
                    </Button>
                  </div>
                </div>
                <Slider
                  min={0}
                  max={25000}
                  step={500}
                  value={alt}
                  onValueChange={setAlt}
                  className="mt-1"
                />
              </div>

              {/* 3. Ambient Temperature (OAT, °C) */}
              <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <CloudSunIcon className="size-3.5 text-amber-500" /> Outside Air Temp (OAT)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setOat((v) => Math.max(-30, v - 1))}
                      className="size-6 p-0 font-bold"
                    >
                      <MinusIcon className="size-3" />
                    </Button>
                    <div className="flex items-center">
                      <Input
                        type="number"
                        min={-30}
                        max={55}
                        step={1}
                        value={oat}
                        onChange={(e) => setOat(Math.max(-30, Math.min(55, Number(e.target.value) || 0)))}
                        className="h-6 w-16 px-1 text-center font-mono text-xs font-bold text-amber-500"
                      />
                      <span className="ml-1 text-xs font-mono text-muted-foreground">°C</span>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setOat((v) => Math.min(55, v + 1))}
                      className="size-6 p-0 font-bold"
                    >
                      <PlusIcon className="size-3" />
                    </Button>
                  </div>
                </div>
                <Slider
                  min={-30}
                  max={55}
                  step={1}
                  value={oat}
                  onValueChange={setOat}
                  className="mt-1"
                  indicatorClassName="bg-amber-500"
                  thumbClassName="border-amber-500 shadow-amber-500/30"
                />
              </div>

              {/* 4. Manifold Absolute Pressure (MAP) */}
              <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <ActivityIcon className="size-3.5 text-primary" /> Manifold Pressure (MAP)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setMapKpa((v) => Math.max(40, v - 2))}
                      className="size-6 p-0 font-bold"
                    >
                      <MinusIcon className="size-3" />
                    </Button>
                    <div className="flex items-center">
                      <Input
                        type="number"
                        min={40}
                        max={125}
                        step={2}
                        value={mapKpa}
                        onChange={(e) => setMapKpa(Math.max(40, Math.min(125, Number(e.target.value) || 40)))}
                        className="h-6 w-16 px-1 text-center font-mono text-xs font-bold text-primary"
                      />
                      <span className="ml-1 text-xs font-mono text-muted-foreground">kPa</span>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setMapKpa((v) => Math.min(125, v + 2))}
                      className="size-6 p-0 font-bold"
                    >
                      <PlusIcon className="size-3" />
                    </Button>
                  </div>
                </div>
                <Slider
                  min={40}
                  max={125}
                  step={2}
                  value={mapKpa}
                  onValueChange={setMapKpa}
                  className="mt-1"
                />
              </div>

              {/* 5. Cooling Airflow Degradation (%) */}
              <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <FlameIcon className="size-3.5 text-destructive" /> Cooling Degradation
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setCooling((v) => Math.max(0, v - 5))}
                      className="size-6 p-0 font-bold"
                    >
                      <MinusIcon className="size-3" />
                    </Button>
                    <div className="flex items-center">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={cooling}
                        onChange={(e) => setCooling(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                        className="h-6 w-16 px-1 text-center font-mono text-xs font-bold text-destructive"
                      />
                      <span className="ml-1 text-xs font-mono text-muted-foreground">%</span>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setCooling((v) => Math.min(100, v + 5))}
                      className="size-6 p-0 font-bold"
                    >
                      <PlusIcon className="size-3" />
                    </Button>
                  </div>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={cooling}
                  onValueChange={setCooling}
                  className="mt-1"
                  indicatorClassName="bg-destructive"
                  thumbClassName="border-destructive shadow-destructive/30"
                />
              </div>

              {/* 6. Fuel Injection Offset (°CA) */}
              <div className="rounded-md border border-border/50 bg-background/60 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <ActivityIcon className="size-3.5 text-primary" /> Injection Timing Offset
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setInjOffset((v) => Math.max(-10, v - 1))}
                      className="size-6 p-0 font-bold"
                    >
                      <MinusIcon className="size-3" />
                    </Button>
                    <div className="flex items-center">
                      <Input
                        type="number"
                        min={-10}
                        max={10}
                        step={1}
                        value={injOffset}
                        onChange={(e) => setInjOffset(Math.max(-10, Math.min(10, Number(e.target.value) || 0)))}
                        className="h-6 w-16 px-1 text-center font-mono text-xs font-bold text-primary"
                      />
                      <span className="ml-1 text-xs font-mono text-muted-foreground">°CA</span>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setInjOffset((v) => Math.min(10, v + 1))}
                      className="size-6 p-0 font-bold"
                    >
                      <PlusIcon className="size-3" />
                    </Button>
                  </div>
                </div>
                <Slider
                  min={-10}
                  max={10}
                  step={1}
                  value={injOffset}
                  onValueChange={setInjOffset}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Run button */}
            <div className="mt-2 flex items-center gap-2">
              <Button
                onClick={handleSimulate}
                disabled={isSimulating}
                className="h-9 flex-1 gap-2 bg-primary text-primary-foreground font-bold text-xs shadow-md"
              >
                <PlayIcon className="size-4 fill-current" />
                <span>{isSimulating ? "RUNNING SIMULATION..." : "RUN COUNTERFACTUAL SIMULATION"}</span>
              </Button>
            </div>
          </div>

          {/* Right Column: Results & Comparisons (5 cols) */}
          <div className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/20 p-3.5 md:col-span-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2Icon className="size-3.5 text-emerald-500" /> Projected Impact
              </span>
              <Badge
                variant="outline"
                className={`font-mono text-[10px] font-bold ${
                  deltaRul > 0
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : deltaRul < 0
                    ? "border-destructive text-destructive bg-destructive/10"
                    : "border-border text-muted-foreground"
                }`}
              >
                {deltaRul > 0 ? "LIFE EXTENSION" : deltaRul < 0 ? "INCREASED WEAR" : "NEUTRAL"}
              </Badge>
            </div>

            {/* Side-by-side comparison table */}
            <div className="my-3 overflow-hidden rounded-lg border border-border/80 bg-background/80">
              <table className="w-full text-xs font-mono">
                <thead className="border-b border-border/60 bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-bold">Metric</th>
                    <th className="p-2 text-right">Base</th>
                    <th className="p-2 text-right font-bold text-foreground">What-If</th>
                    <th className="p-2 text-right">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr>
                    <td className="p-2 font-sans font-medium text-muted-foreground">RPM</td>
                    <td className="p-2 text-right">{displayBase.rpm}</td>
                    <td className="p-2 text-right font-bold text-primary">{displayCf.rpm}</td>
                    <td className="p-2 text-right text-[11px]">
                      {displayCf.rpm - displayBase.rpm > 0
                        ? `+${displayCf.rpm - displayBase.rpm}`
                        : displayCf.rpm - displayBase.rpm}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-medium text-muted-foreground">CHT</td>
                    <td className="p-2 text-right">{displayBase.cht}°F</td>
                    <td className={`p-2 text-right font-bold ${deltaCht < 0 ? "text-emerald-500" : deltaCht > 0 ? "text-destructive" : ""}`}>
                      {displayCf.cht}°F
                    </td>
                    <td className={`p-2 text-right text-[11px] font-bold ${deltaCht < 0 ? "text-emerald-500" : deltaCht > 0 ? "text-destructive" : ""}`}>
                      {deltaCht > 0 ? `+${deltaCht}` : deltaCht}°F
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-medium text-muted-foreground">EGT</td>
                    <td className="p-2 text-right">{displayBase.egt}°F</td>
                    <td className={`p-2 text-right font-bold ${deltaEgt < 0 ? "text-emerald-500" : deltaEgt > 0 ? "text-amber-500" : ""}`}>
                      {displayCf.egt}°F
                    </td>
                    <td className={`p-2 text-right text-[11px] ${deltaEgt < 0 ? "text-emerald-500" : deltaEgt > 0 ? "text-amber-500" : ""}`}>
                      {deltaEgt > 0 ? `+${deltaEgt}` : deltaEgt}°F
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-medium text-muted-foreground">Power</td>
                    <td className="p-2 text-right">{displayBase.power} HP</td>
                    <td className="p-2 text-right font-bold text-foreground">{displayCf.power} HP</td>
                    <td className="p-2 text-right text-[11px]">
                      {deltaPower > 0 ? `+${deltaPower}` : deltaPower} HP
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-medium text-muted-foreground">Health</td>
                    <td className="p-2 text-right">{displayBase.health}%</td>
                    <td className={`p-2 text-right font-bold ${deltaHealth >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {displayCf.health}%
                    </td>
                    <td className={`p-2 text-right text-[11px] font-bold ${deltaHealth >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {deltaHealth >= 0 ? `+${deltaHealth}` : deltaHealth}%
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-medium text-muted-foreground">RUL</td>
                    <td className="p-2 text-right">{displayBase.rul} c</td>
                    <td className={`p-2 text-right font-bold ${deltaRul >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {displayCf.rul} c
                    </td>
                    <td className={`p-2 text-right text-[11px] font-bold ${deltaRul >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {deltaRul >= 0 ? `+${deltaRul}` : deltaRul} c
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Prescriptive synthesis card */}
            <div className="space-y-2 rounded-lg border border-border/80 bg-background/90 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                {deltaRul >= 0 ? (
                  <>
                    <CheckCircle2Icon className="size-4 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Positive Life Cycle Recovery</span>
                  </>
                ) : (
                  <>
                    <AlertTriangleIcon className="size-4 text-destructive" />
                    <span className="text-destructive">Elevated Degradation Risk</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {deltaRul >= 0
                  ? `Operating at ${displayCf.rpm} RPM with ${cooling}% cooling loss yields a ${(
                      Math.abs(deltaCht)
                    )}°F thermal relief, recovering ~${Math.max(1, deltaRul)} flight cycles before mandatory cylinder overhaul.`
                  : `Operating at ${displayCf.rpm} RPM increases cylinder head thermal stress (+${deltaCht}°F), shortening RUL by ${Math.abs(
                      deltaRul
                    )} cycles.`}
              </p>
            </div>

            <div className="mt-3 text-center text-[10px] text-muted-foreground">
              Deterministic Otto thermodynamic solver &amp; thermal cycling degradation (α=1.5).
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
