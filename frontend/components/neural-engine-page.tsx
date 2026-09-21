"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  Flame,
  Gauge,
  Layers,
  PanelRight,
  PanelRightClose,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Waves,
  Wrench,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_META, QUICK_PROMPTS, useAICopilot } from "@/components/ai-copilot-context"
import { useTelemetry } from "@/components/telemetry-provider"
import type { ChatMessage } from "@/components/ai-copilot-context"

/* ═══════════════════════════════════════════════════════════════════════════════
   PRESET SCENARIO CARDS (FOR STANDARD EMPTY STATE / HERO)
   ═══════════════════════════════════════════════════════════════════════════════ */
const STARTER_SCENARIOS = [
  {
    icon: <Flame className="size-4 text-amber-500" />,
    title: "Thermal CHT & Cooling",
    desc: "Why is cylinder head temperature elevated and what derate is needed?",
    query: "Why is cylinder head temperature elevated and what derate is needed?",
  },
  {
    icon: <Waves className="size-4 text-cyan-500" />,
    title: "Vibration & Mechanical Wear",
    desc: "What is the primary driver for the current vibration anomaly?",
    query: "What is the top driver for the current anomaly?",
  },
  {
    icon: <ShieldAlert className="size-4 text-violet-500" />,
    title: "Mission Go/No-Go Feasibility",
    desc: "Can this engine complete the planned mission safely with current RUL?",
    query: "Can this engine complete the planned mission safely?",
  },
  {
    icon: <Zap className="size-4 text-emerald-500" />,
    title: "Throttle Derate Recovery",
    desc: "What happens to CHT if I derate throttle RPM by 200?",
    query: "What happens to CHT if I derate RPM by 200?",
  },
  {
    icon: <Wrench className="size-4 text-orange-500" />,
    title: "Maintenance Action Priority",
    desc: "What line-replaceable unit servicing is recommended right now?",
    query: "What maintenance action is recommended right now?",
  },
  {
    icon: <Activity className="size-4 text-rose-500" />,
    title: "Full Subsystem Health Audit",
    desc: "Break down the degradation factors contributing to the health score.",
    query: "Why is the engine health degraded?",
  },
]

/* ═══════════════════════════════════════════════════════════════════════════════
   USER TRANSMISSION MESSAGE
   ═══════════════════════════════════════════════════════════════════════════════ */
