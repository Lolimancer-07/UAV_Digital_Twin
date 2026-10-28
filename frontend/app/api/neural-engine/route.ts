import { NextResponse } from "next/server"

const AGENT37_API_KEY = process.env.AGENT37_API_KEY || ""
const AGENT37_INSTANCE_ID = process.env.AGENT37_INSTANCE_ID || "c1iy0ok07a"

const BASE_URL = `https://${AGENT37_INSTANCE_ID}.agent37.app`

const PERSONA = `You are Agent 37, the AI Mission Engineer embedded in a UAV (Unmanned Aerial Vehicle) Digital Twin system, powered by the Agent 37 Hermes cloud platform. You have direct access to live propulsion telemetry, LSTM prognostics, anomaly detection, mission risk data, and prescriptive maintenance advisories.

Your role as Agent 37: answer operator questions concisely and precisely, grounded in the telemetry snapshot provided. Do not speculate beyond the data.

IMPORTANT - respond ONLY with a single valid JSON object, no other text:
{
  "answer": "<detailed plain-English answer grounded in the telemetry>",
  "category": "<one of: WHY_UNHEALTHY | WHY_ANOMALY | RUL_STATUS | MISSION_RISK | RPM_ADVICE | MAINTENANCE | RECOMMENDATION | SENSOR_STATUS | THERMAL | OIL | VIBRATION | GENERAL_STATUS>",
  "confidence": 1.0,
  "follow_ups": ["<relevant follow-up 1>", "<relevant follow-up 2>", "<relevant follow-up 3>"]
}`

const DEFAULT_FOLLOWUPS: Record<string, string[]> = {
  WHY_UNHEALTHY: [
    "What is the top anomaly driver?",
    "How many flight cycles remain before overhaul?",
    "What is the current mission risk?",
  ],
  WHY_ANOMALY: [
    "What sensor is driving the anomaly?",
    "Is this anomaly critical for flight safety?",
    "What maintenance action is required?",
  ],
  RUL_STATUS: [
    "What is the 90% confidence interval for RUL?",
    "Can the engine complete the planned mission?",
    "Why is the engine health degraded?",
  ],
  MISSION_RISK: [
    "What is the estimated safe flight endurance?",
    "What happens to risk if I derate RPM by 200?",
    "Can this engine complete the planned mission safely?",
  ],
  RPM_ADVICE: [
    "What happens to CHT if I derate RPM by 200?",
    "What is the optimal cruise RPM right now?",
    "Will derating RPM recover remaining useful life?",
  ],
  MAINTENANCE: [
    "Which component needs service first?",
    "Is this a ground-turnaround or depot maintenance item?",
    "What is the root cause of the maintenance alert?",
  ],
  RECOMMENDATION: [
    "Why is the engine health degraded?",
    "What is the current mission risk?",
    "What maintenance action is recommended right now?",
  ],
  SENSOR_STATUS: [
    "Are any sensors showing integrity faults?",
    "What is the current CHT vs nominal?",
    "Is vibration within allowable limits?",
  ],
  THERMAL: [
    "What is the peak cylinder head temperature?",
    "How does current CHT compare to the 380°F nominal limit?",
    "What derate is recommended to reduce thermal stress?",
  ],
  OIL: [
    "Is oil pressure within nominal limits?",
    "What is the oil temperature trend?",
    "Is lubrication degradation contributing to RUL loss?",
  ],
  VIBRATION: [
    "What is the vibration kurtosis value?",
    "Is the vibration consistent with mechanical unbalance?",
    "What maintenance action is recommended for vibration?",
  ],
  GENERAL_STATUS: [
    "Why is the engine health degraded?",
    "Can this engine complete the planned mission safely?",
    "What is the predicted remaining useful life?",
  ],
}

