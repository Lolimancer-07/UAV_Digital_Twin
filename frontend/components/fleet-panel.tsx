"use client"

import * as React from "react"
import { CheckCircle2Icon, FlameIcon, GaugeIcon, PlaneIcon, ShieldAlertIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"

interface FleetUav {
  id: string
  callsign: string
  mission: string
  health: number
  rul: number
  flightHours: number
  alert: "NOMINAL" | "WARNING" | "CRITICAL"
  faults: string[]
}

export function FleetPanel() {
  const { latestTelemetry, sendCommand } = useTelemetry()

  const activeUavId = latestTelemetry?.uav_id ?? "UAV-07"
  const liveHealth = latestTelemetry?.health?.health_index ?? 92
  const liveRul = latestTelemetry?.predicted_rul ? Math.round(latestTelemetry.predicted_rul) : 1184
  const liveAlert = (latestTelemetry?.alert as any) ?? "NOMINAL"
  const liveFaults = (latestTelemetry?.fault_events ?? []).map((f) => (f.name || "FAULT").replace(/_/g, " "))

  const fleet: FleetUav[] = [
    {
      id: "UAV-07",
      callsign: "VIPER-07 (CURRENT)",
      mission: "Primary ISR Patrol (3,000 ft MSL)",
      health: Math.round(liveHealth),
      rul: liveRul,
      flightHours: 428.4,
      alert: liveAlert,
      faults: liveFaults,
    },
    {
      id: "UAV-02",
      callsign: "CONDOR-02",
      mission: "High Altitude Loiter (18,000 ft MSL)",
      health: 84,
      rul: 1120,
      flightHours: 215.1,
      alert: "NOMINAL",
      faults: [],
    },
    {
      id: "UAV-03",
      callsign: "GHOST-03",
      mission: "Tactical Evasive Intercept",
      health: 62,
      rul: 520,
      flightHours: 640.8,
      alert: "WARNING",
      faults: ["Cooling Margin Degraded"],
    },
    {
      id: "UAV-04",
      callsign: "FALCON-04",
      mission: "Depot Overhaul Test Cell",
      health: 28,
      rul: 64,
      flightHours: 980.2,
      alert: "CRITICAL",
      faults: ["Exhaust Valve Erosion", "Oil Scavenge Loss"],
    },
  ]

  const handleSelectUav = (uavId: string) => {
    sendCommand({
      command: "select_uav",
      uav_id: uavId,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top Status Strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Readiness</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-500">75.0%</div>
          <div className="text-[11px] text-muted-foreground">3 of 4 airframes dispatchable</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Digital Twins</div>
          <div className="mt-1 font-mono text-xl font-bold text-primary">4 Synced</div>
          <div className="text-[11px] text-muted-foreground">10 Hz multi-node MQTT bridge</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Mean Health</div>
          <div className="mt-1 font-mono text-xl font-bold text-foreground">
            {Math.round(fleet.reduce((acc, u) => acc + u.health, 0) / fleet.length)} / 100
          </div>
          <div className="text-[11px] text-muted-foreground">Fleet Weibull distribution</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AOG Warnings</div>
          <div className="mt-1 font-mono text-xl font-bold text-destructive">1 Unit</div>
          <div className="text-[11px] text-muted-foreground">UAV-04 scheduled for depot</div>
        </Card>
      </div>

      {/* ── Fleet Airframe Cards Grid ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fleet.map((uav) => {
          const isSelected = uav.id === activeUavId || (activeUavId.includes("01") && uav.id === "UAV-07")
          return (
            <Card
              key={uav.id}
              className={`flex flex-col justify-between transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/40"
                  : "bg-card/80 hover:bg-card hover:shadow-sm"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="font-mono text-xs font-bold text-primary">
                    {uav.id}
                  </Badge>
                  <Badge
                    variant={uav.alert === "CRITICAL" ? "destructive" : uav.alert === "WARNING" ? "outline" : "outline"}
                    className={`text-[10px] ${
                      uav.alert === "WARNING" ? "border-amber-500 text-amber-500" : uav.alert === "NOMINAL" ? "border-emerald-500 text-emerald-500" : ""
                    }`}
                  >
                    {uav.alert}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-sm font-semibold">{uav.callsign}</CardTitle>
                <CardDescription className="text-xs">{uav.mission}</CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase">Health</span>
                    <div className={`text-base font-bold ${uav.health > 70 ? "text-emerald-500" : uav.health > 40 ? "text-amber-500" : "text-destructive"}`}>
                      {uav.health} / 100
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase">RUL</span>
                    <div className="text-base font-bold text-foreground">{uav.rul} c</div>
                  </div>
                  <div className="col-span-2 border-t border-border/30 pt-1 text-[11px] text-muted-foreground">
                    Flight Time: <span className="text-foreground">{uav.flightHours} hrs</span>
                  </div>
                </div>

                {uav.faults.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {uav.faults.map((f, fIdx) => (
                      <Badge key={fIdx} variant="destructive" className="text-[9px]">
                        {f}
                      </Badge>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  disabled={isSelected}
                  onClick={() => handleSelectUav(uav.id)}
                  className="w-full text-xs font-semibold"
                >
                  {isSelected ? "ACTIVE TWIN TARGET" : "SWITCH DIGITAL TWIN"}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
