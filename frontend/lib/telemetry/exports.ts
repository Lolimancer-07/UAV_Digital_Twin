import { AIRWORTHINESS_SUMMARY } from "@/lib/telemetry/constants"
import { formatInteger, formatNumber } from "@/lib/telemetry/formatters"
import type { CanFrame, MaintenanceAdvisory, TelemetryPayload } from "./types"

function escapeCsvCell(value: string | number | undefined) {
  const text = value == null ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function escapeHtml(value: string | number | undefined) {
  return (value == null ? "" : String(value))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function serializeCanLog(frames: CanFrame[]) {
  const rows = frames.map((frame) =>
    [
      frame.timestamp,
      frame.cycle,
      frame.can_id,
      frame.pgn,
      frame.name,
      frame.dlc,
      frame.hex,
      frame.decoded,
    ]
      .map(escapeCsvCell)
      .join(",")
  )

  return [
    "Timestamp,Cycle,CAN ID,PGN,Message,DLC,Hex,Decoded",
    ...rows,
  ].join("\n")
}

export function createDossierHtml(
  payload: TelemetryPayload | undefined,
  advisories: MaintenanceAdvisory[]
) {
  const now = new Date().toISOString()
  const health = payload?.health
  const physics = payload?.physics
  const rows = [
    ["Total Flight Cycles Recorded", formatInteger(payload?.cycle), "COMPLETED"],
    [
      "Engine Health Index (EHI)",
      `${formatInteger(health?.health_index)} / 100`,
      health?.condition ?? "--",
    ],
    [
      "AI Predicted RUL",
      `${formatInteger(payload?.predicted_rul)} cycles`,
      `95% CI [${formatNumber(payload?.rul_ci_lower, 1)}, ${formatNumber(
        payload?.rul_ci_upper,
        1
      )}]`,
    ],
    [
      "Brake Horsepower",
      `${formatNumber(physics?.brake_power_hp, 2)} BHP`,
      "CONTINUOUS OPERATING ENVELOPE",
    ],
    [
      "Specific Fuel Consumption",
      `${formatNumber(physics?.bsfc_g_kwh, 1)} g/kWh`,
      "OPTIMAL CRUISE RANGE",
    ],
  ]

  const advisoryRows = advisories.map(
    (item) => `<tr>
      <td><strong>${escapeHtml(item.task_id)}</strong></td>
      <td>${escapeHtml(item.ata_chapter)}</td>
      <td>${escapeHtml(item.priority)}</td>
      <td>${escapeHtml(item.action)}</td>
    </tr>`
  )

  const airworthinessRows = AIRWORTHINESS_SUMMARY.map(
    (item) => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(
      item.value
    )}</td></tr>`
  )

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>UAV Propulsion Dossier</title>
<style>
body{font-family:Arial,sans-serif;background:#fff;color:#09090b;padding:40px;font-size:13px;line-height:1.6}
.hdr{border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end}
h1{font-size:18px;color:#000;font-weight:800;letter-spacing:.05em;margin:0}
h2{font-size:12px;text-transform:uppercase;margin:24px 0 10px;border-bottom:1px solid #d4d4d8;padding-bottom:4px;font-weight:800;letter-spacing:.04em}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #d4d4d8;padding:8px 12px;text-align:left;vertical-align:top}
th{background:#f4f4f5;font-weight:800;color:#52525b;font-size:11px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.sign{margin-top:40px;display:flex;justify-content:space-between;border-top:1px solid #71717a;padding-top:12px;font-size:12px}
</style>
</head>
<body>
<div class="hdr">
  <div>
    <h1>MALE UAV PROPULSION AIRWORTHINESS DOSSIER</h1>
    <div>MIL-STD-1553 · DO-178C LEVEL B CERTIFICATION</div>
  </div>
  <div class="mono">DATE: ${escapeHtml(now)}<br>TAIL: UAV-07 | S/N: 914-8841</div>
</div>
<h2>1. Executive Propulsion State & Prognostics Summary</h2>
<table>
  <tr><th>Parameter</th><th>Value</th><th>Airworthiness Evaluation</th></tr>
  ${rows
    .map(
      ([parameter, value, evaluation]) =>
        `<tr><td>${escapeHtml(parameter)}</td><td>${escapeHtml(
          value
        )}</td><td>${escapeHtml(evaluation)}</td></tr>`
    )
    .join("")}
</table>
<h2>2. Active ATA-100 Maintenance Work Orders</h2>
<table>
  <tr><th>Task ID</th><th>ATA Chapter</th><th>Priority</th><th>Required Maintenance Action</th></tr>
  ${advisoryRows.join("")}
</table>
<h2>3. Airworthiness Compliance Summary</h2>
<table>${airworthinessRows.join("")}</table>
<div class="sign">
  <div>CHIEF PROPULSION ENGINEER: _______________________</div>
  <div>QA VERIFIED: [PASS] DO-178C LVL B · ${escapeHtml(now)}</div>
</div>
</body>
</html>`
}

export function downloadTextFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function serializeTelemetryLogCsv(
  telemetryLog: TelemetryPayload[],
  latest?: TelemetryPayload
) {
  const list = telemetryLog.length > 0 ? telemetryLog : latest ? [latest] : []
  const headers = [
    "Cycle",
    "Timestamp",
    "RPM",
    "CHT_C",
    "EGT_C",
    "Oil_Pressure_bar",
    "Oil_Temp_C",
    "Fuel_Flow_L_hr",
    "Fuel_Rail_bar",
    "Vibration_g",
    "Vib_Kurtosis",
    "Battery_V",
    "Bus_Current_A",
    "Inj_Timing_deg",
    "Altitude_ft",
    "OAT_C",
    "MAP_kPa",
    "Health_Index",
    "Predicted_RUL",
    "Alert_Status",
    "Is_Anomaly",
  ]

  const rows = list.map((t, idx) => [
    t.cycle ?? idx + 1,
    new Date().toISOString(),
    t.rpm != null ? t.rpm.toFixed(1) : "",
    t.cht != null ? t.cht.toFixed(1) : "",
    t.egt != null ? t.egt.toFixed(1) : "",
    t.oil_pressure != null ? t.oil_pressure.toFixed(2) : "",
    t.oil_temp != null ? t.oil_temp.toFixed(1) : "",
    t.fuel_flow != null ? t.fuel_flow.toFixed(2) : "",
    t.fuel_rail_pressure_bar != null ? t.fuel_rail_pressure_bar.toFixed(2) : "",
    t.vibration != null ? t.vibration.toFixed(3) : "",
    t.vibration_kurtosis != null ? t.vibration_kurtosis.toFixed(2) : "",
    t.battery_v != null ? t.battery_v.toFixed(2) : "",
    t.bus_current_a != null ? t.bus_current_a.toFixed(1) : "",
    t.inj_timing != null ? t.inj_timing.toFixed(1) : "",
    t.altitude_ft != null ? Math.round(t.altitude_ft) : "",
    t.oat_c != null ? t.oat_c.toFixed(1) : "",
    t.map_kpa != null ? t.map_kpa.toFixed(1) : "",
    t.health?.health_index != null ? Math.round(t.health.health_index) : "",
    t.predicted_rul != null ? Math.round(t.predicted_rul) : "",
    `"${t.alert ?? "NOMINAL"}"`,
    t.is_anomaly ? "TRUE" : "FALSE",
  ].join(","))

  return [headers.join(","), ...rows].join("\n")
}

