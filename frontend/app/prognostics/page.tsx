import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { PrognosticsPanel } from "@/components/prognostics-panel"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function PrognosticsPage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <PrognosticsPanel />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
