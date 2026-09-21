"use client"

import * as React from "react"
import { BotIcon, Maximize2Icon, SendIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SHORT_PROMPTS, useAICopilot } from "@/components/ai-copilot-context"

export function AICopilotSidebar() {
  const { messages, input, setInput, waiting, setIsOpen, handleSend, clearMessages } = useAICopilot()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, waiting])

  return (
    <div className="mx-2 mb-2 flex flex-col rounded-xl border border-border/70 bg-card/60 p-2.5 shadow-sm backdrop-blur-md transition-all hover:border-primary/40">
      {/* ── Widget Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <div className="flex items-center gap-2">
          <div className="relative flex size-6 items-center justify-center rounded-md bg-primary/10 border border-primary/25 text-primary">
            <BotIcon className="size-3.5" />
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold tracking-tight text-foreground">AI COPILOT</span>
            <span className="text-[9px] font-mono text-emerald-500 font-medium">TWIN REASONING</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={clearMessages}
            title="Clear Chat History"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
          >
            <Trash2Icon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsOpen(true)}
            title="Expand to Full Sheet"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
          >
            <Maximize2Icon className="size-3" />
          </Button>
        </div>
      </div>

      {/* ── Messages List (Compact Scrollable Area) ───────────────────── */}
      <div
        ref={scrollRef}
        className="my-2 flex flex-col gap-1.5 max-h-40 min-h-24 overflow-y-auto pr-1 text-[11px] scrollbar-thin"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col rounded-lg p-2 leading-snug transition-all ${
              m.role === "user"
                ? "self-end bg-primary text-primary-foreground font-medium max-w-[88%]"
                : "self-start bg-muted/60 border border-border/50 text-foreground max-w-[94%] shadow-xs"
            }`}
          >
            <span className="whitespace-pre-wrap">{m.text}</span>
            <span
              className={`mt-1 text-[8px] self-end font-mono ${
                m.role === "user" ? "text-primary-foreground/75" : "text-muted-foreground"
              }`}
            >
              {m.timestamp}
            </span>
          </div>
        ))}
        {waiting && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 p-1.5 rounded-md border border-border/40">
            <SparklesIcon className="size-3 animate-spin text-primary" />
            <span className="italic">AI reasoning over live telemetry…</span>
          </div>
        )}
      </div>

      {/* ── Quick Prompt Chips ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 mb-2">
        {SHORT_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(p.query)}
            className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[9px] font-medium text-muted-foreground transition-all hover:border-primary/50 hover:text-primary hover:bg-primary/5"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Input Box ─────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
        className="flex items-center gap-1"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI Engineer…"
          className="h-7 text-[11px] bg-background/90 border-border/70 px-2 rounded-md focus-visible:ring-1 focus-visible:ring-primary"
        />
        <Button
          type="submit"
          size="icon-xs"
          disabled={!input.trim() || waiting}
          className="size-7 shrink-0 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
        >
          <SendIcon className="size-3" />
        </Button>
      </form>
    </div>
  )
}
