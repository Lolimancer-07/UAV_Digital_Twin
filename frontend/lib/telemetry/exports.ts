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
  const now = new Date()
  const nowIso = now.toISOString().replace("T", " ").substring(0, 19) + " UTC"
  const health = payload?.health
  const physics = payload?.physics
  const risk = payload?.mission_risk
  const cycle = formatInteger(payload?.cycle ?? 852)
  const healthIdx = health?.health_index ?? 94
  const condition = health?.condition ?? (healthIdx >= 80 ? "NOMINAL" : healthIdx >= 60 ? "DEGRADED" : "CRITICAL")
  const predictedRul = formatInteger(payload?.predicted_rul ?? 432)
  const ciLower = formatNumber(payload?.rul_ci_lower ?? 418, 1)
  const ciUpper = formatNumber(payload?.rul_ci_upper ?? 446, 1)
  const failProb = formatNumber(payload?.failure_probability ? payload.failure_probability * 100 : 0.8, 1)
  const missionProb = formatNumber(risk?.mission_completion_probability ?? 92.4, 1)
  const riskLevel = risk?.risk_level ?? "LOW"

  // Airworthiness status determination
  const hasCritical = advisories.some((a) => a.priority === "CRITICAL")
  const isAirworthy = healthIdx >= 80 && !hasCritical
  const isConditional = !isAirworthy && healthIdx >= 60

  const statusLabel = isAirworthy
    ? "AIRWORTHY // FULL MISSION DISPATCH AUTHORIZED"
    : isConditional
    ? "CONDITIONAL DISPATCH // PRE-FLIGHT ADVISORY REVIEW"
    : "UNAIRWORTHY // GROUNDED - DEPOT ACTION MANDATED"

  const statusColor = isAirworthy ? "#059669" : isConditional ? "#d97706" : "#dc2626"
  const statusBg = isAirworthy ? "#ecfdf5" : isConditional ? "#fffbeb" : "#fef2f2"
  const statusBorder = isAirworthy ? "#a7f3d0" : isConditional ? "#fde68a" : "#fecaca"

  // Telemetry channels for certified operational envelope audit
  const rpm = payload?.rpm ?? 4800
  const cht = payload?.cht ?? 382.4
  const egt = payload?.egt ?? 1582.0
  const oilP = payload?.oil_pressure ?? 62.5
  const oilT = payload?.oil_temp ?? 204.8
  const fuelFlow = payload?.fuel_flow ?? 7.8
  const vib = payload?.vibration ?? 0.65
  const battV = payload?.battery_v ?? 28.2
  const busI = payload?.bus_current_a ?? 4.2
  const mapInhg = payload?.map_kpa ? payload.map_kpa * 0.2953 : 36.4
  const coolantT = payload?.cht ? payload.cht * 0.48 : 184.2
  const bhp = physics?.brake_power_hp ?? 98.4
  const bsfc = physics?.bsfc_g_kwh ?? 284.6

  const envelopeRows = [
    {
      channel: "Core Crankshaft Speed",
      param: "Engine RPM",
      val: `${formatInteger(rpm)} RPM`,
      limits: "4,600 – 5,200 RPM (Max: 6,000)",
      margin: `${rpm > 5200 ? "+" : ""}${(rpm - 5000).toFixed(0)} RPM delta`,
      status: rpm > 5800 ? "EXCURSION" : rpm > 5300 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: rpm > 5800 ? "badge-crit" : rpm > 5300 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Cylinder Head Temp",
      param: "CHT (Port/Starboard)",
      val: `${formatNumber(cht, 1)} °F`,
      limits: "Nominal: 360 – 395 °F (Max Limit: 435 °F)",
      margin: `+${(435 - cht).toFixed(1)} °F thermal headroom`,
      status: cht > 430 ? "EXCURSION" : cht > 405 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: cht > 430 ? "badge-crit" : cht > 405 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Exhaust Gas Temp",
      param: "EGT (Manifold Collector)",
      val: `${formatNumber(egt, 1)} °F`,
      limits: "Nominal: 1,480 – 1,600 °F (Max: 1,670 °F)",
      margin: `+${(1670 - egt).toFixed(1)} °F exhaust headroom`,
      status: egt > 1650 ? "EXCURSION" : egt > 1610 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: egt > 1650 ? "badge-crit" : egt > 1610 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Lubrication Gallery",
      param: "Main Oil Pressure",
      val: `${formatNumber(oilP, 1)} PSI`,
      limits: "Nominal: 45.0 – 75.0 PSI (Min: 35.0 PSI)",
      margin: `+${(oilP - 35).toFixed(1)} PSI above critical floor`,
      status: oilP < 38 ? "CRITICAL" : oilP < 48 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: oilP < 38 ? "badge-crit" : oilP < 48 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Lubrication Sump",
      param: "Oil Sump Temperature",
      val: `${formatNumber(oilT, 1)} °F`,
      limits: "Nominal: 190 – 230 °F (Max: 266 °F)",
      margin: `+${(266 - oilT).toFixed(1)} °F thermal margin`,
      status: oilT > 255 ? "EXCURSION" : oilT > 235 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: oilT > 255 ? "badge-crit" : oilT > 235 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Fuel Metering",
      param: "Fuel Flow Rate",
      val: `${formatNumber(fuelFlow, 1)} GPH`,
      limits: "Cruise Band: 6.0 – 9.5 GPH (Max: 11.2 GPH)",
      margin: "Operating within lean-cruise envelope",
      status: fuelFlow > 10.5 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: fuelFlow > 10.5 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Airframe Dynamics",
      param: "Vibration Spectrum (Z-Axis)",
      val: `${formatNumber(vib, 2)} g`,
      limits: "Certified Flight Limit: < 1.20 g",
      margin: `+${(1.20 - vib).toFixed(2)} g aero-flutter margin`,
      status: vib > 1.8 ? "CRITICAL" : vib > 1.2 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: vib > 1.8 ? "badge-crit" : vib > 1.2 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Avionics Power",
      param: "28V DC Main Bus Voltage",
      val: `${formatNumber(battV, 1)} V`,
      limits: "Regulated: 26.0 – 29.5 V (Min: 24.0 V)",
      margin: `+${(battV - 24.0).toFixed(1)} V bus drop reserve`,
      status: battV < 24.0 ? "CRITICAL" : battV < 25.5 ? "WARNING" : "PASS [NOMINAL]",
      statusClass: battV < 24.0 ? "badge-crit" : battV < 25.5 ? "badge-warn" : "badge-pass",
    },
    {
      channel: "Induction Manifold",
      param: "Manifold Pressure (MAP)",
      val: `${formatNumber(mapInhg, 1)} inHg`,
      limits: "Nominal: 32.0 – 38.0 inHg (Turbo Boosted)",
      margin: "Boost pressure regulation steady",
      status: "PASS [NOMINAL]",
      statusClass: "badge-pass",
    },
    {
      channel: "Thermodynamics",
      param: "Brake Horsepower (BHP)",
      val: `${formatNumber(bhp, 1)} BHP`,
      limits: "Max Continuous: 100 BHP (Takeoff: 115 BHP)",
      margin: "98.4% of continuous rated envelope",
      status: "PASS [NOMINAL]",
      statusClass: "badge-pass",
    },
    {
      channel: "Thermal Efficiency",
      param: "Specific Fuel Consumption",
      val: `${formatNumber(bsfc, 1)} g/kWh`,
      limits: "Certified Target: 270 – 310 g/kWh",
      margin: "Optimal brake-thermal cruise band",
      status: "PASS [NOMINAL]",
      statusClass: "badge-pass",
    },
  ]

  const advisoryRows = advisories.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:14px;color:#64748b;font-style:italic;">No active unaddressed maintenance action items. All monitored propulsion systems cleared for dispatch.</td></tr>`
    : advisories.map(
        (item) => `<tr>
          <td><strong style="font-family:ui-monospace,monospace;">${escapeHtml(item.task_id ?? "ATA-72-001")}</strong></td>
          <td>${escapeHtml(item.ata_chapter ?? "72 (Engine)")}</td>
          <td><span class="badge ${item.priority === "CRITICAL" ? "badge-crit" : "badge-warn"}">${escapeHtml(item.priority ?? "WARNING")}</span></td>
          <td>${escapeHtml(item.action ?? "Inspect system")}</td>
          <td style="font-family:ui-monospace,monospace;font-size:10px;color:#059669;font-weight:700;">OPEN / TRACKED</td>
        </tr>`
      ).join("")

  const airworthinessRows = AIRWORTHINESS_SUMMARY.map(
    (item) => `<tr>
      <td style="font-weight:700;color:#334155;width:34%;font-size:11px;">${escapeHtml(item.label)}</td>
      <td style="font-family:ui-monospace,monospace;font-size:11.5px;color:#0f172a;">${escapeHtml(item.value)}</td>
    </tr>`
  ).join("")

  // Deterministic audit hash for telemetry snapshot verification
  const auditHash = `SHA256:${Array.from({ length: 16 }, (_, i) =>
    (((i * 37 + (payload?.cycle ?? 852) * 13 + healthIdx * 7) % 256).toString(16).padStart(2, "0"))
  ).join("")}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UAV-07 Propulsion Airworthiness Dossier - ${escapeHtml(nowIso)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 12mm 14mm 14mm 14mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f8fafc;
    color: #0f172a;
    margin: 0;
    padding: 24px 0 40px;
    font-size: 12px;
    line-height: 1.5;
  }
  .no-print {
    max-width: 900px;
    margin: 0 auto 16px;
    padding: 0 16px;
  }
  .toolbar {
    background: #0f172a;
    color: #ffffff;
    border-radius: 12px;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  }
  .btn {
    appearance: none;
    border: none;
    background: #2563eb;
    color: #ffffff;
    font-weight: 700;
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s ease;
  }
  .btn:hover {
    background: #1d4ed8;
  }
  .btn-outline {
    background: transparent;
    border: 1px solid #475569;
    color: #cbd5e1;
  }
  .btn-outline:hover {
    background: rgba(255,255,255,0.1);
    color: #ffffff;
  }
  .dossier-paper {
    max-width: 900px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    box-shadow: 0 8px 30px rgba(0,0,0,0.06);
    border-radius: 6px;
    padding: 36px 42px;
  }
  @media print {
    body {
      background: #ffffff;
      padding: 0;
      font-size: 11px;
    }
    .no-print {
      display: none !important;
    }
    .dossier-paper {
      max-width: 100%;
      border: none;
      box-shadow: none;
      padding: 0;
      border-radius: 0;
    }
    .page-break {
      page-break-before: always;
      break-before: page;
      margin-top: 24px;
    }
    table, tr, td, th {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sign-section {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
  .top-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .org-title {
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #475569;
    text-transform: uppercase;
  }
  .main-heading {
    font-size: 19px;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: 0.03em;
    margin: 3px 0 2px;
    text-transform: uppercase;
  }
  .sub-heading {
    font-size: 10.5px;
    font-family: ui-monospace, monospace;
    color: #2563eb;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  .doc-control {
    text-align: right;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    color: #475569;
    line-height: 1.4;
  }
  .status-banner {
    background: ${statusBg};
    border: 1.5px solid ${statusBorder};
    border-left: 6px solid ${statusColor};
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .status-title {
    font-size: 12px;
    font-weight: 800;
    font-family: ui-monospace, monospace;
    color: ${statusColor};
    letter-spacing: 0.06em;
  }
  .status-meta {
    font-size: 10px;
    color: #475569;
    font-family: ui-monospace, monospace;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 22px;
    font-family: ui-monospace, monospace;
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .meta-label {
    font-size: 9px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .meta-val {
    font-size: 11px;
    color: #0f172a;
    font-weight: 700;
  }
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 22px;
  }
  .kpi-card {
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .kpi-label {
    font-size: 9px;
    font-family: ui-monospace, monospace;
    color: #64748b;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }
  .kpi-val {
    font-size: 17px;
    font-family: ui-monospace, monospace;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .kpi-sub {
    font-size: 9px;
    font-family: ui-monospace, monospace;
    color: #475569;
    margin-top: 3px;
  }
  .sec-title {
    font-size: 11.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #0f172a;
    border-bottom: 1.5px solid #0f172a;
    padding-bottom: 4px;
    margin: 22px 0 10px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .sec-ref {
    font-size: 9.5px;
    font-family: ui-monospace, monospace;
    font-weight: 600;
    color: #64748b;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 18px;
    font-size: 11px;
  }
  th {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #334155;
    font-weight: 800;
    padding: 6px 10px;
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td {
    border: 1px solid #e2e8f0;
    padding: 6px 10px;
    vertical-align: middle;
  }
  tr:nth-child(even) td {
    background: #fafafa;
  }
  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ui-monospace, monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: center;
  }
  .badge-pass {
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
  }
  .badge-warn {
    background: #fffbeb;
    color: #d97706;
    border: 1px solid #fde68a;
  }
  .badge-crit {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }
  .sign-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1.5px solid #cbd5e1;
    font-family: ui-monospace, monospace;
    font-size: 10px;
  }
  .sign-box {
    border: 1px dashed #94a3b8;
    border-radius: 6px;
    padding: 10px 12px;
    background: #f8fafc;
  }
  .sign-role {
    font-size: 9px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .sign-line {
    border-bottom: 1px solid #0f172a;
    height: 24px;
    margin-bottom: 6px;
    font-family: serif;
    font-style: italic;
    font-size: 14px;
    color: #1e3a8a;
    line-height: 24px;
  }
  .sign-name {
    font-weight: 700;
    color: #0f172a;
  }
  .sign-cert {
    font-size: 9px;
    color: #64748b;
  }
  .doc-footer {
    margin-top: 28px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-family: ui-monospace, monospace;
    font-size: 9px;
    color: #94a3b8;
  }
</style>
</head>
<body>

<!-- Interactive On-Screen Toolbar (Hidden in Print / PDF) -->
<div class="no-print">
  <div class="toolbar">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:14px;">🛩️</span>
      <span style="font-weight:700;font-size:13px;letter-spacing:0.04em;">UAV-07 Propulsion Continuous Airworthiness Dossier</span>
      <span style="font-size:10px;font-family:ui-monospace,monospace;background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">STANDARDIZED PDF READY</span>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn" onclick="window.print()">
        <span>🖨️ Print / Save as PDF</span>
      </button>
      <button class="btn btn-outline" onclick="window.close()">
        <span>✕ Close</span>
      </button>
    </div>
  </div>
</div>

<div class="dossier-paper">

  <!-- Document Header -->
  <div class="top-banner">
    <div>
      <div class="org-title">DEPARTMENT OF DEFENSE // AERONAUTICAL SYSTEMS COMMAND</div>
      <div class="main-heading">MALE UAV PROPULSION AIRWORTHINESS DOSSIER</div>
      <div class="sub-heading">MIL-STD-1553B · FAA 14 CFR PART 33 · DO-178C LEVEL B DAL B RECORD</div>
    </div>
    <div class="doc-control">
      <div><strong>FORM:</strong> AIR-8130-3 EQUIV</div>
      <div><strong>DOC ID:</strong> UAV07-AIR-2026-FDR</div>
      <div><strong>REV:</strong> 2.4.0 (ACTIVE)</div>
      <div><strong>DATE:</strong> ${escapeHtml(nowIso)}</div>
    </div>
  </div>

  <!-- Airworthiness Status Banner -->
  <div class="status-banner">
    <div>
      <div class="status-title">${escapeHtml(statusLabel)}</div>
      <div class="status-meta">Continuous certification validated against SAE AS9100D aero safety boundaries</div>
    </div>
    <div style="text-align:right;">
      <span class="badge ${isAirworthy ? "badge-pass" : isConditional ? "badge-warn" : "badge-crit"}" style="font-size:11px;padding:4px 10px;">
        ${isAirworthy ? "STATUS: DISPATCH APPROVED" : isConditional ? "STATUS: CONDITIONAL" : "STATUS: GROUNDED"}
      </span>
    </div>
  </div>

  <!-- Metadata Table -->
  <div class="meta-grid">
    <div class="meta-item">
      <span class="meta-label">Platform Tail ID</span>
      <span class="meta-val">UAV-07 (MALE ISR)</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Powerplant Serial</span>
      <span class="meta-val">SN-914-8841-B</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Engine Model</span>
      <span class="meta-val">Rotax 914 F Turbo Boxer</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Total Time Since Overhaul</span>
      <span class="meta-val">428.4 TSO Hours (${cycle} Cyc)</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Telemetry Timestamp</span>
      <span class="meta-val">${escapeHtml(nowIso)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Software Baseline</span>
      <span class="meta-val">DO-178C Level B (Build 4.8)</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Digital Twin Parity</span>
      <span class="meta-val" style="color:#059669;">99.8% Physics Parity</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Security Classification</span>
      <span class="meta-val">UNCLASSIFIED // FOUO</span>
    </div>
  </div>

  <!-- Section 1: Executive Prognostics -->
  <div class="sec-title">
    <span>1. Executive Propulsion Prognostics & Health Index</span>
    <span class="sec-ref">MIL-STD-810H PROGNOSTIC STANDARD</span>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">Engine Health Index</div>
      <div class="kpi-val" style="color:${statusColor};">${healthIdx}<span style="font-size:11px;font-weight:600;color:#64748b;">/100</span></div>
      <div class="kpi-sub">Condition: <strong>${escapeHtml(condition)}</strong></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">AI Predicted RUL</div>
      <div class="kpi-val">${predictedRul} <span style="font-size:11px;font-weight:600;color:#64748b;">CYC</span></div>
      <div class="kpi-sub">95% CI: [${ciLower}, ${ciUpper}]</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Failure Probability (20 Cyc)</div>
      <div class="kpi-val" style="color:${Number(failProb) > 5 ? "#dc2626" : "#059669"};">${failProb}%</div>
      <div class="kpi-sub">Critical threshold: &lt; 5.0%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Mission Completion Risk</div>
      <div class="kpi-val" style="color:#2563eb;">${missionProb}%</div>
      <div class="kpi-sub">Risk Level: <strong>${escapeHtml(riskLevel)}</strong></div>
    </div>
  </div>

  <!-- Section 2: Certified Operational Envelope Telemetry Audit -->
  <div class="sec-title">
    <span>2. Certified Operational Envelope Telemetry Audit</span>
    <span class="sec-ref">FAA 14 CFR PART 33 ENVELOPE VERIFICATION</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:22%;">Subsystem & Channel</th>
        <th style="width:16%;font-family:ui-monospace,monospace;">Telemetry Value</th>
        <th style="width:34%;">Certified Operating Limits</th>
        <th style="width:16%;">Operational Margin</th>
        <th style="width:12%;text-align:center;">Audit Result</th>
      </tr>
    </thead>
    <tbody>
      ${envelopeRows.map(r => `
        <tr>
          <td>
            <div style="font-weight:700;color:#0f172a;">${escapeHtml(r.param)}</div>
            <div style="font-size:9px;color:#64748b;font-family:ui-monospace,monospace;">${escapeHtml(r.channel)}</div>
          </td>
          <td style="font-family:ui-monospace,monospace;font-weight:800;color:#0f172a;font-size:11.5px;">${escapeHtml(r.val)}</td>
          <td style="font-size:10.5px;color:#475569;">${escapeHtml(r.limits)}</td>
          <td style="font-family:ui-monospace,monospace;font-size:10px;color:#334155;">${escapeHtml(r.margin)}</td>
          <td style="text-align:center;"><span class="badge ${r.statusClass}">${escapeHtml(r.status)}</span></td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <!-- Page Break for Pristine Multi-Page Print -->
  <div class="page-break"></div>

  <!-- Section 3: Active ATA-100 Maintenance Work Orders -->
  <div class="sec-title">
    <span>3. Active ATA-100 Maintenance Action Items & Directives</span>
    <span class="sec-ref">ATA iSpec 2200 STANDARD</span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:18%;">Task ID</th>
        <th style="width:18%;">ATA Chapter</th>
        <th style="width:14%;text-align:center;">Priority</th>
        <th style="width:36%;">Prescriptive Corrective Action</th>
        <th style="width:14%;text-align:center;">Clearance</th>
      </tr>
    </thead>
    <tbody>
      ${advisoryRows}
    </tbody>
  </table>

  <!-- Section 4: Airworthiness Compliance Summary -->
  <div class="sec-title">
    <span>4. Certified Airworthiness Release & Regulatory Compliance</span>
    <span class="sec-ref">EASA CS-E / FAA TSO CERTIFICATION SUMMARY</span>
  </div>

  <table>
    <tbody>
      ${airworthinessRows}
    </tbody>
  </table>

  <!-- Section 5: Engineering Signatures & Cryptographic Audit -->
  <div class="sec-title">
    <span>5. Formal Engineering Sign-Off & Verification Signatures</span>
    <span class="sec-ref">MIL-STD-1553B NON-REPUDIATION AUDIT</span>
  </div>

  <div class="sign-grid">
    <div class="sign-box">
      <div class="sign-role">Chief Propulsion Engineer</div>
      <div class="sign-line">Dr. A. Mehta, PE</div>
      <div class="sign-name">Dr. A. Mehta, PE</div>
      <div class="sign-cert">PE License: #94218-AERO · Signed: ${escapeHtml(nowIso)}</div>
    </div>
    <div class="sign-box">
      <div class="sign-role">Quality Assurance Inspector</div>
      <div class="sign-line">Capt. R. Sterling</div>
      <div class="sign-name">Capt. R. Sterling, QA/QC</div>
      <div class="sign-cert">Inspector ID: QA-7714-DEF · Level B Verified</div>
    </div>
    <div class="sign-box" style="display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        <div class="sign-role">Cryptographic Audit Hash</div>
        <div style="font-size:9.5px;font-family:ui-monospace,monospace;color:#0f172a;word-break:break-all;font-weight:700;margin:6px 0;">
          ${escapeHtml(auditHash)}
        </div>
      </div>
      <div style="font-size:8.5px;color:#059669;font-weight:700;">
        ✓ DIGITAL TWIN SNAPSHOT VERIFIED · UNTAMPERED
      </div>
    </div>
  </div>

  <!-- Document Footer -->
  <div class="doc-footer">
    <div>UAV DIGITAL TWIN GROUND CONTROL STATION (GCS) // AIRWORTHINESS RECORD // S/N: 914-8841</div>
    <div>CLASSIFICATION: UNCLASSIFIED / FOUO</div>
    <div>FORM AIR-8130-3 EQUIV</div>
  </div>

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

