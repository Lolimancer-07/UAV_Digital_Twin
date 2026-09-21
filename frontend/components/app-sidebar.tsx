"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BarChart3,
  Bot,
  Database,
  FileChartColumn,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  Plane,
  Radar,
  Settings2,
  Wrench,
} from "lucide-react"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { useAICopilot } from "@/components/ai-copilot-context"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const navMain = [
  { title: "GCS Overview", url: "/", icon: <LayoutDashboard /> },
  { title: "Telemetry Matrix", url: "/telemetry", icon: <Activity /> },
  { title: "Prognostics & Attribution", url: "/prognostics", icon: <Gauge /> },
  { title: "Thermodynamics & P-V", url: "/thermodynamics", icon: <BarChart3 /> },
  { title: "CAN Bus FDR", url: "/can", icon: <Database /> },
  { title: "Maintenance Advisories", url: "/maintenance", icon: <Wrench /> },
  { title: "Multi-UAV Fleet", url: "/fleet", icon: <Plane /> },
  { title: "Mission Command", url: "/mission-command", icon: <Radar /> },
]

const operations = [
  { name: "Airworthiness", url: "/airworthiness", icon: <FileCheck2 /> },
  { name: "Flight Data Recorder", url: "/flight-data", icon: <Database /> },
  { name: "Dossier Export", url: "/dossier", icon: <FileChartColumn /> },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isOpen, setIsOpen } = useAICopilot()
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-sidebar-border px-3 py-5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />} size="lg" className="h-auto rounded-lg px-3 py-2 hover:bg-sidebar-accent">
              <span className="font-mono text-sm font-semibold tracking-tight text-sidebar-primary">UAV-07</span>
              <span className="font-heading text-sm font-semibold tracking-wide">PROPULSION GCS</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />

        {/* ── AI Copilot Side Panel Toggle ──────────────────────── */}
        <SidebarGroup className="px-3 py-1.5">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setIsOpen(!isOpen)}
                isActive={isOpen}
                tooltip={isOpen ? "Close AI Copilot Panel" : "Open AI Copilot Side Panel"}
                size="lg"
                className={`h-11 rounded-lg px-3 text-[0.92rem] font-medium tracking-[-0.01em] transition-all duration-150 ease-out active:scale-[0.99] border ${
                  isOpen
                    ? "border-primary bg-primary/15 text-primary font-semibold shadow-xs"
                    : "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10 hover:text-primary"
                }`}
              >
                <Bot className="size-4 text-primary animate-pulse" />
                <span className="font-semibold">AI Copilot</span>
                <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                  isOpen
                    ? "bg-primary text-primary-foreground"
                    : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-500"
                }`}>
                  {isOpen ? "OPEN" : "LIVE"}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="px-3 py-3">
          <SidebarGroupLabel className="px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">Engineering</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {operations.map((item) => {
              const active = pathname === item.url || pathname.startsWith(item.url + "/")
              return (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    isActive={active}
                    render={<Link href={item.url} prefetch={true} />}
                    tooltip={item.name}
                    size="lg"
                    className="relative h-11 rounded-lg px-3 text-[0.92rem] font-medium tracking-[-0.01em] transition-all duration-150 ease-out data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-xs data-active:font-semibold hover:translate-x-0.5 active:scale-[0.99]"
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3.5px] rounded-r-full bg-primary transition-all duration-200 ease-out shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-in fade-in zoom-in-75 duration-150" />
                    )}
                    {item.icon}
                    <span>{item.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
        <NavSecondary items={[{ title: "System Settings", url: "/settings", icon: <Settings2 /> }]} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}
