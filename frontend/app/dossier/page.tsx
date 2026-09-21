import type { Metadata } from "next"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { DossierPanel } from "@/components/dossier-panel"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata: Metadata = {
  title: "Dossier Export | UAV-07 Propulsion GCS",
  description: "Certified airworthiness compliance dossier and multi-channel flight data export for UAV-07.",
}

export default function DossierPage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <DossierPanel />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
