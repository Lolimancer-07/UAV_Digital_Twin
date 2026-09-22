"use client"

import * as React from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Html, Sparkles } from "@react-three/drei"
import * as THREE from "three"
import { useTheme } from "next-themes"
import { useTelemetry } from "@/components/telemetry-provider"
import {
  Activity,
  Box,
  Cpu,
  Eye,
  Flame,
  Maximize2,
  Minimize2,
  RotateCcw,
  Shield,
  X,
  Zap,
} from "lucide-react"

// ─── Health & Status Colors ──────────────────────────────────────────────────

function getHealthColor(health: number, isDark: boolean): string {
  if (health >= 80) return isDark ? "#00ffcc" : "#059669" // Cyber Cyan / Emerald
  if (health >= 60) return isDark ? "#fbbf24" : "#d97706" // Amber
  if (health >= 35) return isDark ? "#fb923c" : "#ea580c" // Orange
  return isDark ? "#ff3366" : "#dc2626"                  // Plasma Red
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

  // Animated telemetry data pulse moving continuously along the wire
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
      {/* Live moving telemetry pulse bead */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

// ─── 3D Subsystem Node: Orb + Orbital Ring + Expandable Card ──────────────────

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
    const t = clock.elapsedTime
    if (ringRef.current) {
      ringRef.current.rotation.z += dt * (selected ? 2.4 : 0.95)
      ringRef.current.rotation.x += dt * 0.45
    }
    if (sphereRef.current) {
      const scale = selected ? 1.35 : hovered ? 1.18 : 1.0
      sphereRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), dt * 12)
    }
  })

  return (
    <group position={position}>
      {/* Central 3D Glowing Core Sphere */}
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
          emissiveIntensity={selected ? 1.6 : isDark ? 1.0 : 0.5}
          roughness={0.15}
          metalness={0.9}
        />
      </mesh>

      {/* Orbiting Tech Ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[0.092, 0.008, 12, 36]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.95 : hovered ? 0.85 : isDark ? 0.6 : 0.4}
        />
      </mesh>

      {/* 3D Expandable Card: Clicking directly selects and expands details */}
      <Html center={false} position={[0.13, 0.08, 0]} zIndexRange={[100, 0]}>
        <div
          onPointerDown={(e) => {
            // Stops pointer event from starting an OrbitControls rotation drag
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          className="select-none cursor-pointer transition-all duration-200"
          style={{
            transform: selected ? "scale(1.04)" : hovered ? "scale(1.02)" : "scale(1)",
          }}
        >
          {selected ? (
            /* ── EXPANDED CARD VIEW ── */
            <div
              style={{
                minWidth: 172,
                background: isDark
                  ? `linear-gradient(135deg, ${color}30 0%, rgba(6,16,36,0.97) 100%)`
                  : `linear-gradient(135deg, ${color}18 0%, rgba(255,255,255,0.98) 100%)`,
                border: `1.5px solid ${color}`,
                borderRadius: 12,
                padding: "8px 11px",
                backdropFilter: "blur(16px)",
                boxShadow: selected
                  ? `0 0 24px ${color}55, 0 8px 24px rgba(0,0,0,0.4)`
                  : "0 4px 16px rgba(0,0,0,0.1)",
              }}
            >
              {/* Header: Code + Title + Close Button */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color, display: "flex" }}>{icon}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: isDark ? "#ffffff" : "#0f172a",
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
                  style={{
                    background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
                    border: "none",
                    borderRadius: 99,
                    width: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: isDark ? "#e2e8f0" : "#475569",
                  }}
                >
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </div>

              {/* Value + Status Badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span
                    style={{
                      fontSize: 18,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      lineHeight: 1.1,
                      letterSpacing: "-0.02em",
                      color,
                    }}
                  >
                    {value}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "monospace",
                      color: isDark ? "#94a3b8" : "#64748b",
                    }}
                  >
                    {unit}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 8.5,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color,
                    background: `${color}22`,
                    padding: "1.5px 5px",
                    borderRadius: 4,
                  }}
                >
                  {health.toFixed(0)}% · {getHealthStatus(health)}
                </span>
              </div>

              {/* Range & Tolerance Limits */}
              <div
                style={{
                  fontSize: 8.5,
                  fontFamily: "monospace",
                  color: isDark ? "#94a3b8" : "#64748b",
                  background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                  padding: "4px 7px",
                  borderRadius: 6,
                  marginBottom: 5,
                }}
              >
                {range}
              </div>

              {/* Status Note */}
              <div
                style={{
                  fontSize: 8,
                  fontFamily: "monospace",
                  color: isDark ? "#cbd5e1" : "#475569",
                  marginBottom: 6,
                }}
              >
                {statusText}
              </div>

              {/* Full Health Bar */}
              <div
                style={{
                  height: 3,
                  background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
                  borderRadius: 99,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(0, Math.min(100, health))}%`,
                    background: color,
                    borderRadius: 99,
                    transition: "width 0.6s ease",
                  }}
                />
              </div>
            </div>
          ) : (
            /* ── COMPACT CARD VIEW ── */
            <div
              style={{
                minWidth: 86,
                background: isDark
                  ? "rgba(6,16,36,0.92)"
                  : "rgba(255,255,255,0.93)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 10,
                padding: "6px 10px",
                backdropFilter: "blur(14px)",
                boxShadow: isDark
                  ? "0 4px 18px rgba(0,0,0,0.65)"
                  : "0 4px 16px rgba(0,0,0,0.08)",
              }}
            >
              {/* Header: Icon + Code + Health Pill */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color, display: "flex" }}>{icon}</span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: isDark ? "#f1f5f9" : "#1e293b",
                    }}
                  >
                    {code}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 8,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color,
                    background: `${color}20`,
                    padding: "1px 4.5px",
                    borderRadius: 4,
                  }}
                >
                  {health.toFixed(0)}%
                </span>
              </div>

              {/* Value & Unit */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span
                  style={{
                    color: isDark ? "#ffffff" : "#0f172a",
                    fontSize: 15,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {value}
                </span>
                <span
                  style={{
                    color: isDark ? "#94a3b8" : "#64748b",
                    fontSize: 8.5,
                    fontFamily: "monospace",
                  }}
                >
                  {unit}
                </span>
              </div>

              {/* Mini Health Meter */}
              <div
                style={{
                  height: 2,
                  background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
                  borderRadius: 99,
                  marginTop: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(0, Math.min(100, health))}%`,
                    background: color,
                    borderRadius: 99,
                    transition: "width 0.8s ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

// ─── POLISHED UAV AIRFRAME WITH REFINED ENGINE BOX ────────────────────────────

interface AirframeProps {
  rpm: number
  cht: number
  wireframe: boolean
  isDark: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}

function UavWithEngineBox({
  rpm,
  cht,
  wireframe,
  isDark,
  selectedId,
  onSelect,
}: AirframeProps) {
  const propRef = React.useRef<THREE.Group>(null)
  const bodyRef = React.useRef<THREE.Group>(null)

  // Fluid aerodynamic hover float
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 0.85) * 0.026
      bodyRef.current.rotation.z = Math.sin(t * 0.55) * 0.008
      bodyRef.current.rotation.y = Math.sin(t * 0.3) * 0.005
    }
    if (propRef.current) {
      propRef.current.rotation.x += dt * Math.min(38, Math.max(1, rpm / 140))
    }
  })

  // Polished Airframe Material: High-contrast Titanium Gunmetal in dark mode
  const airframeMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#38475c" : "#e2e8f0",
      roughness: isDark ? 0.22 : 0.36,
      metalness: isDark ? 0.72 : 0.52,
      wireframe,
    })
  }, [isDark, wireframe])

  // Polished Machined Engine Box Material
  const engineBoxMat = React.useMemo(() => {
    const isHot = cht > 405
    return new THREE.MeshStandardMaterial({
      color: isDark ? (isHot ? "#f97316" : "#0284c7") : isHot ? "#ea580c" : "#2563eb",
      emissive: isDark ? (isHot ? "#ea580c" : "#0369a1") : isHot ? "#ea580c" : "#3b82f6",
      emissiveIntensity: isDark ? 0.55 : 0.2,
      roughness: 0.2,
      metalness: 0.85,
      wireframe,
    })
  }, [isDark, cht, wireframe])

  // Cooling Fin Material
  const finMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#64748b" : "#94a3b8",
      metalness: 0.95,
      roughness: 0.15,
    })
  }, [isDark])

  // Luminous Edge Accent Material (Defines the 3D silhouette in dark mode!)
  const edgeTrimMat = React.useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: isDark ? "#00f0ff" : "#0284c7",
      transparent: true,
      opacity: isDark ? 0.9 : 0.45,
    })
  }, [isDark])

  return (
    <group ref={bodyRef}>
      {/* ── Main Aircraft Fuselage (Smooth 32 segments) ────────────────────── */}
      <mesh material={airframeMat} position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.16, 1.7, 32]} />
      </mesh>

      {/* Dorsal Spine Luminous Trim Line */}
      <mesh position={[0.05, 0.162, 0]} material={edgeTrimMat}>
        <boxGeometry args={[1.2, 0.008, 0.012]} />
      </mesh>

      {/* Aerodynamic Tapered Nose (Smooth 32 segments) */}
      <mesh material={airframeMat} position={[1.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.13, 0.42, 32]} />
      </mesh>

      {/* Dorsal SATCOM Dome */}
      <mesh material={airframeMat} position={[0.35, 0.12, 0]} scale={[1.4, 0.5, 0.7]}>
        <sphereGeometry args={[0.14, 24, 24]} />
      </mesh>

      {/* ── Swept High-Aspect Wings ────────────────────────────────────────── */}
      <group position={[0.02, 0.01, 0]}>
        {/* Left Wing */}
        <mesh material={airframeMat} position={[-0.04, 0, -1.02]} rotation={[0.02, -0.04, 0.01]}>
          <boxGeometry args={[0.42, 0.026, 1.92]} />
        </mesh>
        {/* Right Wing */}
        <mesh material={airframeMat} position={[-0.04, 0, 1.02]} rotation={[-0.02, 0.04, 0.01]}>
          <boxGeometry args={[0.42, 0.026, 1.92]} />
        </mesh>

        {/* Wing Leading Edge Luminous Contours */}
        <mesh position={[0.155, 0.005, -1.02]} material={edgeTrimMat}>
          <boxGeometry args={[0.012, 0.01, 1.88]} />
        </mesh>
        <mesh position={[0.155, 0.005, 1.02]} material={edgeTrimMat}>
          <boxGeometry args={[0.012, 0.01, 1.88]} />
        </mesh>

        {/* Winglets with Nav Beacons */}
        <mesh position={[-0.04, 0.07, -1.98]} material={airframeMat}>
          <boxGeometry args={[0.2, 0.14, 0.02]} />
        </mesh>
        <mesh position={[-0.04, 0.07, 1.98]} material={airframeMat}>
          <boxGeometry args={[0.2, 0.14, 0.02]} />
        </mesh>

        {/* Port Nav Beacon (Red) */}
        <mesh position={[-0.02, 0.13, -1.99]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        {/* Starboard Nav Beacon (Green) */}
        <mesh position={[-0.02, 0.13, 1.99]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshBasicMaterial color="#00ffcc" />
        </mesh>
      </group>

      {/* ── V-Tail Empennage ───────────────────────────────────────────────── */}
      <group position={[-0.85, 0.08, 0]}>
        <mesh material={airframeMat} position={[0, 0.2, -0.28]} rotation={[0.6, 0.1, -0.1]}>
          <boxGeometry args={[0.24, 0.42, 0.02]} />
        </mesh>
        <mesh material={airframeMat} position={[0, 0.2, 0.28]} rotation={[-0.6, -0.1, -0.1]}>
          <boxGeometry args={[0.24, 0.42, 0.02]} />
        </mesh>
      </group>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── POLISHED ENGINE BOX: MACHINED AEROSPACE POWERPLANT BLOCK ───────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <group
        position={[0.72, 0.02, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect("thermal")
        }}
      >
        {/* Main Precision Engine Box Body */}
        <mesh material={engineBoxMat}>
          <boxGeometry args={[0.54, 0.32, 0.36]} />
        </mesh>

        {/* Precision Heatsink Cooling Fins on Top */}
        {[-0.18, -0.09, 0, 0.09, 0.18].map((x) => (
          <mesh key={`fin-${x}`} position={[x, 0.17, 0]} material={finMat}>
            <boxGeometry args={[0.02, 0.045, 0.32]} />
          </mesh>
        ))}

        {/* Cylinder Head Covers on Port & Starboard */}
        <mesh position={[0, 0, 0.19]} material={finMat}>
          <boxGeometry args={[0.36, 0.2, 0.04]} />
        </mesh>
        <mesh position={[0, 0, -0.19]} material={finMat}>
          <boxGeometry args={[0.36, 0.2, 0.04]} />
        </mesh>

        {/* Exhaust Manifold Header with Live Thermal Shimmer */}
        <mesh position={[-0.16, -0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.22, 16]} />
          <meshStandardMaterial
            color={cht > 400 ? "#ff5500" : isDark ? "#f59e0b" : "#d97706"}
            emissive={cht > 400 ? "#ff5500" : isDark ? "#f59e0b" : "#d97706"}
            emissiveIntensity={cht > 400 ? 1.0 : 0.45}
            metalness={0.92}
            roughness={0.18}
          />
        </mesh>
      </group>

      {/* ── Polished Pusher Propeller at Front / Shaft ─────────────────────── */}
      <group ref={propRef} position={[1.05, 0.02, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.048, 0.12, 16]} />
          <meshStandardMaterial color={isDark ? "#38bdf8" : "#0284c7"} metalness={0.95} roughness={0.12} />
        </mesh>
        {/* 2 Aerodynamic Carbon Blades with Tip Accents */}
        <group position={[0, 0.28, 0]} rotation={[0.08, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.016, 0.54, 0.045]} />
            <meshStandardMaterial color={isDark ? "#1e293b" : "#334155"} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.017, 0.06, 0.046]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        </group>
        <group position={[0, -0.28, 0]} rotation={[-0.08, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.016, 0.54, 0.045]} />
            <meshStandardMaterial color={isDark ? "#1e293b" : "#334155"} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.24, 0]}>
            <boxGeometry args={[0.017, 0.06, 0.046]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// ─── Polished Minimal Radar Floor with Rotating Sweep ─────────────────────────

function RadarFloor({ isDark }: { isDark: boolean }) {
  const sweepRef = React.useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    if (sweepRef.current) {
      sweepRef.current.rotation.y += dt * 0.6
    }
  })

  const gridColor1 = isDark ? "#1e40af" : "#cbd5e1"
  const gridColor2 = isDark ? "#0f2744" : "#e2e8f0"
  const ringColor = isDark ? "#00f0ff" : "#94a3b8"

  return (
    <group position={[0, -1.1, 0]}>
      {/* Base Floor Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial
          color={isDark ? "#030a18" : "#f1f5f9"}
          roughness={0.92}
          metalness={0.04}
        />
      </mesh>

      {/* Coordinate Grid */}
      <gridHelper args={[16, 32, gridColor1, gridColor2]} />

      {/* Concentric Distance Rings */}
      {[1.2, 2.4, 3.8].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.008, r + 0.008, 64]} />
          <meshBasicMaterial
            color={ringColor}
            transparent
            opacity={isDark ? 0.45 : 0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Subtle Rotating Radar Sweep Line in Dark Mode */}
      {isDark && (
        <group ref={sweepRef}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.9, 0.002, 0]}>
            <planeGeometry args={[3.8, 0.015]} />
            <meshBasicMaterial color="#00f0ff" transparent opacity={0.35} />
          </mesh>
        </group>
      )}

      {/* Soft Vignette Ground Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[3.8, 6.5, 32]} />
        <meshBasicMaterial
          color={isDark ? "#020712" : "#e2e8f0"}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

// ─── Camera Handler for Preset Transitions & Reset ────────────────────────────

function CameraHandler({ resetKey }: { resetKey: number }) {
  const { camera } = useThree()
  React.useEffect(() => {
    camera.position.set(2.8, 1.6, 3.2)
    camera.lookAt(0, 0.1, 0)
  }, [camera, resetKey])
  return null
}

// ─── MAIN 3D SCENE ────────────────────────────────────────────────────────────

interface SceneProps {
  telemetry: any
  wireframe: boolean
  autoRotate: boolean
  isDark: boolean
  resetKey: number
  selectedSubsystem: string | null
  onSelectSubsystem: (id: string | null) => void
}

function Scene({
  telemetry: t,
  wireframe,
  autoRotate,
  isDark,
  resetKey,
  selectedSubsystem,
  onSelectSubsystem,
}: SceneProps) {
  const rpm = t?.rpm ?? 4800
  const cht = t?.cht ?? 382
  const oilP = t?.oil_pressure ?? 65
  const battV = t?.battery_v ?? 28.5
  const vib = t?.vibration ?? 0.65

  // Health scores
  const thrHealth = Math.max(10, Math.min(100, cht > 430 ? 18 : cht > 410 ? 45 : cht > 390 ? 72 : 95))
  const lubHealth = Math.max(10, Math.min(100, oilP < 38 ? 20 : oilP < 50 ? 55 : oilP < 75 ? 88 : 98))
  const cmbHealth = Math.max(10, Math.min(100, 100 - (t?.anomaly_score ?? 0.12) * 85))
  const eleHealth = Math.max(10, Math.min(100, battV < 24 ? 22 : battV < 26 ? 60 : 96))
  const mecHealth = Math.max(10, Math.min(100, vib > 2.5 ? 18 : vib > 1.6 ? 50 : 92))

  // 5 Subsystem Nodes (ELEC, MECH, THR, LUB, CMB) with Hardpoints on the UAV
  const nodes = [
    {
      id: "thermal",
      code: "THR",
      title: "Thermal & CHT",
      label: "Thermal",
      value: cht.toFixed(0),
      unit: "°F",
      health: thrHealth,
      range: "Nominal: 360–395°F · Max 435°F",
      statusText: cht > 410 ? "Warning - Thermal Spike" : "Nominal Engine Temperature",
      position: [0.85, 0.68, 0.65] as [number, number, number],
      wireOrigin: [0.72, 0.18, 0.15] as [number, number, number], // Top of Engine Box
      icon: <Flame style={{ width: 10, height: 10 }} />,
    },
    {
      id: "lubrication",
      code: "LUB",
      title: "Lubrication & Sump",
      label: "Lubrication",
      value: oilP.toFixed(1),
      unit: "PSI",
      health: lubHealth,
      range: "Nominal: 55–75 PSI · Min 35 PSI",
      statusText: oilP < 40 ? "Alert - Low Oil Pressure" : "Nominal Fluid Pressure",
      position: [0.85, 0.68, -0.65] as [number, number, number],
      wireOrigin: [0.72, -0.12, -0.15] as [number, number, number], // Sump of Engine Box
      icon: <Activity style={{ width: 10, height: 10 }} />,
    },
    {
      id: "combustion",
      code: "CMB",
      title: "Propulsion & Shaft",
      label: "Combustion",
      value: rpm.toFixed(0),
      unit: "RPM",
      health: cmbHealth,
      range: "Operating: 4600–5200 RPM · Max 6000",
      statusText: "Combustion Cycles Synchronized",
      position: [1.25, -0.36, 0] as [number, number, number],
      wireOrigin: [1.02, 0.02, 0] as [number, number, number], // Front prop shaft
      icon: <Cpu style={{ width: 10, height: 10 }} />,
    },
    {
      id: "electrical",
      code: "ELEC",
      title: "Avionics & Battery",
      label: "Electrical",
      value: battV.toFixed(1),
      unit: "V",
      health: eleHealth,
      range: `Bus: 28.0V · ${(t?.bus_current_a ?? 4.2).toFixed(1)}A Current`,
      statusText: battV < 24 ? "Alert - Low Bus Voltage" : "Nominal Power Distribution",
      position: [-0.15, 0.68, 0.95] as [number, number, number],
      wireOrigin: [0.35, 0.14, 0] as [number, number, number], // Avionics bay
      icon: <Zap style={{ width: 10, height: 10 }} />,
    },
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
      position: [-0.15, 0.68, -0.95] as [number, number, number],
      wireOrigin: [0.02, 0.02, -0.5] as [number, number, number], // Wing spar
      icon: <Shield style={{ width: 10, height: 10 }} />,
    },
  ]

  return (
    <>
      <CameraHandler resetKey={resetKey} />

      {/* ── Studio Lighting: High contrast, vivid specular & dual rim lights in Dark Mode ── */}
      <ambientLight intensity={isDark ? 0.78 : 0.85} color={isDark ? "#dbeafe" : "#ffffff"} />
      {/* Key Top Sun Light */}
      <directionalLight
        position={[5, 9, 6]}
        intensity={isDark ? 2.4 : 1.5}
        color={isDark ? "#f0f9ff" : "#ffffff"}
      />
      {/* Cyan Rim Light (Highlights stealth silhouette from behind) */}
      <directionalLight
        position={[-6, 3, -6]}
        intensity={isDark ? 2.5 : 0.45}
        color={isDark ? "#00f0ff" : "#cbd5e1"}
      />
      {/* Ice Rim Light (Edge highlights opposite side) */}
      <directionalLight
        position={[6, 2, -6]}
        intensity={isDark ? 1.9 : 0.4}
        color={isDark ? "#93c5fd" : "#cbd5e1"}
      />
      {/* Warm Engine Radiant Light */}
      <pointLight
        position={[0.72, 0.25, 0]}
        intensity={isDark ? 1.4 : 0.4}
        color={isDark ? "#f97316" : "#fbbf24"}
        distance={2.5}
      />
      {/* Underbody Soft Fill so belly surfaces remain visible */}
      <pointLight
        position={[0, -1.8, 0]}
        intensity={isDark ? 0.85 : 0.3}
        color={isDark ? "#1d4ed8" : "#94a3b8"}
      />

      {/* Floating Cyber Atmosphere Particles in Dark Mode */}
      {isDark && (
        <Sparkles count={45} scale={10} size={1.6} speed={0.35} color="#38bdf8" opacity={0.38} />
      )}

      {/* Ground Floor */}
      <RadarFloor isDark={isDark} />

      {/* UAV Model with Precision Engine Box */}
      <UavWithEngineBox
        rpm={rpm}
        cht={cht}
        wireframe={wireframe}
        isDark={isDark}
        selectedId={selectedSubsystem}
        onSelect={(id) => onSelectSubsystem(selectedSubsystem === id ? null : id)}
      />

      {/* ── 3D Nodes & Expandable Cards ────────────────────────────────────── */}
      {nodes.map((node) => {
        const isSel = selectedSubsystem === node.id
        const color = getHealthColor(node.health, isDark)
        return (
          <React.Fragment key={node.id}>
            {/* Fine Animated Data Wire */}
            <DataWire
              from={node.wireOrigin}
              to={node.position}
              color={color}
              active={isSel}
              isDark={isDark}
            />
            {/* Interactive 3D Node & Expandable Badge */}
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

      {/* Silky Smooth OrbitControls with automatic interaction decoupling */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}   // Smooth, weighted deceleration
        rotateSpeed={0.75}     // Responsive, fluid rotation
        zoomSpeed={0.75}       // Smooth exponential zoom
        minDistance={1.4}
        maxDistance={8.5}
        autoRotate={autoRotate}
        autoRotateSpeed={0.65}
        maxPolarAngle={Math.PI * 0.78}
        minPolarAngle={0.06}
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

  // States
  const [wireframe, setWireframe] = React.useState(false)
  const [autoRotate, setAutoRotate] = React.useState(true)
  const [selectedSubsystem, setSelectedSubsystem] = React.useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [resetKey, setResetKey] = React.useState(0)

  const overallHealth = Math.max(0, Math.min(100, t?.health?.health_index ?? 94))
  const healthColor = getHealthColor(overallHealth, isDark)

  const rpm = t?.rpm ?? 4800
  const cht = t?.cht ?? 382
  const oilP = t?.oil_pressure ?? 65
  const battV = t?.battery_v ?? 28.5
  const vib = t?.vibration ?? 0.65

  // Subsystem descriptions for selected drawer
  const subsystemInfo: Record<
    string,
    { title: string; code: string; val: string; status: string; metric: string; icon: React.ReactNode }
  > = {
    thermal: {
      title: "Engine Thermal & CHT",
      code: "THR",
      val: `${cht.toFixed(0)}°F`,
      metric: `Nominal band: 360–395°F · Max limit: 435°F`,
      status: cht > 410 ? "Warning - High Heat" : "Nominal Thermal Envelope",
      icon: <Flame className="size-4 text-amber-500" />,
    },
    lubrication: {
      title: "Lubrication & Sump",
      code: "LUB",
      val: `${oilP.toFixed(1)} PSI`,
      metric: `Nominal band: 55–75 PSI · Min limit: 35 PSI`,
      status: oilP < 40 ? "Alert - Low Oil Pressure" : "Nominal Fluid Pressure",
      icon: <Activity className="size-4 text-emerald-500" />,
    },
    combustion: {
      title: "Engine Propulsion & Shaft",
      code: "CMB",
      val: `${rpm.toFixed(0)} RPM`,
      metric: `Operating range: 4600–5200 RPM · Redline: 6000`,
      status: "Combustion Synchronized",
      icon: <Cpu className="size-4 text-cyan-500" />,
    },
    electrical: {
      title: "Avionics Bus & Battery",
      code: "ELEC",
      val: `${battV.toFixed(1)} V`,
      metric: `Current: ${(t?.bus_current_a ?? 4.2).toFixed(1)} A · Bus Nominal: 28.0V`,
      status: battV < 24 ? "Alert - Low Bus Voltage" : "Nominal Power Distribution",
      icon: <Zap className="size-4 text-emerald-500" />,
    },
    mechanical: {
      title: "Airframe & Wing Flutter",
      code: "MECH",
      val: `${vib.toFixed(2)} g`,
      metric: `Vibration tolerance: < 1.20 g · Strain gauge nominal`,
      status: vib > 1.8 ? "Elevated Vibration" : "Aero Dynamics Smooth",
      icon: <Shield className="size-4 text-blue-500" />,
    },
  }

  const selectedData = selectedSubsystem ? subsystemInfo[selectedSubsystem] : null

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-0 overflow-hidden rounded-2xl border transition-all select-none ${
        isDark ? "border-cyan-500/20 bg-[#020712]" : "border-slate-200 bg-slate-50"
      } ${isFullscreen ? "fixed inset-0 z-50 rounded-none border-none" : ""}`}
      style={{
        touchAction: "none",
        background: isDark
          ? "radial-gradient(ellipse at 50% 38%, #102447 0%, #071224 52%, #020712 100%)"
          : "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #f8fafc 55%, #e2e8f0 100%)",
      }}
    >
      {/* ── Minimal Floating Top Bar ────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        {/* Left: Platform Status */}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md pointer-events-auto shadow-sm ${
            isDark
              ? "border-white/10 bg-slate-900/80 text-white"
              : "border-slate-200/80 bg-white/85 text-slate-800"
          }`}
        >
          <div
            className="size-2 rounded-full"
            style={{ background: healthColor, boxShadow: `0 0 8px ${healthColor}` }}
          />
          <span className="text-[11px] font-semibold tracking-wide">
            {t?.uav_id ?? "UAV-01"} Digital Twin
          </span>
          <span
            className="text-[10px] font-mono font-bold"
            style={{ color: healthColor }}
          >
            {overallHealth.toFixed(0)}% {getHealthStatus(overallHealth)}
          </span>
        </div>

        {/* Right: Quick Action Controls */}
        <div
          className={`flex items-center gap-1 rounded-full border p-1 backdrop-blur-md pointer-events-auto shadow-sm ${
            isDark
              ? "border-white/10 bg-slate-900/80 text-slate-300"
              : "border-slate-200/80 bg-white/85 text-slate-600"
          }`}
        >
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

          {/* Reset Camera View */}
          <button
            onClick={() => {
              setResetKey((k) => k + 1)
              setSelectedSubsystem(null)
            }}
            title="Reset Camera View"
            className={`rounded-full p-1.5 transition-all ${
              isDark
                ? "hover:bg-white/10 hover:text-white"
                : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Eye className="size-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            title="Toggle Fullscreen"
            className={`rounded-full p-1.5 transition-all ${
              isDark
                ? "hover:bg-white/10 hover:text-white"
                : "hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* ── 3D Canvas Viewport (100% of available space) ────────────────────── */}
      <div className="w-full h-full min-h-0 flex-1">
        <Canvas
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: isDark ? 1.2 : 1.05,
          }}
          dpr={[1, 2]}
          style={{ touchAction: "none" }}
        >
          <Scene
            telemetry={t}
            wireframe={wireframe}
            autoRotate={autoRotate}
            isDark={isDark}
            resetKey={resetKey}
            selectedSubsystem={selectedSubsystem}
            onSelectSubsystem={setSelectedSubsystem}
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
          Click cards or drag to orbit
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

      {/* ── Corner Inspector Drawer (syncs with selected card) ─────────────── */}
      {selectedData && (
        <div
          className={`absolute top-14 right-3 z-20 w-64 rounded-xl border p-3 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 ${
            isDark
              ? "border-white/10 bg-slate-900/90 text-white"
              : "border-slate-200 bg-white/95 text-slate-800"
          }`}
        >
          <div
            className={`flex items-center justify-between pb-1.5 mb-1.5 border-b ${
              isDark ? "border-white/10" : "border-slate-100"
            }`}
          >
            <div className="flex items-center gap-2">
              {selectedData.icon}
              <h4 className="text-xs font-semibold">{selectedData.title}</h4>
            </div>
            <button
              onClick={() => setSelectedSubsystem(null)}
              className={`rounded-full p-1 transition-all ${
                isDark
                  ? "text-slate-400 hover:text-white hover:bg-white/10"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="flex items-baseline justify-between py-1">
            <span className="text-lg font-mono font-bold">{selectedData.val}</span>
            <span
              className="text-[10px] font-mono font-semibold"
              style={{ color: getHealthColor(90, isDark) }}
            >
              {selectedData.status}
            </span>
          </div>

          <p className={`text-[10px] font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {selectedData.metric}
          </p>
        </div>
      )}
    </div>
  )
}
