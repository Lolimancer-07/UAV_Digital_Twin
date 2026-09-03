export type ModuleDetail = {
  title: string
  eyebrow: string
  description: string
  status: string
  metrics: { label: string; value: string; detail: string }[]
  rows: { label: string; value: string; state: string }[]
  insight: string
}

export const moduleDetails: Record<string, ModuleDetail> = {
  prognostics: {
    title: "Prognostics & Attribution",
    eyebrow: "HEALTH FORECASTING",
    description: "Remaining-life estimates and the subsystem evidence behind each prediction.",
    status: "MODEL LIVE",
    metrics: [
      { label: "Engine health index", value: "94 / 100", detail: "Nominal · +1.8% this cycle" },
      { label: "Estimated remaining life", value: "1,184 cycles", detail: "95% confidence interval" },
      { label: "Prediction confidence", value: "96.2%", detail: "FADEC ensemble model" },
      { label: "Next service window", value: "86 cycles", detail: "Inspection recommended" },
    ],
    rows: [
      { label: "Thermal loading", value: "96%", state: "NOMINAL" },
      { label: "Lubrication system", value: "91%", state: "NOMINAL" },
      { label: "Mechanical integrity", value: "88%", state: "WATCH" },
      { label: "Electrical systems", value: "94%", state: "NOMINAL" },
    ],
    insight: "Mechanical integrity is the leading contributor to the service-window estimate; vibration kurtosis remains inside the learned baseline.",
  },
  thermodynamics: {
    title: "Thermodynamics & P-V",
    eyebrow: "COMBUSTION ANALYSIS",
    description: "Live power, pressure, temperature, and efficiency measurements across the engine cycle.",
    status: "CYCLE LOCKED",
    metrics: [
      { label: "Brake power", value: "112.8 BHP", detail: "At 5,802 RPM" },
      { label: "Thermal efficiency", value: "31.4%", detail: "Target band 29–33%" },
      { label: "IMEP", value: "8.42 bar", detail: "Stable over 20 cycles" },
      { label: "BSFC", value: "238 g/kWh", detail: "−3.1% vs baseline" },
    ],
    rows: [
      { label: "Peak cylinder pressure", value: "64.8 bar", state: "NOMINAL" },
      { label: "Exhaust gas temperature", value: "1,228 °F", state: "NOMINAL" },
      { label: "Air-fuel ratio", value: "14.7 : 1", state: "NOMINAL" },
      { label: "Manifold pressure", value: "1.18 bar", state: "NOMINAL" },
    ],
    insight: "The current P-V loop is balanced with no abnormal combustion signature detected in the last 10 Hz sample window.",
  },
  can: {
    title: "CAN Bus FDR",
    eyebrow: "BUS OBSERVABILITY",
    description: "Frame health, message throughput, and fault history from the propulsion CAN network.",
    status: "RECORDING",
    metrics: [
      { label: "Bus utilization", value: "42.8%", detail: "500 kbit/s nominal" },
      { label: "Frames received", value: "18,422", detail: "Last 60 seconds" },
      { label: "Packet loss", value: "0.00%", detail: "No dropped frames" },
      { label: "Active DTCs", value: "0", detail: "No diagnostic trouble codes" },
    ],
    rows: [
      { label: "FADEC command", value: "2,410 frames", state: "HEALTHY" },
      { label: "Engine sensors", value: "9,840 frames", state: "HEALTHY" },
      { label: "Power management", value: "4,122 frames", state: "HEALTHY" },
      { label: "Gateway heartbeat", value: "2,050 frames", state: "HEALTHY" },
    ],
    insight: "Traffic is evenly distributed across the propulsion nodes. The recorder has retained 42 minutes of the current flight session.",
  },
  maintenance: {
    title: "Maintenance Advisories",
    eyebrow: "SERVICE CONTROL",
    description: "Prioritized maintenance actions derived from current telemetry and service history.",
    status: "0 CRITICAL",
    metrics: [
      { label: "Open advisories", value: "2", detail: "Both low priority" },
      { label: "Critical items", value: "0", detail: "Aircraft dispatchable" },
      { label: "Last inspection", value: "18 cycles ago", detail: "No findings" },
      { label: "Compliance", value: "100%", detail: "Current service bulletin set" },
    ],
    rows: [
      { label: "Inspect ignition leads", value: "Due in 86 cycles", state: "PLANNED" },
      { label: "Review vibration trend", value: "Due in 24 cycles", state: "WATCH" },
      { label: "Oil filter replacement", value: "Completed", state: "CLOSED" },
      { label: "Cooling system check", value: "Completed", state: "CLOSED" },
    ],
    insight: "No maintenance action currently limits dispatch. The vibration review is scheduled early because it supports the prognostics model.",
  },
  airworthiness: {
    title: "Airworthiness",
    eyebrow: "RELEASE CONTROL",
    description: "Dispatch readiness, limitations, and signed compliance evidence for UAV-07.",
    status: "VALID",
    metrics: [
      { label: "Release status", value: "VALID", detail: "Reviewed 02 Sep 2026" },
      { label: "Flight hours", value: "248.6 h", detail: "Airframe total" },
      { label: "Open limitations", value: "0", detail: "No operational restrictions" },
      { label: "Certificate expiry", value: "184 days", detail: "18 Mar 2027" },
    ],
    rows: [
      { label: "Propulsion release", value: "Signed · A. Mehta", state: "VALID" },
      { label: "Software configuration", value: "v2.8.14", state: "CURRENT" },
      { label: "Weight and balance", value: "Within envelope", state: "VALID" },
      { label: "Emergency equipment", value: "Inspection current", state: "VALID" },
    ],
    insight: "UAV-07 is cleared for the current ISR profile with no open limitations or overdue compliance actions.",
  },
  "flight-data": {
    title: "Flight Data Recorder",
    eyebrow: "MISSION HISTORY",
    description: "Recorded flight sessions, cycle summaries, and high-value events from UAV-07.",
    status: "CAPTURING",
    metrics: [
      { label: "Current mission", value: "ISR-0420", detail: "In progress" },
      { label: "Mission elapsed", value: "00:42:18", detail: "Normal profile" },
      { label: "Recorded sessions", value: "128", detail: "Since commissioning" },
      { label: "Storage remaining", value: "68%", detail: "Solid-state recorder" },
    ],
    rows: [
      { label: "Current cycle", value: "00420", state: "RECORDING" },
      { label: "Peak RPM", value: "5,944", state: "NOMINAL" },
      { label: "Max cylinder head temp", value: "362 °F", state: "NOMINAL" },
      { label: "Events captured", value: "0", state: "CLEAR" },
    ],
    insight: "The active session contains a clean propulsion trace and is being written to the recorder without gaps.",
  },
  dossier: {
    title: "Dossier Export",
    eyebrow: "EVIDENCE PACKAGE",
    description: "Prepared compliance and engineering evidence available for export from the current session.",
    status: "READY",
    metrics: [
      { label: "Package status", value: "READY", detail: "All sources synchronized" },
      { label: "Telemetry frames", value: "1.52M", detail: "Current mission" },
      { label: "Attachments", value: "14", detail: "Signed source records" },
      { label: "Last generated", value: "09:41 UTC", detail: "03 Sep 2026" },
    ],
    rows: [
      { label: "Telemetry matrix", value: "Included", state: "READY" },
      { label: "Airworthiness release", value: "Included", state: "SIGNED" },
      { label: "Maintenance history", value: "Included", state: "READY" },
      { label: "Flight data recorder", value: "Included", state: "READY" },
    ],
    insight: "The evidence package is complete for the current flight session and contains synchronized, signed source records.",
  },
  settings: {
    title: "System Settings",
    eyebrow: "GCS CONFIGURATION",
    description: "Connection, display, and data-retention settings for this ground-control station.",
    status: "CONNECTED",
    metrics: [
      { label: "Ground station", value: "GCS-07", detail: "Primary operator console" },
      { label: "Telemetry link", value: "10.0 Hz", detail: "Encrypted transport" },
      { label: "Data retention", value: "90 days", detail: "Local rolling archive" },
      { label: "Firmware profile", value: "2.8.14", detail: "Production channel" },
    ],
    rows: [
      { label: "Theme", value: "System adaptive", state: "ACTIVE" },
      { label: "Time zone", value: "UTC+05:30", state: "ACTIVE" },
      { label: "Alert notifications", value: "Enabled", state: "ACTIVE" },
      { label: "Auto-sync", value: "Enabled", state: "ACTIVE" },
    ],
    insight: "The console is connected to the primary telemetry source and will preserve the current display and alert preferences.",
  },
}
