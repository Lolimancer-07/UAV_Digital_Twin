import { AppSidebar } from "@/components/app-sidebar"
import { MissionCommandCenter } from "@/components/mission-command-center"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function MissionCommandPage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <MissionCommandCenter />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
