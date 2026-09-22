"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  BarChart3,
  BrainIcon,
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
import { useTelemetry } from "@/components/telemetry-provider"
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
  const { latestTelemetry } = useTelemetry()
  const activeUavId = latestTelemetry?.uav_id ?? "UAV-01"
  const pathname = usePathname()
  const isAiActive = pathname === "/neural-engine" || pathname === "/nexus"

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-sidebar-border px-3 py-5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />} size="lg" className="h-auto rounded-lg px-3 py-2 hover:bg-sidebar-accent">
              <span className="font-mono text-sm font-semibold tracking-tight text-sidebar-primary">{activeUavId}</span>
              <span className="font-heading text-sm font-semibold tracking-wide">PropulsionX GCS</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />

        {/* ── PropulsionX Neural Engine — Dedicated AI Command Page ─────────── */}
        <SidebarGroup className="px-3 py-2">
          <SidebarMenu>
            <SidebarMenuItem>
              {/* Full-page PropulsionX Neural Engine link */}
              <SidebarMenuButton
                render={<Link href="/neural-engine" />}
                isActive={isAiActive}
                tooltip="Open PropulsionX Neural Engine HUD"
                size="lg"
                className={`h-11 rounded-xl px-3 text-[0.92rem] font-medium tracking-[-0.01em] transition-all duration-150 ease-out active:scale-[0.99] border ${
                  isAiActive
                    ? "border-cyan-500/60 bg-gradient-to-r from-cyan-500/20 via-primary/15 to-violet-500/10 text-cyan-400 font-semibold shadow-md ring-1 ring-cyan-500/30"
                    : "border-cyan-500/30 bg-cyan-500/5 text-foreground hover:bg-cyan-500/10 hover:text-cyan-400"
                }`}
              >
                <div className="relative flex size-5 items-center justify-center text-cyan-400">
                  <BrainIcon className="size-4 animate-pulse" />
                </div>
                <span className="font-semibold tracking-wide">Neural Engine</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-mono font-bold ${
                  isAiActive
                    ? "bg-cyan-500 text-black shadow-xs"
                    : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                }`}>
                  {isAiActive ? "LIVE HUD" : "AERO-AI"}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Side console quick drawer toggle */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setIsOpen(!isOpen)}
                isActive={isOpen}
                tooltip={isOpen ? "Close Side Console" : "Open Side Console"}
                size="sm"
                className={`h-7.5 rounded-lg px-3 text-[0.8rem] font-mono transition-all duration-150 ease-out active:scale-[0.99] ${
                  isOpen
                    ? "text-cyan-400 bg-cyan-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
              >
                <span className="ml-5 text-[10px]">↗ Open Side Console</span>
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