function UserMessageRow({ m }: { m: ChatMessage }) {
  return (
    <div className="flex justify-end gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex max-w-[80%] md:max-w-[70%] flex-col items-end gap-1">
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span>Flight Commander</span>
          <span>·</span>
          <span>{m.timestamp}</span>
        </div>
        <div className="rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-2.5 text-sm leading-relaxed shadow-sm font-sans">
          <p className="whitespace-pre-wrap">{m.displayText}</p>
        </div>
      </div>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mt-1">
        <User className="size-4" />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ASSISTANT ENGINE READOUT MESSAGE
   ═══════════════════════════════════════════════════════════════════════════════ */
function AssistantMessageRow({
  m,
  onFollowUp,
}: {
  m: ChatMessage
  onFollowUp: (prompt: string) => void
}) {
  const [copied, setCopied] = React.useState(false)
  const [vote, setVote] = React.useState<"up" | "down" | null>(null)

  const meta = m.category ? CATEGORY_META[m.category] : null
  const confidencePct = m.confidence ? (m.confidence * 100).toFixed(0) : "94"

  const handleCopy = () => {
    navigator.clipboard.writeText(m.text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Engine Avatar */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs mt-1">
        <Brain className="size-4.5" />
      </div>

      <div className="flex flex-1 min-w-0 max-w-[85%] md:max-w-[80%] flex-col gap-2">
        {/* Metadata Bar */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
          <span className="font-semibold text-foreground">PropulsionX Engine</span>
          {meta && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.2 font-medium ${meta.color}`}
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
            </span>
          )}
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.2 text-muted-foreground">
            {confidencePct}% confidence
          </span>
          <span className="hidden sm:inline text-muted-foreground">
            · Grounded in Rotax 914 F
          </span>
          <span className="ml-auto text-muted-foreground">{m.timestamp}</span>
        </div>

        {/* Message Content Bubble */}
        <div className="rounded-2xl rounded-tl-xs border border-border/80 bg-card p-4 text-sm text-card-foreground shadow-xs leading-relaxed">
          <p className="whitespace-pre-wrap font-sans">{m.displayText}</p>
          {m.isStreaming && (
            <span className="ml-1 inline-block size-2 rounded-full bg-primary animate-pulse align-middle" />
          )}

          {/* Action Footer */}
          {!m.isStreaming && (
            <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setVote(vote === "up" ? null : "up")}
                  className={`size-6 rounded-md ${
                    vote === "up" ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Helpful"
                >
                  <ThumbsUp className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setVote(vote === "down" ? null : "down")}
                  className={`size-6 rounded-md ${
                    vote === "down" ? "text-rose-500 bg-rose-500/10" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Not helpful"
                >
                  <ThumbsDown className="size-3" />
                </Button>
              </div>

              <span className="text-[10px] font-mono text-muted-foreground/80">
                Validated against Live Telemetry
              </span>
            </div>
          )}
        </div>

        {/* Follow-up Action Suggestions */}
        {!m.isStreaming && m.follow_ups && m.follow_ups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {m.follow_ups.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowUp(q)}
                className="group flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-1 text-xs text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all shadow-2xs"
              >
                <Sparkles className="size-3 text-primary/70 group-hover:text-primary transition-colors" />
                <span>{q}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TELEMETRY SENSORS SIDE DRAWER
   ═══════════════════════════════════════════════════════════════════════════════ */
function TelemetrySideDrawer({
  isOpen,
  onClose,
  telemetry,
}: {
  isOpen: boolean
  onClose: () => void
  telemetry: any
}) {
  if (!isOpen) return null

  const hi = telemetry?.health?.health_index ?? 92
  const rul = telemetry?.predicted_rul ?? 85
  const rpm = telemetry?.rpm ?? 1400
  const cht = telemetry?.cht ?? 395
  const egt = telemetry?.egt ?? 1600
  const oilPress = telemetry?.oil_pressure ?? 52
  const vib = telemetry?.vibration ?? 1.4
  const condition = telemetry?.health?.condition ?? "NOMINAL"

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card/50 backdrop-blur-sm p-4 flex flex-col gap-4 overflow-y-auto animate-in slide-in-from-right-4 duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <span className="font-semibold text-sm">Telemetry Inspector</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-7 rounded-lg">
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      {/* Health Gauge Box */}
      <div className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-muted-foreground">ENGINE HEALTH</span>
          <Badge
            variant="outline"
            className={
              hi < 60
                ? "border-rose-500/40 text-rose-500 bg-rose-500/10"
                : hi < 80
                ? "border-amber-500/40 text-amber-500 bg-amber-500/10"
                : "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
            }
          >
            {condition}
          </Badge>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-mono font-bold">{hi.toFixed(0)}</span>
          <span className="text-sm font-mono text-muted-foreground">/ 100</span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              hi < 60 ? "bg-rose-500" : hi < 80 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.max(5, Math.min(100, hi))}%` }}
          />
        </div>
      </div>

      {/* Sensor Metric Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="rounded-lg border border-border/70 bg-card p-2.5">
          <span className="text-muted-foreground text-[10px] block">RUL HORIZON</span>
          <span className="text-base font-bold text-foreground">{rul.toFixed(0)} cyc</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-card p-2.5">
          <span className="text-muted-foreground text-[10px] block">ENGINE RPM</span>
          <span className="text-base font-bold text-foreground">{rpm.toFixed(0)}</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-card p-2.5">
          <span className="text-muted-foreground text-[10px] block">CYL HEAD (CHT)</span>
          <span className="text-base font-bold text-foreground">{cht.toFixed(0)}°F</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-card p-2.5">
          <span className="text-muted-foreground text-[10px] block">EXHAUST (EGT)</span>
          <span className="text-base font-bold text-foreground">{egt.toFixed(0)}°F</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-card p-2.5">
          <span className="text-muted-foreground text-[10px] block">OIL PRESSURE</span>
          <span className="text-base font-bold text-foreground">{oilPress.toFixed(1)} PSI</span>
        </div>
        <div className="rounded-lg border border-border/70 bg-card p-2.5">
          <span className="text-muted-foreground text-[10px] block">VIBRATION</span>
          <span className="text-base font-bold text-foreground">{vib.toFixed(2)} g</span>
        </div>
      </div>

      {/* Model Spec */}
      <div className="rounded-xl border border-border/70 bg-card p-3 text-xs flex flex-col gap-1.5 font-mono">
        <span className="text-[10px] font-bold text-muted-foreground uppercase">AI Architecture</span>
        <div className="flex justify-between text-muted-foreground">
          <span>Intent Classification:</span>
          <span className="text-foreground font-semibold">TF-IDF + LogReg</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Prognostics (RUL):</span>
          <span className="text-foreground font-semibold">Bi-LSTM (95% CI)</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Anomaly Attributions:</span>
          <span className="text-foreground font-semibold">Isolation Forest</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Telemetry Sample Rate:</span>
          <span className="text-emerald-500 font-semibold">10 Hz Synchronized</span>
        </div>
      </div>
    </aside>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PROPULSIONX NEURAL ENGINE PAGE (STANDARD LAYOUT)
   ═══════════════════════════════════════════════════════════════════════════════ */
export function NeuralEnginePage() {
  const { messages, input, setInput, waiting, handleSend, clearMessages } = useAICopilot()
  const { latestTelemetry } = useTelemetry()
  const chatScrollRef = React.useRef<HTMLDivElement>(null)
  const [showInspector, setShowInspector] = React.useState<boolean>(false)

  // Live telemetry
  const hi = latestTelemetry?.health?.health_index ?? 92
  const rul = latestTelemetry?.predicted_rul ?? 85
  const condition = latestTelemetry?.health?.condition ?? "NOMINAL"

  // Check if conversation only has the initial greeting
  const isInitialState = messages.length <= 1

  // Auto-scroll when messages update
  React.useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, waiting])

  return (
    <div data-fixed-layout="true" className="flex flex-1 min-h-0 h-full w-full flex-col overflow-hidden bg-background">
      {/* ── TOP STANDARD ENGINE BAR ─────────────────────────────────────── */}
      <header className="shrink-0 border-b border-border bg-card/60 px-4 sm:px-6 py-2.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          {/* Identity */}
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <Brain className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-sm font-bold tracking-tight text-foreground">
                  PropulsionX Neural Engine
                </h1>
                <Badge variant="outline" className="border-border text-[9px] font-mono px-1.5 py-0">
                  ML Core 4.2
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono px-1.5 py-0"
                >
                  10 Hz Live
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                UAV-07 Rotax 914 F Digital Twin · Grounded in Live Telemetry
              </p>
            </div>
          </div>

          {/* Quick Context Badges & Actions */}
          <div className="flex items-center gap-2">
            {/* Quick telemetry pill */}
            <div className="hidden sm:flex items-center gap-2 border border-border/80 rounded-lg px-2.5 py-1 bg-background text-[11px] font-mono">
              <span className="text-muted-foreground">Health:</span>
              <span
                className={`font-bold ${
                  hi < 60 ? "text-rose-500" : hi < 80 ? "text-amber-500" : "text-emerald-500"
                }`}
              >
                {hi.toFixed(0)}% ({condition})
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">RUL:</span>
              <span className="font-bold text-foreground">{rul.toFixed(0)} cyc</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInspector(!showInspector)}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-border/80"
              title="Toggle Telemetry Inspector"
            >
              <PanelRight className="size-3.5" />
              <span className="hidden md:inline">Telemetry</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title="Clear conversation history"
            >
              <Trash2 className="size-3.5" />
              <span className="hidden md:inline">Clear</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── MAIN CHAT AREA + OPTIONAL INSPECTOR ─────────────────────────── */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Central Chat Feed */}
        <main className="flex flex-1 min-w-0 flex-col overflow-hidden">
          <div
            ref={chatScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6 scrollbar-thin"
          >
            <div className="mx-auto max-w-3xl flex flex-col gap-6">
              {/* If Initial State: Show Standard AI Hero & Starter Scenarios */}
              {isInitialState && (
                <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in duration-300">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-sm mb-3">
                    <Brain className="size-7" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    PropulsionX AI Engine
                  </h2>
                  <p className="max-w-md text-xs sm:text-sm text-muted-foreground mt-1 mb-6 leading-relaxed">
                    Directly synchronized with UAV-07 propulsion digital twin telemetry. Ask a question or select a scenario below to begin diagnostics.
                  </p>

                  {/* 2x3 Starter Scenario Grid - Clean & Standard */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                    {STARTER_SCENARIOS.map((sc, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSend(sc.query)}
                        className="group flex items-start gap-3 rounded-xl border border-border/80 bg-card/60 p-3.5 hover:border-primary/40 hover:bg-card transition-all shadow-2xs text-left"
                      >
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 border border-border/60 group-hover:scale-105 transition-transform">
                          {sc.icon}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                            {sc.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mt-0.5">
                            {sc.desc}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessageRow key={m.id} m={m} />
                ) : (
                  <AssistantMessageRow key={m.id} m={m} onFollowUp={handleSend} />
                )
              )}

              {/* Waiting Indicator */}
              {waiting && (
                <div className="flex gap-3 animate-in fade-in duration-200">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs mt-1">
                    <Brain className="size-4.5 animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1 max-w-[80%]">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                      <span>PropulsionX Engine</span>
                      <span>·</span>
                      <span className="text-primary animate-pulse">Reasoning...</span>
                    </div>
                    <div className="rounded-2xl rounded-tl-xs border border-border/80 bg-card p-4 text-sm text-muted-foreground shadow-xs flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <span className="size-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="size-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="size-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-xs font-mono ml-1">Analyzing digital twin telemetry vectors…</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── BOTTOM COMPOSER (PROMPT BAR - FIXED PINNED AT BOTTOM) ───────── */}
          <div className="shrink-0 sticky bottom-0 z-20 border-t border-border/80 bg-card/95 backdrop-blur-md px-4 py-3 shadow-sm">
            <div className="mx-auto max-w-3xl flex flex-col gap-2">
              {/* Quick suggestion pills (horizontal scrollable) */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 text-xs">
                {QUICK_PROMPTS.slice(0, 4).map((qp, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(qp)}
                    className="shrink-0 rounded-full border border-border/80 bg-background px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/40 transition-all shadow-2xs"
                  >
                    {qp}
                  </button>
                ))}
              </div>

              {/* Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSend()
                }}
                className="relative flex items-center rounded-2xl border border-border bg-background p-1.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all"
              >
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      if (!waiting && input.trim()) handleSend()
                    }
                  }}
                  placeholder="Ask PropulsionX about health, anomalies, RUL, CHT, or mission risk... (Enter to send)"
                  disabled={waiting}
                  className="flex-1 resize-none bg-transparent px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32"
                />

                <Button
                  type="submit"
                  disabled={!input.trim() || waiting}
                  size="icon"
                  className="size-8 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </form>

              <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
                <span>PropulsionX Neural Engine · Grounded in live UAV-07 digital twin</span>
                <span>Shift + Enter for new line</span>
              </div>
            </div>
          </div>
        </main>

        {/* Optional Collapsible Telemetry Inspector */}
        <TelemetrySideDrawer
          isOpen={showInspector}
          onClose={() => setShowInspector(false)}
          telemetry={latestTelemetry}
        />
      </div>
    </div>
  )
}
