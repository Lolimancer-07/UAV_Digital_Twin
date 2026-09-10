"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div
      key={pathname}
      className="animate-page-enter flex min-w-0 flex-1 flex-col transition-all duration-300 ease-out"
    >
      {children}
    </div>
  )
}
