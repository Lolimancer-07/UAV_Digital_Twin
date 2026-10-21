import * as React from "react"
import type { Metadata } from "next"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { FlightDataPanel } from "@/components/flight-data-panel"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata: Metadata = {
  title: "Flight Data Recorder | UAV-07 Propulsion GCS",
  description: "TSO-C124b Solid-State Crash Survivable Memory Unit (CSMU) & Multi-Track Flight Telemetry Ingestion.",
}

export default function FlightDataPage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <FlightDataPanel />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
