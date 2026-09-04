"use client"

import * as React from "react"
import { SparklesIcon, TargetIcon } from "lucide-react"
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

const TARGETS = [
  { id: "MAX_ENDURANCE", label: "Max Endurance Loiter", desc: "Minimize BSFC & fuel consumption while maintaining certified minimum cruise power." },
  { id: "MAX_POWER", label: "Max Dash Power", desc: "Maximize brake horsepower within certified 5-minute cylinder head & EGT temperature limits." },
  { id: "COOLEST_RUNNING", label: "Thermal Preservation", desc: "Target lowest CHT/oil temperature margin to arrest active degradation." },
]

export function OptimizeDialog() {
  const { latestTelemetry, sendCommand } = useTelemetry()
  const [target, setTarget] = React.useState("MAX_ENDURANCE")
  const [maxCht, setMaxCht] = React.useState(420)
  const [submitted, setSubmitted] = React.useState(false)

  const handleOptimize = () => {
    setSubmitted(true)
    sendCommand({
      command: "optimize",
      constraints: {
        target,
        max_cht: maxCht,
      },
    })
  }

  const opt = latestTelemetry?.optimize_result

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <SparklesIcon className="size-3.5 text-amber-500" />
            <span>OPTIMIZE</span>
          </Button>
        }
      />
      <DialogContent className="max-w-xl bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <SparklesIcon className="size-4 text-amber-500" />
            <span>AI Operating Point Optimization</span>
            <Badge variant="outline" className="text-[10px]">PRESCRIPTIVE</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Determines the optimal FADEC setpoint (RPM, MAP, altitude) based on mission objectives, ambient conditions, and current engine degradation state.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Target selection */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Objective</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTarget(t.id)}
                  className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors ${
                    target === t.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-xs">
                    <TargetIcon className="size-3 text-primary" />
                    <span>{t.label}</span>
                  </div>
                  <span className="mt-1 text-[10px] leading-tight opacity-80">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
            <span className="text-xs font-medium">Max Allowable CHT</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={360}
                max={460}
                step={5}
                value={maxCht}
                onChange={(e) => setMaxCht(Number(e.target.value))}
                className="w-32 accent-primary"
              />
              <span className="font-mono text-xs font-semibold text-primary">{maxCht} °F</span>
            </div>
          </div>

          <Button onClick={handleOptimize} className="gap-2">
            <SparklesIcon className="size-4" />
            RUN AI OPTIMIZATION
          </Button>

          {/* Results section */}
          {opt ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 font-mono text-xs">
              <div className="mb-2 flex items-center justify-between border-b border-primary/20 pb-2">
                <span className="font-semibold text-foreground">RECOMMENDED OPERATING SETPOINT</span>
                <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">OPTIMAL</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <span className="text-[10px] text-muted-foreground">Optimal RPM</span>
                  <div className="text-base font-bold text-primary">{opt.optimal_rpm ?? "—"} RPM</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Projected Power</span>
                  <div className="text-base font-bold text-foreground">{opt.projected_power_hp?.toFixed(1) ?? "—"} HP</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Risk Reduction</span>
                  <div className="text-base font-bold text-emerald-500">+{opt.risk_reduction_pct?.toFixed(0) ?? "0"}%</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Fuel Savings</span>
                  <div className="text-base font-bold text-emerald-500">{opt.fuel_savings_pct?.toFixed(1) ?? "0"}%</div>
                </div>
              </div>

              {opt.recommendations && opt.recommendations.length > 0 && (
                <div className="mt-3 border-t border-primary/20 pt-2 font-sans text-[11px] text-muted-foreground">
                  <div className="mb-1 font-semibold text-foreground">Actionable Guidance:</div>
                  <ul className="list-inside list-disc space-y-0.5">
                    {opt.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            submitted && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Calculating multi-objective optimization envelope…
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
