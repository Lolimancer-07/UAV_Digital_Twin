"use client"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Radio } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTelemetry } from "@/components/telemetry-provider"

function ConnectionBadge() {
  const { connectionStatus } = useTelemetry()

  if (connectionStatus === "live") {
    return (
      <Badge variant="outline" className="text-primary">
        <Radio data-icon="inline-start" />
        <span className="hidden sm:inline">10 HZ · LIVE</span>
        <span className="sm:hidden">LIVE</span>
      </Badge>
    )
  }

  if (connectionStatus === "connecting" || connectionStatus === "reconnecting") {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
        <Radio data-icon="inline-start" className="animate-pulse" />
        <span className="hidden sm:inline">
          {connectionStatus === "reconnecting" ? "RECONNECTING…" : "CONNECTING…"}
        </span>
        <span className="sm:hidden">…</span>
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-destructive text-destructive">
      <Radio data-icon="inline-start" />
      <span className="hidden sm:inline">OFFLINE</span>
      <span className="sm:hidden">OFF</span>
    </Badge>
  )
}

function AlertBadge() {
  const { latestTelemetry } = useTelemetry()
  const alert = latestTelemetry?.alert

  if (alert === "CRITICAL") {
    return (
      <Badge className="hidden bg-destructive/10 text-destructive sm:inline-flex animate-pulse">
        CRITICAL
      </Badge>
    )
  }
  if (alert === "WARNING") {
    return (
      <Badge className="hidden bg-amber-500/10 text-amber-600 dark:text-amber-400 sm:inline-flex">
        WARNING
      </Badge>
    )
  }
  return (
    <Badge className="hidden bg-primary/10 text-primary sm:inline-flex">
      OPERATIONAL
    </Badge>
  )
}

import { ExportDialog } from "@/components/export-dialog"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-[10px] tracking-[0.18em] text-muted-foreground">
              UAV-07 · PROPULSION UNIT · ROTAX 914 F ENGINE
            </p>
            <h1 className="truncate text-base font-semibold tracking-wide">
              UAV PROPULSION GROUND CONTROL STATION
            </h1>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ConnectionBadge />
            <AlertBadge />
            <ExportDialog />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
