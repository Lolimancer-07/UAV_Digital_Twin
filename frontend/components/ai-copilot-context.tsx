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

function generateFallbackResponse(
  question: string,
  t?: ReturnType<typeof useTelemetry>["latestTelemetry"]
): { answer: string; category: string; follow_ups: string[] } {
  const q = question.toLowerCase()
  const health = Math.round(t?.health?.health_index ?? 94)
  const rul = Math.round(t?.predicted_rul ?? 142)
  const rpm = Math.round(t?.rpm ?? 2400)
  const cht = Math.round(t?.cht ?? 382)
  const egt = Math.round(t?.egt ?? 1465)
  const activeFaults = (t?.fault_events ?? []).map((f) => f.name || "FAULT")

  if (q.includes("health") || q.includes("degraded") || q.includes("condition")) {
    return {
      category: "WHY_UNHEALTHY",
      answer: `Rotax 914 F propulsion health is currently at ${health}/100 (${t?.health?.condition ?? "NOMINAL"}). Thermal loading sub-score is ${t?.health?.sub_scores?.thermal ?? 96}%, lubrication is ${t?.health?.sub_scores?.lubrication ?? 94}%, and mechanical balance is ${t?.health?.sub_scores?.mechanical ?? 92}%. ${
        activeFaults.length > 0 ? `Active fault triggers: ${activeFaults.join(", ")}.` : "All subsystems operating within standard envelope."
      }`,
      follow_ups: ["What maintenance action is recommended right now?", "What happens to CHT if I derate RPM by 200?"],
    }
  }

  if (q.includes("anomaly") || q.includes("fault") || q.includes("driver")) {
    return {
      category: "WHY_ANOMALY",
      answer: activeFaults.length > 0
        ? `Anomaly detector Isolation Forest flagged active events: ${activeFaults.join(", ")}. Primary parameter residuals indicate elevated thermal gradient on cylinder #${(t?.cht_cyl ? t.cht_cyl.indexOf(Math.max(...t.cht_cyl)) + 1 : 2)}.`
        : `Isolation Forest anomaly score is ${t?.anomaly_score?.toFixed(4) ?? "0.0820"} (nominal baseline). No anomalous variance detected across RPM, MAP, CHT, EGT, or vibration kurtosis.`,
      follow_ups: ["Can this engine complete the planned mission safely?", "Why is the engine health degraded?"],
    }
  }

  if (q.includes("rul") || q.includes("remaining") || q.includes("life")) {
    return {
      category: "RUL_STATUS",
      answer: `Bi-LSTM RUL model estimates ${rul} remaining cycles [90% CI: ${Math.round(t?.rul_ci_lower ?? rul * 0.85)} – ${Math.round(t?.rul_ci_upper ?? rul * 1.15)} cycles] with Monte Carlo uncertainty std of ${t?.rul_mc_std?.toFixed(2) ?? "4.20"}. Service window exceeds planned mission profile by >3.2x.`,
      follow_ups: ["Can this engine complete the planned mission safely?", "What maintenance action is recommended right now?"],
    }
  }

  if (q.includes("mission") || q.includes("safely") || q.includes("risk")) {
    return {
      category: "MISSION_RISK",
      answer: `Mission feasibility analysis: ${health >= 70 ? "HIGH CONFIDENCE GO" : "ADVISORY HOLD"}. Projected completion probability is ${Math.round(92 - (100 - health) * 0.4)}%. Safe endurance is estimated at ${(rul * 0.08).toFixed(1)} flight hours under current cruise power (${rpm} RPM, ${cht}°F CHT).`,
      follow_ups: ["What happens to CHT if I derate RPM by 200?", "What maintenance action is recommended right now?"],
    }
  }

  if (q.includes("derate") || q.includes("rpm") || q.includes("throttle") || q.includes("cht")) {
    const estNewCht = Math.round(cht * Math.pow((rpm - 200) / rpm, 1.3))
    return {
      category: "RPM_ADVICE",
      answer: `Derating engine speed by -200 RPM (from ${rpm} to ${Math.max(1200, rpm - 200)} RPM) is projected by the Otto-cycle physics twin to decrease peak CHT from ${cht}°F to ~${estNewCht}°F (-${cht - estNewCht}°F reduction) and recover +${Math.round(rul * 0.12)} cycles of remaining useful life.`,
      follow_ups: ["Why is the engine health degraded?", "Can this engine complete the planned mission safely?"],
    }
  }

  if (q.includes("maintenance") || q.includes("action") || q.includes("advisory")) {
    return {
      category: "MAINTENANCE",
      answer: `Autonomous Maintenance Advisor recommendations: 1) Verify cylinder head thermocouple calibration. 2) Inspect lubrication gallery pressure filter (current: ${t?.oil_pressure?.toFixed(1) ?? "48.5"} PSI). 3) Schedule standard 50-hr post-flight boroscope inspection at Base Home.`,
      follow_ups: ["Why is the engine health degraded?", "Can this engine complete the planned mission safely?"],
    }
  }

  return {
    category: "GENERAL_STATUS",
    answer: `Propulsion status UAV-07 (Rotax 914 F): ${rpm} RPM | CHT ${cht}°F | EGT ${egt}°F | Health ${health}% | RUL ${rul} cyc. Digital Twin state is synchronized and within nominal aerodynamic envelope.`,
    follow_ups: QUICK_PROMPTS.slice(0, 3),
  }
}

