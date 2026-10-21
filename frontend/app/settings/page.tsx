import * as React from "react"
import type { Metadata } from "next"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SettingsPanel } from "@/components/settings-panel"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata: Metadata = {
  title: "System Settings | UAV-07 Propulsion GCS",
  description: "GCS link configuration, master audio annunciator, aerospace conventions, and operator RBAC.",
}

export default function SettingsPage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <SettingsPanel />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
