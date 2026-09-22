"use client"

import * as React from "react"
import { useTelemetry } from "@/components/telemetry-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowUpRight, RefreshCw, Target, TrendingUp, Zap } from "lucide-react"

// ─── Constants ─────────────────────────────────────────────────────────────────

const RPM_MIN = 4200, RPM_MAX = 5800, RPM_STEPS = 32
const ALT_MIN = 0, ALT_MAX = 25000, ALT_STEPS = 24
const RPM_RANGE = RPM_MAX - RPM_MIN
const ALT_RANGE = ALT_MAX - ALT_MIN

// ─── Probability model (mirrors L-BFGS-B objective) ───────────────────────────

function pComplete(rpm: number, alt: number, health: number, faultPenalty: number): number {
  const rn = (rpm - RPM_MIN) / RPM_RANGE  // 0–1
  const an = alt / ALT_MAX                // 0–1

  // RPM sweet-spot ~4800 (rn≈0.375)
  const rpmPen = Math.pow(Math.abs(rn - 0.375), 1.8) * 0.30

  // Altitude: moderate bonus, penalty past 60%
  const altBonus = an * 0.10
  const altPen = an > 0.60 ? Math.pow(an - 0.60, 2) * 0.40 : 0

  // Thermal penalty at low alt + high RPM
  const thermalPen = (rn > 0.70 && an < 0.20) ? 0.18 : 0

  const hf = health / 100
  return Math.max(0.04, Math.min(0.985, 0.94 * hf - rpmPen + altBonus - altPen - thermalPen - faultPenalty))
}

// ─── Pixel → RGB color mapping ─────────────────────────────────────────────────

function pToRgb(p: number): [number, number, number] {
  // multi-stop: dark navy (0) → indigo → violet → amber → green (1)
  if (p >= 0.82) {
    const t = (p - 0.82) / 0.18
    return [Math.round(34 * (1 - t)), Math.round(165 + t * 32), Math.round(94 - t * 20)]
  }
  if (p >= 0.58) {
    const t = (p - 0.58) / 0.24
    return [Math.round(139 * (1 - t * 0.85)), Math.round(92 + t * 73), Math.round(245 * (1 - t) + 11 * t)]
  }
  if (p >= 0.35) {
    const t = (p - 0.35) / 0.23
    return [Math.round(30 + t * 109), Math.round(27 + t * 65), Math.round(86 + t * 159)]
  }
  // 0 → 0.35: near-black navy to indigo
  const t = p / 0.35
  return [Math.round(15 + t * 15), Math.round(10 + t * 17), Math.round(30 + t * 56)]
}

// ─── Canvas heatmap ─────────────────────────────────────────────────────────────

interface HeatmapProps {
  grid: number[][]
  currentRpm: number; currentAlt: number
  optRpm: number | null; optAlt: number | null
  w: number; h: number
  onHover: (rpm: number, alt: number, p: number) => void
  onLeave: () => void
}

