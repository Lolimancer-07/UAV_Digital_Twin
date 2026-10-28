import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { NexusPage } from "@/components/nexus-page"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata = {
  title: "Agent 37 Neural Engine | AI Aero-Propulsion Core",
  description: "Agent 37 Neural Engine — Hermes cloud intelligence grounded in live UAV-07 digital twin telemetry.",
}

export default function NexusRoute() {
  return (
    <SidebarProvider
      className="!min-h-0 h-full overflow-hidden"
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="!min-h-0 h-full flex flex-col overflow-hidden">
        <SiteHeader />
        <NexusPage />
      </SidebarInset>
    </SidebarProvider>
  )
}
