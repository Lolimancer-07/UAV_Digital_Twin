"use client"

import * as React from "react"
import {
  BotIcon, CopyIcon, SendIcon, SparklesIcon, ThumbsDownIcon,
  ThumbsUpIcon, Trash2Icon, UserIcon, XIcon, CheckIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CATEGORY_META, QUICK_PROMPTS, useAICopilot } from "@/components/ai-copilot-context"
import type { ChatMessage } from "@/components/ai-copilot-context"

/* ── Animated UAV avatar ──────────────────────────────────────────────────── */
function AIAvatar({ size = 8 }: { size?: number }) {
  const sz = `size-${size}`
  return (
    <div className={`relative flex ${sz} shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary shadow-md`}>
      <BotIcon className="size-4" />
      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-background animate-pulse" />
    </div>
  )
}

/* ── Category badge ───────────────────────────────────────────────────────── */
function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null
  const meta = CATEGORY_META[category]
  if (!meta) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.color}`}>
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  )
}

/* ── Copy button ──────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy response"
      className="flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
    >
      {copied ? <CheckIcon className="size-3 text-emerald-400" /> : <CopyIcon className="size-3" />}
    </button>
  )
}

/* ── Reaction buttons ─────────────────────────────────────────────────────── */
function ReactionButtons({ messageId }: { messageId: string }) {
  const [vote, setVote] = React.useState<"up" | "down" | null>(null)
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => setVote(vote === "up" ? null : "up")}
        title="Helpful"
        className={`flex items-center justify-center size-5 rounded-md transition-all ${vote === "up" ? "text-emerald-400" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10"}`}
      >
        <ThumbsUpIcon className="size-3" />
      </button>
      <button
        onClick={() => setVote(vote === "down" ? null : "down")}
        title="Not helpful"
        className={`flex items-center justify-center size-5 rounded-md transition-all ${vote === "down" ? "text-rose-400" : "text-muted-foreground hover:text-rose-400 hover:bg-rose-400/10"}`}
      >
        <ThumbsDownIcon className="size-3" />
      </button>
    </div>
  )
}

