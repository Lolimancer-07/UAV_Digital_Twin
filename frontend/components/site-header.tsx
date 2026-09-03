import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Radio } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-[10px] tracking-[0.18em] text-muted-foreground">UAV-07 · PROPULSION UNIT · ROTAX 914 F ENGINE</p>
            <h1 className="truncate text-base font-semibold tracking-wide">UAV PROPULSION GROUND CONTROL STATION</h1>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Badge variant="outline" className="text-primary"><Radio data-icon="inline-start" /><span className="hidden sm:inline">10 HZ · LIVE</span><span className="sm:hidden">LIVE</span></Badge>
            <Badge className="hidden bg-primary/10 text-primary sm:inline-flex">OPERATIONAL</Badge>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
