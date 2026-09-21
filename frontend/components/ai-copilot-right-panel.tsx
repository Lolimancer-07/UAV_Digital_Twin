"use client"

import * as React from "react"
import { BotIcon, SendIcon, SparklesIcon, Trash2Icon, UserIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { QUICK_PROMPTS, useAICopilot } from "@/components/ai-copilot-context"

export function AICopilotRightPanel() {
  const { messages, input, setInput, waiting, isOpen, setIsOpen, handleSend, clearMessages } = useAICopilot()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const panelRef = React.useRef<HTMLElement>(null)

  // Auto-scroll to bottom on new messages or waiting changes
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, waiting])

  // Isolate chatbox scrolling completely: prevent any wheel events inside the chatbox from chaining to the main page
  React.useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const handleWheel = (e: WheelEvent) => {
      const scrollEl = scrollRef.current
      if (!scrollEl) {
        e.preventDefault()
        return
      }

      // If wheeling outside the scrollable messages area (e.g. header, chips, input form), stop page scroll
      if (!scrollEl.contains(e.target as Node)) {
        e.preventDefault()
        return
      }

      // Inside messages container: allow internal scrolling, prevent chaining at bounds
      const { scrollTop, scrollHeight, clientHeight } = scrollEl
      const isScrollable = scrollHeight > clientHeight
      if (!isScrollable) {
        e.preventDefault()
        return
      }

      const isScrollingUp = e.deltaY < 0
      const isScrollingDown = e.deltaY > 0
      const isAtTop = scrollTop <= 0
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

      if ((isScrollingUp && isAtTop) || (isScrollingDown && isAtBottom)) {
        e.preventDefault()
      }
    }

    panel.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      panel.removeEventListener("wheel", handleWheel)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <aside
      ref={panelRef}
      aria-label="AI Mission Engineer Copilot"
      className="relative z-20 flex h-full w-[360px] md:w-[400px] xl:w-[430px] shrink-0 flex-col border-l border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur-md transition-all duration-200 overflow-hidden overscroll-contain"
    >
      {/* ── Top Header ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-col border-b border-border p-4 pb-3 bg-card/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex size-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/30 text-primary">
              <BotIcon className="size-4" />
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-sm font-semibold tracking-wide text-foreground">
                AI Propulsion Engineer
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">Digital Twin Mission Advisor</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5"
            >
              GROUNDED IN TWIN
            </Badge>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={clearMessages}
              title="Clear Chat History"
              className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Trash2Icon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setIsOpen(false)}
              title="Close Copilot Panel"
              className="size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted ml-0.5"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground leading-normal">
          Real-time reasoning grounded in propulsion physics, LSTM degradation models, and isolation forest anomaly drivers.
        </p>
      </div>

      {/* ── Quick Prompt Chips ────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap gap-1.5 border-b border-border/70 p-3 bg-muted/40">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase self-center mr-1">Quick:</span>
        {QUICK_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSend(prompt)}
            className="rounded-full border border-border/80 bg-background/90 px-2.5 py-1 text-[10px] text-foreground transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5 active:scale-95"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* ── Scrollable Messages List ──────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-3.5 text-xs bg-background/50 scrollbar-thin"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2.5 text-xs ${
              m.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-foreground border border-border shadow-xs"
              }`}
            >
              {m.role === "user" ? (
                <UserIcon className="size-3.5" />
              ) : (
                <BotIcon className="size-3.5 text-primary" />
              )}
            </div>
            <div
              className={`flex max-w-[85%] flex-col rounded-xl px-3.5 py-2.5 leading-relaxed shadow-xs ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-card border border-border/80 text-foreground"
              }`}
            >
              <span className="whitespace-pre-wrap">{m.text}</span>
              <span
                className={`mt-1 text-[9px] self-end font-mono ${
                  m.role === "user" ? "text-primary-foreground/80" : "text-muted-foreground"
                }`}
              >
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}
        {waiting && (
          <div className="flex gap-2 text-xs text-muted-foreground items-center bg-card/80 p-2.5 rounded-lg border border-border shadow-xs">
            <SparklesIcon className="size-3.5 animate-spin text-primary shrink-0" />
            <span className="italic">AI Engineer reasoning over Digital Twin telemetry…</span>
          </div>
        )}
      </div>

      {/* ── Input Bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border p-3 bg-card/80">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about health, RUL, anomalies, mission risk…"
            className="h-9 text-xs bg-background/90 border-border text-foreground focus-visible:ring-1 focus-visible:ring-primary"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || waiting}
            className="h-9 px-3 gap-1 bg-primary text-primary-foreground hover:bg-primary/90 transition-all shrink-0"
          >
            <SendIcon className="size-3.5" />
          </Button>
        </form>
      </div>
    </aside>
  )
}
