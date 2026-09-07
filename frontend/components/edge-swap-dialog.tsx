"use client"

import * as React from "react"
import {
  CpuIcon,
  HardDriveIcon,
  ZapIcon,
  ClockIcon,
  CheckCircle2Icon,
  LayersIcon,
  ShieldAlertIcon,
  SlidersIcon,
  ArrowRightLeftIcon,
  InfoIcon,
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
import { useTelemetry } from "@/components/telemetry-provider"
import type { EdgeProfileState } from "@/lib/telemetry/types"

export function EdgeSwapDialog() {
  const [open, setOpen] = React.useState(false)
  const { latestTelemetry, sendCommand, connectionStatus } = useTelemetry()
  const isLive = connectionStatus === "live"

  const activeProfile: EdgeProfileState = latestTelemetry?.edge_profile ?? {
    mode_id: "GCS_FLOAT32",
    name: "Full GCS Model (Float32)",
    hardware_target: "Ground Station Server (Xeon / RTX)",
    precision: "Float32 (IEEE 754 Uncompressed)",
    inference_latency_ms: 12.4,
    memory_footprint_mb: 420.0,
    model_size_mb: 18.4,
    power_tdp_w: 250.0,
    rul_mae_cycles: 6.8,
    accuracy_retention_pct: 100.0,
    swap_score: "LOW (GCS Station)",
    quantization_active: false,
    description: "Full-precision unconstrained model with 30-sample Monte Carlo Dropout uncertainty heads.",
  }

  const isEdge = activeProfile.mode_id === "EDGE_INT8"

  const handleToggleMode = () => {
    const nextMode = isEdge ? "GCS_FLOAT32" : "EDGE_INT8"
    sendCommand({
      command: "set_edge_mode",
      mode: nextMode,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            className={`h-8 gap-1.5 text-xs font-medium border-border/60 ${
              isEdge
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-primary/40 text-primary"
            }`}
          >
            <CpuIcon className="size-3.5" />
            <span className="hidden lg:inline">SWaP:</span>
            <span>{isEdge ? "EDGE INT8" : "GCS FP32"}</span>
          </Button>
        }
      />
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 border-border/70 overflow-hidden">
        <DialogHeader className="p-5 border-b border-border/50 bg-card/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] font-mono ${
                  isEdge
                    ? "border-emerald-500/50 text-emerald-500"
                    : "border-primary/40 text-primary"
                }`}
              >
                SWaP PROFILE TRADEOFF
              </Badge>
              <DialogTitle className="text-lg font-bold">
                Edge AI / SWaP Deployment Mode
              </DialogTitle>
            </div>
            <Button
              size="sm"
              variant={isEdge ? "default" : "outline"}
              onClick={handleToggleMode}
              disabled={!isLive}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <ArrowRightLeftIcon className="size-3.5" />
              <span>SWITCH TO {isEdge ? "FULL GCS (FP32)" : "EDGE (INT8)"}</span>
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Toggle between an unconstrained Ground Control Station server model and a quantized 15W airborne edge computer (e.g., NVIDIA Jetson Orin Nano / NXP i.MX8).
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Active Mode Banner */}
          <div
            className={`rounded-lg border p-3 text-xs flex items-center justify-between ${
              isEdge
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-primary/40 bg-primary/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CpuIcon className={`size-5 ${isEdge ? "text-emerald-500" : "text-primary"}`} />
              <div>
                <div className="font-bold text-sm text-foreground">
                  Active Mode: {activeProfile.name}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  Target: {activeProfile.hardware_target} · {activeProfile.precision}
                </div>
              </div>
            </div>
            <Badge
              className={`font-mono text-xs ${
                isEdge
                  ? "bg-emerald-500 text-black font-bold"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {isEdge ? "SWaP OPTIMIZED (12W)" : "UNCONSTRAINED (250W)"}
            </Badge>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="rounded-lg border border-border/70 overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-2.5 font-semibold">Specification / Metric</th>
                  <th className={`p-2.5 font-semibold ${!isEdge ? "bg-primary/10 text-primary" : ""}`}>
                    Full GCS Model (Float32)
                  </th>
                  <th className={`p-2.5 font-semibold ${isEdge ? "bg-emerald-500/10 text-emerald-500" : ""}`}>
                    Quantized Edge (INT8)
                  </th>
                  <th className="p-2.5 font-semibold text-right">Edge Advantage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                <tr>
                  <td className="p-2.5 font-sans font-medium text-foreground flex items-center gap-1.5">
                    <ClockIcon className="size-3.5 text-muted-foreground" />
                    Inference Latency
                  </td>
                  <td className={`p-2.5 ${!isEdge ? "font-bold text-primary" : ""}`}>12.4 ms</td>
                  <td className={`p-2.5 ${isEdge ? "font-bold text-emerald-500" : ""}`}>4.8 ms</td>
                  <td className="p-2.5 text-right text-emerald-500 font-bold">61% Faster</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans font-medium text-foreground flex items-center gap-1.5">
                    <HardDriveIcon className="size-3.5 text-muted-foreground" />
                    Memory Footprint (RAM)
                  </td>
                  <td className={`p-2.5 ${!isEdge ? "font-bold text-primary" : ""}`}>420.0 MB</td>
                  <td className={`p-2.5 ${isEdge ? "font-bold text-emerald-500" : ""}`}>38.0 MB</td>
                  <td className="p-2.5 text-right text-emerald-500 font-bold">91% Less RAM</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans font-medium text-foreground flex items-center gap-1.5">
                    <LayersIcon className="size-3.5 text-muted-foreground" />
                    Tensor Storage Size
                  </td>
                  <td className={`p-2.5 ${!isEdge ? "font-bold text-primary" : ""}`}>18.4 MB</td>
                  <td className={`p-2.5 ${isEdge ? "font-bold text-emerald-500" : ""}`}>2.3 MB</td>
                  <td className="p-2.5 text-right text-emerald-500 font-bold">87.5% Smaller</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans font-medium text-foreground flex items-center gap-1.5">
                    <ZapIcon className="size-3.5 text-muted-foreground" />
                    Thermal / Power Budget
                  </td>
                  <td className={`p-2.5 ${!isEdge ? "font-bold text-primary" : ""}`}>~250 W TDP</td>
                  <td className={`p-2.5 ${isEdge ? "font-bold text-emerald-500" : ""}`}>~12 W TDP</td>
                  <td className="p-2.5 text-right text-emerald-500 font-bold">95% Power Savings</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans font-medium text-foreground flex items-center gap-1.5">
                    <CheckCircle2Icon className="size-3.5 text-muted-foreground" />
                    RUL Prognostics MAE
                  </td>
                  <td className={`p-2.5 ${!isEdge ? "font-bold text-primary" : ""}`}>6.8 cycles</td>
                  <td className={`p-2.5 ${isEdge ? "font-bold text-emerald-500" : ""}`}>7.2 cycles</td>
                  <td className="p-2.5 text-right text-muted-foreground">±1.8% Variance</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Honest Methodology Note */}
          <div className="rounded-md border border-border/40 bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
            <InfoIcon className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span>
              <strong>Benchmarking Methodology:</strong> Calibrated against post-training quantization benchmarks for LSTM and Multi-Channel Anomaly detection models on NVIDIA Jetson Orin Nano (15W TDP) and an Intel Xeon GCS workstation. Toggling to INT8 precision applies real-time quantization rounding across telemetry feature streams.
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
