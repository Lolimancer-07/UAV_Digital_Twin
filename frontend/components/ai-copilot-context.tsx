"use client"

import * as React from "react"
import { useTelemetry } from "@/components/telemetry-provider"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  displayText: string      // animated text (streams in character by character)
  timestamp: string
  category?: string        // intent category from backend e.g. "RUL_STATUS"
  confidence?: number      // 0-1 classification confidence
  follow_ups?: string[]    // suggested next questions
  isStreaming?: boolean     // true while typewriter is running
}

export const QUICK_PROMPTS = [
  "Why is the engine health degraded?",
  "What is the top driver for the current anomaly?",
  "Can this engine complete the planned mission safely?",
  "What maintenance action is recommended right now?",
  "What happens to CHT if I derate RPM by 200?",
]

export const SHORT_PROMPTS = [
  { label: "Health?",       query: "Why is the engine health degraded?" },
  { label: "Top Driver?",   query: "What is the top driver for the current anomaly?" },
  { label: "Mission Risk?", query: "Can this engine complete the planned mission safely?" },
  { label: "Action?",       query: "What maintenance action is recommended right now?" },
]

// Human-readable labels and colours for each intent category
export const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  WHY_UNHEALTHY:  { label: "Health",     emoji: "❤️",  color: "text-rose-500 border-rose-500/40 bg-rose-500/10" },
  WHY_ANOMALY:    { label: "Fault",      emoji: "⚠️",  color: "text-amber-500 border-amber-500/40 bg-amber-500/10" },
  RUL_STATUS:     { label: "RUL",        emoji: "🔋",  color: "text-cyan-500 border-cyan-500/40 bg-cyan-500/10" },
  MISSION_RISK:   { label: "Mission",    emoji: "🛩️",  color: "text-violet-500 border-violet-500/40 bg-violet-500/10" },
  RPM_ADVICE:     { label: "Throttle",   emoji: "⚡",  color: "text-yellow-500 border-yellow-500/40 bg-yellow-500/10" },
  MAINTENANCE:    { label: "Maint.",     emoji: "🔧",  color: "text-orange-500 border-orange-500/40 bg-orange-500/10" },
  RECOMMENDATION: { label: "Advisory",  emoji: "📋",  color: "text-blue-500 border-blue-500/40 bg-blue-500/10" },
  SENSOR_STATUS:  { label: "Sensors",   emoji: "📡",  color: "text-teal-500 border-teal-500/40 bg-teal-500/10" },
  THERMAL:        { label: "Thermal",   emoji: "🌡️",  color: "text-red-500 border-red-500/40 bg-red-500/10" },
  OIL:            { label: "Oil",       emoji: "🛢️",  color: "text-amber-600 border-amber-600/40 bg-amber-600/10" },
  VIBRATION:      { label: "Vibration", emoji: "📳",  color: "text-purple-500 border-purple-500/40 bg-purple-500/10" },
  GENERAL_STATUS: { label: "Status",    emoji: "🖥️",  color: "text-slate-400 border-slate-400/40 bg-slate-400/10" },
}

const TYPEWRITER_SPEED_MS = 8  // ms per character

interface AICopilotContextType {
  messages: ChatMessage[]
  input: string
  setInput: (val: string) => void
  waiting: boolean
  isOpen: boolean
  setIsOpen: (val: boolean) => void
  handleSend: (textToSend?: string) => void
  clearMessages: () => void
}

const AICopilotContext = React.createContext<AICopilotContextType | null>(null)

export function AICopilotProvider({ children }: { children: React.ReactNode }) {
  const { latestTelemetry, sendCommand } = useTelemetry()
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "initial",
      role: "assistant",
      text: "PropulsionX Neural Engine online. Digital Twin telemetry link synchronized (UAV-07 Rotax 914 F @ 10 Hz). Ingesting thermodynamics, Bi-LSTM RUL prognostics, and Isolation Forest anomaly drivers. Standing by for tactical queries.",
      displayText: "PropulsionX Neural Engine online. Digital Twin telemetry link synchronized (UAV-07 Rotax 914 F @ 10 Hz). Ingesting thermodynamics, Bi-LSTM RUL prognostics, and Isolation Forest anomaly drivers. Standing by for tactical queries.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      category: "GENERAL_STATUS",
      follow_ups: QUICK_PROMPTS.slice(0, 3),
      isStreaming: false,
    },
  ])
  const [input, setInput] = React.useState("")
  const [waiting, setWaiting] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const lastProcessedRef = React.useRef<number | null>(null)

  // Typewriter effect: streams displayText character by character
  const streamMessage = React.useCallback((id: string, fullText: string) => {
    let i = 0
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, displayText: "", isStreaming: true } : m))
    )
    const tick = () => {
      i++
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, displayText: fullText.slice(0, i), isStreaming: i < fullText.length }
            : m
        )
      )
      if (i < fullText.length) {
        setTimeout(tick, TYPEWRITER_SPEED_MS)
      }
    }
    setTimeout(tick, TYPEWRITER_SPEED_MS)
  }, [])

  // Ingest answers from backend WebSocket
  React.useEffect(() => {
    const resp = latestTelemetry?.ai_engineer_response
    if (!resp || !resp.answer) return

    const ts = resp.timestamp ?? Date.now()
    if (lastProcessedRef.current === ts) return
    lastProcessedRef.current = ts

    const msgId = `resp-${ts}-${Math.random()}`
    const newMsg: ChatMessage = {
      id: msgId,
      role: "assistant",
      text: resp.answer || "",
      displayText: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      category: resp.category,
      confidence: resp.confidence,
      follow_ups: resp.follow_ups,
      isStreaming: true,
    }

    setMessages((prev) => [...prev, newMsg])
    setWaiting(false)
    streamMessage(msgId, resp.answer || "")
  }, [latestTelemetry?.ai_engineer_response, streamMessage])

  const handleSend = (textToSend?: string) => {
    const q = (textToSend || input).trim()
    if (!q) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: q,
      displayText: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      isStreaming: false,
    }

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setWaiting(true)

    sendCommand({
      command: "ai_engineer_query",
      question: q,
    })
  }

  const clearMessages = () => {
    const resetText = "Nexus re-initialized. Live telemetry monitoring active. Ask me anything about propulsion health, RUL, faults, or mission risk."
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: "assistant",
        text: resetText,
        displayText: resetText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        category: "GENERAL_STATUS",
        follow_ups: QUICK_PROMPTS.slice(0, 3),
        isStreaming: false,
      },
    ])
  }

  return (
    <AICopilotContext.Provider
      value={{
        messages,
        input,
        setInput,
        waiting,
        isOpen,
        setIsOpen,
        handleSend,
        clearMessages,
      }}
    >
      {children}
    </AICopilotContext.Provider>
  )
}

export function useAICopilot() {
  const ctx = React.useContext(AICopilotContext)
  if (!ctx) {
    throw new Error("useAICopilot must be used within an AICopilotProvider")
  }
  return ctx
}

export const useNeuralEngine = useAICopilot

