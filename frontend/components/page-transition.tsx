"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

/**
 * PageTransition — smooth, fluid 200ms page glide-in.
 * Starts at 0.88 opacity to avoid sudden content flashes or blank screens.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div
      key={pathname}
      className="animate-page-fade flex min-w-0 flex-1 flex-col h-full min-h-0"
    >
      {children}
    </div>
  )
}
