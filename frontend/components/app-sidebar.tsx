"use client"

import * as React from "react"
import Link from "next/link"
import {
  Activity,
  BarChart3,
  Database,
  FileChartColumn,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  Settings2,
  Wrench,
} from "lucide-react"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
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
]

const operations = [
  { name: "Airworthiness", url: "/airworthiness", icon: <FileCheck2 /> },
  { name: "Flight Data Recorder", url: "/flight-data", icon: <Database /> },
  { name: "Dossier Export", url: "/dossier", icon: <FileChartColumn /> },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
        <SidebarGroup className="px-3 py-4">
          <SidebarGroupLabel className="px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">Engineering</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {operations.map((item) => (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton
                  render={<Link href={item.url} />}
                  tooltip={item.name}
                  size="lg"
                  className="h-11 rounded-lg px-3 text-[0.95rem] font-medium tracking-[-0.01em] transition-colors hover:bg-sidebar-accent"
                >
                  {item.icon}
                  <span>{item.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <NavSecondary items={[{ title: "System Settings", url: "/settings", icon: <Settings2 /> }]} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}