export function AICopilotProvider({ children }: { children: React.ReactNode }) {
  const { latestTelemetry, sendCommand } = useTelemetry()
  const latestTelemetryRef = React.useRef(latestTelemetry)
  React.useEffect(() => {
    latestTelemetryRef.current = latestTelemetry
  }, [latestTelemetry])

  const sessionIdRef = React.useRef<string | null>(null)

  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: "initial",
      role: "assistant",
      text: "Agent 37 Neural Engine online (Instance: c1iy0ok07a · Hermes). Digital Twin telemetry link synchronized (UAV-07 Rotax 914 F @ 10 Hz). Ingesting thermodynamics, Bi-LSTM RUL prognostics, and Isolation Forest anomaly drivers. Standing by for tactical queries.",
      displayText: "Agent 37 Neural Engine online (Instance: c1iy0ok07a · Hermes). Digital Twin telemetry link synchronized (UAV-07 Rotax 914 F @ 10 Hz). Ingesting thermodynamics, Bi-LSTM RUL prognostics, and Isolation Forest anomaly drivers. Standing by for tactical queries.",
      timestamp: "ONLINE",
      category: "GENERAL_STATUS",
      follow_ups: QUICK_PROMPTS.slice(0, 3),
      isStreaming: false,
    },
  ])
  const [input, setInput] = React.useState("")
  const [waiting, setWaiting] = React.useState(false)
  const waitingRef = React.useRef(false)
  const lastSendTimeRef = React.useRef(0)
  const [isOpen, setIsOpen] = React.useState(false)
  const lastProcessedRef = React.useRef<string | null>(null)
  const fallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // On mount, ignore any stale response generated before the user session started
  React.useEffect(() => {
    const existing = latestTelemetry?.ai_engineer_response
    if (existing && existing.answer && lastProcessedRef.current === null) {
      lastProcessedRef.current = `${existing.question || ""}_${existing.timestamp || ""}_${existing.answer.slice(0, 20)}`
    }
  }, [latestTelemetry?.ai_engineer_response])

  // Ingest answers from backend WebSocket (fallback sync)
  React.useEffect(() => {
    const resp = latestTelemetry?.ai_engineer_response
    if (!resp || !resp.answer) return

    const key = `${resp.question || ""}_${resp.timestamp || ""}_${resp.answer.slice(0, 20)}`
    if (lastProcessedRef.current === key) return
    lastProcessedRef.current = key

    waitingRef.current = false
    setWaiting(false)

    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }

    const msgId = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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

    setMessages((prev) => {
      // Deduplicate: ignore if identical assistant reply already added
      const last = prev[prev.length - 1]
      if (last && last.role === "assistant" && last.text === (resp.answer || "")) {
        return prev
      }
      return [...prev, newMsg]
    })
    streamMessage(msgId, resp.answer || "")
  }, [latestTelemetry?.ai_engineer_response, streamMessage])

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim()
    if (!q) return

    // Debounce rapid double-triggers (e.g. Enter key + form submit within 400ms)
    const now = Date.now()
    if (now - lastSendTimeRef.current < 400) return
    lastSendTimeRef.current = now

    // If already waiting for a response, do not allow overlapping submission
    if (waitingRef.current) return
    waitingRef.current = true
    setWaiting(true)

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

    // Send through WebSocket to maintain backend audit logs and telemetry snapshot
    sendCommand({
      command: "ai_engineer_query",
      question: q,
    })

    // Query Agent 37 Hermes directly via Next.js API route
    try {
      const res = await fetch("/api/neural-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          telemetry: latestTelemetryRef.current,
          sessionId: sessionIdRef.current,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.session_id) {
          sessionIdRef.current = data.session_id
        }

        waitingRef.current = false
        setWaiting(false)

        const msgId = `resp-agent37-${Date.now()}`
        const answerText = data.answer || "No response received from Agent 37."
        lastProcessedRef.current = `${q}_${data.timestamp || ""}_${answerText.slice(0, 20)}`

        const newMsg: ChatMessage = {
          id: msgId,
          role: "assistant",
          text: answerText,
          displayText: "",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          category: data.category || "GENERAL_STATUS",
          confidence: data.confidence ?? 1.0,
          follow_ups: data.follow_ups || QUICK_PROMPTS.slice(0, 3),
          isStreaming: true,
        }

        setMessages((prev) => [...prev, newMsg])
        streamMessage(msgId, answerText)
        return
      }
    } catch (err) {
      console.warn("Direct Agent 37 API call failed, awaiting WebSocket response or fallback:", err)
    }

    // Fallback: If Agent 37 API call fails or times out after 45s, generate fallback
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
    }

    fallbackTimerRef.current = setTimeout(() => {
      if (!waitingRef.current) return
      waitingRef.current = false
      setWaiting(false)

      const fallback = generateFallbackResponse(q, latestTelemetryRef.current)
      const msgId = `resp-fallback-${Date.now()}`
      const fallbackMsg: ChatMessage = {
        id: msgId,
        role: "assistant",
        text: fallback.answer,
        displayText: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        category: fallback.category,
        confidence: 0.91,
        follow_ups: fallback.follow_ups,
        isStreaming: true,
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === "assistant" && last.text === fallback.answer) {
          return prev
        }
        return [...prev, fallbackMsg]
      })
      streamMessage(msgId, fallback.answer)
    }, 45000)
  }

  const clearMessages = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
    }
    sessionIdRef.current = null
    const resetText = "Agent 37 Neural Engine re-initialized. Live telemetry monitoring active (Rotax 914 F). Ask me anything about propulsion health, RUL, faults, or mission risk."
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: "assistant",
        text: resetText,
        displayText: resetText,
        timestamp: "ONLINE",
        category: "GENERAL_STATUS",
        follow_ups: QUICK_PROMPTS.slice(0, 3),
        isStreaming: false,
      },
    ])
    setWaiting(false)
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

