"use client"

import * as React from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Html, Sparkles } from "@react-three/drei"
import * as THREE from "three"

// Suppress THREE.Clock deprecation log from internal @react-three/fiber useFrame loop
if (typeof window !== "undefined") {
  const _warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("THREE.Clock: This module has been deprecated")) return
    _warn(...args)
  }
}

import { useTheme } from "next-themes"
import { useTelemetry } from "@/components/telemetry-provider"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Cpu,
  Eye,
  Flame,
  Gauge,
  Layers,
  Maximize2,
  Minimize2,
  Navigation,
  Plane,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles as SparklesIcon,
  Thermometer,
  Wind,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

// ─── Types & Presets ──────────────────────────────────────────────────────────

export type RenderMode = "STEALTH_SURFACE" | "X_RAY_INTERNAL" | "THERMAL_FLIR" | "EXPLODED_ASSEMBLY"

export type CameraPreset = "ISOMETRIC" | "ENGINE_ZOOM" | "CHASE_CAM" | "TOP_PLANFORM" | "FRONT_HEADON"

interface CameraPresetConfig {
  pos: [number, number, number]
  target: [number, number, number]
  label: string
}

const CAMERA_PRESETS: Record<CameraPreset, CameraPresetConfig> = {
  ISOMETRIC: {
    pos: [2.8, 1.6, 3.2],
    target: [0.0, 0.05, 0],
    label: "Isometric 3/4",
  },
  ENGINE_ZOOM: {
    pos: [-1.6, 0.8, 1.1],
    target: [-0.5, 0.05, 0],
    label: "Powerplant Macro",
  },
  CHASE_CAM: {
    pos: [-3.2, 1.1, 0],
    target: [0.4, 0.05, 0],
    label: "Chase Observer",
  },
  TOP_PLANFORM: {
    pos: [0.0, 4.4, 0.01],
    target: [0.0, 0, 0],
    label: "Top Planform",
  },
  FRONT_HEADON: {
    pos: [3.4, 0.2, 0],
    target: [0.6, 0.0, 0],
    label: "Nose FLIR View",
  },
}

// ─── Health & Status Colors ──────────────────────────────────────────────────

function getHealthColor(health: number, isDark: boolean): string {
  if (health >= 80) return isDark ? "#00ffcc" : "#059669"
  if (health >= 60) return isDark ? "#fbbf24" : "#d97706"
  if (health >= 35) return isDark ? "#fb923c" : "#ea580c"
  return isDark ? "#ff3366" : "#dc2626"
}

function getHealthStatus(health: number): string {
  if (health >= 80) return "NOMINAL"
  if (health >= 60) return "DEGRADED"
  if (health >= 35) return "ALERT"
  return "CRITICAL"
}

// ─── Animated Data Wire connecting Hardpoint to Node Card ─────────────────────

function DataWire({
  from,
  to,
  color,
  active,
  isDark,
}: {
  from: [number, number, number]
  to: [number, number, number]
  color: string
  active: boolean
  isDark: boolean
}) {
  const lineObj = React.useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ])
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: active ? (isDark ? 0.95 : 0.85) : isDark ? 0.45 : 0.25,
    })
    return new THREE.Line(geo, mat)
  }, [from, to, color, active, isDark])

  const pulseRef = React.useRef<THREE.Mesh>(null)
  const vFrom = React.useMemo(() => new THREE.Vector3(...from), [from])
  const vTo = React.useMemo(() => new THREE.Vector3(...to), [to])

  useFrame(({ clock }, dt) => {
    if (lineObj.material instanceof THREE.LineBasicMaterial) {
      const targetOpacity = active ? (isDark ? 0.95 : 0.85) : isDark ? 0.45 : 0.25
      lineObj.material.opacity += (targetOpacity - lineObj.material.opacity) * dt * 8
    }
    if (pulseRef.current) {
      const progress = (clock.elapsedTime * 0.9) % 1
      pulseRef.current.position.lerpVectors(vFrom, vTo, progress)
    }
  })

  return (
    <group>
      <primitive object={lineObj} />
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

// ─── Aerodynamic Airflow Streamlines ──────────────────────────────────────────

function AerodynamicStreamlines({ active, isDark, cht }: { active: boolean; isDark: boolean; cht: number }) {
  const numParticles = 36
  const particles = React.useMemo(() => {
    return Array.from({ length: numParticles }, (_, i) => ({
      initialX: 2.2 - (i % 12) * 0.35,
      y: 0.14 + (Math.floor(i / 12) - 1) * 0.08,
      z: -1.2 + (i % 9) * 0.3,
      speed: 1.8 + (i % 5) * 0.25,
      offset: i * 0.12,
    }))
  }, [numParticles])

  const groupRef = React.useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!groupRef.current || !active) return
    const t = clock.elapsedTime
    groupRef.current.children.forEach((child, i) => {
      const p = particles[i]
      if (child instanceof THREE.Mesh) {
        let x = 2.4 - ((t * p.speed + p.offset) % 4.6)
        let y = p.y + (Math.abs(x) < 0.6 ? 0.04 : 0)
        child.position.set(x, y, p.z)
      }
    })
  })

  if (!active) return null

  const isHot = cht > 400
  const streamColor = isHot ? "#fb923c" : isDark ? "#38bdf8" : "#0284c7"

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.initialX, p.y, p.z]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshBasicMaterial color={streamColor} transparent opacity={isDark ? 0.65 : 0.45} />
        </mesh>
      ))}
    </group>
  )
}

// ─── 3D Subsystem Node: Orb + Orbital Ring + Interactive Card ──────────────────

interface SubsystemNodeProps {
  id: string
  code: string
  title: string
  label: string
  value: string
  unit: string
  health: number
  range: string
  statusText: string
  position: [number, number, number]
  icon: React.ReactNode
  selected: boolean
  isDark: boolean
  onClick: () => void
  onClose: () => void
}

function SubsystemNode({
  code,
  title,
  value,
  unit,
  health,
  range,
  statusText,
  position,
  icon,
  selected,
  isDark,
  onClick,
  onClose,
}: SubsystemNodeProps) {
  const [hovered, setHovered] = React.useState(false)
  const sphereRef = React.useRef<THREE.Mesh>(null)
  const ringRef = React.useRef<THREE.Mesh>(null)

  const color = getHealthColor(health, isDark)

  useFrame(({ clock }, dt) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += dt * (selected ? 2.2 : 0.95)
      ringRef.current.rotation.x += dt * 0.45
    }
    if (sphereRef.current) {
      const scale = selected ? 1.35 : hovered ? 1.2 : 1.0
      sphereRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), dt * 12)
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={sphereRef}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        onPointerOver={() => {
          setHovered(true)
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = "default"
        }}
      >
        <sphereGeometry args={[0.055, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.8 : isDark ? 1.1 : 0.65}
          roughness={0.15}
          metalness={0.9}
        />
      </mesh>

      <mesh ref={ringRef}>
        <torusGeometry args={[0.095, 0.008, 12, 36]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.95 : hovered ? 0.85 : isDark ? 0.75 : 0.55}
        />
      </mesh>

      <Html center={false} position={[0.12, 0.06, 0]} zIndexRange={[100, 0]}>
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className="select-none cursor-pointer"
          style={{
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease",
            transform: selected ? "scale(1.02)" : hovered ? "scale(1.04) translateY(-2px)" : "scale(1)",
          }}
        >
          {selected ? (
            <div
              style={{
                width: 242,
                background: isDark ? "rgba(10, 15, 29, 0.97)" : "rgba(255, 255, 255, 0.98)",
                border: `1.5px solid ${color}`,
                borderRadius: 18,
                padding: "12px 14px 11px",
                backdropFilter: "blur(24px)",
                boxShadow: isDark
                  ? `0 0 32px ${color}66, 0 16px 40px -8px rgba(0, 0, 0, 0.85)`
                  : `0 0 28px ${color}45, 0 14px 34px -6px rgba(0, 0, 0, 0.12)`,
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color, display: "flex", alignItems: "center" }}>{icon}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontWeight: 700,
                      color: isDark ? "#f8fafc" : "#0f172a",
                    }}
                  >
                    {code} · {title}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                  }}
                  title="Close details"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 9999,
                    border: isDark ? "1px solid rgba(71, 85, 105, 0.6)" : "1px solid rgba(203, 213, 225, 0.8)",
                    background: isDark ? "rgba(30, 41, 59, 0.8)" : "rgba(241, 245, 249, 0.9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: isDark ? "#94a3b8" : "#64748b",
                  }}
                >
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span
                    style={{
                      fontSize: 26,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontWeight: 800,
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                      color: color,
                    }}
                  >
                    {value}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontWeight: 600,
                      color: isDark ? "#64748b" : "#94a3b8",
                    }}
                  >
                    {unit}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 700,
                    color: color,
                    background: `${color}18`,
                    border: `1px solid ${color}35`,
                    padding: "2.5px 8px",
                    borderRadius: 9999,
                    letterSpacing: "0.04em",
                  }}
                >
                  {health.toFixed(0)}% · {getHealthStatus(health)}
                </span>
              </div>

              <div
                style={{
                  background: isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(241, 245, 249, 0.85)",
                  border: isDark ? "1px solid rgba(51, 65, 85, 0.5)" : "1px solid rgba(226, 232, 240, 0.9)",
                  borderRadius: 8,
                  padding: "5px 9px",
                  marginBottom: 6,
                  fontSize: 10,
                  fontFamily: "var(--font-geist-mono), monospace",
                  color: isDark ? "#94a3b8" : "#64748b",
                  fontWeight: 500,
                }}
              >
                {range}
              </div>

              <div
                style={{
                  fontSize: 10.5,
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontWeight: 600,
                  color: isDark ? "#cbd5e1" : "#334155",
                  marginBottom: 8,
                }}
              >
                {statusText}
              </div>

              <div
                style={{
                  height: 3.5,
                  width: 52,
                  borderRadius: 9999,
                  background: color,
                  boxShadow: `0 0 8px ${color}aa`,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                minWidth: 108,
                background: isDark ? "rgba(10, 15, 29, 0.95)" : "rgba(255, 255, 255, 0.98)",
                border: isDark ? "1px solid rgba(51, 65, 85, 0.8)" : "1px solid rgba(226, 232, 240, 0.95)",
                borderRadius: 14,
                padding: "8px 12px 7px",
                backdropFilter: "blur(20px)",
                boxShadow: isDark
                  ? "0 8px 24px -4px rgba(0, 0, 0, 0.75), 0 2px 6px rgba(0, 0, 0, 0.5)"
                  : "0 8px 24px -4px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color, display: "flex", alignItems: "center" }}>{icon}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: isDark ? "#f8fafc" : "#0f172a",
                    }}
                  >
                    {code}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 700,
                    color: color,
                    background: `${color}18`,
                    padding: "1px 6px",
                    borderRadius: 6,
                    border: `1px solid ${color}30`,
                  }}
                >
                  {health.toFixed(0)}%
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 18,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    color: isDark ? "#f8fafc" : "#0f172a",
                  }}
                >
                  {value}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 600,
                    color: isDark ? "#64748b" : "#94a3b8",
                  }}
                >
                  {unit}
                </span>
              </div>

              <div
                style={{
                  height: 3,
                  width: 36,
                  borderRadius: 9999,
                  background: color,
                  boxShadow: `0 0 6px ${color}88`,
                }}
              />
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

