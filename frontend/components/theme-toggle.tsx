"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const trackRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="h-7 w-20 sm:w-36 rounded-full border border-border/40 bg-muted/40 opacity-0 shrink-0" aria-hidden="true" />
    )
  }

  const isDark = resolvedTheme === "dark"

  const handlePointerDown = (e: React.PointerEvent) => {
    const startX = e.clientX
    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      if (deltaX > 10) {
        setTheme("dark")
      } else if (deltaX < -10) {
        setTheme("light")
      }
    }
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
  }

  return (
    <div className="flex items-center shrink-0">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Theme mode scrollbar slider"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={isDark ? 1 : 0}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setTheme("light")
          if (e.key === "ArrowRight") setTheme("dark")
          if (e.key === " " || e.key === "Enter") setTheme(isDark ? "light" : "dark")
        }}
        onPointerDown={handlePointerDown}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="group relative flex h-7 items-center rounded-full border border-border/80 bg-muted/50 p-0.5 shadow-inner select-none cursor-pointer transition-colors duration-150 hover:border-border hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title={isDark ? "Scroll/Slide to Light Mode" : "Scroll/Slide to Dark Mode"}
      >
        {/* Sliding Thumb Indicator: scrolls/slides between light & dark states */}
        <div
          className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full bg-background shadow-xs border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isDark
              ? "left-[calc(50%+1px)] border-sky-500/40 shadow-sky-500/10"
              : "left-0.5 border-amber-500/40 shadow-amber-500/10"
          }`}
        />

        {/* Light Mode Side */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setTheme("light")
          }}
          className={`relative z-10 flex h-full items-center justify-center gap-1 px-2 text-[10px] font-mono tracking-wider transition-colors duration-150 ${
            !isDark
              ? "text-amber-600 dark:text-amber-400 font-bold"
              : "text-muted-foreground/70 hover:text-foreground"
          }`}
          title="Switch to Light Mode"
        >
          <Sun className={`size-3.5 transition-transform duration-200 ${!isDark ? "scale-110 text-amber-500" : ""}`} />
          <span className="hidden sm:inline">LIGHT</span>
        </button>

        {/* Dark Mode Side */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setTheme("dark")
          }}
          className={`relative z-10 flex h-full items-center justify-center gap-1 px-2 text-[10px] font-mono tracking-wider transition-colors duration-150 ${
            isDark
              ? "text-sky-500 dark:text-sky-400 font-bold"
              : "text-muted-foreground/70 hover:text-foreground"
          }`}
          title="Switch to Dark Mode"
        >
          <Moon className={`size-3.5 transition-transform duration-200 ${isDark ? "scale-110 text-sky-400" : ""}`} />
          <span className="hidden sm:inline">DARK</span>
        </button>
      </div>
    </div>
  )
}
