"use client"

import * as React from "react"
import { BotIcon, CheckIcon, CopyIcon, SendIcon, SparklesIcon, UserIcon } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CATEGORY_META, QUICK_PROMPTS, useAICopilot } from "@/components/ai-copilot-context"
import type { ChatMessage } from "@/components/ai-copilot-context"

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null
  const meta = CATEGORY_META[category]
  if (!meta) return null
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${meta.color}`}>
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      title="Copy"
      className="flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
    >
      {copied ? <CheckIcon className="size-3 text-emerald-400" /> : <CopyIcon className="size-3" />}
    </button>
  )
}

function MessageBubble({ m, onFollowUp }: { m: ChatMessage; onFollowUp: (q: string) => void }) {
  const isUser = m.role === "user"
  if (isUser) {
    return (
      <div className="flex gap-2.5 flex-row-reverse">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UserIcon className="size-3.5" />
        </div>
        <div className="flex max-w-[82%] flex-col rounded-2xl rounded-tr-sm px-3.5 py-2.5 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
          <span className="text-xs font-medium whitespace-pre-wrap">{m.displayText}</span>
          <span className="mt-1 self-end text-[9px] font-mono text-primary-foreground/75">{m.timestamp}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2.5 flex-row">
      <div className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary">
        <BotIcon className="size-3.5" />
      </div>
      <div className="flex max-w-[82%] flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <CategoryBadge category={m.category} />
          {m.isStreaming && <span className="text-[9px] font-mono text-primary/60 animate-pulse">typing…</span>}
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-card border border-border/80 px-3.5 py-2.5 shadow-xs text-foreground text-xs">
          <span className="whitespace-pre-wrap">
            {m.displayText}
            {m.isStreaming && <span className="ml-0.5 inline-block w-0.5 h-3 bg-primary/80 animate-pulse align-middle" />}
          </span>
          <div className="mt-1.5 flex items-center justify-between">
            <CopyButton text={m.text} />
            <span className="text-[9px] font-mono text-muted-foreground">{m.timestamp}</span>
          </div>
        </div>
        {!m.isStreaming && m.follow_ups && m.follow_ups.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {m.follow_ups.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowUp(q)}
                className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[9px] text-muted-foreground transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5"
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

export function AICopilotSheet() {
  const { messages, input, setInput, waiting, isOpen, setIsOpen, handleSend } = useAICopilot()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, waiting])

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-primary border-primary bg-background hover:bg-primary hover:text-primary-foreground font-semibold">
            <BotIcon className="size-3.5 text-current" />
            <span>NEXUS</span>
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 bg-card text-card-foreground border-l border-border shadow-2xl">
        <SheetHeader className="border-b border-border p-4 pb-3 bg-gradient-to-b from-card to-card/60">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <div className="relative flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary">
                <BotIcon className="size-3.5" />
                <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-400 ring-2 ring-background animate-pulse" />
              </div>
              <span>Nexus</span>
            </SheetTitle>
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold tracking-wider uppercase">
              LIVE
            </Badge>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Reasoning grounded in real-time engine physics, LSTM predictions, and fault telemetry.
          </SheetDescription>
        </SheetHeader>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-1.5 border-b border-border p-3 bg-muted/30">
          <span className="text-[9px] font-bold text-muted-foreground uppercase self-center mr-1 tracking-wider">Quick:</span>
          {QUICK_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSend(prompt)}
              className="rounded-full border border-border/80 bg-background/90 px-2.5 py-0.5 text-[10px] text-foreground transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5 active:scale-95"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4 bg-background/50 scrollbar-thin"
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} onFollowUp={handleSend} />
          ))}
          {waiting && (
            <div className="flex gap-2.5 flex-row">
              <div className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary">
                <BotIcon className="size-3.5" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-card border border-border/80 px-3.5 py-2.5 shadow-xs">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.9s" }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 bg-card/80">
          <form onSubmit={(e) => { e.preventDefault(); handleSend() }} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about health, RUL, anomalies, mission risk…"
              className="h-9 text-xs bg-background border-border text-foreground"
            />
            <Button type="submit" size="sm" disabled={!input.trim() || waiting} className="h-9 px-3 gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
              {waiting ? <SparklesIcon className="size-3.5 animate-spin" /> : <SendIcon className="size-3.5" />}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