function HeatmapCanvas({ grid, currentRpm, currentAlt, optRpm, optAlt, w, h, onHover, onLeave }: HeatmapProps) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const cellW = w / RPM_STEPS
  const cellH = h / ALT_STEPS

  React.useEffect(() => {
    const c = canvas.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    ctx.clearRect(0, 0, w, h)

    for (let ai = 0; ai < ALT_STEPS; ai++) {
      for (let ri = 0; ri < RPM_STEPS; ri++) {
        const p = grid[ai]?.[ri] ?? 0
        const [r, g, b] = pToRgb(p)
        ctx.fillStyle = `rgba(${r},${g},${b},${0.6 + p * 0.4})`
        ctx.fillRect(ri * cellW, (ALT_STEPS - 1 - ai) * cellH, cellW + 0.8, cellH + 0.8)
      }
    }

    // Contour lines at key probability levels
    // (simplified — just marker rings around operating point)

    // Optimal point
    if (optRpm !== null && optAlt !== null) {
      const ox = ((optRpm - RPM_MIN) / RPM_RANGE) * w
      const oy = h - ((optAlt - ALT_MIN) / ALT_RANGE) * h

      // Outer ring
      ctx.beginPath()
      ctx.arc(ox, oy, 11, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(255,255,255,0.6)"
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])

      // Inner dot
      ctx.beginPath()
      ctx.arc(ox, oy, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(255,255,255,0.95)"
      ctx.fill()

      // Cross arms
      ctx.strokeStyle = "rgba(255,255,255,0.85)"
      ctx.lineWidth = 1.5
      ;[[-18, 0, -7, 0], [7, 0, 18, 0], [0, -18, 0, -7], [0, 7, 0, 18]].forEach(([x1, y1, x2, y2]) => {
        ctx.beginPath()
        ctx.moveTo(ox + x1, oy + y1)
        ctx.lineTo(ox + x2, oy + y2)
        ctx.stroke()
      })
    }

    // Current operating crosshair
    const cx = ((currentRpm - RPM_MIN) / RPM_RANGE) * w
    const cy = h - ((currentAlt - ALT_MIN) / ALT_RANGE) * h

    // Full crosshair lines
    ctx.strokeStyle = "rgba(6,182,212,0.45)"
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h)
    ctx.moveTo(0, cy); ctx.lineTo(w, cy)
    ctx.stroke()
    ctx.setLineDash([])

    // Dot
    ctx.beginPath()
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = "#06b6d4"
    ctx.shadowColor = "#06b6d4"
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [grid, currentRpm, currentAlt, optRpm, optAlt, w, h, cellW, cellH])

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const rx = (e.clientX - rect.left) / rect.width
    const ry = 1 - (e.clientY - rect.top) / rect.height
    const rpm = RPM_MIN + rx * RPM_RANGE
    const alt = ALT_MIN + ry * ALT_RANGE
    const ri = Math.min(RPM_STEPS - 1, Math.max(0, Math.floor(rx * RPM_STEPS)))
    const ai = Math.min(ALT_STEPS - 1, Math.max(0, Math.floor(ry * ALT_STEPS)))
    onHover(rpm, alt, grid[ai]?.[ri] ?? 0)
  }

  return (
    <canvas ref={canvas} width={w} height={h} className="block rounded-lg cursor-crosshair"
      style={{ imageRendering: "pixelated" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={onLeave}
    />
  )
}

// ─── Gradient legend bar ────────────────────────────────────────────────────────

function GradientBar() {
  const STEPS = 120
  const stops = Array.from({ length: STEPS }, (_, i) => {
    const [r, g, b] = pToRgb(i / STEPS)
    return `rgb(${r},${g},${b})`
  }).join(",")
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2.5 w-full rounded-full" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground/70">
        <span>Low · 0%</span>
        <span className="text-amber-400/80">50%</span>
        <span className="text-emerald-400/80">High · 99%</span>
      </div>
    </div>
  )
}

// ─── Hover tooltip ─────────────────────────────────────────────────────────────

interface HoverInfo { rpm: number; alt: number; p: number }

// ─── Main component ────────────────────────────────────────────────────────────

