"use client"

import * as React from "react"
import {
  Wrench,
  Clock,
  PackageCheck,
  AlertOctagon,
  FileText,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Download,
  Copy,
  Check,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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

interface MaintenanceSchedule {
  uav_id: string
  hours50: { current: number; max: number; status: "OK" | "DUE" | "OVERDUE" }
  hours100: { current: number; max: number; status: "OK" | "DUE" | "OVERDUE" }
  hours500: { current: number; max: number; status: "OK" | "DUE" | "OVERDUE" }
  nextAction: string
  urgency: "LOW" | "MEDIUM" | "HIGH" | "AOG"
}

const SCHEDULE_DATA: Record<string, MaintenanceSchedule> = {
  "UAV-01": {
    uav_id: "UAV-01",
    hours50: { current: 38, max: 50, status: "OK" },
    hours100: { current: 78, max: 100, status: "OK" },
    hours500: { current: 214, max: 500, status: "OK" },
    nextAction: "50h Routine Filter & Lube in 12h flight time",
    urgency: "LOW",
  },
  "UAV-02": {
    uav_id: "UAV-02",
    hours50: { current: 24, max: 50, status: "OK" },
    hours100: { current: 62, max: 100, status: "OK" },
    hours500: { current: 348, max: 500, status: "OK" },
    nextAction: "Thermal sensor calibration on cylinder #3",
    urgency: "LOW",
  },
  "UAV-03": {
    uav_id: "UAV-03",
    hours50: { current: 48, max: 50, status: "DUE" },
    hours100: { current: 94, max: 100, status: "DUE" },
    hours500: { current: 412, max: 500, status: "OK" },
    nextAction: "100h Borescope & Dual Spark Plug service IMMINENT (2h remaining)",
    urgency: "HIGH",
  },
  "UAV-04": {
    uav_id: "UAV-04",
    hours50: { current: 50, max: 50, status: "OVERDUE" },
    hours100: { current: 100, max: 100, status: "OVERDUE" },
    hours500: { current: 492, max: 500, status: "DUE" },
    nextAction: "CRITICAL: Engine depot overhaul; cylinder #2 valve guide rebuild required",
    urgency: "AOG",
  },
  "UAV-05": {
    uav_id: "UAV-05",
    hours50: { current: 6, max: 50, status: "OK" },
    hours100: { current: 12, max: 100, status: "OK" },
    hours500: { current: 26, max: 500, status: "OK" },
    nextAction: "Nominal operational state; 44h until first depot service",
    urgency: "LOW",
  },
}

const SPARES_INVENTORY = [
  { item: "Rotax Synthetic Lube Oil (10W-50)", partNo: "ROTAX-LUBE-4L", staged: 28, required: 4, unit: "Liters", ready: true },
  { item: "Rotax Engine Oil Filter Cartridge", partNo: "825-701-OEM", staged: 14, required: 2, unit: "Units", ready: true },
  { item: "Denso Iridium Spark Plugs (Set of 8)", partNo: "IK27-ROTAX-SPEC", staged: 22, required: 8, unit: "Sets", ready: true },
  { item: "Garrett Turbocharger Core Assembly", partNo: "GT1544-CHRA", staged: 2, required: 1, unit: "Assemblies", ready: true },
  { item: "Cylinder #2 Top-End Overhaul Gasket Kit", partNo: "RTX-914-GSK-02", staged: 3, required: 1, unit: "Kits", ready: true },
]

export function FleetMaintenanceHorizon({
  fleetList,
  activeUavId,
  onSelectUav,
}: {
  fleetList: FleetItem[]
  activeUavId: string
  onSelectUav: (uavId: string) => void
}) {
  const [selectedUavForOrder, setSelectedUavForOrder] = React.useState<string>("UAV-04")
  const [orderGenerated, setOrderGenerated] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const handleGenerateWorkOrder = (uavId: string) => {
    setSelectedUavForOrder(uavId)
    setOrderGenerated(true)
  }

  const workOrderText = `=====================================================
DEFENSE LOGISTICS & AIRWORTHINESS COMMAND
STANAG 4586 / MIL-STD-1521B DEPOT WORK ORDER
=====================================================
Work Order Ref: WO-${selectedUavForOrder}-${Date.now().toString().slice(-6)}
Target Airframe: ${selectedUavForOrder}
Assigned Facility: Hangar 3 — Forward Maintenance Depot Echo
Generated Timestamp: ${new Date().toISOString()}

PRIMARY DEFECT / TASKING:
${SCHEDULE_DATA[selectedUavForOrder]?.nextAction || "Scheduled depot maintenance inspection"}

AIRFRAME STATUS:
- Current TBO Accrual: ${SCHEDULE_DATA[selectedUavForOrder]?.hours500.current} / 500 hours
- 50h Filter Service: ${SCHEDULE_DATA[selectedUavForOrder]?.hours50.current}/50h (${SCHEDULE_DATA[selectedUavForOrder]?.hours50.status})
- 100h Borescope Check: ${SCHEDULE_DATA[selectedUavForOrder]?.hours100.current}/100h (${SCHEDULE_DATA[selectedUavForOrder]?.hours100.status})
- Urgency Rating: ${SCHEDULE_DATA[selectedUavForOrder]?.urgency}

REQUIRED LINE-REPLACEABLE UNITS (LRU):
1. ROTAX-LUBE-4L (Qty: 1) - Staged at Bay 2
2. 825-701-OEM Oil Filter (Qty: 1) - Verified QC Pass
3. RTX-914-GSK-02 Gasket Kit (Qty: 1) - Reserved

TECHNICIAN AUTHORIZATION:
Inspector ID: GCS-TECH-ALPHA-07
Sign-Off Protocol: ISO 9001:2015 AS9100D Standard
=====================================================`

  const handleCopy = () => {
    navigator.clipboard.writeText(workOrderText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-border/80 bg-card/85 shadow-lg backdrop-blur-md overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 opacity-90" />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-xs">
              <Wrench className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-bold tracking-wide text-foreground">
                  PREDICTIVE MAINTENANCE HORIZON & OVERHAUL TIMELINE
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px] border-amber-500/40 text-amber-400">
                  GANTT HORIZON · ROTAX 914 F TBO
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                50-hour oil services, 100-hour borescope intervals, and 500-hour factory overhaul countdowns across all fleet airframes.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerateWorkOrder("UAV-04")}
              className="h-8 gap-1.5 text-xs font-mono font-medium border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            >
              <FileText className="size-3.5" />
              <span>GENERATE WORK ORDER (UAV-04)</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-0">
        {/* Airframe Gantt Bars */}
        <div className="rounded-xl border border-border/70 bg-background/50 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Airframe Lifecycle Overhaul Tracking (50h / 100h / 500h TBO)
            </span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> OK
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-500" /> IMMINENT (&lt;10h)
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-destructive" /> AOG OVERDUE
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {fleetList.map((u) => {
              const sched = SCHEDULE_DATA[u.uav_id] || SCHEDULE_DATA["UAV-01"]
              const isSelected = u.uav_id === activeUavId
              const pct500 = Math.min(100, (sched.hours500.current / sched.hours500.max) * 100)
              const pct100 = Math.min(100, (sched.hours100.current / sched.hours100.max) * 100)

              return (
                <div
                  key={`sched-${u.uav_id}`}
                  className={`p-3 rounded-xl border transition-all ${
                    isSelected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border/60 bg-muted/15"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground">{u.uav_id}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">({u.call_sign})</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-mono px-1.5 py-0 ${
                          sched.urgency === "AOG"
                            ? "border-destructive text-destructive bg-destructive/10"
                            : sched.urgency === "HIGH"
                            ? "border-amber-500 text-amber-500 bg-amber-500/10"
                            : "border-emerald-500/40 text-emerald-400"
                        }`}
                      >
                        {sched.urgency === "AOG" ? "AOG GROUNDED" : sched.urgency === "HIGH" ? "SERVICE DUE" : "AIRWORTHY"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {sched.nextAction}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleGenerateWorkOrder(u.uav_id)}
                        className="h-6 px-2 text-[10px] font-mono text-primary hover:bg-primary/10"
                      >
                        CREATE TICKET
                      </Button>
                    </div>
                  </div>

                  {/* Dual Progress Bars: 100h Service & 500h TBO */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* 100h Interval */}
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                        <span>100h Borescope Check</span>
                        <span className={pct100 >= 90 ? "text-destructive font-bold" : "text-foreground"}>
                          {sched.hours100.current} / {sched.hours100.max} hrs
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct100 >= 95 ? "bg-destructive" : pct100 >= 80 ? "bg-amber-500" : "bg-sky-500"
                          }`}
                          style={{ width: `${pct100}%` }}
                        />
                      </div>
                    </div>

                    {/* 500h TBO Interval */}
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                        <span>500h Rotax Factory TBO Rebuild</span>
                        <span className={pct500 >= 95 ? "text-destructive font-bold" : "text-foreground"}>
                          {sched.hours500.current} / {sched.hours500.max} hrs
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct500 >= 95 ? "bg-destructive" : pct500 >= 80 ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${pct500}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Spares Staging Inventory Grid */}
        <div className="rounded-xl border border-border/70 bg-background/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageCheck className="size-4 text-emerald-400" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-foreground">
                Line-Replaceable Unit (LRU) Spares Staging Inventory
              </span>
            </div>
            <Badge variant="outline" className="font-mono text-[9px] border-emerald-500/40 text-emerald-400">
              SUPPLY STATUS: ADEQUATE
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-border/60 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2">Part Description</th>
                  <th className="pb-2">NATO Part #</th>
                  <th className="pb-2 text-right">Staged Qty</th>
                  <th className="pb-2 text-right">Batch Req</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {SPARES_INVENTORY.map((part) => (
                  <tr key={part.partNo} className="hover:bg-muted/15 transition-colors">
                    <td className="py-2 font-medium text-foreground">{part.item}</td>
                    <td className="py-2 text-muted-foreground text-[10px]">{part.partNo}</td>
                    <td className="py-2 text-right font-bold text-foreground">
                      {part.staged} {part.unit}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {part.required} {part.unit}
                    </td>
                    <td className="py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                        <CheckCircle2 className="size-3" /> READY
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Generated Work Order Modal / Box */}
        {orderGenerated && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-amber-400" />
                <span className="font-mono text-xs font-bold text-amber-400 uppercase">
                  STANAG 4586 Maintenance Work Package (Ready for Dispatch)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="h-7 gap-1 text-[10px] font-mono border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  <span>{copied ? "COPIED" : "COPY TEXT"}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOrderGenerated(false)}
                  className="h-7 text-[10px] font-mono text-muted-foreground hover:text-foreground"
                >
                  CLOSE
                </Button>
              </div>
            </div>

            <pre className="p-3 rounded-lg bg-black/60 border border-border/80 text-[10px] font-mono text-amber-200/90 leading-relaxed overflow-x-auto">
              {workOrderText}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
