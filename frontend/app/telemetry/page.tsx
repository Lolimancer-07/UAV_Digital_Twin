import { Activity, Radio } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { SiteHeader } from "@/components/site-header"
import { TelemetryMatrix } from "@/components/telemetry-matrix"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function TelemetryPage() {
  return (
    <SidebarProvider style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground">LIVE SENSOR ARRAY</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Telemetry matrix</h1>
              <p className="mt-1 text-sm text-muted-foreground">UAV-07 propulsion channels synchronized at 10 Hz.</p>
            </div>
            <Badge variant="outline" className="text-primary"><Radio data-icon="inline-start" /> LINK ACTIVE</Badge>
          </div>
          <Separator />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)]">
            <ChartAreaInteractive />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity data-icon="inline-start" /> Matrix status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Channels online</span><strong>12 / 12</strong></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Sample rate</span><strong className="font-mono">10.0 Hz</strong></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Packet loss</span><strong className="font-mono text-primary">0.00%</strong></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Last frame</span><strong className="font-mono">00:00:02</strong></div>
              </CardContent>
            </Card>
          </div>
          <TelemetryMatrix />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
