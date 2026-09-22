"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  Flame,
  Radio,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Volume2,
  X,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface ChecklistItem {
  id: string
  title: string
  desc: string
  type: "auto" | "action"
  status: "pending" | "completed"
  timestamp?: string
}

interface EmergencyChecklistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  destinationName: string
  onCompleteChecklist?: () => void
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  {
    id: "derate",
    title: "Derate Powerplant RPM to 1200",
    desc: "Reduces CHT thermal accumulation and preserves remaining cylinder life.",
    type: "auto",
    status: "completed",
    timestamp: "T+00:01s",
  },
  {
    id: "squawk",
    title: "Set ICAO Transponder Squawk to 7700",
    desc: "Transmits civilian & military emergency beacon to air traffic controllers.",
    type: "auto",
    status: "completed",
    timestamp: "T+00:02s",
  },
  {
    id: "cooling",
    title: "Isolate Fuel Cross-feed & Engage Aux Oil Scavenge",
    desc: "Ensures single-line fuel containment and maximizes continuous oil circulation.",
    type: "action",
    status: "pending",
  },
  {
    id: "arff",
    title: "Dispatch Alert to Recovery Field ARFF (Crash/Fire/Rescue)",
    desc: "Alerts ground rescue crew to stage foam units at runway threshold.",
    type: "action",
    status: "pending",
  },
  {
    id: "runway",
    title: "Confirm Runway Approach & Arresting Zone Clearance",
    desc: "Verifies airspace is sanitized and arresting cable/net system is active.",
    type: "action",
    status: "pending",
  },
]

export function EmergencyChecklistDialog({
  open,
  onOpenChange,
  destinationName,
  onCompleteChecklist,
}: EmergencyChecklistDialogProps) {
  const [items, setItems] = React.useState<ChecklistItem[]>(INITIAL_CHECKLIST)
  const [isLogged, setIsLogged] = React.useState(false)

  // Reset or mark automated items on open
  React.useEffect(() => {
    if (open) {
      setItems((prev) =>
        prev.map((item) =>
          item.type === "auto"
            ? { ...item, status: "completed", timestamp: "T+00:01s" }
            : item
        )
      )
      setIsLogged(false)
    }
  }, [open])

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextStatus = item.status === "completed" ? "pending" : "completed"
          return {
            ...item,
            status: nextStatus,
            timestamp: nextStatus === "completed" ? `T+${Math.floor(Math.random() * 20 + 5)}s` : undefined,
          }
        }
        return item
      })
    )
  }

  const completedCount = items.filter((i) => i.status === "completed").length
  const progressPct = Math.round((completedCount / items.length) * 100)
  const allComplete = completedCount === items.length

  const handleFinalize = () => {
    setIsLogged(true)
    onCompleteChecklist?.()
    setTimeout(() => {
      onOpenChange(false)
    }, 1200)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-red-500/40 bg-slate-950 text-slate-100 shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-red-500/20 text-red-400 border border-red-500/40">
                <ShieldAlert className="size-4 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="font-mono text-base tracking-wide text-red-200">
                  EMERGENCY SAFE RETURN CHECKLIST
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Standard Operating Procedure (SOP) · Diversion to{" "}
                  <strong className="text-emerald-400 font-mono">{destinationName}</strong>
                </DialogDescription>
              </div>
            </div>

            <Badge variant="outline" className="border-red-500/50 bg-red-500/10 text-red-400 font-mono text-[10px]">
              SQUAWK 7700
            </Badge>
          </div>
        </DialogHeader>

        {/* ── Progress Bar ────────────────────────────────────────────── */}
        <div className="space-y-1.5 my-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">CHECKLIST EXECUTION:</span>
            <span className={`font-bold ${allComplete ? "text-emerald-400" : "text-amber-400"}`}>
              {completedCount} OF {items.length} COMPLETE ({progressPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                allComplete ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* ── Checklist Items ─────────────────────────────────────────── */}
        <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden my-2 font-mono text-xs">
          {items.map((item, index) => {
            const isDone = item.status === "completed"
            return (
              <div
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-all ${
                  isDone
                    ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                    : "hover:bg-slate-800/60"
                }`}
              >
                {/* Step check box */}
                <div
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-all ${
                    isDone
                      ? "border-emerald-500 bg-emerald-500 text-slate-950 shadow-sm"
                      : "border-slate-600 bg-slate-800 text-transparent"
                  }`}
                >
                  <CheckCircle2 className="size-3.5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold ${
                        isDone ? "text-slate-200 line-through opacity-80" : "text-slate-100"
                      }`}
                    >
                      {index + 1}. {item.title}
                    </span>
                    {item.type === "auto" && (
                      <Badge
                        variant="outline"
                        className="border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-[8px] px-1 py-0"
                      >
                        AUTOMATED
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{item.desc}</p>
                </div>

                {/* Timestamp tag */}
                {item.timestamp && (
                  <span className="text-[10px] text-emerald-400/80 shrink-0 font-mono">
                    {item.timestamp}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Logged Confirmation Notice ──────────────────────────────── */}
        {isLogged && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono animate-in fade-in">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <span>Emergency Safe Return SOP verified & logged to GCS Airworthiness ledger.</span>
          </div>
        )}

        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-slate-200"
          >
            Dismiss
          </Button>

          <Button
            size="sm"
            onClick={handleFinalize}
            disabled={!allComplete || isLogged}
            className={`font-mono text-xs font-bold gap-1.5 ${
              allComplete
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                : "bg-slate-800 text-slate-500"
            }`}
          >
            <FileCheck className="size-3.5" />
            {isLogged ? "AUDIT LOGGED" : "CONFIRM & AUDIT LOG"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
