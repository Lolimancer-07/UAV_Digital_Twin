"use client"

import * as React from "react"
import { Radio, RefreshCwIcon, ServerIcon, ShieldCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTelemetry } from "@/components/telemetry-provider"

function RadarSweep() {
  const [angle, setAngle] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setAngle(a => (a + 3) % 360), 30)
    return () => clearInterval(id)
  }, [])
  const spoke = 64
  const rad = (60 * Math.PI) / 180
  const x2 = 80 + spoke * Math.sin(rad)
  const y2 = 80 - spoke * Math.cos(rad)
  return (
    <div className="relative flex items-center justify-center">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {[64, 48, 32, 16].map((r, i) => (
          <circle key={i} cx="80" cy="80" r={r} fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="1" />
        ))}
        <line x1="80" y1="16" x2="80" y2="144" stroke="rgba(99,102,241,0.15)" strokeWidth="1" />
        <line x1="16" y1="80" x2="144" y2="80" stroke="rgba(99,102,241,0.15)" strokeWidth="1" />
        <defs>
          <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.7)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </radialGradient>
        </defs>
        <g transform={`rotate(${angle}, 80, 80)`}>
          <path d={`M80,80 L80,16 A${spoke},${spoke} 0 0,1 ${x2},${y2} Z`} fill="url(#sweepGrad)" opacity="0.5" />
          <line x1="80" y1="80" x2="80" y2="16" stroke="rgba(99,102,241,0.9)" strokeWidth="1.5" />
        </g>
        <circle cx="80" cy="80" r="4" fill="rgb(99,102,241)" />
      </svg>
    </div>
  )
}

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color}`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  )
}

function CheckItem({ label, done, pulse }: { label: string; done: boolean; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      {done ? (
        <ShieldCheckIcon className="size-4 text-emerald-500 shrink-0" />
      ) : (
        <Radio className={`size-4 text-primary shrink-0 ${pulse ? "animate-pulse" : ""}`} />
      )}
      <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>{label}</span>
    </div>
  )
}

export function BackendGate({ children }: { children: React.ReactNode }) {
  const { connectionStatus, latestTelemetry, reconnect } = useTelemetry()
  const hasTelemetry = latestTelemetry != null
  const isWsOpen = connectionStatus === "live"
  const isConnected = isWsOpen && hasTelemetry
  const isReconnecting = connectionStatus === "reconnecting"
  const isConnecting = connectionStatus === "connecting"
  const isWaitingForSim = isWsOpen && !hasTelemetry

  if (isConnected) return <>{children}</>

  return (
    <>
      <div className="pointer-events-none select-none opacity-10 blur-md transition-all duration-500" aria-hidden>
        {children}
      </div>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
        <div className="relative w-full max-w-md">
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent mb-6 opacity-80" />
          <div className="rounded-2xl border border-primary/30 bg-card/95 shadow-2xl overflow-hidden backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <PulsingDot color={isWaitingForSim ? "bg-amber-400" : isConnecting || isReconnecting ? "bg-amber-500" : "bg-destructive"} />
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  UAV-07 · PROPULSION GCS
                </span>
              </div>
              <span className="rounded bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-destructive uppercase">
                {isWaitingForSim ? "STREAM PENDING" : "GCS LOCKED"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-5 px-6 py-6">
              <RadarSweep />
              <div className="text-center space-y-1.5">
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  {isWaitingForSim
                    ? "Inference Core Live — Waiting for Telemetry…"
                    : isConnecting
                    ? "Waiting for Digital Twin Backend…"
                    : isReconnecting
                    ? "Reconnecting to Digital Twin Core…"
                    : "Digital Twin Backend Offline"}
                </h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {isWaitingForSim
                    ? "WebSocket handshake established on :8765. Waiting for telemetry packets from the simulator."
                    : "All propulsion controls, FADEC commands, and analytics are locked until a secure telemetry connection is active."}
                </p>
              </div>
              <div className="w-full rounded-xl border border-border/60 bg-background/70 p-3.5 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  System Boot & Link Status
                </p>
                <CheckItem label="Mosquitto MQTT Broker (:1883)" done={true} />
                <CheckItem label="Deep LSTM RUL Model & Weights" done={true} />
                <CheckItem label="Isolation Forest Anomaly Detector" done={true} />
                <CheckItem label="Thermodynamic Otto-Cycle Physics Twin" done={true} />
                <CheckItem label="WebSocket Telemetry Link (:8765)" done={isWsOpen} pulse={isConnecting || isReconnecting} />
                <CheckItem label="Real-Time 10 Hz Telemetry Stream" done={hasTelemetry} pulse={isWaitingForSim} />
              </div>
              <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold font-mono ${
                isWaitingForSim
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : isReconnecting
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-primary/40 bg-primary/10 text-primary"
              }`}>
                <Radio className="size-3.5 animate-pulse" />
                {isWaitingForSim
                  ? "WS CONNECTED · AWAITING PACKETS"
                  : isReconnecting
                  ? "RECONNECTING — RETRYING EVERY 1.5s"
                  : "WAITING FOR TWIN BACKEND…"}
              </div>
              <div className="w-full space-y-2 pt-1">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <ServerIcon className="size-3.5 text-primary shrink-0" />
                    <span>To launch or restart the backend:</span>
                  </p>
                  <p className="mt-1 pl-5">
                    Run <code className="rounded bg-background px-1.5 py-0.5 font-mono text-primary font-bold">bash run.sh</code> in your project root.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10"
                  onClick={reconnect}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Retry Connection Now
                </Button>
              </div>
            </div>
          </div>
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent mt-6 opacity-80" />
        </div>
      </div>
    </>
  )
}
