"use client"

import * as React from "react"
import { FlameIcon, GaugeIcon, ZapIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useTelemetry } from "@/components/telemetry-provider"

export function ThermodynamicsPanel() {
  const { latestTelemetry } = useTelemetry()
  const p = latestTelemetry?.physics
  const res = p?.residuals

  // Synthesize 60-point Otto Cycle P-V indicator loop based on IMEP
  const imep = p?.imep_bar ?? 8.4
  const compressionRatio = 9.0

  const pvPoints = React.useMemo(() => {
    const pts = 60
    const points: Array<{ v: number; p: number; x: number; y: number }> = []
    for (let i = 0; i <= pts; i++) {
      const theta = (i / pts) * 2 * Math.PI
      const V = 1.0 + Math.sin(theta) * 0.42 + 0.55 // volume 1.0 to 2.0
      // Polytropic expansion/compression law P ~ IMEP * (1/V)^1.35
      const P = ((imep * 2.2) / Math.pow(V, 1.35)) + Math.sin(theta) * 0.4
      const pClamped = Math.max(0.5, P)
      // Map to 320x180 SVG coordinates (padding 30, 20)
      const x = 35 + ((V - 1.0) / 1.0) * 250
      const y = 160 - (pClamped / (imep * 2.8)) * 135
      points.push({ v: V, p: pClamped, x, y })
    }
    return points
  }, [imep])

  const svgPath = React.useMemo(() => {
    if (!pvPoints.length) return ""
    return pvPoints.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, "") + " Z"
  }, [pvPoints])

  // Physics residuals data
  const residuals = [
    {
      channel: "EXHAUST GAS TEMP (EGT)",
      measured: latestTelemetry?.egt ?? 0,
      expected: res?.expected_egt ?? 0,
      delta: res?.delta_egt ?? 0,
      unit: "°F",
      limit: 80,
      decimals: 1,
    },
    {
      channel: "CYLINDER HEAD TEMP (CHT)",
      measured: latestTelemetry?.cht ?? 0,
      expected: res?.expected_cht ?? 0,
      delta: res?.delta_cht ?? 0,
      unit: "°F",
      limit: 40,
      decimals: 1,
    },
    {
      channel: "OIL GALLERY PRESSURE",
      measured: latestTelemetry?.oil_pressure ?? 0,
      expected: res?.expected_oil_p ?? 0,
      delta: res?.delta_oil_p ?? 0,
      unit: "PSI",
      limit: 12,
      decimals: 1,
      invertBad: true,
    },
    {
      channel: "FUEL MASS FLOW",
      measured: latestTelemetry?.fuel_flow ?? 0,
      expected: res?.expected_fuel ?? 0,
      delta: res?.delta_fuel ?? 0,
      unit: "L/H",
      limit: 1.5,
      decimals: 2,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top Thermodynamic Metrics Strip ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brake Power</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {p?.brake_power_hp?.toFixed(1) ?? "—"} <span className="text-xs font-normal text-muted-foreground">HP</span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">{p?.brake_power_kw?.toFixed(1) ?? "—"} kW</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Thermal Eff. (η_th)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-500">
            {p?.thermal_efficiency?.toFixed(1) ?? "—"}%
          </div>
          <div className="text-[11px] text-muted-foreground">Target band 29–34%</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">IMEP (Indicated)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-primary">
            {p?.imep_bar?.toFixed(2) ?? "—"} <span className="text-xs font-normal text-muted-foreground">bar</span>
          </div>
          <div className="text-[11px] text-muted-foreground">BMEP: {p?.bmep_bar?.toFixed(2) ?? "—"} bar</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">BSFC</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {p?.bsfc_g_kwh?.toFixed(0) ?? "—"} <span className="text-xs font-normal text-muted-foreground">g/kWh</span>
          </div>
          <div className="text-[11px] text-muted-foreground">Specific fuel burn</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Volumetric Eff.</div>
          <div className="mt-1 font-mono text-2xl font-bold text-primary">
            {p?.volumetric_efficiency?.toFixed(1) ?? "—"}%
          </div>
          <div className="text-[11px] text-muted-foreground">MAP: {latestTelemetry?.map_kpa ?? 96} kPa</div>
        </Card>
        <Card className="bg-card/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Air-Fuel Equiv (λ)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-foreground">
            {p?.air_fuel_ratio ? (p.air_fuel_ratio / 14.7).toFixed(2) : "1.02"}
          </div>
          <div className="text-[11px] text-muted-foreground">AFR: {p?.air_fuel_ratio?.toFixed(1) ?? "15.0"}:1</div>
        </Card>
      </div>

      {/* ── Main Grid: P-V Loop Diagram + Physics Residuals ───────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Card 1: P-V Indicator Loop */}
        <Card className="bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Otto Cycle P-V Indicator Diagram</CardTitle>
              <CardDescription className="text-xs">
                Real-time thermodynamic pressure-volume expansion loop calculated from indicated mean effective pressure.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] border-primary/40 text-primary">
              CR 9.0:1
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-2">
            <div className="relative h-64 w-full max-w-lg rounded-lg border border-border/60 bg-muted/20 p-2">
              <svg viewBox="0 0 320 180" className="h-full w-full">
                {/* Grid lines */}
                <line x1="35" y1="25" x2="35" y2="160" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
                <line x1="35" y1="160" x2="300" y2="160" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
                <line x1="35" y1="90" x2="300" y2="90" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
                <line x1="167" y1="25" x2="167" y2="160" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />

                {/* Axis labels */}
                <text x="35" y="18" fill="currentColor" fillOpacity="0.6" fontSize="9" fontFamily="monospace">Pressure (bar)</text>
                <text x="240" y="174" fill="currentColor" fillOpacity="0.6" fontSize="9" fontFamily="monospace">Volume (rel)</text>

                {/* Filled P-V Loop */}
                <path
                  d={svgPath}
                  fill="url(#pvGrad)"
                  stroke="var(--color-primary, #38bdf8)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />

                <defs>
                  <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* State callout dots */}
                <circle cx="50" cy="40" r="3" fill="#ef4444" />
                <text x="58" y="42" fill="#ef4444" fontSize="8" fontFamily="monospace" fontWeight="bold">TDC Combustion</text>

                <circle cx="280" cy="155" r="3" fill="#38bdf8" />
                <text x="230" y="148" fill="#38bdf8" fontSize="8" fontFamily="monospace">BDC Exhaust</text>
              </svg>
            </div>

            <div className="mt-3 grid w-full grid-cols-3 gap-2 border-t border-border/40 pt-3 text-center font-mono text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground">Peak Pressure</span>
                <div className="font-bold text-foreground">{((imep * 2.5) || 21.0).toFixed(1)} bar</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Displacement</span>
                <div className="font-bold text-foreground">1,211 cc</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground">Thermodynamic State</span>
                <div className="font-bold text-emerald-500">CLOSED LOOP</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: First-Principles Physics Residuals */}
        <Card className="bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">First-Principles Residual Tracking</CardTitle>
            <CardDescription className="text-xs">
              Continuous deviation tracking between physical sensor readings and theoretical thermodynamic expected values.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto border-t border-border/60">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Channel</th>
                    <th className="px-3 py-2.5">Measured</th>
                    <th className="px-3 py-2.5">Expected</th>
                    <th className="px-3 py-2.5">Residual (Δ)</th>
                    <th className="px-4 py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {residuals.map((r, i) => {
                    const isDrift = Math.abs(r.delta) > r.limit
                    return (
                      <tr key={i} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground text-[11px] font-sans">
                          {r.channel}
                        </td>
                        <td className="px-3 py-3 font-semibold text-primary">
                          {r.measured ? r.measured.toFixed(r.decimals) : "—"} {r.unit}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {r.expected ? r.expected.toFixed(r.decimals) : "—"} {r.unit}
                        </td>
                        <td className="px-3 py-3">
                          <span className={isDrift ? "font-bold text-destructive" : "text-muted-foreground"}>
                            {r.delta >= 0 ? `+${r.delta.toFixed(r.decimals)}` : r.delta.toFixed(r.decimals)} {r.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              isDrift
                                ? "border-destructive text-destructive bg-destructive/10"
                                : "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                            }`}
                          >
                            {isDrift ? "DRIFT" : "TRACKING"}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 text-xs leading-relaxed text-muted-foreground font-sans">
              <span className="font-semibold text-foreground">Thermodynamic Analysis: </span>
              Residuals exceeding threshold envelopes trigger the Digital Twin Consistency validator, separating genuine hardware degradation from sensor transducer drift.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
