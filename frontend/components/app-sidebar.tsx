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
import { NavDocuments } from "@/components/nav-documents"
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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />} className="p-1.5!">
              <span className="font-mono text-primary">UAV-07</span>
              <span className="font-semibold">PROPULSION GCS</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <SidebarGroup>
          <SidebarGroupLabel>Engineering</SidebarGroupLabel>
          <SidebarMenu>
            {operations.map((item) => (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton render={<Link href={item.url} />} tooltip={item.name}>
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
