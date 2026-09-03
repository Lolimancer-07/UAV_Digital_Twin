import { AppSidebar } from "@/components/app-sidebar"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { TelemetryDistribution } from "@/components/telemetry-distribution"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function DashboardPage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
          <SectionCards />
          <div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)] lg:px-6">
            <ChartAreaInteractive />
            <TelemetryDistribution />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
