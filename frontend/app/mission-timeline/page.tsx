import { AppSidebar } from "@/components/app-sidebar"
import { MissionTimeline } from "@/components/mission-timeline"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { Metadata } from "next"
import * as React from "react"

export const metadata: Metadata = {
  title: "Mission Timeline | PropulsionX GCS",
  description: "Predictive RUL burn-down and mission timeline with Go/No-Go decision support.",
}

export default function MissionTimelinePage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
          <MissionTimeline />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
