"use client"

import * as React from "react"
import {
  ShieldAlert,
  ArrowRight,
  Plane,
  Clock,
  Radio,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Compass,
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

export function FleetSwarmRelief({
  fleetList,
  activeUavId,
  onSelectUav,
}: {
  fleetList: FleetItem[]
  activeUavId: string
  onSelectUav: (uavId: string) => void
}) {
  const { sendCommand } = useTelemetry()
  const [relievedId, setRelievedId] = React.useState<string>("UAV-04")
  const [standbyId, setStandbyId] = React.useState<string>("UAV-05")
  const [executing, setExecuting] = React.useState(false)
  const [stage, setStage] = React.useState<number>(0)
  const [success, setSuccess] = React.useState(false)

  // Auto-find degraded and candidate airframes
  React.useEffect(() => {
    const degraded = fleetList.find((u) => u.health < 75 || u.alert === "CRITICAL")
    if (degraded) setRelievedId(degraded.uav_id)
    const fresh = fleetList.find((u) => u.health >= 90 && u.uav_id !== (degraded?.uav_id ?? "UAV-04"))
    if (fresh) setStandbyId(fresh.uav_id)
  }, [fleetList])

  const relievedUav = fleetList.find((u) => u.uav_id === relievedId) || fleetList[3] || fleetList[0]
  const standbyUav = fleetList.find((u) => u.uav_id === standbyId) || fleetList[4] || fleetList[1]

  const handleStartRelief = () => {
    setExecuting(true)
    setStage(1)
    sendCommand({
      command: "trigger_swarm_relief",
      relieved_uav_id: relievedId,
      standby_uav_id: standbyId,
    })

    setTimeout(() => setStage(2), 1200)
    setTimeout(() => setStage(3), 2400)
    setTimeout(() => {
      setStage(4)
      setExecuting(false)
      setSuccess(true)
    }, 3600)
  }

  const handleReset = () => {
    setExecuting(false)
    setStage(0)
    setSuccess(false)
  }

  const steps = [
    { num: 1, title: "Transit Vectoring", desc: "Standby airframe vectors toward station at 74 kt (ETA 5.8m)" },
    { num: 2, title: "Sensor Handshake", desc: "P2P cryptographic sync & sensor telemetry transfer via AES-256" },
    { num: 3, title: "Station Overlap", desc: "Loiter station co-patrol during 28-minute fuel safety window" },
    { num: 4, title: "RTB Inbound Vector", desc: "Degraded airframe disengages and returns to Home Base Echo" },
  ]

  return (
    <Card className="border-border/80 bg-card/85 shadow-lg backdrop-blur-md overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-primary to-cyan-500 opacity-90" />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 shadow-xs">
              <Radio className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-sm font-bold tracking-wide text-foreground">
                  AUTONOMOUS SWARM RELIEF & HANDSHAKE PROTOCOL
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px] border-violet-500/40 text-violet-400">
                  STANAG 4586 SWARM LOGISTICS
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Dynamic airframe handover planning when an active node experiences thermal fatigue, low RUL, or system faults.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {success ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="h-8 gap-1.5 text-xs font-mono font-medium"
              >
                <RotateCcw className="size-3.5" />
                <span>RESET PROTOCOL</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleStartRelief}
                disabled={executing}
                className="h-8 gap-1.5 text-xs font-mono font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-xs"
              >
                <Play className={`size-3.5 ${executing ? "animate-spin" : ""}`} />
                <span>{executing ? "EXECUTING HANDSHAKE..." : "EXECUTE SWARM RELIEF"}</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-0">
        {/* Airframe Matching Cards */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Degraded Airframe */}
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-destructive">
                DEGRADED / RELIEVED NODE
              </span>
              <Badge variant="destructive" className="font-mono text-[9px]">
                {relievedUav.alert}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold font-mono text-foreground">{relievedUav.uav_id}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{relievedUav.call_sign} · {relievedUav.mission}</div>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-destructive">{relievedUav.health}% Health</div>
                <div className="text-[10px] text-muted-foreground">{relievedUav.rul} cyc RUL</div>
              </div>
            </div>
          </div>

          {/* Transfer Arrow */}
          <div className="hidden md:flex flex-col items-center justify-center text-muted-foreground">
            <span className="text-[9px] font-mono font-bold text-violet-400 mb-1">STATION RELIEF</span>
            <div className="flex size-9 items-center justify-center rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-400">
              <ArrowRight className="size-4" />
            </div>
            <span className="text-[9px] font-mono text-muted-foreground mt-1">28m Overlap</span>
          </div>

          {/* Relief Candidate Airframe */}
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-emerald-400">
                OPTIMAL RELIEF CANDIDATE
              </span>
              <Badge className="font-mono text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                PEAK READINESS #1
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold font-mono text-foreground">{standbyUav.uav_id}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{standbyUav.call_sign} · {standbyUav.mission}</div>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-emerald-400">{standbyUav.health}% Health</div>
                <div className="text-[10px] text-muted-foreground">{standbyUav.rul} cyc RUL</div>
              </div>
            </div>
          </div>
        </div>

        {/* Handshake Parameters Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-2.5 rounded-lg border border-border/70 bg-background/50">
            <div className="text-[10px] text-muted-foreground uppercase">Rendezvous Waypoint</div>
            <div className="font-bold text-foreground mt-0.5">WP-03 (26.78°N, 78.14°E)</div>
            <div className="text-[10px] text-muted-foreground">Alt: 3,500 ft MSL</div>
          </div>
          <div className="p-2.5 rounded-lg border border-border/70 bg-background/50">
            <div className="text-[10px] text-muted-foreground uppercase">Transit Time (ETA)</div>
            <div className="font-bold text-primary mt-0.5">5.8 minutes</div>
            <div className="text-[10px] text-muted-foreground">Speed: 74 kt cruise</div>
          </div>
          <div className="p-2.5 rounded-lg border border-border/70 bg-background/50">
            <div className="text-[10px] text-muted-foreground uppercase">Fuel Overlap Window</div>
            <div className="font-bold text-emerald-400 mt-0.5">28.0 minutes</div>
            <div className="text-[10px] text-muted-foreground">Dual-loiter coverage</div>
          </div>
          <div className="p-2.5 rounded-lg border border-border/70 bg-background/50">
            <div className="text-[10px] text-muted-foreground uppercase">Data Link Protocol</div>
            <div className="font-bold text-violet-400 mt-0.5">MIL-STD-188-220D</div>
            <div className="text-[10px] text-muted-foreground">AES-256-GCM Handshake</div>
          </div>
        </div>

        {/* 4-Stage Protocol Stepper */}
        <div className="rounded-xl border border-border/70 bg-background/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Swarm Reliever Handshake Sequence Status
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {stage === 0 ? "IDLE / STANDBY" : stage === 4 ? "HANDOVER COMPLETED" : `EXECUTING STEP ${stage} OF 4`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {steps.map((st) => {
              const isPast = stage > st.num || success
              const isCurrent = stage === st.num

              return (
                <div
                  key={st.num}
                  className={`p-3 rounded-lg border transition-all ${
                    isPast
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : isCurrent
                      ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500 animate-pulse"
                      : "border-border/60 bg-muted/20 opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {isPast ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                    ) : (
                      <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-mono font-bold">
                        {st.num}
                      </span>
                    )}
                    <span className="font-mono text-xs font-bold text-foreground">{st.title}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono leading-normal">{st.desc}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Handover Confirmed Banner */}
        {success && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 text-emerald-400" />
              <div>
                <div className="text-xs font-bold text-emerald-400 font-mono">
                  SWARM RELIEF PROTOCOL EXECUTED & VERIFIED
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {standbyUav.uav_id} ({standbyUav.call_sign}) has assumed station command. {relievedUav.uav_id} is in transit to Base Echo for maintenance.
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSelectUav(standbyUav.uav_id)}
              className="h-7 text-xs font-mono border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
            >
              CONNECT TO {standbyUav.uav_id}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
