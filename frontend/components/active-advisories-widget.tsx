"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ArrowRightIcon,
  WrenchIcon,
  PlaneIcon,
  ActivityIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useTelemetry } from "@/components/telemetry-provider"

export function ActiveAdvisoriesWidget() {
  const { latestTelemetry: t } = useTelemetry()

  const prescriptive = t?.prescriptive ?? []
  const advisories = t?.advisories ?? []
  const isAnomaly = t?.is_anomaly ?? false
  const alertLevel = t?.alert ?? "NOMINAL"
  const healthIndex = Math.round(t?.health?.health_index ?? 92)

  const isCritical = alertLevel === "CRITICAL" || healthIndex < 40
  const isWarning = alertLevel === "WARNING" || healthIndex < 70 || isAnomaly

  // Use top prescriptive item or fallback nominal
  const primaryItem = prescriptive.length > 0 ? prescriptive[0] : null

  return (
    <Card className="border-2 shadow-sm bg-card overflow-hidden">
      <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <div>
            <CardTitle className="text-sm font-bold tracking-tight">
              Real-Time Prescriptive Advisories
            </CardTitle>
            <CardDescription className="text-xs">
              Algorithmic action guidance grounded in live digital twin state
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={isCritical ? "destructive" : "outline"}
            className={`text-[11px] font-bold ${
              !isCritical && isWarning
                ? "border-amber-500 bg-amber-500/20 text-amber-600 dark:text-amber-400"
                : !isCritical && !isWarning
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : ""
            }`}
          >
            {isCritical ? "CRITICAL ALERT" : isWarning ? "ATTENTION REQUIRED" : "ALL SYSTEMS NOMINAL"}
          </Badge>
          <Link href="/maintenance">
            <Button variant="ghost" size="xs" className="text-xs font-semibold text-primary gap-1">
              <span>Full Work Orders</span>
              <ArrowRightIcon className="size-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {primaryItem ? (
          <div className="flex flex-col gap-3">
            <div
              className={`rounded-lg border p-3.5 flex items-start gap-3 ${
                primaryItem.severity === "CRITICAL" || primaryItem.severity === "EMERGENCY"
                  ? "border-destructive/60 bg-destructive/10"
                  : primaryItem.severity === "WARNING"
                  ? "border-amber-500/60 bg-amber-500/10"
                  : "border-emerald-500/50 bg-emerald-500/10"
              }`}
            >
              {primaryItem.severity === "CRITICAL" || primaryItem.severity === "EMERGENCY" ? (
                <ShieldAlertIcon className="size-5 text-destructive shrink-0 mt-0.5" />
              ) : primaryItem.severity === "WARNING" ? (
                <AlertTriangleIcon className="size-5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheckIcon className="size-5 text-emerald-500 shrink-0 mt-0.5" />
              )}

              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Action Recommended
                  </span>
                  <Badge
                    variant={
                      primaryItem.severity === "CRITICAL" || primaryItem.severity === "EMERGENCY"
                        ? "destructive"
                        : "outline"
                    }
                    className="text-[10px] font-bold"
                  >
                    {primaryItem.severity}
                  </Badge>
                </div>
                <div className="text-sm font-bold text-foreground mt-1 leading-snug">
                  {primaryItem.action}
                </div>
              </div>
            </div>

            {/* Directives breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {primaryItem.operational && (
                <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                  <span className="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1 mb-1">
                    <PlaneIcon className="size-3" /> Pilot Directive:
                  </span>
                  <p className="font-medium text-foreground leading-tight">
                    {primaryItem.operational}
                  </p>
                </div>
              )}
              {primaryItem.maintenance && (
                <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                  <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1">
                    <WrenchIcon className="size-3" /> Tech Inspection:
                  </span>
                  <p className="font-medium text-foreground leading-tight">
                    {primaryItem.maintenance}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5">
            <div className="flex items-center gap-3">
              <CheckCircle2Icon className="size-5 text-emerald-500 shrink-0" />
              <div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  Propulsion System Nominal — Cleared for Mission Dispatch
                </div>
                <div className="text-xs font-medium text-muted-foreground mt-0.5">
                  All 12 telemetry channels, cylinder balance, and physics residuals are operating within certified baseline limits.
                </div>
              </div>
            </div>
            <Link href="/maintenance" className="shrink-0 hidden sm:block">
              <Button variant="outline" size="xs" className="text-xs font-semibold">
                Inspect Specs
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
