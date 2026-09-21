"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, Radio } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTelemetry } from "@/components/telemetry-provider"

const ROUTE_LABELS: Record<string, { label: string; parent?: string }> = {
  "/": { label: "GCS Overview" },
  "/dashboard": { label: "GCS Overview" },
  "/telemetry": { label: "Telemetry Matrix", parent: "GCS Overview" },
  "/prognostics": { label: "Prognostics & Attribution", parent: "GCS Overview" },
  "/thermodynamics": { label: "Thermodynamics & P-V", parent: "GCS Overview" },
  "/can": { label: "CAN Bus FDR", parent: "GCS Overview" },
  "/maintenance": { label: "Maintenance Advisories", parent: "GCS Overview" },
  "/fleet": { label: "Multi-UAV Fleet", parent: "GCS Overview" },
  "/mission-command": { label: "Mission Command", parent: "GCS Overview" },
  "/airworthiness": { label: "Airworthiness", parent: "Engineering" },
  "/flight-data": { label: "Flight Data Recorder", parent: "Engineering" },
  "/dossier": { label: "Dossier Export", parent: "Engineering" },
  "/settings": { label: "System Settings", parent: "System" },
}

function Breadcrumb() {
  const pathname = usePathname()
  const route = ROUTE_LABELS[pathname] ?? { label: pathname.replace(/\//g, "").replace(/-/g, " ").toUpperCase() }
  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-[11px] font-mono md:flex">
      {route.parent && (
        <>
          <span className="text-muted-foreground/60">{route.parent}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
        </>
      )}
      <span className="font-semibold text-foreground tracking-wide">{route.label}</span>
    </nav>
  )
}

function ConnectionBadge() {
  const { connectionStatus, reconnect } = useTelemetry()

  if (connectionStatus === "live") {
    return (
      <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/50">
        <Radio data-icon="inline-start" className="text-emerald-500" />
        <span className="hidden sm:inline">10 HZ · LIVE</span>
        <span className="sm:hidden">LIVE</span>
      </Badge>
    )
  }

  if (connectionStatus === "connecting" || connectionStatus === "reconnecting") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-500/10"
        onClick={reconnect}
      >
        <Radio data-icon="inline-start" className="animate-pulse" />
        <span className="hidden sm:inline">
          {connectionStatus === "reconnecting" ? "RECONNECTING…" : "CONNECTING…"}
        </span>
        <span className="sm:hidden">…</span>
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="border-destructive text-destructive cursor-pointer hover:bg-destructive/10 animate-pulse"
      onClick={reconnect}
    >
      <Radio data-icon="inline-start" />
      <span className="hidden sm:inline">TWIN OFFLINE</span>
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
import { JargonGuideDialog } from "@/components/jargon-guide-dialog"
import { SecurityPostureDialog } from "@/components/security-posture-dialog"

export function SiteHeader() {
  const { latestTelemetry } = useTelemetry()
  const activeUavId = latestTelemetry?.uav_id ?? "UAV-01"

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur-md supports-backdrop-filter:backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) shadow-xs">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
            <Breadcrumb />
            <p className="truncate text-[10px] tracking-[0.14em] text-muted-foreground font-mono leading-none">
              <span className="font-bold text-primary">{activeUavId}</span> · ROTAX 914 F · PROPULSION GCS
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ConnectionBadge />
            <SecurityPostureDialog />
            <AlertBadge />
            <JargonGuideDialog />
            <ExportDialog />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
