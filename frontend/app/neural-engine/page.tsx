import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { NeuralEnginePage } from "@/components/neural-engine-page"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export const metadata = {
  title: "PropulsionX Neural Engine | AI Aero-Propulsion Core",
  description: "PropulsionX Neural Engine — Cyber-Aerospace digital twin intelligence grounded in live UAV-07 telemetry.",
}

export default function NeuralEngineRoute() {
  return (
    <SidebarProvider
      className="!min-h-0 h-full overflow-hidden"
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="!min-h-0 h-full flex flex-col overflow-hidden">
        <SiteHeader />
        <NeuralEnginePage />
      </SidebarInset>
    </SidebarProvider>
  )
}