/* ── Typing indicator ────────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex gap-1 items-center px-3.5 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-primary/70 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  )
}

/* ── Individual message bubble ───────────────────────────────────────────── */
function MessageBubble({ m, onFollowUp }: { m: ChatMessage; onFollowUp: (q: string) => void }) {
  const [hovered, setHovered] = React.useState(false)
  const isUser = m.role === "user"

  if (isUser) {
    return (
      <div className="flex gap-2.5 flex-row-reverse">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <UserIcon className="size-3.5" />
        </div>
        <div className="flex max-w-[80%] flex-col rounded-2xl rounded-tr-sm px-4 py-2.5 leading-relaxed bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-md">
          <span className="text-xs font-medium whitespace-pre-wrap">{m.displayText}</span>
          <span className="mt-1 self-end text-[9px] font-mono text-primary-foreground/70">{m.timestamp}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 flex-row" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <AIAvatar size={7} />
      <div className="flex max-w-[85%] flex-col gap-1.5">
        {/* Badge row */}
        <div className="flex items-center gap-2">
          <CategoryBadge category={m.category} />
          {m.isStreaming && (
            <span className="text-[9px] font-mono text-primary/60 animate-pulse">typing…</span>
          )}
        </div>
        {/* Bubble */}
        <div className="relative rounded-2xl rounded-tl-sm px-4 py-2.5 leading-relaxed bg-card border border-border/80 shadow-sm text-foreground text-xs">
          {/* Cursor blink while streaming */}
          <span className="whitespace-pre-wrap">
            {m.displayText}
            {m.isStreaming && <span className="ml-0.5 inline-block w-0.5 h-3 bg-primary/80 animate-pulse align-middle" />}
          </span>
          <span className="mt-1.5 text-[9px] font-mono text-muted-foreground block text-right">{m.timestamp}</span>
          {/* Action bar on hover */}
          <div className={`absolute -bottom-5 right-1 flex items-center gap-1 transition-all ${hovered && !m.isStreaming ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <CopyButton text={m.text} />
            <ReactionButtons messageId={m.id} />
          </div>
        </div>
        {/* Follow-up suggestion chips */}
        {!m.isStreaming && m.follow_ups && m.follow_ups.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {m.follow_ups.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowUp(q)}
                className="rounded-full border border-border/60 bg-background/80 px-2.5 py-0.5 text-[9px] text-muted-foreground transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5 active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Auto-grow textarea ──────────────────────────────────────────────────── */
function AutoTextarea({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  // Grow height to fit content
  React.useEffect(() => {
    if (!ref.current) return
    ref.current.style.height = "auto"
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          if (!disabled && value.trim()) onSubmit()
        }
      }}
      placeholder="Ask about health, RUL, anomalies, mission risk… (Enter to send)"
      className="flex-1 resize-none overflow-hidden rounded-xl border border-border bg-background/90 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 transition-all"
    />
  )
}

/* ── Main right panel component ──────────────────────────────────────────── */
export function AICopilotRightPanel() {
  const { messages, input, setInput, waiting, isOpen, setIsOpen, handleSend, clearMessages } = useAICopilot()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const panelRef = React.useRef<HTMLElement>(null)

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, waiting])

  // Isolate chatbox scrolling — prevent wheel chaining to main page
  React.useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const handleWheel = (e: WheelEvent) => {
      const scrollEl = scrollRef.current
      if (!scrollEl) { e.preventDefault(); return }
      if (!scrollEl.contains(e.target as Node)) { e.preventDefault(); return }
      const { scrollTop, scrollHeight, clientHeight } = scrollEl
      const isScrollable = scrollHeight > clientHeight
      if (!isScrollable) { e.preventDefault(); return }
      const isAtTop = scrollTop <= 0
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1
      if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
        e.preventDefault()
      }
    }
    panel.addEventListener("wheel", handleWheel, { passive: false })
    return () => panel.removeEventListener("wheel", handleWheel)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <aside
      ref={panelRef}
      aria-label="PropulsionX Neural Engine"
      className="relative z-20 flex h-full w-[400px] md:w-[440px] xl:w-[480px] shrink-0 flex-col border-l border-border/60 bg-card/95 text-card-foreground shadow-2xl backdrop-blur-md transition-all duration-200 overflow-hidden overscroll-contain"
    >
      {/* ── Gradient top header ───────────────────────────────────────── */}
      <div className="shrink-0 flex flex-col border-b border-border/60 p-4 pb-3 bg-gradient-to-b from-card to-card/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AIAvatar size={9} />
            <div className="flex flex-col">
              <span className="font-heading text-sm font-semibold tracking-wide text-foreground leading-tight">
                PropulsionX Neural Engine
              </span>
              <span className="text-[10px] font-mono text-cyan-400">AERO-ML Intelligence Core</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold tracking-wider uppercase px-2 py-0.5"
            >
              10 HZ LIVE
            </Badge>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={clearMessages}
              title="Clear Chat History"
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Trash2Icon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setIsOpen(false)}
              title="Close Neural Console"
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          PropulsionX real-time reasoning grounded in UAV-07 thermodynamics, Bi-LSTM degradation models, and Isolation Forest anomaly drivers.
        </p>
      </div>

      {/* ── Quick prompt chips ────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap gap-1.5 border-b border-border/50 px-4 py-2.5 bg-muted/30">
        <span className="text-[9px] font-bold text-muted-foreground uppercase self-center mr-1 tracking-wider">Quick:</span>
        {QUICK_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSend(prompt)}
            className="rounded-full border border-border/70 bg-background/80 px-2.5 py-0.5 text-[9px] font-medium text-foreground transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5 active:scale-95"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* ── Messages list ─────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-5 text-xs bg-background/40 scrollbar-thin"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} onFollowUp={handleSend} />
        ))}
        {waiting && (
          <div className="flex gap-2.5 flex-row">
            <AIAvatar size={7} />
            <div className="flex flex-col gap-1.5">
              <CategoryBadge category="GENERAL_STATUS" />
              <div className="rounded-2xl rounded-tl-sm bg-card border border-border/80 shadow-sm">
                <TypingDots />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Input bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border/60 p-3 bg-card/80">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex items-end gap-2"
        >
          <AutoTextarea
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            disabled={waiting}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || waiting}
            className="h-9 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shrink-0 self-end"
          >
            {waiting ? (
              <SparklesIcon className="size-3.5 animate-spin" />
            ) : (
              <SendIcon className="size-3.5" />
            )}
          </Button>
        </form>
        <p className="mt-1.5 text-[9px] text-muted-foreground text-center">
          Enter to send · Shift+Enter for new line · Grounded in live telemetry
        </p>
      </div>
    </aside>
  )
}
