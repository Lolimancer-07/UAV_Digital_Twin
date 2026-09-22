import { AppSidebar } from "@/components/app-sidebar"
import { EnvelopeHeatmap } from "@/components/envelope-heatmap"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { Metadata } from "next"
import * as React from "react"

export const metadata: Metadata = {
  title: "Operational Envelope | PropulsionX GCS",
  description: "RPM × Altitude heatmap of mission completion probability with optimizer overlay.",
}

export default function EnvelopePage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
          <EnvelopeHeatmap />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
