"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
const pathname = usePathname()
return (
  <SidebarGroup {...props} className="px-3 py-3">
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname === item.url || pathname.startsWith(item.url + "/")
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={active}
                  size="lg"
                  className="relative h-11 rounded-lg px-3 text-[0.92rem] font-medium transition-all duration-150 ease-out data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-xs data-active:font-semibold hover:translate-x-0.5 active:scale-[0.99]"
                  render={<Link href={item.url} prefetch={true} />}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3.5px] rounded-r-full bg-primary transition-all duration-200 ease-out shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-in fade-in zoom-in-75 duration-150" />
                  )}
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
