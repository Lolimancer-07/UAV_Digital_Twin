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
          emissiveIntensity={selected ? 1.8 : isDark ? 1.1 : 0.65}
          roughness={0.15}
          metalness={0.9}
        />
      </mesh>

      {/* Orbiting Tech Ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[0.095, 0.008, 12, 36]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.95 : hovered ? 0.85 : isDark ? 0.75 : 0.55}
        />
      </mesh>

      {/* 3D Overlay Card: Compact or Detailed Expanded (matching reference design) */}
      <Html center={false} position={[0.12, 0.06, 0]} zIndexRange={[100, 0]}>
        <div
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
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
            /* ── DETAILED EXPANDED CARD (matching screenshot) ── */
            <div
              style={{
                width: 242,
                background: isDark ? "rgba(15, 23, 42, 0.96)" : "rgba(255, 255, 255, 0.98)",
                border: `1.5px solid ${color}`,
                borderRadius: 18,
                padding: "12px 14px 11px",
                backdropFilter: "blur(24px)",
                boxShadow: isDark
                  ? `0 0 32px ${color}66, 0 16px 40px -8px rgba(0, 0, 0, 0.8)`
                  : `0 0 28px ${color}45, 0 14px 34px -6px rgba(0, 0, 0, 0.12)`,
                fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
              }}
            >
              {/* Header: Icon + Code · Title, and Close Button */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
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
                    transition: "all 0.15s ease",
                  }}
                >
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </div>

              {/* Metric Row: Big colored Value + Status Badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
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

                {/* Status Badge */}
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

              {/* Operational Limit Pill */}
              <div
                style={{
                  background: isDark ? "rgba(30, 41, 59, 0.6)" : "rgba(241, 245, 249, 0.85)",
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

              {/* Status / Diagnosis Description */}
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

              {/* Bottom Accent Bar */}
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
            /* ── COMPACT CARD (matching screenshot) ── */
            <div
              style={{
                minWidth: 108,
                background: isDark ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.98)",
                border: isDark ? "1px solid rgba(51, 65, 85, 0.8)" : "1px solid rgba(226, 232, 240, 0.95)",
                borderRadius: 14,
                padding: "8px 12px 7px",
                backdropFilter: "blur(20px)",
                boxShadow: isDark
                  ? "0 8px 24px -4px rgba(0, 0, 0, 0.65), 0 2px 6px rgba(0, 0, 0, 0.4)"
                  : "0 8px 24px -4px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)",
                transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease",
              }}
            >
              {/* Top Row: Icon + Code on Left, Health % Badge on Right */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 3,
                }}
              >
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

              {/* Value + Unit Row */}
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

              {/* Accent Bar at Bottom */}
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

  // Airframe Material: Stealth aerospace composite / titanium in dark mode
  const airframeMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#1e2638" : "#e2e8f0",
      emissive: isDark ? "#060e1a" : "#000000",
      emissiveIntensity: isDark ? 0.05 : 0,
      roughness: isDark ? 0.38 : 0.30,
      metalness: isDark ? 0.65 : 0.45,
      wireframe,
    })
  }, [isDark, wireframe])

  // Precision Engine Box Material — anodized alloy with vivid thermal state
  const engineBoxMat = React.useMemo(() => {
    const isHot = cht > 405
    return new THREE.MeshStandardMaterial({
      color: isDark ? (isHot ? "#f97316" : "#24344d") : isHot ? "#ea580c" : "#2563eb",
      emissive: isDark ? (isHot ? "#c2410c" : "#0c1b30") : isHot ? "#ea580c" : "#3b82f6",
      emissiveIntensity: isHot ? 0.85 : isDark ? 0.25 : 0.15,
      roughness: 0.20,
      metalness: 0.88,
      wireframe,
    })
  }, [isDark, cht, wireframe])

  // Cooling Fin / Cylinder Head Material — machined billet aluminum
  const finMat = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isDark ? "#64748b" : "#94a3b8",
      metalness: 0.95,
      roughness: 0.18,
    })
  }, [isDark])

  // Luminous Edge Accent — crisp cyan contour lines
  const edgeTrimMat = React.useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: isDark ? "#38bdf8" : "#0284c7",
      transparent: true,
      opacity: isDark ? 0.85 : 0.45,
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
      id: "mechanical",
      code: "MECH",
      title: "Airframe Dynamics",
      label: "Mechanical",
      value: vib.toFixed(2),
      unit: "g",
      health: mecHealth,
      range: "Vibration Limit: < 1.20 g",
      statusText: vib > 1.8 ? "Elevated Airframe Flutter" : "Aero Dynamics Smooth",
      position: [0.45, 0.72, -0.65] as [number, number, number],
      wireOrigin: [0.10, 0.05, -0.35] as [number, number, number], // Wing spar
      icon: <Shield style={{ width: 11, height: 11 }} />,
    },
    {
      id: "thermal",
      code: "THR",
      title: "Engine Thermal & CHT",
      label: "Thermal",
      value: cht.toFixed(0),
      unit: "°F",
      health: thrHealth,
      range: "Thermal Limit: < 435 °F",
      statusText: cht > 410 ? "Warning - Thermal Spike" : "Nominal Engine Temperature",
      position: [0.65, 0.38, 0.40] as [number, number, number],
      wireOrigin: [0.72, 0.18, 0.15] as [number, number, number], // Top of Engine Box
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
      position: [-0.35, 0.62, 0.55] as [number, number, number],
      wireOrigin: [0.20, 0.12, 0.0] as [number, number, number], // Avionics bay
      icon: <Zap style={{ width: 11, height: 11 }} />,
    },
    {
      id: "combustion",
      code: "CMB",
      title: "Propulsion & Shaft",
      label: "Combustion",
      value: rpm.toFixed(0),
      unit: "RPM",
      health: cmbHealth,
      range: "Operating Limit: < 6000 RPM",
      statusText: "Combustion Cycles Synchronized",
      position: [1.15, -0.38, 0.45] as [number, number, number],
      wireOrigin: [1.02, 0.02, 0.0] as [number, number, number], // Front prop shaft
      icon: <Cpu style={{ width: 11, height: 11 }} />,
    },
    {
      id: "lubrication",
      code: "LUB",
      title: "Lubrication & Sump",
      label: "Lubrication",
      value: oilP.toFixed(1),
      unit: "PSI",
      health: lubHealth,
      range: "Pressure Limit: > 35 PSI",
      statusText: oilP < 40 ? "Alert - Low Oil Pressure" : "Nominal Fluid Pressure",
      position: [0.35, -0.55, -0.75] as [number, number, number],
      wireOrigin: [0.72, -0.12, -0.15] as [number, number, number], // Sump of Engine Box
      icon: <Activity style={{ width: 11, height: 11 }} />,
    },
  ]

  return (
    <>
      <CameraHandler resetKey={resetKey} />

      {/* ── Studio Lighting Rig: Balanced & High Contrast without Specular Blowout ── */}
      {/* Base Ambient — keeps shadowed surfaces readable */}
      <ambientLight intensity={isDark ? 0.45 : 0.60} color={isDark ? "#94a3b8" : "#ffffff"} />

      {/* Key Light — primary top-front sun that defines form */}
      <directionalLight
        position={[5, 8, 5]}
        intensity={isDark ? 2.0 : 1.6}
        color="#ffffff"
      />

      {/* Fill Light — softens front-left harsh shadows */}
      <directionalLight
        position={[-5, 4, 4]}
        intensity={isDark ? 0.8 : 0.5}
        color={isDark ? "#94a3b8" : "#e2e8f0"}
      />

      {/* Stealth Rim Light — crisp cyan backlight tracing the stealth silhouette */}
      <directionalLight
        position={[-6, 5, -6]}
        intensity={isDark ? 1.8 : 0.45}
        color={isDark ? "#38bdf8" : "#cbd5e1"}
      />

      {/* Underbelly Fill — prevents belly from going completely dark */}
      <pointLight
        position={[0, -2, 0]}
        intensity={isDark ? 0.35 : 0.25}
        color={isDark ? "#0f172a" : "#94a3b8"}
        distance={4.5}
      />

      {/* Engine Radiant Glow — thermal emission from engine box */}
      <pointLight
        position={[0.72, 0.25, 0]}
        intensity={cht > 400 ? 2.5 : isDark ? 0.9 : 0.4}
        color={cht > 400 ? "#ff5500" : "#fbbf24"}
        distance={2.8}
      />

      {/* Floating Cyber Atmosphere Particles in Dark Mode */}
      {isDark && (
        <Sparkles count={40} scale={10} size={1.5} speed={0.3} color="#38bdf8" opacity={0.35} />
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

      {/* OrbitControls — autoRotate smoothly pauses when a card is expanded */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}   // Smooth, weighted deceleration
        rotateSpeed={0.75}     // Responsive, fluid rotation
        zoomSpeed={0.75}       // Smooth exponential zoom
        minDistance={1.4}
        maxDistance={8.5}
        autoRotate={autoRotate && !selectedSubsystem}
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
  const [selectedSubsystem, setSelectedSubsystem] = React.useState<string | null>("mechanical")
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [resetKey, setResetKey] = React.useState(0)

  const overallHealth = Math.max(0, Math.min(100, t?.health?.health_index ?? 94))
  const healthColor = getHealthColor(overallHealth, isDark)

  const rpm = t?.rpm ?? 4800
  const cht = t?.cht ?? 382
  const oilP = t?.oil_pressure ?? 65
  const battV = t?.battery_v ?? 28.5
  const vib = t?.vibration ?? 0.65

  return (
    <div
      className={`relative flex flex-col w-full h-full min-h-0 overflow-hidden rounded-2xl border transition-all select-none ${
        isDark ? "border-slate-800 bg-[#02050c]" : "border-slate-200 bg-slate-50"
      } ${isFullscreen ? "fixed inset-0 z-50 rounded-none border-none" : ""}`}
      style={{
        touchAction: "none",
        background: isDark
          ? "radial-gradient(ellipse at 50% 35%, #0d1527 0%, #060c18 55%, #02050c 100%)"
          : "radial-gradient(ellipse at 50% 38%, #ffffff 0%, #f1f5f9 60%, #e2e8f0 100%)",
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
    </div>
  )
}
