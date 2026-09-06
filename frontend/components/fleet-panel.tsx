"use client"

import * as React from "react"
import { CheckCircle2Icon, FlameIcon, GaugeIcon, PlaneIcon, ShieldAlertIcon } from "lucide-react"
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
}

const DEFAULT_FLEET: FleetItem[] = [
  { uav_id: "UAV-01", call_sign: "ALPHA-01", mission: "ISR-LOITER", health: 94, rul: 142, condition: "EXCELLENT", fault_count: 0, alert: "NOMINAL", status_color: "ok", status_dot: "🟢", is_active: true, mission_probability: 92.0 },
  { uav_id: "UAV-02", call_sign: "ALPHA-02", mission: "ROUTE-SURVEY", health: 87, rul: 112, condition: "GOOD", fault_count: 0, alert: "NOMINAL", status_color: "ok", status_dot: "🟢", is_active: false, mission_probability: 88.0 },
  { uav_id: "UAV-03", call_sign: "BRAVO-01", mission: "HOT-STANDBY", health: 78, rul: 52, condition: "FAIR", fault_count: 1, alert: "WARNING", status_color: "warn", status_dot: "🟡", is_active: false, mission_probability: 74.0 },
  { uav_id: "UAV-04", call_sign: "BRAVO-02", mission: "MAINTENANCE", health: 68, rul: 18, condition: "CRITICAL", fault_count: 2, alert: "CRITICAL", status_color: "crit", status_dot: "🔴", is_active: false, mission_probability: 45.0 },
]

export function FleetPanel() {
  const { latestTelemetry, sendCommand } = useTelemetry()

  const rawFleet = latestTelemetry?.fleet_status as FleetItem[] | undefined
  const fleetList = rawFleet && rawFleet.length > 0 ? rawFleet : DEFAULT_FLEET
  const activeUavId = latestTelemetry?.uav_id ?? fleetList.find(u => u.is_active)?.uav_id ?? "UAV-01"

  const handleSelectUav = (uavId: string) => {
    sendCommand({
      command: "select_uav",
      uav_id: uavId,
    })
  }

  const dispatchableCount = fleetList.filter(u => u.health >= 50).length
  const fleetReadinessPct = Math.round((dispatchableCount / fleetList.length) * 100)
  const meanHealth = Math.round(fleetList.reduce((acc, u) => acc + u.health, 0) / fleetList.length)
  const aogCount = fleetList.filter(u => u.alert === "CRITICAL" || u.health < 50).length

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top Status Strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Readiness</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-500">{fleetReadinessPct}%</div>
          <div className="text-[11px] text-muted-foreground">{dispatchableCount} of {fleetList.length} airframes dispatchable</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Digital Twins</div>
          <div className="mt-1 font-mono text-xl font-bold text-primary">{fleetList.length} Synced</div>
          <div className="text-[11px] text-muted-foreground">10 Hz multi-node MQTT bridge</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fleet Mean Health</div>
          <div className="mt-1 font-mono text-xl font-bold text-foreground">
            {meanHealth} / 100
          </div>
          <div className="text-[11px] text-muted-foreground">Fleet Weibull distribution</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AOG Warnings</div>
          <div className="mt-1 font-mono text-xl font-bold text-destructive">{aogCount} Unit{aogCount === 1 ? "" : "s"}</div>
          <div className="text-[11px] text-muted-foreground">Requires maintenance intervention</div>
        </Card>
      </div>

      {/* ── Fleet Airframe Cards Grid ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fleetList.map((uav) => {
          const isSelected = uav.uav_id === activeUavId || uav.is_active
          return (
            <Card
              key={uav.uav_id}
              className={`flex flex-col justify-between transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/40"
                  : "bg-card/80 hover:bg-card hover:shadow-sm"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="font-mono text-xs font-bold text-primary">
                    {uav.uav_id}
                  </Badge>
                  <Badge
                    variant={uav.alert === "CRITICAL" ? "destructive" : uav.alert === "WARNING" ? "outline" : "outline"}
                    className={`text-[10px] ${
                      uav.alert === "WARNING" ? "border-amber-500 text-amber-500" : uav.alert === "NOMINAL" ? "border-emerald-500 text-emerald-500" : ""
                    }`}
                  >
                    {uav.status_dot} {uav.alert}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-sm font-semibold">{uav.call_sign} {isSelected ? "(ACTIVE)" : ""}</CardTitle>
                <CardDescription className="text-xs">{uav.mission}</CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase">Health</span>
                    <div className={`text-base font-bold ${uav.health > 70 ? "text-emerald-500" : uav.health > 40 ? "text-amber-500" : "text-destructive"}`}>
                      {uav.health}%
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase">RUL</span>
                    <div className="text-base font-bold text-foreground">{uav.rul} cycles</div>
                  </div>
                  <div className="col-span-2 border-t border-border/30 pt-1 text-[11px] text-muted-foreground flex justify-between">
                    <span>Condition: <strong className="text-foreground">{uav.condition}</strong></span>
                    <span>Mission: <strong className="text-foreground">{uav.mission_probability}%</strong></span>
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
                  disabled={isSelected}
                  onClick={() => handleSelectUav(uav.uav_id)}
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

