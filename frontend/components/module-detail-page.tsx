import Link from "next/link"
import { ArrowLeft, CheckCircle2, CircleAlert } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { ModuleDetail } from "@/lib/module-data"

export function ModuleDetailPage({ detail }: { detail: ModuleDetail }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "18rem", "--header-height": "3.25rem" } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                <ArrowLeft data-icon="inline-start" /> GCS overview
              </Link>
              <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground">{detail.eyebrow}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{detail.title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{detail.description}</p>
            </div>
            <Badge variant="outline" className="text-primary"><CheckCircle2 data-icon="inline-start" /> {detail.status}</Badge>
          </div>
          <Separator />
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {detail.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="font-mono text-2xl tabular-nums">{metric.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{metric.detail}</CardContent>
              </Card>
            ))}
          </section>
          <section className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <Card>
              <CardHeader>
                <CardTitle>Detailed status</CardTitle>
                <CardDescription>Current values reported by the propulsion data services.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-0">
                {detail.rows.map((row) => (
                  <div key={row.label} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className="flex items-center gap-3 font-mono text-sm"><strong>{row.value}</strong><Badge variant="secondary">{row.state}</Badge></span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CircleAlert data-icon="inline-start" /> Operator insight</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{detail.insight}</CardContent>
            </Card>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