function formatTelemetry(t: any): string {
  if (!t || typeof t !== "object") {
    return "=== LIVE PROPULSION TELEMETRY SNAPSHOT ===\n[Telemetry unavailable - operating with default envelope]\n=========================================="
  }

  const h = t.health || {}
  const subs = h.sub_scores || {}
  const xai = t.xai || {}
  const risk = t.mission_risk || {}
  const faults = (t.fault_events || []).map((f: any) =>
    typeof f === "string" ? f : f?.name || "FAULT"
  )

  return `=== LIVE PROPULSION TELEMETRY SNAPSHOT ===
Aircraft / Engine  : ${t.uav_id || "UAV-07"} | Engine: ${t.engine_id || 1} (Rotax 914 F Turbo)
Flight Cycle       : ${t.cycle ?? 1}

PROPULSION HEALTH:
  Health Index     : ${h.health_index ?? t.health_index ?? 92}/100 [Condition: ${h.condition || "NOMINAL"}]
  Sub-scores       : Thermal=${subs.thermal ?? 92}%, Lube=${subs.lubrication ?? 95}%, Mech=${subs.mechanical ?? 91}%, Elec=${subs.electrical ?? 94}%

PROGNOSTICS (Bi-LSTM + Monte Carlo Dropout):
  Predicted RUL    : ${t.predicted_rul ?? 125} cycles [90% CI: ${t.rul_ci_lower ?? 110} – ${t.rul_ci_upper ?? 140}]
  Uncertainty Std  : ${t.rul_mc_std ?? 4.2} cycles
  True Ground Truth: ${t.true_rul ?? t.predicted_rul ?? 125} cycles

THERMAL & FLUID MEASUREMENTS:
  RPM              : ${t.rpm ?? 2400} (Nominal: 2400, Redline: 2500)
  CHT              : ${t.cht ?? 382}°F (Nominal: 380°F, Limit: 450°F)
  EGT              : ${t.egt ?? 1465}°F (Nominal: 1475°F, Limit: 1650°F)
  MAP              : ${t.map_kpa ?? 101.3} kPa
  Oil Pressure     : ${t.oil_pressure ?? 48.5} PSI (Nominal: 50.0 PSI, Min: 30.0 PSI)
  Oil Temperature  : ${t.oil_temp ?? 95.0}°C (Nominal: 90.0°C, Limit: 120.0°C)
  Fuel Flow        : ${t.fuel_flow ?? 7.2} GPH
  Vibration        : ${t.vibration ?? 1.2} g RMS
  Bus Voltage      : ${t.battery_v ?? 28.1} V | Current: ${t.bus_current_a ?? 14.5} A

ANOMALY DETECTION & XAI:
  Anomaly Status   : ${t.is_anomaly ? "ANOMALY DETECTED" : "NOMINAL"}
  Anomaly Score    : ${t.anomaly_score ?? -0.02}
  Active Faults    : ${faults.length > 0 ? faults.join(", ") : "None"}
  Top Anomaly Drivers: ${JSON.stringify(xai.top_drivers || [])}

MISSION FEASIBILITY:
  Mission Risk     : ${risk.risk_level || "LOW"} (Score: ${risk.risk_score || 0.12})
  Completion Prob  : ${risk.completion_probability ? Math.round(risk.completion_probability * 100) : 92}%
  Safe Flight Hours: ${risk.safe_flight_hours || 10.0} hrs
==========================================`
}

function parseAgentResponse(rawText: string) {
  let text = rawText.trim()

  if (text.includes("```")) {
    const parts = text.split("```")
    for (let i = 1; i < parts.length; i += 2) {
      let candidate = parts[i].trim()
      if (candidate.startsWith("json")) {
        candidate = candidate.slice(4).trim()
      }
      try {
        return JSON.parse(candidate)
      } catch {
        // try next fence
      }
    }
  }

  try {
    return JSON.parse(text)
  } catch {
    // Return raw text
    return {
      answer: text || "Agent 37 Neural Engine processed your query.",
      category: "GENERAL_STATUS",
      confidence: 1.0,
      follow_ups: DEFAULT_FOLLOWUPS.GENERAL_STATUS,
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { question, telemetry, sessionId } = body

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      )
    }

    const stateBlock = formatTelemetry(telemetry)
    const fullPrompt = `${PERSONA}\n\n${stateBlock}\n\nOperator: ${question}`

    const agentPayload: Record<string, any> = {
      input: fullPrompt,
      stream: false,
    }
    if (sessionId) {
      agentPayload.session_id = sessionId
    }

    const res = await fetch(`${BASE_URL}/v1/responses`, {
      method: "POST",
      headers: {
        "X-Agent37-Key": AGENT37_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(agentPayload),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        {
          error: `Agent 37 returned HTTP ${res.status}`,
          details: errText,
        },
        { status: res.status }
      )
    }

    const data = await res.json()
    const parsed = parseAgentResponse(data.output_text || "")

    const category = (parsed.category || "GENERAL_STATUS").toUpperCase()
    const followUps =
      parsed.follow_ups && Array.isArray(parsed.follow_ups)
        ? parsed.follow_ups.slice(0, 3)
        : DEFAULT_FOLLOWUPS[category] || DEFAULT_FOLLOWUPS.GENERAL_STATUS

    return NextResponse.json({
      answer: parsed.answer || data.output_text,
      category,
      confidence: parsed.confidence ?? 1.0,
      follow_ups: followUps,
      session_id: data.session_id,
      model: "Agent 37 Hermes",
      instance_id: AGENT37_INSTANCE_ID,
      timestamp: Date.now(),
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Failed to consult Agent 37 Neural Engine",
        message: err.message,
      },
      { status: 500 }
    )
  }
}
