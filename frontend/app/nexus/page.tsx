import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { NexusPage } from "@/components/nexus-page"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata = {
  title: "PropulsionX Nexus | AI Mission Engineer",
  description: "PropulsionX Nexus — AI-powered propulsion intelligence engine grounded in live Digital Twin telemetry.",
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
