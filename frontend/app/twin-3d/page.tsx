import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Twin3DViewer } from "@/components/twin-3d-viewer"
import type { Metadata } from "next"
import * as React from "react"

export const metadata: Metadata = {
  title: "3D Digital Twin | PropulsionX GCS",
  description: "Live 3D visualization of the UAV airframe and engine subsystem health — powered by PropulsionX Digital Twin.",
}

export default function Twin3DPage() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="flex flex-col min-h-0 h-full overflow-hidden">
        <SiteHeader />
        <main className="flex-1 min-h-0 w-full p-2 sm:p-3 overflow-hidden flex flex-col">
          <Twin3DViewer />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