// ─── HIGH-FIDELITY TACTICAL MALE UAV WITH ROTAX 914 F POWERPLANT ──────────────

interface AirframeProps {
  rpm: number
  cht: number
  wireframe: boolean
  isDark: boolean
  renderMode: RenderMode
  explosionFactor: number
  selectedId: string | null
  onSelect: (id: string) => void
}

function UavWithEngineBox({
  rpm,
  cht,
  wireframe,
  isDark,
  renderMode,
  explosionFactor,
  selectedId,
  onSelect,
}: AirframeProps) {
  const propRef = React.useRef<THREE.Group>(null)
  const bodyRef = React.useRef<THREE.Group>(null)
  const strobeRef = React.useRef<THREE.Mesh>(null)

  // Fluid aerodynamic hover float (damped during exploded view)
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (bodyRef.current) {
      const damp = 1 - explosionFactor * 0.85
      bodyRef.current.position.y = Math.sin(t * 0.85) * 0.02 * damp
      bodyRef.current.rotation.z = Math.sin(t * 0.55) * 0.006 * damp
      bodyRef.current.rotation.y = Math.sin(t * 0.3) * 0.004 * damp
    }
    if (propRef.current) {
      propRef.current.rotation.x += dt * Math.min(48, Math.max(2, rpm / 120))
    }
    // High-visibility anti-collision strobe flash
    if (strobeRef.current) {
      const flash = Math.sin(t * 5.0) > 0.85 ? 1.0 : 0.0
      if (strobeRef.current.material instanceof THREE.MeshBasicMaterial) {
        strobeRef.current.material.opacity = flash
      }
    }
  })

  // ── Render Mode Materials ──────────────────────────────────────────────────
  const isXray = renderMode === "X_RAY_INTERNAL"
  const isThermal = renderMode === "THERMAL_FLIR"
  const isHot = cht > 405

  // 1. Main Airframe: Aeronautic Slate Titanium (Tactical RAM coating)
  const airframeMat = React.useMemo(() => {
    if (isThermal) {
      return new THREE.MeshStandardMaterial({
        color: "#1e1b4b",
        emissive: "#1d4ed8",
        emissiveIntensity: 0.45,
        roughness: 0.35,
        metalness: 0.65,
        wireframe,
      })
    }
    if (isXray) {
      return new THREE.MeshStandardMaterial({
        color: isDark ? "#38bdf8" : "#0284c7",
        transparent: true,
        opacity: 0.18,
        roughness: 0.08,
        metalness: 0.95,
        wireframe,
      })
    }
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#334155" : "#f1f5f9",
      emissive: isDark ? "#0f172a" : "#000000",
      emissiveIntensity: isDark ? 0.35 : 0,
      roughness: isDark ? 0.35 : 0.40,
      metalness: isDark ? 0.48 : 0.25,
      wireframe,
    })
  }, [isDark, wireframe, isXray, isThermal])

  // 2. Fuselage Lower Belly & Underside (Two-tone counter-shading)
  const bellyMat = React.useMemo(() => {
    if (isThermal) return airframeMat
    if (isXray) return airframeMat
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#1e293b" : "#cbd5e1",
      roughness: isDark ? 0.4 : 0.45,
      metalness: isDark ? 0.5 : 0.25,
      wireframe,
    })
  }, [isDark, wireframe, isXray, isThermal, airframeMat])

  // 3. Forward Dorsal SATCOM Dielectric Radome (Authentic ceramic off-white blister)
  const radomeMat = React.useMemo(() => {
    if (isThermal) {
      return new THREE.MeshStandardMaterial({
        color: "#0284c7",
        emissive: "#0369a1",
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.5,
      })
    }
    if (isXray) return airframeMat
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#e2e8f0" : "#ffffff",
      emissive: isDark ? "#1e293b" : "#f1f5f9",
      emissiveIntensity: isDark ? 0.2 : 0,
      roughness: 0.22,
      metalness: 0.28,
      wireframe,
    })
  }, [isDark, wireframe, isXray, isThermal, airframeMat])

  // 4. Wing Panels & Control Surfaces (Tactical Carbon Weave)
  const carbonPanelMat = React.useMemo(() => {
    if (isThermal) {
      return new THREE.MeshStandardMaterial({
        color: "#0284c7",
        emissive: "#0369a1",
        emissiveIntensity: 0.5,
      })
    }
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#18202f" : "#94a3b8",
      roughness: 0.42,
      metalness: 0.65,
      wireframe,
    })
  }, [isDark, wireframe, isThermal])

  // 5. Polished Metallic Hardware (Pitot probe, brackets, fasteners)
  const metalTrimMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: "#cbd5e1",
      metalness: 0.96,
      roughness: 0.12,
    })
  }, [])

  // 6. Machined Billet Aluminum Crankcase (Rotax 914 F)
  const engineCoreMat = React.useMemo(() => {
    if (isThermal) {
      return new THREE.MeshStandardMaterial({
        color: "#ea580c",
        emissive: isHot ? "#ff2200" : "#c2410c",
        emissiveIntensity: isHot ? 1.6 : 0.95,
        roughness: 0.2,
        metalness: 0.9,
        wireframe,
      })
    }
    return new THREE.MeshStandardMaterial({
      color: isDark ? (isHot ? "#f97316" : "#64748b") : isHot ? "#ea580c" : "#475569",
      emissive: isDark ? (isHot ? "#c2410c" : "#1e293b") : isHot ? "#ea580c" : "#0f172a",
      emissiveIntensity: isHot ? 0.95 : isDark ? 0.25 : 0.15,
      roughness: 0.24,
      metalness: 0.88,
      wireframe,
    })
  }, [isDark, cht, wireframe, isThermal, isHot])

  // 7. Boxer Cylinder Heads & Cooling Fins
  const finMat = React.useMemo(() => {
    if (isThermal) {
      return new THREE.MeshStandardMaterial({
        color: "#f59e0b",
        emissive: "#d97706",
        emissiveIntensity: 0.85,
        metalness: 0.95,
        roughness: 0.18,
      })
    }
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#94a3b8" : "#cbd5e1",
      metalness: 0.95,
      roughness: 0.18,
    })
  }, [isDark, isThermal])

  // 8. Garrett T25 Turbocharger (Lustrous Gold-Titanium Scroll)
  const turboMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isThermal ? "#ef4444" : "#f59e0b",
      emissive: isThermal ? "#dc2626" : isDark ? "#78350f" : "#a16207",
      emissiveIntensity: isThermal ? 1.3 : 0.45,
      metalness: 0.95,
      roughness: 0.14,
    })
  }, [isThermal, isDark])

  // 9. Heat-Tempered Dual Exhaust Tailpipes (Thermal bluing gradient)
  const exhaustMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: cht > 400 ? "#ff2200" : isDark ? "#f59e0b" : "#d97706",
      emissive: cht > 400 ? "#ff2200" : isDark ? "#ea580c" : "#b45309",
      emissiveIntensity: cht > 400 ? 1.9 : 0.75,
      metalness: 0.95,
      roughness: 0.15,
    })
  }, [cht, isDark])

  // 10. Chin FLIR Optical Turret
  const turretHousingMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#1e293b" : "#334155",
      roughness: 0.25,
      metalness: 0.9,
    })
  }, [isDark])

  const opticalLensMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: "#00f0ff",
      emissive: "#00d4ff",
      emissiveIntensity: isDark ? 1.6 : 0.85,
      roughness: 0.04,
      metalness: 0.92,
    })
  }, [isDark])

  // 11. Razor-sharp Laminar Edge Trim
  const edgeTrimMat = React.useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: isThermal ? "#f97316" : isDark ? "#00f0ff" : "#0284c7",
      transparent: true,
      opacity: isDark ? 0.75 : 0.45,
    })
  }, [isDark, isThermal])

  // 12. Carbon Propeller & Landing Skids
  const propBladeMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#1e293b" : "#334155",
      metalness: 0.75,
      roughness: 0.32,
    })
  }, [isDark])

  const propTipMat = React.useMemo(() => {
    return new THREE.MeshBasicMaterial({ color: "#fbbf24" })
  }, [])

  const skidMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#1e2636" : "#475569",
      roughness: 0.35,
      metalness: 0.7,
      wireframe,
    })
  }, [isDark, wireframe])

  // Exploded view coordinate offsets
  const ef = explosionFactor
  const fuselageY = ef * 0.35
  const noseX = 0.8 + ef * 0.45
  const engineX = -0.45 - ef * 0.65
  const propX = -0.88 - ef * 1.05
  const leftWingZ = -1.02 - ef * 0.85
  const rightWingZ = 1.02 + ef * 0.85
  const vTailX = -0.82 - ef * 0.6
  const skidY = -0.22 - ef * 0.3

  return (
    <group ref={bodyRef}>
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 1. MAIN AERODYNAMIC CHINED FUSELAGE & SATCOM RADOME ────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group position={[0, fuselageY, 0]}>
        {/* Upper Fuselage Aerodynamic Lifting Body */}
        <mesh material={airframeMat} position={[0.08, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.138, 0.165, 1.48, 32]} />
        </mesh>

        {/* Lower Belly Counter-Shading Plate */}
        <mesh material={bellyMat} position={[0.08, -0.065, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.14, 1.42, 32]} />
        </mesh>

        {/* Dorsal SATCOM Dielectric Radome (Contrasting Ceramic Off-White Blister) */}
        <mesh material={radomeMat} position={[0.38, 0.125, 0]} scale={[1.8, 0.7, 0.85]}>
          <sphereGeometry args={[0.135, 28, 28]} />
        </mesh>

        {/* Forward Avionics Access Hatch Seam */}
        <mesh position={[0.38, 0.148, 0]} material={edgeTrimMat}>
          <boxGeometry args={[0.35, 0.005, 0.08]} />
        </mesh>

        {/* Dorsal Spine Avionics Ridge */}
        <mesh position={[0.05, 0.152, 0]} material={edgeTrimMat}>
          <boxGeometry args={[1.15, 0.008, 0.012]} />
        </mesh>

        {/* Dorsal Anti-Collision Xenon Strobe Light */}
        <mesh ref={strobeRef} position={[0.05, 0.165, 0]}>
          <sphereGeometry args={[0.018, 14, 14]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={1} />
        </mesh>

        {/* NACA Ram-Air Engine Cooling Scoops (Upper Shoulders) */}
        <mesh position={[-0.18, 0.125, 0.075]} rotation={[0.2, 0, 0]} material={carbonPanelMat}>
          <boxGeometry args={[0.22, 0.035, 0.08]} />
        </mesh>
        <mesh position={[-0.18, 0.125, -0.075]} rotation={[-0.2, 0, 0]} material={carbonPanelMat}>
          <boxGeometry args={[0.22, 0.035, 0.08]} />
        </mesh>

        {/* Ventral Chin Air Radiator Scoop */}
        <mesh position={[0.25, -0.14, 0]} material={carbonPanelMat}>
          <boxGeometry args={[0.28, 0.045, 0.12]} />
        </mesh>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 2. FORWARD CHIN & MULTI-SPECTRAL EO/IR FLIR TURRET ─────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group position={[noseX, fuselageY, 0]}>
        {/* Sculpted Aerodynamic Nose Cone */}
        <mesh material={airframeMat} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.138, 0.54, 32]} />
        </mesh>

        {/* Surgical Stainless Steel Pitot-Static Probe */}
        <mesh position={[0.36, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={metalTrimMat}>
          <cylinderGeometry args={[0.004, 0.005, 0.22, 12]} />
        </mesh>
        {/* Pitot AoA Micro-Vane */}
        <mesh position={[0.31, 0.012, 0]} material={metalTrimMat}>
          <boxGeometry args={[0.02, 0.018, 0.002]} />
        </mesh>

        {/* Underside Chin Multi-Spectral FLIR Sensor Turret Ball */}
        <group position={[0.04, -0.125 - ef * 0.25, 0]}>
          {/* Outer Gimbal Housing */}
          <mesh material={turretHousingMat}>
            <sphereGeometry args={[0.088, 28, 28]} />
          </mesh>

          {/* Machined Gimbal Bezel Ring */}
          <mesh position={[0.05, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={metalTrimMat}>
            <torusGeometry args={[0.055, 0.008, 12, 24]} />
          </mesh>

          {/* Main Sapphire Optical Aperture (Front-Looking) */}
          <mesh position={[0.075, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={opticalLensMat}>
            <cylinderGeometry args={[0.042, 0.042, 0.02, 24]} />
          </mesh>

          {/* Secondary Infrared LWIR Thermal Window */}
          <mesh position={[0.06, -0.038, 0]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.022, 16]} />
            <meshBasicMaterial color="#a855f7" />
          </mesh>

          {/* Co-Axial Laser Rangefinder / Designator Diode */}
          <mesh position={[0.065, 0.034, 0]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.014, 16]} />
            <meshBasicMaterial color="#f59e0b" />
          </mesh>
        </group>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 3. HIGH-ASPECT TAPERED WINGS & BLENDED WINGLETS ────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group position={[0.05, 0.01 + fuselageY * 0.5, 0]}>
        {/* ── Port Wing (Left) ── */}
        <group position={[-0.02, 0, leftWingZ]}>
          {/* Main Tapered Wing Chord */}
          <mesh material={airframeMat} position={[0, 0, 0]} rotation={[0.012, -0.03, 0.01]}>
            <boxGeometry args={[0.38, 0.024, 1.95]} />
          </mesh>

          {/* Wing Root Fairing Strake / Glove (Blended wing-body transition) */}
          <mesh material={carbonPanelMat} position={[0.09, 0.005, 0.72]} rotation={[0, 0.04, 0]}>
            <boxGeometry args={[0.28, 0.028, 0.55]} />
          </mesh>

          {/* Trailing Edge Aileron & Flap Control Surface */}
          <mesh material={carbonPanelMat} position={[-0.14, -0.002, -0.15]}>
            <boxGeometry args={[0.08, 0.018, 1.4]} />
          </mesh>

          {/* Luminous Razor Leading Edge */}
          <mesh position={[0.18, 0.004, 0]} material={edgeTrimMat}>
            <boxGeometry args={[0.012, 0.008, 1.92]} />
          </mesh>

          {/* Underwing Tactical Pylons */}
          {[-0.35, 0.25].map((pz) => (
            <mesh key={`pylon-l-${pz}`} position={[-0.02, -0.025, pz]} material={metalTrimMat}>
              <boxGeometry args={[0.18, 0.03, 0.018]} />
            </mesh>
          ))}

          {/* Winglet (Canted Upward 65°) */}
          <mesh material={airframeMat} position={[-0.02, 0.09, -0.98]} rotation={[0, 0, -0.2]}>
            <boxGeometry args={[0.20, 0.18, 0.018]} />
          </mesh>

          {/* Port Navigation Light (Aviation Red) */}
          <mesh position={[-0.01, 0.17, -0.99]}>
            <sphereGeometry args={[0.018, 14, 14]} />
            <meshBasicMaterial color="#ff1744" />
          </mesh>
        </group>

        {/* ── Starboard Wing (Right) ── */}
        <group position={[-0.02, 0, rightWingZ]}>
          {/* Main Tapered Wing Chord */}
          <mesh material={airframeMat} position={[0, 0, 0]} rotation={[-0.012, 0.03, 0.01]}>
            <boxGeometry args={[0.38, 0.024, 1.95]} />
          </mesh>

          {/* Wing Root Fairing Strake / Glove */}
          <mesh material={carbonPanelMat} position={[0.09, 0.005, -0.72]} rotation={[0, -0.04, 0]}>
            <boxGeometry args={[0.28, 0.028, 0.55]} />
          </mesh>

          {/* Trailing Edge Aileron & Flap Control Surface */}
          <mesh material={carbonPanelMat} position={[-0.14, -0.002, 0.15]}>
            <boxGeometry args={[0.08, 0.018, 1.4]} />
          </mesh>

          {/* Luminous Razor Leading Edge */}
          <mesh position={[0.18, 0.004, 0]} material={edgeTrimMat}>
            <boxGeometry args={[0.012, 0.008, 1.92]} />
          </mesh>

          {/* Underwing Tactical Pylons */}
          {[-0.25, 0.35].map((pz) => (
            <mesh key={`pylon-r-${pz}`} position={[-0.02, -0.025, pz]} material={metalTrimMat}>
              <boxGeometry args={[0.18, 0.03, 0.018]} />
            </mesh>
          ))}

          {/* Winglet (Canted Upward 65°) */}
          <mesh material={airframeMat} position={[-0.02, 0.09, 0.98]} rotation={[0, 0, 0.2]}>
            <boxGeometry args={[0.20, 0.18, 0.018]} />
          </mesh>

          {/* Starboard Navigation Light (Aviation Green) */}
          <mesh position={[-0.01, 0.17, 0.99]}>
            <sphereGeometry args={[0.018, 14, 14]} />
            <meshBasicMaterial color="#00e676" />
          </mesh>
        </group>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 4. UNDERSIDE TACTICAL LANDING SKIDS & STRUTS ───────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group position={[0.1, skidY, 0]}>
        {/* Port Landing Skid */}
        <group position={[0, 0, -0.32]}>
          {/* Longitudinal Carbon Skid Tube */}
          <mesh rotation={[0, 0, Math.PI / 2]} material={skidMat}>
            <cylinderGeometry args={[0.012, 0.012, 0.95, 12]} />
          </mesh>
          {/* Titanium Wear Shoe Curve (Front) */}
          <mesh position={[0.48, 0.03, 0]} rotation={[0, 0, Math.PI / 4]} material={metalTrimMat}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
          </mesh>
          {/* Canted Support Struts (Front & Rear) */}
          <mesh position={[0.22, 0.08, 0.08]} rotation={[0.4, 0, -0.1]} material={skidMat}>
            <cylinderGeometry args={[0.009, 0.009, 0.18, 12]} />
          </mesh>
          <mesh position={[-0.25, 0.08, 0.08]} rotation={[0.4, 0, 0.1]} material={skidMat}>
            <cylinderGeometry args={[0.009, 0.009, 0.18, 12]} />
          </mesh>
        </group>

        {/* Starboard Landing Skid */}
        <group position={[0, 0, 0.32]}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={skidMat}>
            <cylinderGeometry args={[0.012, 0.012, 0.95, 12]} />
          </mesh>
          <mesh position={[0.48, 0.03, 0]} rotation={[0, 0, Math.PI / 4]} material={metalTrimMat}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
          </mesh>
          <mesh position={[0.22, 0.08, -0.08]} rotation={[-0.4, 0, -0.1]} material={skidMat}>
            <cylinderGeometry args={[0.009, 0.009, 0.18, 12]} />
          </mesh>
          <mesh position={[-0.25, 0.08, -0.08]} rotation={[-0.4, 0, 0.1]} material={skidMat}>
            <cylinderGeometry args={[0.009, 0.009, 0.18, 12]} />
          </mesh>
        </group>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 5. ROTAX 914 F TURBO POWERPLANT (AFT NACELLE INSTALLATION) ─────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group
        position={[engineX, 0.03 + fuselageY * 0.3, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect("thermal")
        }}
      >
        {/* Machined Billet Aluminum Crankcase */}
        <mesh material={engineCoreMat}>
          <boxGeometry args={[0.48, 0.28, 0.34]} />
        </mesh>

        {/* Reduction Gearbox Flange */}
        <mesh position={[-0.26, 0.01, 0]} rotation={[0, 0, Math.PI / 2]} material={metalTrimMat}>
          <cylinderGeometry args={[0.09, 0.11, 0.06, 20]} />
        </mesh>

        {/* 4 Horizontally Opposed Finned Boxer Cylinder Barrels */}
        {[-0.12, 0.12].map((x) => (
          <React.Fragment key={`cyl-barrel-${x}`}>
            {/* Port Cylinder Head (Cyl 1 & 3) */}
            <mesh position={[x, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]} material={finMat}>
              <cylinderGeometry args={[0.082, 0.082, 0.16, 20]} />
            </mesh>
            {/* Starboard Cylinder Head (Cyl 2 & 4 - Hot Thermal Excursion Zone) */}
            <mesh
              position={[x, 0, -0.22]}
              rotation={[Math.PI / 2, 0, 0]}
              material={isThermal ? turboMat : finMat}
            >
              <cylinderGeometry args={[0.082, 0.082, 0.16, 20]} />
            </mesh>
          </React.Fragment>
        ))}

        {/* Billet Cylinder Top Cooling Fins */}
        {[-0.16, -0.08, 0, 0.08, 0.16].map((x) => (
          <mesh key={`fin-${x}`} position={[x, 0.155, 0]} material={finMat}>
            <boxGeometry args={[0.018, 0.04, 0.32]} />
          </mesh>
        ))}

        {/* Garrett T25 Turbocharger Assembly (Lustrous Gold-Titanium Scroll) */}
        <group position={[-0.15, -0.05, 0.24 + ef * 0.4]}>
          <mesh material={turboMat}>
            <torusGeometry args={[0.072, 0.034, 16, 24]} />
          </mesh>
          <mesh position={[0, -0.04, 0]} material={turboMat}>
            <cylinderGeometry args={[0.024, 0.024, 0.1, 14]} />
          </mesh>
          {/* Turbo Wastegate Actuator Rod */}
          <mesh position={[0.04, 0.02, 0.04]} rotation={[0, 0, 0.3]} material={metalTrimMat}>
            <cylinderGeometry args={[0.005, 0.005, 0.08, 8]} />
          </mesh>
        </group>

        {/* Dry Sump Oil Scavenge Reservoir (Aft Port) */}
        <mesh position={[-0.22, -0.06, -0.15]} material={finMat}>
          <cylinderGeometry args={[0.055, 0.055, 0.2, 16]} />
        </mesh>

        {/* High-Pressure Fuel Rail with Anodized Fittings */}
        <mesh position={[0, 0.13, 0]}>
          <boxGeometry args={[0.34, 0.015, 0.26]} />
          <meshStandardMaterial color="#2563eb" metalness={0.92} roughness={0.15} />
        </mesh>

        {/* Dual Stainless Steel Exhaust Stubs with Thermal Exhaust Core */}
        <group position={[-0.26, -0.12, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={exhaustMat}>
            <cylinderGeometry args={[0.032, 0.032, 0.18, 16]} />
          </mesh>
        </group>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 6. REAR PUSHER PROPELLER (CARBON FIBER & SAFETY CHEVRONS) ──────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group ref={propRef} position={[propX, 0.04 + fuselageY * 0.3, 0]}>
        {/* Polished Machined Aluminum Spinner Cone */}
        <mesh rotation={[0, 0, -Math.PI / 2]} material={metalTrimMat}>
          <coneGeometry args={[0.052, 0.14, 24]} />
        </mesh>

        {/* Blade 1 (Upper) */}
        <group position={[0, 0.26, 0]} rotation={[-0.1, 0, 0]}>
          <mesh material={propBladeMat}>
            <boxGeometry args={[0.014, 0.52, 0.042]} />
          </mesh>
          {/* High-Visibility Aviation Yellow Safety Tip */}
          <mesh position={[0, 0.23, 0]} material={propTipMat}>
            <boxGeometry args={[0.015, 0.06, 0.043]} />
          </mesh>
        </group>

        {/* Blade 2 (Lower) */}
        <group position={[0, -0.26, 0]} rotation={[0.1, 0, 0]}>
          <mesh material={propBladeMat}>
            <boxGeometry args={[0.014, 0.52, 0.042]} />
          </mesh>
          <mesh position={[0, -0.23, 0]} material={propTipMat}>
            <boxGeometry args={[0.015, 0.06, 0.043]} />
          </mesh>
        </group>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 7. TWIN TAIL BOOMS & INVERTED V-TAIL EMPENNAGE ─────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group position={[vTailX, 0.06 + fuselageY * 0.4, 0]}>
        {/* Left Tubular Composite Tail Boom */}
        <mesh position={[0.2, 0, -0.32]} rotation={[0, 0, Math.PI / 2]} material={airframeMat}>
          <cylinderGeometry args={[0.024, 0.032, 0.85, 16]} />
        </mesh>
        {/* Right Tubular Composite Tail Boom */}
        <mesh position={[0.2, 0, 0.32]} rotation={[0, 0, Math.PI / 2]} material={airframeMat}>
          <cylinderGeometry args={[0.024, 0.032, 0.85, 16]} />
        </mesh>

        {/* Left Inverted V-Fin Stabilizer (Canted 45° downward) */}
        <mesh material={airframeMat} position={[-0.18, 0.18, -0.26]} rotation={[0.62, 0.08, -0.12]}>
          <boxGeometry args={[0.22, 0.44, 0.018]} />
        </mesh>
        {/* Right Inverted V-Fin Stabilizer */}
        <mesh material={airframeMat} position={[-0.18, 0.18, 0.26]} rotation={[-0.62, -0.08, -0.12]}>
          <boxGeometry args={[0.22, 0.44, 0.018]} />
        </mesh>

        {/* Luminous Trailing Edge Ruddervator Contours */}
        <mesh position={[-0.28, 0.18, -0.26]} rotation={[0.62, 0.08, -0.12]} material={edgeTrimMat}>
          <boxGeometry args={[0.008, 0.42, 0.01]} />
        </mesh>
        <mesh position={[-0.28, 0.18, 0.26]} rotation={[-0.62, -0.08, -0.12]} material={edgeTrimMat}>
          <boxGeometry args={[0.008, 0.42, 0.01]} />
        </mesh>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 8. INTERNAL X-RAY SUB-ASSEMBLIES (REVEALED IN X-RAY MODE) ──────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {isXray && (
        <group position={[0, fuselageY, 0]}>
          {/* FADEC Avionics Flight Computer */}
          <mesh position={[0.3, 0.02, 0]}>
            <boxGeometry args={[0.24, 0.08, 0.14]} />
            <meshStandardMaterial color="#10b981" emissive="#059669" emissiveIntensity={0.8} />
          </mesh>
          {/* Dual 28V Lithium-Ion Avionics Battery Modules */}
          <mesh position={[0.02, -0.02, 0]}>
            <boxGeometry args={[0.26, 0.09, 0.16]} />
            <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.7} />
          </mesh>
          {/* Central Composite Fuel Bladder */}
          <mesh position={[-0.25, 0.01, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.35, 16]} />
            <meshStandardMaterial color="#f59e0b" transparent opacity={0.55} />
          </mesh>
        </group>
      )}
    </group>
  )
}

// ─── HIGH-TECH DEFENSE TURNTABLE & STUDIO HANGAR DECK ─────────────────────────

function RadarFloor({ isDark }: { isDark: boolean }) {
  const sweepRef = React.useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    if (sweepRef.current) {
      sweepRef.current.rotation.y += dt * 0.4
    }
  })

  return (
    <group position={[0, -1.05, 0]}>
      {/* 1. Base Aerospace Studio Deck */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial
          color={isDark ? "#0c1220" : "#f1f5f9"}
          roughness={0.85}
          metalness={0.25}
        />
      </mesh>

      {/* 2. Precision Brushed Circular Turntable Disc */}
      <mesh position={[0, -0.01, 0]}>
        <cylinderGeometry args={[2.85, 2.85, 0.02, 64]} />
        <meshStandardMaterial
          color={isDark ? "#151e2e" : "#e2e8f0"}
          metalness={isDark ? 0.88 : 0.25}
          roughness={isDark ? 0.32 : 0.55}
        />
      </mesh>

      {/* 3. Outer Titanium Beveled Rim Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[2.83, 2.85, 64]} />
        <meshBasicMaterial color={isDark ? "#38bdf8" : "#94a3b8"} transparent opacity={isDark ? 0.85 : 0.4} />
      </mesh>

      {/* 4. Luminous Perimeter Cyan Track */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[2.75, 2.77, 64]} />
        <meshBasicMaterial color={isDark ? "#00f0ff" : "#0284c7"} transparent opacity={isDark ? 0.9 : 0.45} />
      </mesh>

      {/* 5. Concentric Inner Telemetry Rings */}
      {[1.15, 1.95].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0025, 0]}>
          <ringGeometry args={[r - 0.005, r + 0.005, 64]} />
          <meshBasicMaterial color={isDark ? "#38bdf8" : "#cbd5e1"} transparent opacity={isDark ? 0.45 : 0.25} />
        </mesh>
      ))}

      {/* 6. Cardinal Compass Crosshairs (N, E, S, W) & 15° Degree Tick Lines */}
      {[0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3, (3 * Math.PI) / 4, (5 * Math.PI) / 6].map(
        (rad) => (
          <mesh key={rad} rotation={[-Math.PI / 2, 0, rad]} position={[0, 0.003, 0]}>
            <planeGeometry args={[5.4, 0.006]} />
            <meshBasicMaterial color={isDark ? "#00f0ff" : "#94a3b8"} transparent opacity={isDark ? 0.3 : 0.15} />
          </mesh>
        )
      )}

      {/* 7. Runway Alignment Centerline Guide Dots */}
      {[-1.6, -1.2, -0.8, -0.4, 0.4, 0.8, 1.2, 1.6].map((x) => (
        <mesh key={`dot-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.0035, 0]}>
          <circleGeometry args={[0.018, 12]} />
          <meshBasicMaterial color={isDark ? "#fbbf24" : "#f59e0b"} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* 8. Soft Radial Ambient Occlusion Shadow directly beneath UAV */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[0, 2.3, 36]} />
        <meshBasicMaterial color={isDark ? "#050811" : "#cbd5e1"} transparent opacity={isDark ? 0.78 : 0.45} />
      </mesh>

      {/* 9. Rotating Laser/Lidar Sweep Line in Dark Mode */}
      {isDark && (
        <group ref={sweepRef}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.38, 0.005, 0]}>
            <planeGeometry args={[2.76, 0.012]} />
            <meshBasicMaterial color="#00f0ff" transparent opacity={0.35} />
          </mesh>
        </group>
      )}
    </group>
  )
}

// ─── SMOOTH CAMERA HANDLER (FREE MOVEMENT RESTORED) ───────────────────────────

function SmoothCameraHandler({
  preset,
  controlsRef,
}: {
  preset: CameraPreset
  controlsRef: React.RefObject<any>
}) {
  const { camera, gl } = useThree()
  const cfg = CAMERA_PRESETS[preset]
  const targetV = React.useMemo(() => new THREE.Vector3(...cfg.pos), [cfg])
  const lookAtV = React.useMemo(() => new THREE.Vector3(...cfg.target), [cfg])

  const [isTransitioning, setIsTransitioning] = React.useState(false)
  const prevPresetRef = React.useRef<CameraPreset | null>(null)

  // Initial camera placement on mount — leave free immediately
  React.useEffect(() => {
    camera.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2])
    camera.lookAt(cfg.target[0], cfg.target[1], cfg.target[2])
    if (controlsRef.current) {
      controlsRef.current.target.set(cfg.target[0], cfg.target[1], cfg.target[2])
      controlsRef.current.update()
    }
  }, [])

  // Trigger smooth transition ONLY when user explicitly changes preset
  React.useEffect(() => {
    if (prevPresetRef.current !== null && prevPresetRef.current !== preset) {
      setIsTransitioning(true)
    }
    prevPresetRef.current = preset
  }, [preset])

  // Stop transition immediately as soon as user touches, drags, or scrolls
  React.useEffect(() => {
    const dom = gl.domElement
    const stopTransition = () => {
      setIsTransitioning(false)
    }

    dom.addEventListener("pointerdown", stopTransition, { passive: true })
    dom.addEventListener("wheel", stopTransition, { passive: true })
    dom.addEventListener("touchstart", stopTransition, { passive: true })

    return () => {
      dom.removeEventListener("pointerdown", stopTransition)
      dom.removeEventListener("wheel", stopTransition)
      dom.removeEventListener("touchstart", stopTransition)
    }
  }, [gl])

  useFrame((_, dt) => {
    if (!isTransitioning) return

    camera.position.lerp(targetV, dt * 5)
    if (controlsRef.current) {
      controlsRef.current.target.lerp(lookAtV, dt * 5)
      controlsRef.current.update()
    }

    // When close enough, end transition so user has 100% free movement
    if (
      camera.position.distanceTo(targetV) < 0.04 &&
      (!controlsRef.current || controlsRef.current.target.distanceTo(lookAtV) < 0.04)
    ) {
      setIsTransitioning(false)
    }
  })

  return null
}

// ─── MAIN 3D SCENE ────────────────────────────────────────────────────────────

interface SceneProps {
  telemetry: any
  wireframe: boolean
  autoRotate: boolean
  isDark: boolean
  renderMode: RenderMode
  explosionFactor: number
  streamlinesActive: boolean
  activePreset: CameraPreset
  selectedSubsystem: string | null
  onSelectSubsystem: (id: string | null) => void
  virtualRpmOffset: number
  virtualOatOffset: number
}

function Scene({
  telemetry: t,
  wireframe,
  autoRotate,
  isDark,
  renderMode,
  explosionFactor,
  streamlinesActive,
  activePreset,
  selectedSubsystem,
  onSelectSubsystem,
  virtualRpmOffset,
  virtualOatOffset,
}: SceneProps) {
  const controlsRef = React.useRef<any>(null)

  // Live telemetry with virtual sandbox offsets applied
  const baseRpm = t?.rpm ?? 4800
  const baseCht = t?.cht ?? 382
  const rpm = Math.max(1200, Math.min(5800, baseRpm + virtualRpmOffset))
  const cht = Math.max(180, Math.min(480, baseCht + virtualOatOffset * 1.2 + (virtualRpmOffset / 100) * 1.5))
  const oilP = t?.oil_pressure ?? 65
  const battV = t?.battery_v ?? 28.5
  const vib = t?.vibration ?? 0.65

  // Health scores
  const thrHealth = Math.max(10, Math.min(100, cht > 430 ? 18 : cht > 410 ? 45 : cht > 390 ? 72 : 95))
  const lubHealth = Math.max(10, Math.min(100, oilP < 38 ? 20 : oilP < 50 ? 55 : oilP < 75 ? 88 : 98))
  const cmbHealth = Math.max(10, Math.min(100, 100 - (t?.anomaly_score ?? 0.12) * 85))
  const eleHealth = Math.max(10, Math.min(100, battV < 24 ? 22 : battV < 26 ? 60 : 96))
  const mecHealth = Math.max(10, Math.min(100, vib > 2.5 ? 18 : vib > 1.6 ? 50 : 92))

  // 5 Subsystem Nodes (ELEC, MECH, THR, LUB, CMB) mapped to authentic airframe hardpoints
  const nodes = [
    {
      id: "mechanical",
      code: "MECH",
      title: "Airframe Dynamics",
      label: "Mechanical",
      value: vib.toFixed(2),
      unit: "g",
      health: mecHealth,
      range: "Vibration Limit: < 1.20 g",
      statusText: vib > 1.8 ? "Elevated Airframe Flutter" : "Aero Dynamics Smooth",
      position: [0.1, 0.65, -0.95] as [number, number, number],
      wireOrigin: [0.05, 0.04, -0.55] as [number, number, number],
      icon: <Shield style={{ width: 11, height: 11 }} />,
    },
    {
      id: "thermal",
      code: "THR",
      title: "Rotax 914 F CHT",
      label: "Thermal",
      value: cht.toFixed(0),
      unit: "°F",
      health: thrHealth,
      range: "Thermal Limit: < 435 °F",
      statusText: cht > 410 ? "Warning - Thermal Spike" : "Nominal Engine Temperature",
      position: [-0.35, 0.58, 0.65] as [number, number, number],
      wireOrigin: [-0.45, 0.12, 0.18] as [number, number, number],
      icon: <Flame style={{ width: 11, height: 11 }} />,
    },
    {
      id: "electrical",
      code: "ELEC",
      title: "Avionics & Battery",
      label: "Electrical",
      value: battV.toFixed(1),
      unit: "V",
      health: eleHealth,
      range: `Bus Voltage Limit: > 24.0 V`,
      statusText: battV < 24 ? "Alert - Low Bus Voltage" : "Nominal Power Distribution",
      position: [0.45, 0.68, 0.55] as [number, number, number],
      wireOrigin: [0.35, 0.08, 0.0] as [number, number, number],
      icon: <Zap style={{ width: 11, height: 11 }} />,
    },
    {
      id: "combustion",
      code: "CMB",
      title: "Pusher Propulsion",
      label: "Combustion",
      value: rpm.toFixed(0),
      unit: "RPM",
      health: cmbHealth,
      range: "Operating Limit: < 5800 RPM",
      statusText: "Combustion Cycles Synchronized",
      position: [-0.95, 0.42, -0.55] as [number, number, number],
      wireOrigin: [-0.85, 0.02, 0.0] as [number, number, number],
      icon: <Cpu style={{ width: 11, height: 11 }} />,
    },
    {
      id: "lubrication",
      code: "LUB",
      title: "Oil System & Sump",
      label: "Lubrication",
      value: oilP.toFixed(1),
      unit: "PSI",
      health: lubHealth,
      range: "Pressure Limit: > 35 PSI",
      statusText: oilP < 40 ? "Alert - Low Oil Pressure" : "Nominal Fluid Pressure",
      position: [-0.45, -0.52, -0.75] as [number, number, number],
      wireOrigin: [-0.52, -0.12, -0.18] as [number, number, number],
      icon: <Activity style={{ width: 11, height: 11 }} />,
    },
  ]

  return (
    <>
      <SmoothCameraHandler preset={activePreset} controlsRef={controlsRef} />

      {/* ── Studio Lighting Rig: Balanced High-Contrast Aerospace Presentation ── */}
      <hemisphereLight
        skyColor={isDark ? "#38bdf8" : "#ffffff"}
        groundColor={isDark ? "#0f172a" : "#94a3b8"}
        intensity={isDark ? 1.25 : 0.85}
      />

      <ambientLight intensity={isDark ? 0.45 : 0.65} color={isDark ? "#94a3b8" : "#ffffff"} />

      {/* Key Light (Top-Front Sun defining stealth facets) */}
      <directionalLight position={[6, 10, 6]} intensity={isDark ? 2.8 : 1.8} color="#ffffff" />

      {/* Fill Light (Soft side fill) */}
      <directionalLight position={[-5, 4, 5]} intensity={isDark ? 1.0 : 0.7} color={isDark ? "#94a3b8" : "#e2e8f0"} />

      {/* Cyan Cyber Rim Light (Razor-sharp electric cyan silhouette highlight) */}
      <directionalLight
        position={[-7, 5, -7]}
        intensity={isDark ? 3.6 : 0.7}
        color={isDark ? "#00f0ff" : "#93c5fd"}
      />

      {/* Tactical Amber Accent Rim Light */}
      <directionalLight
        position={[7, 4, -7]}
        intensity={isDark ? 1.8 : 0.4}
        color={isDark ? "#f59e0b" : "#fed7aa"}
      />

      {/* Engine Bay Internal Radiance */}
      <pointLight
        position={[-0.45, 0.12, 0]}
        intensity={cht > 400 ? 3.4 : isDark ? 2.2 : 0.8}
        color={cht > 400 ? "#ff2200" : "#f59e0b"}
        distance={2.8}
      />

      {/* FLIR Optical Lens Spotlight */}
      <pointLight
        position={[0.9, -0.12, 0]}
        intensity={isDark ? 1.8 : 0.7}
        color="#00f0ff"
        distance={2.0}
      />

      {/* Port Navigation Light Glow */}
      <pointLight
        position={[-0.02, 0.15, -1.9]}
        intensity={isDark ? 1.5 : 0.5}
        color="#ff1744"
        distance={1.4}
      />

      {/* Starboard Navigation Light Glow */}
      <pointLight
        position={[-0.02, 0.15, 1.9]}
        intensity={isDark ? 1.5 : 0.5}
        color="#00e676"
        distance={1.4}
      />

      {/* Underbelly Studio Bounce */}
      <pointLight
        position={[0, -1.6, 0]}
        intensity={isDark ? 0.75 : 0.35}
        color={isDark ? "#1e293b" : "#cbd5e1"}
        distance={4.5}
      />

      {/* Cyber Atmosphere Specks */}
      {isDark && (
        <Sparkles count={35} scale={9} size={1.4} speed={0.25} color="#38bdf8" opacity={0.3} />
      )}

      {/* Ground Floor Turntable */}
      <RadarFloor isDark={isDark} />

      {/* Aerodynamic Airflow Streamlines */}
      <AerodynamicStreamlines active={streamlinesActive} isDark={isDark} cht={cht} />

      {/* UAV Airframe & Rotax 914 F Geometry */}
      <UavWithEngineBox
        rpm={rpm}
        cht={cht}
        wireframe={wireframe}
        isDark={isDark}
        renderMode={renderMode}
        explosionFactor={explosionFactor}
        selectedId={selectedSubsystem}
        onSelect={(id) => onSelectSubsystem(selectedSubsystem === id ? null : id)}
      />

      {/* 3D Nodes & Overlay Cards */}
      {nodes.map((node) => {
        const isSel = selectedSubsystem === node.id
        const color = getHealthColor(node.health, isDark)
        return (
          <React.Fragment key={node.id}>
            <DataWire
              from={node.wireOrigin}
              to={node.position}
              color={color}
              active={isSel}
              isDark={isDark}
            />
            <SubsystemNode
              {...node}
              selected={isSel}
              isDark={isDark}
              onClick={() => onSelectSubsystem(isSel ? null : node.id)}
              onClose={() => onSelectSubsystem(null)}
            />
          </React.Fragment>
        )
      })}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.9}
        zoomSpeed={0.9}
        panSpeed={0.9}
        enablePan={true}
        minDistance={0.8}
        maxDistance={12.0}
        autoRotate={autoRotate && !selectedSubsystem && explosionFactor === 0}
        autoRotateSpeed={0.65}
        maxPolarAngle={Math.PI * 0.96}
        minPolarAngle={0.02}
      />
    </>
  )
}

// ─── ROOT TWIN 3D VIEWER COMPONENT ───────────────────────────────────────────

export function Twin3DViewer() {
  const { latestTelemetry: t } = useTelemetry()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])
  const isDark = mounted ? resolvedTheme !== "light" : true

  // State Management
  const [renderMode, setRenderMode] = React.useState<RenderMode>("STEALTH_SURFACE")
  const [wireframe, setWireframe] = React.useState(false)
  const [autoRotate, setAutoRotate] = React.useState(false)
  const [streamlinesActive, setStreamlinesActive] = React.useState(true)
  const [explosionFactor, setExplosionFactor] = React.useState(0)
  const [activePreset, setActivePreset] = React.useState<CameraPreset>("ISOMETRIC")
  const [selectedSubsystem, setSelectedSubsystem] = React.useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  // Interactive Sandbox Virtual Throttle & OAT
  const [sandboxOpen, setSandboxOpen] = React.useState(false)
  const [virtualRpmOffset, setVirtualRpmOffset] = React.useState(0)
  const [virtualOatOffset, setVirtualOatOffset] = React.useState(0)

  // Overall Health
  const overallHealth = Math.max(0, Math.min(100, t?.health?.health_index ?? 94))
  const healthColor = getHealthColor(overallHealth, isDark)

  const rpm = Math.max(1200, Math.min(5800, (t?.rpm ?? 4800) + virtualRpmOffset))
  const cht = Math.max(180, Math.min(480, (t?.cht ?? 382) + virtualOatOffset * 1.2 + (virtualRpmOffset / 100) * 1.5))
  const oilP = t?.oil_pressure ?? 65
  const battV = t?.battery_v ?? 28.5
  const vib = t?.vibration ?? 0.65

  // Handler for render mode change
  const handleSetRenderMode = (mode: RenderMode) => {
    setRenderMode(mode)
    if (mode === "EXPLODED_ASSEMBLY" && explosionFactor === 0) {
      setExplosionFactor(0.65)
    } else if (mode !== "EXPLODED_ASSEMBLY" && explosionFactor > 0) {
      setExplosionFactor(0)
    }
  }

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-0 overflow-hidden rounded-2xl border transition-all select-none ${
        isDark ? "border-slate-800 bg-[#02050c]" : "border-slate-200 bg-slate-50"
      } ${isFullscreen ? "fixed inset-0 z-50 rounded-none border-none" : ""}`}
      style={{
        touchAction: "none",
        background: isDark
          ? "radial-gradient(ellipse at 50% 36%, #1a2436 0%, #0f1624 45%, #080c14 100%)"
          : "radial-gradient(ellipse at 50% 36%, #ffffff 0%, #f1f5f9 60%, #e2e8f0 100%)",
      }}
    >
      {/* ── Top Floating Bar: Status + Mode Selector + Controls ────────────── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Platform Status */}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md pointer-events-auto shadow-sm ${
            isDark
              ? "border-white/10 bg-slate-900/85 text-white"
              : "border-slate-200/80 bg-white/85 text-slate-800"
          }`}
        >
          <div
            className="size-2 rounded-full animate-pulse"
            style={{ background: healthColor, boxShadow: `0 0 8px ${healthColor}` }}
          />
          <span className="text-[11px] font-semibold tracking-wide">
            {t?.uav_id ?? "UAV-01"} 3D Digital Twin
          </span>
          <span className="text-[10px] font-mono font-bold" style={{ color: healthColor }}>
            {overallHealth.toFixed(0)}% {getHealthStatus(overallHealth)}
          </span>
        </div>

        {/* Center: 4 Diagnostic Render Modes */}
        <div
          className={`flex items-center gap-1 rounded-full border p-1 backdrop-blur-md pointer-events-auto shadow-sm ${
            isDark
              ? "border-white/10 bg-slate-900/90 text-slate-300"
              : "border-slate-200/80 bg-white/90 text-slate-700"
          }`}
        >
          {[
            { id: "STEALTH_SURFACE", label: "Stealth Composite", icon: Plane },
            { id: "X_RAY_INTERNAL", label: "X-Ray Internal", icon: Layers },
            { id: "THERMAL_FLIR", label: "Thermal FLIR", icon: Flame },
            { id: "EXPLODED_ASSEMBLY", label: "Exploded CAD", icon: Box },
          ].map((m) => {
            const Icon = m.icon
            const isActive = renderMode === m.id
            return (
              <button
                key={m.id}
                onClick={() => handleSetRenderMode(m.id as RenderMode)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3" />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* Right: Quick Tools & Camera Presets */}
        <div
          className={`flex items-center gap-1 rounded-full border p-1 backdrop-blur-md pointer-events-auto shadow-sm ${
            isDark
              ? "border-white/10 bg-slate-900/85 text-slate-300"
              : "border-slate-200/80 bg-white/85 text-slate-600"
          }`}
        >
          {/* Aerodynamic Streamlines Toggle */}
          <button
            onClick={() => setStreamlinesActive((v) => !v)}
            title="Toggle Aerodynamic Streamlines"
            className={`rounded-full p-1.5 transition-all ${
              streamlinesActive
                ? "bg-cyan-500/20 text-cyan-400"
                : isDark
                ? "hover:bg-white/10 hover:text-white"
                : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Wind className="size-3.5" />
          </button>

          {/* Wireframe Toggle */}
          <button
            onClick={() => setWireframe((v) => !v)}
            title="Toggle Wireframe"
            className={`rounded-full p-1.5 transition-all ${
              wireframe
                ? isDark
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-900"
                : isDark
                ? "hover:bg-white/10 hover:text-white"
                : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Box className="size-3.5" />
          </button>

          {/* Auto-Rotate Toggle */}
          <button
            onClick={() => setAutoRotate((v) => !v)}
            title="Auto-Rotate"
            className={`rounded-full p-1.5 transition-all ${
              autoRotate
                ? isDark
                  ? "bg-white/20 text-white"
                  : "bg-slate-200 text-slate-900"
                : isDark
                ? "hover:bg-white/10 hover:text-white"
                : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <RotateCcw
              className={`size-3.5 ${autoRotate ? "animate-spin" : ""}`}
              style={{ animationDuration: "7s" }}
            />
          </button>

          {/* Virtual Throttle Sandbox Toggle */}
          <button
            onClick={() => setSandboxOpen((v) => !v)}
            title="Virtual Throttle & OAT Sandbox"
            className={`rounded-full p-1.5 transition-all ${
              sandboxOpen
                ? "bg-amber-500/20 text-amber-400"
                : isDark
                ? "hover:bg-white/10 hover:text-white"
                : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
          </button>

          {/* Reset Camera View */}
          <button
            onClick={() => {
              setActivePreset("ISOMETRIC")
              setSelectedSubsystem(null)
            }}
            title="Reset Camera to Isometric View"
            className={`rounded-full p-1.5 transition-all ${
              isDark ? "hover:bg-white/10 hover:text-white" : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Eye className="size-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            title="Toggle Fullscreen"
            className={`rounded-full p-1.5 transition-all ${
              isDark ? "hover:bg-white/10 hover:text-white" : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Camera Angle Preset Bar (Floating Left) ─────────────────────────── */}
      <div className="absolute top-16 left-3 z-10 hidden md:flex flex-col gap-1 pointer-events-none">
        <div
          className={`flex flex-col gap-1 rounded-xl border p-1.5 backdrop-blur-md pointer-events-auto shadow-md ${
            isDark ? "border-white/10 bg-slate-900/85 text-slate-300" : "border-slate-200/80 bg-white/90 text-slate-700"
          }`}
        >
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-muted-foreground px-2 py-0.5">
            Angles:
          </span>
          {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((cp) => (
            <button
              key={cp}
              onClick={() => setActivePreset(cp)}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono text-left transition-all ${
                activePreset === cp
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {CAMERA_PRESETS[cp].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Exploded View Slider Bar (When Exploded CAD is active) ────────────── */}
      {renderMode === "EXPLODED_ASSEMBLY" && (
        <div className="absolute top-16 right-3 z-10 flex flex-col gap-1 pointer-events-none">
          <div
            className={`flex flex-col gap-2 rounded-xl border p-3 backdrop-blur-md pointer-events-auto shadow-md w-56 ${
              isDark ? "border-white/10 bg-slate-900/90 text-slate-300" : "border-slate-200/80 bg-white/95 text-slate-700"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold">CAD Explosion:</span>
              <span className="text-cyan-400 font-bold">{Math.round(explosionFactor * 100)}%</span>
            </div>
            <Slider
              value={Math.round(explosionFactor * 100)}
              min={0}
              max={100}
              step={1}
              onValueChange={(val: any) => {
                const num = Array.isArray(val) ? val[0] : (typeof val === "number" && !isNaN(val) ? val : Number(val) || 0)
                setExplosionFactor(num / 100)
              }}
              className="cursor-pointer"
            />
            <span className="text-[9px] font-mono text-muted-foreground">
              Separates fuselage, Rotax 914 F engine, wings, and turbocharger
            </span>
          </div>
        </div>
      )}

      {/* ── Virtual Throttle & OAT Stress Sandbox Panel ──────────────────────── */}
      {sandboxOpen && (
        <div className="absolute top-16 right-3 z-10 flex flex-col gap-1 pointer-events-none animate-in fade-in slide-in-from-right-4 duration-200">
          <div
            className={`flex flex-col gap-3 rounded-2xl border p-4 backdrop-blur-md pointer-events-auto shadow-2xl w-64 ${
              isDark ? "border-amber-500/30 bg-slate-900/95 text-slate-200" : "border-amber-500/30 bg-white/95 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-amber-400">
                <SlidersHorizontal className="size-3.5" />
                <span>Virtual Throttle Sandbox</span>
              </div>
              <button
                onClick={() => setSandboxOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Virtual Throttle RPM Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <span className="text-muted-foreground">Engine RPM:</span>
                <span className="font-bold text-foreground">{rpm.toFixed(0)} RPM</span>
              </div>
              <Slider
                value={virtualRpmOffset}
                min={-1500}
                max={1000}
                step={50}
                onValueChange={(val: any) => {
                  const num = Array.isArray(val) ? val[0] : (typeof val === "number" && !isNaN(val) ? val : Number(val) || 0)
                  setVirtualRpmOffset(num)
                }}
                className="cursor-pointer"
              />
              <span className="text-[9px] font-mono text-muted-foreground mt-1 block">
                {virtualRpmOffset > 0 ? `+${virtualRpmOffset}` : virtualRpmOffset} RPM from baseline
              </span>
            </div>

            {/* Outside Air Temperature (OAT) Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <span className="text-muted-foreground">Ambient OAT Delta:</span>
                <span className="font-bold text-amber-400">{virtualOatOffset > 0 ? `+${virtualOatOffset}` : virtualOatOffset} °C</span>
              </div>
              <Slider
                value={virtualOatOffset}
                min={-30}
                max={40}
                step={2}
                onValueChange={(val: any) => {
                  const num = Array.isArray(val) ? val[0] : (typeof val === "number" && !isNaN(val) ? val : Number(val) || 0)
                  setVirtualOatOffset(num)
                }}
                className="cursor-pointer"
              />
              <span className="text-[9px] font-mono text-muted-foreground mt-1 block">
                Thermal CHT response: {cht.toFixed(0)} °F
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setVirtualRpmOffset(0)
                setVirtualOatOffset(0)
              }}
              className="text-xs font-mono h-7"
            >
              Reset Offsets
            </Button>
          </div>
        </div>
      )}

      {/* ── 3D Canvas Viewport (100% of available space) ────────────────────── */}
      <div className="w-full h-full min-h-0 flex-1">
        <Canvas
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: isDark ? 1.05 : 1.0,
          }}
          dpr={[1, 2]}
          style={{ touchAction: "none" }}
        >
          <Scene
            telemetry={t}
            wireframe={wireframe}
            autoRotate={autoRotate}
            isDark={isDark}
            renderMode={renderMode}
            explosionFactor={explosionFactor}
            streamlinesActive={streamlinesActive}
            activePreset={activePreset}
            selectedSubsystem={selectedSubsystem}
            onSelectSubsystem={setSelectedSubsystem}
            virtualRpmOffset={virtualRpmOffset}
            virtualOatOffset={virtualOatOffset}
          />
        </Canvas>
      </div>

      {/* ── Minimal Floating Bottom Telemetry Strip ─────────────────────────── */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        {/* Left: Drag Hint */}
        <span
          className={`hidden sm:inline-block text-[10px] font-mono px-2.5 py-1 rounded-full border backdrop-blur-sm ${
            isDark
              ? "bg-slate-900/60 border-white/5 text-slate-400"
              : "bg-white/70 border-slate-200 text-slate-500 shadow-sm"
          }`}
        >
          Drag to orbit · Scroll to zoom
        </span>

        {/* Center: Live Subsystem Telemetry Strip */}
        <div
          className={`mx-auto flex items-center gap-3 rounded-full border px-4 py-1.5 backdrop-blur-md pointer-events-auto shadow-md text-xs font-mono ${
            isDark
              ? "border-white/10 bg-slate-900/85 text-slate-300"
              : "border-slate-200/90 bg-white/90 text-slate-700"
          }`}
        >
          <button
            onClick={() => setSelectedSubsystem(selectedSubsystem === "combustion" ? null : "combustion")}
            className={`flex items-center gap-1.5 transition-all ${
              selectedSubsystem === "combustion"
                ? "font-bold text-cyan-400"
                : isDark
                ? "hover:text-white"
                : "hover:text-slate-900"
            }`}
          >
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>CMB</span>
            <span>{rpm.toFixed(0)}</span>
          </button>

          <span className={isDark ? "text-white/20" : "text-slate-300"}>|</span>

          <button
            onClick={() => setSelectedSubsystem(selectedSubsystem === "thermal" ? null : "thermal")}
            className={`flex items-center gap-1.5 transition-all ${
              selectedSubsystem === "thermal"
                ? "font-bold text-amber-400"
                : isDark
                ? "hover:text-white"
                : "hover:text-slate-900"
            }`}
          >
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>THR</span>
            <span>{cht.toFixed(0)}°F</span>
          </button>

          <span className={isDark ? "text-white/20" : "text-slate-300"}>|</span>

          <button
            onClick={() => setSelectedSubsystem(selectedSubsystem === "lubrication" ? null : "lubrication")}
            className={`flex items-center gap-1.5 transition-all ${
              selectedSubsystem === "lubrication"
                ? "font-bold text-emerald-400"
                : isDark
                ? "hover:text-white"
                : "hover:text-slate-900"
            }`}
          >
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>LUB</span>
            <span>{oilP.toFixed(1)} PSI</span>
          </button>

          <span className={isDark ? "text-white/20" : "text-slate-300"}>|</span>

          <button
            onClick={() => setSelectedSubsystem(selectedSubsystem === "electrical" ? null : "electrical")}
            className={`flex items-center gap-1.5 transition-all ${
              selectedSubsystem === "electrical"
                ? "font-bold text-emerald-400"
                : isDark
                ? "hover:text-white"
                : "hover:text-slate-900"
            }`}
          >
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>ELEC</span>
            <span>{battV.toFixed(1)}V</span>
          </button>

          <span className={isDark ? "text-white/20" : "text-slate-300"}>|</span>

          <button
            onClick={() => setSelectedSubsystem(selectedSubsystem === "mechanical" ? null : "mechanical")}
            className={`flex items-center gap-1.5 transition-all ${
              selectedSubsystem === "mechanical"
                ? "font-bold text-blue-400"
                : isDark
                ? "hover:text-white"
                : "hover:text-slate-900"
            }`}
          >
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>MECH</span>
            <span>{vib.toFixed(2)}g</span>
          </button>
        </div>

        {/* Right: Predicted RUL */}
        <div
          className={`hidden sm:flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-mono ${
            isDark
              ? "border-purple-500/20 bg-purple-950/40 text-purple-300"
              : "border-purple-200 bg-purple-50 text-purple-700"
          }`}
        >
          <span>RUL:</span>
          <span className="font-bold">{(t?.predicted_rul ?? 142).toFixed(0)} cyc</span>
        </div>
      </div>
    </div>
  )
}