export function EnvelopeHeatmap() {
  const { latestTelemetry: t } = useTelemetry()
  const [hoverInfo, setHoverInfo] = React.useState<HoverInfo | null>(null)

  const currentRpm = t?.rpm ?? 4800
  const currentAlt = t?.altitude_ft ?? 3000
  const health = t?.health?.health_index ?? 88
  const faultPenalty = Math.min(0.35, (t?.fault_events?.length ?? 0) * 0.07)

  const optResult = t?.optimize_result
  const optRpm = optResult?.optimal_rpm ?? null
  const optAlt = optResult?.optimal_alt ?? null

  const grid = React.useMemo<number[][]>(() =>
    Array.from({ length: ALT_STEPS }, (_, ai) => {
      const alt = ALT_MIN + (ai / (ALT_STEPS - 1)) * ALT_RANGE
      return Array.from({ length: RPM_STEPS }, (_, ri) => {
        const rpm = RPM_MIN + (ri / (RPM_STEPS - 1)) * RPM_RANGE
        return pComplete(rpm, alt, health, faultPenalty)
      })
    }), [health, faultPenalty])

  const currentP = pComplete(currentRpm, currentAlt, health, faultPenalty)
  const optP = optRpm && optAlt ? pComplete(optRpm, optAlt, health, faultPenalty) : null
  const gain = optP !== null ? ((optP - currentP) * 100) : null

  // Responsive canvas
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [canvasW, setCanvasW] = React.useState(520)
  React.useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setCanvasW(Math.floor(w))
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])
  const canvasH = Math.round(canvasW * 0.52)

  // Alt axis ticks
  const altTicks = [0, 5000, 10000, 15000, 20000, 25000]
  const rpmTicks = [4200, 4600, 5000, 5400, 5800]

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10">
            <Target className="size-4 text-orange-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Operational Envelope</h1>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Mission P(complete) across RPM × Altitude · L-BFGS-B optimizer overlay
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] border-cyan-500/40 text-cyan-400 gap-1">
            ◉ Current: {(currentP * 100).toFixed(0)}%
          </Badge>
          {optP !== null && (
            <Badge variant="outline" className="font-mono text-[10px] border-white/30 text-white gap-1">
              ✦ Optimal: {(optP * 100).toFixed(0)}%
            </Badge>
          )}
        </div>
      </div>

      {/* ── Heatmap card ─────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="size-3.5 text-orange-500" />
            Mission Completion Probability Map
            {hoverInfo && (
              <span className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">
                {hoverInfo.rpm.toFixed(0)} RPM · {(hoverInfo.alt / 1000).toFixed(1)}k ft → {(hoverInfo.p * 100).toFixed(0)}%
              </span>
            )}
          </CardTitle>
          <CardDescription className="text-[10px] font-mono">
            ◉ = current operating point · ✦ = L-BFGS-B optimal · Hover to probe
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex gap-2">
            {/* Y-axis label + ticks */}
            <div className="flex flex-col items-end justify-between py-1" style={{ minWidth: 36 }}>
              {altTicks.slice().reverse().map(a => (
                <span key={a} className="text-[8px] font-mono text-muted-foreground/60 tabular-nums">
                  {a === 0 ? "0" : `${a / 1000}k`}
                </span>
              ))}
            </div>

            {/* Canvas container */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <div ref={containerRef} className="w-full rounded-xl overflow-hidden border border-border/40"
                style={{ background: "#030810" }}>
                <HeatmapCanvas
                  grid={grid}
                  currentRpm={currentRpm} currentAlt={currentAlt}
                  optRpm={optRpm} optAlt={optAlt}
                  w={canvasW} h={canvasH}
                  onHover={(rpm, alt, p) => setHoverInfo({ rpm, alt, p })}
                  onLeave={() => setHoverInfo(null)}
                />
              </div>

              {/* X-axis ticks */}
              <div className="flex justify-between px-0.5">
                {rpmTicks.map(r => (
                  <span key={r} className="text-[8px] font-mono text-muted-foreground/60 tabular-nums">{r}</span>
                ))}
              </div>
              <p className="text-center text-[9px] font-mono text-muted-foreground/50">ENGINE RPM →</p>
            </div>

            {/* Y-axis label */}
            <div className="flex items-center justify-center" style={{ minWidth: 16 }}>
              <span className="text-[8px] font-mono text-muted-foreground/50 whitespace-nowrap"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                ← ALTITUDE (ft)
              </span>
            </div>
          </div>

          {/* Gradient legend */}
          <div className="mt-3 px-10">
            <GradientBar />
          </div>

          {/* Legend items */}
          <div className="mt-3 flex items-center justify-center gap-6 text-[9px] font-mono text-muted-foreground/70">
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-full bg-cyan-500 shadow-[0_0_6px_#06b6d4]" />
              <span>Current operating point</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
              <span>Optimizer optimal</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Stat cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Current RPM", value: currentRpm.toFixed(0), unit: "RPM", color: "#06b6d4", border: "border-cyan-500/25", bg: "from-cyan-500/8" },
          { label: "Current Altitude", value: currentAlt.toFixed(0), unit: "ft", color: "#8b5cf6", border: "border-violet-500/25", bg: "from-violet-500/8" },
          ...(optRpm ? [{ label: "Optimal RPM", value: optRpm.toFixed(0), unit: `${optAlt?.toFixed(0)} ft`, color: "#ffffff", border: "border-white/15", bg: "from-white/5" }] : []),
          ...(gain !== null ? [{ label: "P(complete) Gain", value: `+${gain.toFixed(1)}%`, unit: "if moved to optimal", color: "#22c55e", border: "border-emerald-500/25", bg: "from-emerald-500/8" }] : []),
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border ${s.border} bg-gradient-to-br ${s.bg} to-transparent p-4`}>
            <p className="text-[9px] font-mono text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-mono font-bold tabular-nums mt-1" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">{s.unit}</p>
          </div>
        ))}
      </div>

      {/* ── Optimizer recommendations ─────────────────────────────────────────── */}
      {optResult?.recommendations && optResult.recommendations.length > 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-transparent p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15">
              <Zap className="size-3.5 text-emerald-400" />
            </div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
              L-BFGS-B Optimizer Recommendations
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {optResult.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs font-mono text-muted-foreground">
                <ArrowUpRight className="size-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Health context ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 bg-muted/20 p-3.5 flex items-start gap-3">
        <TrendingUp className="size-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed">
          Heatmap computed from engine health ({health.toFixed(0)}%) and active fault penalty ({(faultPenalty * 100).toFixed(0)}%). As health degrades, the green "safe zone" contracts toward lower RPM and moderate altitudes.
          The L-BFGS-B optimizer minimises the negative mission completion probability under RPM and altitude constraints.
        </p>
      </div>
    </div>
  )
}
