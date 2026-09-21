"use client"

import * as React from "react"
import { BotIcon, SendIcon, SparklesIcon, UserIcon } from "lucide-react"
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
import { QUICK_PROMPTS, useAICopilot } from "@/components/ai-copilot-context"

export function AICopilotSheet() {
  const { messages, input, setInput, waiting, isOpen, setIsOpen, handleSend } = useAICopilot()

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs text-primary border-primary bg-background hover:bg-primary hover:text-primary-foreground font-semibold">
            <BotIcon className="size-3.5 text-current" />
            <span>AI COPILOT</span>
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 bg-card text-card-foreground border-l border-border shadow-2xl">
        <SheetHeader className="border-b border-border p-4 pb-3 bg-card">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <BotIcon className="size-4 text-primary" />
              <span>AI Propulsion Engineer</span>
            </SheetTitle>
            <Badge variant="outline" className="border-emerald-500 bg-background text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
              GROUNDED IN TWIN
            </Badge>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Reasoning grounded in real-time engine physics, LSTM predictions, and fault telemetry.
          </SheetDescription>
        </SheetHeader>

        {/* Quick prompt chips */}
        <div className="flex flex-wrap gap-1.5 border-b border-border p-3 bg-muted">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase self-center mr-1">Quick:</span>
          {QUICK_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSend(prompt)}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[10px] text-foreground transition-colors hover:border-primary hover:bg-background"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages scroll area */}
        <ScrollArea className="flex-1 p-4 bg-background">
          <div className="flex flex-col gap-3">
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
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground border border-border"
                  }`}
                >
                  {m.role === "user" ? <UserIcon className="size-3.5" /> : <BotIcon className="size-3.5 text-primary" />}
                </div>
                <div
                  className={`flex max-w-[82%] flex-col rounded-lg px-3 py-2 leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-card border border-border text-foreground shadow-xs"
                  }`}
                >
                  <span className="whitespace-pre-wrap">{m.text}</span>
                  <span className={`mt-1 self-end text-[9px] ${m.role === "user" ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                    {m.timestamp}
                  </span>
                </div>
              </div>
            ))}
            {waiting && (
              <div className="flex gap-2 text-xs text-muted-foreground items-center bg-card p-2 rounded-md border border-border">
                <SparklesIcon className="size-3.5 animate-spin text-primary" />
                <span>AI Engineer reasoning over Digital Twin telemetry…</span>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input bar */}
        <div className="border-t border-border p-3 bg-card">
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
              placeholder="Ask about health, RUL, anomalies, mission risk..."
              className="h-9 text-xs bg-background border-border text-foreground"
            />
            <Button type="submit" size="sm" disabled={!input.trim() || waiting} className="h-9 px-3 gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
              <SendIcon className="size-3.5" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
