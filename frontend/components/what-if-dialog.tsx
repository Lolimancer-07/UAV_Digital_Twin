"use client"

import * as React from "react"
import { PlayIcon, RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react"
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
import { useTelemetry } from "@/components/telemetry-provider"

export function WhatIfDialog() {
  const { latestTelemetry, sendCommand } = useTelemetry()

  const [rpm, setRpm] = React.useState(1400)
  const [alt, setAlt] = React.useState(3000)
  const [oat, setOat] = React.useState(15)
  const [mapKpa, setMapKpa] = React.useState(96)
  const [cooling, setCooling] = React.useState(0)
  const [injOffset, setInjOffset] = React.useState(0)
  const [submitted, setSubmitted] = React.useState(false)

  // Sync initial sliders from live telemetry once available
  React.useEffect(() => {
    if (latestTelemetry && !submitted) {
      if (latestTelemetry.rpm) setRpm(Math.round(latestTelemetry.rpm))
      if (latestTelemetry.altitude_ft != null) setAlt(latestTelemetry.altitude_ft)
      if (latestTelemetry.oat_c != null) setOat(Math.round(latestTelemetry.oat_c))
      if (latestTelemetry.map_kpa != null) setMapKpa(Math.round(latestTelemetry.map_kpa))
    }
  }, [latestTelemetry, submitted])

  const handleSimulate = () => {
    setSubmitted(true)
    sendCommand({
      command: "whatif",
      params: {
        rpm,
        altitude_ft: alt,
        oat_c: oat,
        map_kpa: mapKpa,
        cooling_degradation: cooling / 100,
        inj_timing_offset: injOffset,
      },
    })
  }

  const handleReset = () => {
    setRpm(latestTelemetry?.rpm ? Math.round(latestTelemetry.rpm) : 1400)
    setAlt(latestTelemetry?.altitude_ft ?? 3000)
    setOat(latestTelemetry?.oat_c ?? 15)
    setMapKpa(latestTelemetry?.map_kpa ?? 96)
    setCooling(0)
    setInjOffset(0)
  }

  const res = (latestTelemetry?.whatif_result as any)
  const base = res?.current || res?.baseline
  const cf = res?.counterfactual
  const deltas = res?.deltas
  const rulImpact = deltas?.rul ?? res?.rul_impact

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <SlidersHorizontalIcon className="size-3.5" />
            <span>WHAT-IF</span>
          </Button>
        }
      />
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <span>What-If Counterfactual Physics Simulator</span>
            <Badge variant="outline" className="text-[10px]">FIRST-PRINCIPLES</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Test counterfactual operating envelopes before issuing FADEC commands to predict thermodynamic impact and RUL change.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {/* Sliders column */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div>
              <div className="flex justify-between text-xs font-medium">
                <span>Engine Speed</span>
                <span className="font-mono text-primary">{rpm} RPM</span>
              </div>
              <input
                type="range"
                min={1000}
                max={2600}
                step={50}
                value={rpm}
                onChange={(e) => setRpm(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium">
                <span>Altitude</span>
                <span className="font-mono text-primary">{alt.toLocaleString()} ft</span>
              </div>
              <input
                type="range"
                min={0}
                max={25000}
                step={500}
                value={alt}
                onChange={(e) => setAlt(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium">
                <span>Ambient Temp (OAT)</span>
                <span className="font-mono text-primary">{oat} °C</span>
              </div>
              <input
                type="range"
                min={-30}
                max={50}
                step={1}
                value={oat}
                onChange={(e) => setOat(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium">
                <span>Manifold Pressure (MAP)</span>
                <span className="font-mono text-primary">{mapKpa} kPa</span>
              </div>
              <input
                type="range"
                min={40}
                max={120}
                step={2}
                value={mapKpa}
                onChange={(e) => setMapKpa(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium">
                <span>Cooling Airflow Degradation</span>
                <span className="font-mono text-amber-500">{cooling}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={cooling}
                onChange={(e) => setCooling(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSimulate} size="sm" className="flex-1 gap-1.5">
                <PlayIcon className="size-3.5" />
                SIMULATE
              </Button>
              <Button onClick={handleReset} variant="outline" size="sm">
                <RotateCcwIcon className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Results column */}
          <div className="flex flex-col justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Simulation Projections
            </div>

            {res && base && cf ? (
              <div className="my-2 flex flex-col gap-2 font-mono text-xs">
                <div className="grid grid-cols-3 border-b border-border/40 pb-1 text-[10px] text-muted-foreground">
                  <span>METRIC</span>
                  <span className="text-center">BASELINE</span>
                  <span className="text-right font-bold text-foreground">WHAT-IF</span>
                </div>

                <div className="grid grid-cols-3">
                  <span className="text-muted-foreground">CHT</span>
                  <span className="text-center">{base.cht?.toFixed(1) ?? "—"} °F</span>
                  <span className="text-right font-semibold text-primary">
                    {cf.cht?.toFixed(1) ?? "—"} °F
                    {deltas?.cht != null && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({deltas.cht >= 0 ? `+${deltas.cht.toFixed(1)}` : deltas.cht.toFixed(1)})
                      </span>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-3">
                  <span className="text-muted-foreground">EGT</span>
                  <span className="text-center">{base.egt?.toFixed(1) ?? "—"} °F</span>
                  <span className="text-right font-semibold text-primary">
                    {cf.egt?.toFixed(1) ?? "—"} °F
                    {deltas?.egt != null && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({deltas.egt >= 0 ? `+${deltas.egt.toFixed(1)}` : deltas.egt.toFixed(1)})
                      </span>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-3">
                  <span className="text-muted-foreground">Power</span>
                  <span className="text-center">
                    {(base.brake_power_hp ?? latestTelemetry?.physics?.brake_power_hp)?.toFixed(1) ?? "—"} HP
                  </span>
                  <span className="text-right font-semibold text-primary">
                    {cf.brake_power_hp?.toFixed(1) ?? "—"} HP
                  </span>
                </div>

                <div className="grid grid-cols-3">
                  <span className="text-muted-foreground">RUL Impact</span>
                  <span className="text-center">
                    {Math.round(base.rul ?? base.predicted_rul ?? latestTelemetry?.predicted_rul ?? 0)} c
                  </span>
                  <span className="text-right font-semibold text-primary">
                    {Math.round(cf.rul ?? cf.predicted_rul ?? 0)} c
                    {rulImpact != null && (
                      <span className={`ml-1 text-[10px] ${rulImpact >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                        ({rulImpact >= 0 ? `+${Math.round(rulImpact)}` : Math.round(rulImpact)})
                      </span>
                    )}
                  </span>
                </div>

                {res.narrative && (
                  <div className="mt-2 rounded bg-card/60 p-2 font-sans text-[11px] leading-relaxed text-muted-foreground">
                    {res.narrative}
                  </div>
                )}
              </div>
            ) : (
              <div className="my-auto py-8 text-center text-xs text-muted-foreground">
                Adjust sliders and click <span className="font-semibold text-foreground">SIMULATE</span> to run thermodynamic counterfactual.
              </div>
            )}

            <div className="text-[10px] text-muted-foreground">
              Powered by Otto cycle thermodynamic physics solver and Isolation Forest anomaly projection.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
