"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Items whose \"active\" state matches more than one pathname
const ALIAS_MAP: Record<string, string[]> = {
  "/": ["/", "/dashboard"],
}

function isItemActive(itemUrl: string, pathname: string): boolean {
  const aliases = ALIAS_MAP[itemUrl] ?? [itemUrl]
  return aliases.includes(pathname)
}

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
  }[]
}) {
  const pathname = usePathname()
  return (
    <SidebarGroup className="px-3 py-2">
      <SidebarGroupContent className="flex flex-col gap-1">
        <SidebarMenu>
          {items.map((item) => {
            const active = isItemActive(item.url, pathname)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.title}
                  size="lg"
                  className="relative h-11 rounded-lg px-3 text-[0.92rem] font-medium tracking-[-0.01em] transition-all duration-200 ease-out data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-sm hover:translate-x-0.5 active:scale-[0.99]"
                  render={<Link href={item.url} />}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3.5px] rounded-r-full bg-primary transition-all duration-300 ease-out shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-in fade-in zoom-in-75 duration-200" />
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
