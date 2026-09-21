"use client"

import * as React from "react"
import { useTelemetry } from "@/components/telemetry-provider"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  timestamp: string
}

export const QUICK_PROMPTS = [
  "Why is the engine health degraded?",
  "What is the top driver for the current anomaly?",
  "Can this engine complete the planned mission safely?",
  "What maintenance action is recommended right now?",
  "What happens to CHT if I derate RPM by 200?",
]

export const SHORT_PROMPTS = [
  { label: "Health?", query: "Why is the engine health degraded?" },
  { label: "Top Driver?", query: "What is the top driver for the current anomaly?" },
  { label: "Mission Risk?", query: "Can this engine complete the planned mission safely?" },
  { label: "Action?", query: "What maintenance action is recommended right now?" },
]

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
      text: "Hello, Commander. I am your Digital Twin AI Mission Engineer. I have direct access to live first-principles thermodynamics, LSTM RUL predictions, sensor integrity scores, and isolation forest anomaly drivers. How can I assist with your flight envelope?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    },
  ])
  const [input, setInput] = React.useState("")
  const [waiting, setWaiting] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const lastProcessedRef = React.useRef<number | null>(null)

  // Ingest answers from backend WebSocket
  React.useEffect(() => {
    const resp = latestTelemetry?.ai_engineer_response
    if (!resp || !resp.answer) return

    const ts = resp.timestamp ?? Date.now()
    if (lastProcessedRef.current === ts) return
    lastProcessedRef.current = ts

    setMessages((prev) => [
      ...prev,
      {
        id: `resp-${ts}-${Math.random()}`,
        role: "assistant",
        text: resp.answer || "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      },
    ])
    setWaiting(false)
  }, [latestTelemetry?.ai_engineer_response])

  const handleSend = (textToSend?: string) => {
    const q = (textToSend || input).trim()
    if (!q) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
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
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: "assistant",
        text: "Conversation reset. Digital twin telemetry monitoring active. Ask any question regarding engine propulsion or mission state.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
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
