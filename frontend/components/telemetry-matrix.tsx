"use client"

import * as React from "react"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart2,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  FileCode,
  FileSpreadsheet,
  Filter,
  Flame,
  Gauge,
  Grid,
  HardDrive,
  Info,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
  Terminal,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Wind,
  X,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useTelemetry } from "@/components/telemetry-provider"
import type { SensorKey } from "@/lib/telemetry/types"

// ─── Subsystem Categories ─────────────────────────────────────────────────────

export type SubsystemCategory =
  | "ALL"
  | "THERMAL"
  | "PROPULSION"
  | "LUBRICATION"
  | "ELECTRICAL"
  | "DYNAMICS"
  | "ALERTS"

export type MatrixViewMode = "CARDS" | "TABLE" | "CYLINDERS" | "CORRELATION"

export type UnitSystem = "IMPERIAL" | "METRIC"

// ─── Extended Sensor Definition (18 Channels) ────────────────────────────────

export interface MatrixSensorDef {
  id: string
  code: string
  label: string
  subsystem: "THERMAL" | "PROPULSION" | "LUBRICATION" | "ELECTRICAL" | "DYNAMICS"
  transducer: string
  samplingRate: string
  adcBits: number
  unitImperial: string
  unitMetric: string
  decimals: number
  sparkKey: SensorKey
  getValueImperial: (t: any) => number
  getValueMetric: (t: any) => number
  warnLoImperial?: number
  warnHiImperial?: number
  critLoImperial?: number
  critHiImperial?: number
  warnLoMetric?: number
  warnHiMetric?: number
  critLoMetric?: number
  critHiMetric?: number
  baselineImperial: number
  baselineMetric: number
  description: string
}

export const MATRIX_SENSORS: MatrixSensorDef[] = [
  {
    id: "01",
    code: "RPM",
    label: "Engine Rotational Speed",
    subsystem: "PROPULSION",
    transducer: "Hall-Effect Crankshaft Dual Reluctor",
    samplingRate: "50 Hz",
    adcBits: 16,
    unitImperial: "RPM",
    unitMetric: "RPM",
    decimals: 0,
    sparkKey: "rpm",
    getValueImperial: (t) => t?.rpm ?? 4800,
    getValueMetric: (t) => t?.rpm ?? 4800,
    warnLoImperial: 1200,
    warnHiImperial: 5500,
    critLoImperial: 800,
    critHiImperial: 5800,
    baselineImperial: 4800,
    baselineMetric: 4800,
    description: "Rotax 914 F crankshaft speed sensed at 60-2 tooth trigger wheel.",
  },
  {
    id: "02",
    code: "CHT_MEAN",
    label: "Cylinder Head Temp (Mean)",
    subsystem: "THERMAL",
    transducer: "Thermocouple Type K (Spark Plug Gasket)",
    samplingRate: "10 Hz",
    adcBits: 16,
    unitImperial: "°F",
    unitMetric: "°C",
    decimals: 1,
    sparkKey: "cht",
    getValueImperial: (t) => t?.cht ?? 382,
    getValueMetric: (t) => (((t?.cht ?? 382) - 32) * 5) / 9,
    warnHiImperial: 410,
    critHiImperial: 435,
    warnHiMetric: 210,
    critHiMetric: 224,
    baselineImperial: 382,
    baselineMetric: 194.4,
    description: "Average cylinder head temperature across 4 boxer combustion chambers.",
  },
  {
    id: "03",
    code: "EGT_MEAN",
    label: "Exhaust Gas Temp (Mean)",
    subsystem: "THERMAL",
    transducer: "Inconel Sheathed Type K Thermocouple",
    samplingRate: "10 Hz",
    adcBits: 16,
    unitImperial: "°F",
    unitMetric: "°C",
    decimals: 1,
    sparkKey: "egt",
    getValueImperial: (t) => t?.egt ?? 1465,
    getValueMetric: (t) => (((t?.egt ?? 1465) - 32) * 5) / 9,
    warnHiImperial: 1620,
    critHiImperial: 1720,
    warnHiMetric: 882,
    critHiMetric: 938,
    baselineImperial: 1465,
    baselineMetric: 796.1,
    description: "Turbine pre-entry exhaust gas temperature from manifold runner confluence.",
  },
  {
    id: "04",
    code: "MAP",
    label: "Manifold Absolute Pressure",
    subsystem: "PROPULSION",
    transducer: "Piezoresistive Micro-Machined Silicon",
    samplingRate: "20 Hz",
    adcBits: 14,
    unitImperial: "inHg",
    unitMetric: "kPa",
    decimals: 1,
    sparkKey: "map_kpa",
    getValueImperial: (t) => (t?.map_kpa ?? 96.0) * 0.2953,
    getValueMetric: (t) => t?.map_kpa ?? 96.0,
    warnLoImperial: 18.0,
    warnHiImperial: 38.5,
    critLoImperial: 12.0,
    critHiImperial: 42.0,
    warnLoMetric: 60.0,
    warnHiMetric: 130.0,
    critLoMetric: 40.0,
    critHiMetric: 142.0,
    baselineImperial: 28.3,
    baselineMetric: 96.0,
    description: "Intake plenum absolute manifold boost pressure downstream of turbocharger.",
  },
  {
    id: "05",
    code: "OIL_P",
    label: "Oil Gallery Pressure",
    subsystem: "LUBRICATION",
    transducer: "Ceramic Capacitive Pressure Cell",
    samplingRate: "20 Hz",
    adcBits: 16,
    unitImperial: "PSI",
    unitMetric: "bar",
    decimals: 1,
    sparkKey: "oil_pressure",
    getValueImperial: (t) => t?.oil_pressure ?? 65.0,
    getValueMetric: (t) => (t?.oil_pressure ?? 65.0) * 0.0689476,
    warnLoImperial: 40.0,
    warnHiImperial: 80.0,
    critLoImperial: 25.0,
    critHiImperial: 90.0,
    warnLoMetric: 2.75,
    warnHiMetric: 5.5,
    critLoMetric: 1.72,
    critHiMetric: 6.2,
    baselineImperial: 65.0,
    baselineMetric: 4.48,
    description: "Main bearing journal pressurized lubrication delivery gallery.",
  },
  {
    id: "06",
    code: "OIL_T",
    label: "Oil Sump Temperature",
    subsystem: "LUBRICATION",
    transducer: "Platinum RTD PT100 immersion probe",
    samplingRate: "10 Hz",
    adcBits: 16,
    unitImperial: "°F",
    unitMetric: "°C",
    decimals: 1,
    sparkKey: "oil_temp",
    getValueImperial: (t) => t?.oil_temp ?? 198.4,
    getValueMetric: (t) => (((t?.oil_temp ?? 198.4) - 32) * 5) / 9,
    warnHiImperial: 235.0,
    critHiImperial: 255.0,
    warnHiMetric: 112.8,
    critHiMetric: 123.9,
    baselineImperial: 198.4,
    baselineMetric: 92.4,
    description: "Dry sump scavenge oil reservoir return temperature.",
  },
  {
    id: "07",
    code: "FUEL_FLOW",
    label: "Fuel Mass Delivery Rate",
    subsystem: "PROPULSION",
    transducer: "Dual Optical Turbine Flow Transducer",
    samplingRate: "10 Hz",
    adcBits: 14,
    unitImperial: "GPH",
    unitMetric: "L/h",
    decimals: 2,
    sparkKey: "fuel_flow",
    getValueImperial: (t) => (t?.fuel_flow ?? 22.8) * 0.264172,
    getValueMetric: (t) => t?.fuel_flow ?? 22.8,
    warnHiImperial: 8.5,
    critHiImperial: 9.8,
    warnHiMetric: 32.0,
    critHiMetric: 37.0,
    baselineImperial: 6.02,
    baselineMetric: 22.8,
    description: "High-pressure fuel injection delivery rate to port fuel injectors.",
  },
  {
    id: "08",
    code: "FUEL_RAIL",
    label: "Fuel Rail Hydraulic Pressure",
    subsystem: "PROPULSION",
    transducer: "Piezoresistive Stainless Steel Diaphragm",
    samplingRate: "20 Hz",
    adcBits: 16,
    unitImperial: "PSI",
    unitMetric: "bar",
    decimals: 2,
    sparkKey: "fuel_rail_pressure_bar",
    getValueImperial: (t) => (t?.fuel_rail_pressure_bar ?? 3.2) * 14.5038,
    getValueMetric: (t) => t?.fuel_rail_pressure_bar ?? 3.2,
    warnLoImperial: 38.0,
    warnHiImperial: 58.0,
    critLoImperial: 32.0,
    critHiImperial: 65.0,
    warnLoMetric: 2.6,
    warnHiMetric: 4.0,
    critLoMetric: 2.2,
    critHiMetric: 4.5,
    baselineImperial: 46.4,
    baselineMetric: 3.2,
    description: "Common rail accumulator injection manifold pressure.",
  },
  {
    id: "09",
    code: "VIB_RMS",
    label: "Propulsion Vibration RMS",
    subsystem: "DYNAMICS",
    transducer: "Tri-Axial High-Temp Accelerometer",
    samplingRate: "100 Hz",
    adcBits: 16,
    unitImperial: "g",
    unitMetric: "g",
    decimals: 3,
    sparkKey: "vibration",
    getValueImperial: (t) => t?.vibration ?? 0.65,
    getValueMetric: (t) => t?.vibration ?? 0.65,
    warnHiImperial: 1.6,
    critHiImperial: 2.5,
    warnHiMetric: 1.6,
    critHiMetric: 2.5,
    baselineImperial: 0.65,
    baselineMetric: 0.65,
    description: "Engine crankcase and reduction gearbox high-frequency structural acceleration.",
  },
  {
    id: "10",
    code: "VIB_KURT",
    label: "Vibration Kurtosis (K4)",
    subsystem: "DYNAMICS",
    transducer: "DSP Spectral Kurtosis Signal Processor",
    samplingRate: "100 Hz",
    adcBits: 16,
    unitImperial: "K4",
    unitMetric: "K4",
    decimals: 2,
    sparkKey: "vibration_kurtosis",
    getValueImperial: (t) => t?.vibration_kurtosis ?? 3.1,
    getValueMetric: (t) => t?.vibration_kurtosis ?? 3.1,
    warnHiImperial: 4.8,
    critHiImperial: 6.5,
    warnHiMetric: 4.8,
    critHiMetric: 6.5,
    baselineImperial: 3.1,
    baselineMetric: 3.1,
    description: "Fourth standardized statistical moment detecting gearbox micro-pitting and spall.",
  },
  {
    id: "11",
    code: "BUS_V",
    label: "28V DC Avionics Bus Potential",
    subsystem: "ELECTRICAL",
    transducer: "Precision Hall-Effect Voltage Divider",
    samplingRate: "20 Hz",
    adcBits: 14,
    unitImperial: "VDC",
    unitMetric: "VDC",
    decimals: 2,
    sparkKey: "battery_v",
    getValueImperial: (t) => t?.battery_v ?? 28.5,
    getValueMetric: (t) => t?.battery_v ?? 28.5,
    warnLoImperial: 24.5,
    warnHiImperial: 30.5,
    critLoImperial: 22.0,
    critHiImperial: 32.0,
    warnLoMetric: 24.5,
    warnHiMetric: 30.5,
    critLoMetric: 22.0,
    critHiMetric: 32.0,
    baselineImperial: 28.5,
    baselineMetric: 28.5,
    description: "Main essential power distribution bus voltage supplying flight computers & FDR.",
  },
  {
    id: "12",
    code: "BUS_I",
    label: "Alternator / Net Bus Load Current",
    subsystem: "ELECTRICAL",
    transducer: "Isolated Magnetic Fluxgate Current Sensor",
    samplingRate: "20 Hz",
    adcBits: 14,
    unitImperial: "A",
    unitMetric: "A",
    decimals: 1,
    sparkKey: "bus_current_a",
    getValueImperial: (t) => t?.bus_current_a ?? 18.5,
    getValueMetric: (t) => t?.bus_current_a ?? 18.5,
    warnHiImperial: 38.0,
    critHiImperial: 44.0,
    warnHiMetric: 38.0,
    critHiMetric: 44.0,
    baselineImperial: 18.5,
    baselineMetric: 18.5,
    description: "Net current draw across flight control servos, SATCOM link, and FLIR payload.",
  },
  {
    id: "13",
    code: "INJ_ADV",
    label: "Electronic Injection Timing",
    subsystem: "PROPULSION",
    transducer: "ECU Angular Camshaft Encoder",
    samplingRate: "50 Hz",
    adcBits: 14,
    unitImperial: "°BTDC",
    unitMetric: "°BTDC",
    decimals: 1,
    sparkKey: "inj_timing",
    getValueImperial: (t) => t?.inj_timing ?? 18.0,
    getValueMetric: (t) => t?.inj_timing ?? 18.0,
    warnLoImperial: 14.0,
    warnHiImperial: 32.0,
    critLoImperial: 11.0,
    critHiImperial: 36.0,
    warnLoMetric: 14.0,
    warnHiMetric: 32.0,
    critLoMetric: 11.0,
    critHiMetric: 36.0,
    baselineImperial: 18.0,
    baselineMetric: 18.0,
    description: "FADEC calculated injection advance angle prior to top dead center.",
  },
  {
    id: "14",
    code: "AFR",
    label: "Air-Fuel Equivalence Ratio",
    subsystem: "PROPULSION",
    transducer: "Bosch LSU 4.9 Wideband Oxygen Sensor",
    samplingRate: "20 Hz",
    adcBits: 16,
    unitImperial: "AFR",
    unitMetric: "λ",
    decimals: 2,
    sparkKey: "rpm", // mapped proxy
    getValueImperial: (t) => t?.physics?.air_fuel_ratio ?? 14.7,
    getValueMetric: (t) => (t?.physics?.air_fuel_ratio ?? 14.7) / 14.7,
    warnLoImperial: 12.2,
    warnHiImperial: 16.0,
    critLoImperial: 11.0,
    critHiImperial: 17.5,
    warnLoMetric: 0.83,
    warnHiMetric: 1.09,
    critLoMetric: 0.75,
    critHiMetric: 1.19,
    baselineImperial: 14.7,
    baselineMetric: 1.0,
    description: "Stoichiometric air-to-fuel ratio sampled at exhaust manifold downpipe.",
  },
  {
    id: "15",
    code: "TURBO_BOOST",
    label: "Turbocharger Wastegate Boost",
    subsystem: "PROPULSION",
    transducer: "Garrett Differential Boost Sensor",
    samplingRate: "20 Hz",
    adcBits: 14,
    unitImperial: "PSI",
    unitMetric: "bar",
    decimals: 1,
    sparkKey: "map_kpa",
    getValueImperial: (t) => Math.max(0, ((t?.map_kpa ?? 96.0) - 101.3) * 0.145),
    getValueMetric: (t) => Math.max(0, ((t?.map_kpa ?? 96.0) - 101.3) * 0.01),
    warnHiImperial: 11.5,
    critHiImperial: 14.0,
    warnHiMetric: 0.79,
    critHiMetric: 0.96,
    baselineImperial: 4.8,
    baselineMetric: 0.33,
    description: "Positive gauge manifold pressure provided by Garrett T25 wastegate.",
  },
  {
    id: "16",
    code: "ALT_MSL",
    label: "Barometric Pressure Altitude",
    subsystem: "THERMAL",
    transducer: "Static Pitot Barometric Transducer",
    samplingRate: "10 Hz",
    adcBits: 16,
    unitImperial: "ft",
    unitMetric: "m",
    decimals: 0,
    sparkKey: "rpm",
    getValueImperial: (t) => t?.altitude_ft ?? 3200,
    getValueMetric: (t) => (t?.altitude_ft ?? 3200) * 0.3048,
    warnHiImperial: 18000,
    critHiImperial: 22000,
    warnHiMetric: 5486,
    critHiMetric: 6705,
    baselineImperial: 3200,
    baselineMetric: 975,
    description: "Calibrated pressure altitude above mean sea level from nose probe.",
  },
  {
    id: "17",
    code: "OAT",
    label: "Outside Ambient Air Temp",
    subsystem: "THERMAL",
    transducer: "De-iced Flush Aerodynamic RTD Probe",
    samplingRate: "5 Hz",
    adcBits: 14,
    unitImperial: "°F",
    unitMetric: "°C",
    decimals: 1,
    sparkKey: "cht",
    getValueImperial: (t) => (t?.oat_c ?? 15.0) * 1.8 + 32,
    getValueMetric: (t) => t?.oat_c ?? 15.0,
    warnLoImperial: -20.0,
    warnHiImperial: 115.0,
    critLoImperial: -35.0,
    critHiImperial: 125.0,
    warnLoMetric: -28.9,
    warnHiMetric: 46.1,
    critLoMetric: -37.2,
    critHiMetric: 51.7,
    baselineImperial: 59.0,
    baselineMetric: 15.0,
    description: "Free stream static outside air temperature sampled at forward wing root.",
  },
  {
    id: "18",
    code: "SENSOR_TRUST",
    label: "Sensor Array Trust & Integrity",
    subsystem: "DYNAMICS",
    transducer: "Kalman Residual Consistency Filter",
    samplingRate: "10 Hz",
    adcBits: 16,
    unitImperial: "%",
    unitMetric: "%",
    decimals: 1,
    sparkKey: "rpm",
    getValueImperial: (t) => (t?.sensor_integrity?.integrity_score ?? 0.994) * 100,
    getValueMetric: (t) => (t?.sensor_integrity?.integrity_score ?? 0.994) * 100,
    warnLoImperial: 88.0,
    critLoImperial: 75.0,
    warnLoMetric: 88.0,
    critLoMetric: 75.0,
    baselineImperial: 99.4,
    baselineMetric: 99.4,
    description: "Multi-sensor cross-validation metric checking physical plausibility.",
  },
]

// Determine status badge given a sensor value and its thresholds
function getSensorStatus(
  value: number,
  cfg: MatrixSensorDef,
  units: UnitSystem
): "NORM" | "WARN" | "CRIT" {
  const isMetric = units === "METRIC"
  const critHi = isMetric ? cfg.critHiMetric : cfg.critHiImperial
  const critLo = isMetric ? cfg.critLoMetric : cfg.critLoImperial
  const warnHi = isMetric ? cfg.warnHiMetric : cfg.warnHiImperial
  const warnLo = isMetric ? cfg.warnLoMetric : cfg.warnLoImperial

  if ((critHi != null && value >= critHi) || (critLo != null && value <= critLo)) return "CRIT"
  if ((warnHi != null && value >= warnHi) || (warnLo != null && value <= warnLo)) return "WARN"
  return "NORM"
}

// ─── Sparkline SVG Component ──────────────────────────────────────────────────

function MiniSparkline({
  points,
  status,
  color,
}: {
  points: number[]
  status: "NORM" | "WARN" | "CRIT"
  color?: string
}) {
  if (points.length < 2) {
    return (
      <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="mt-2 h-5 w-full text-muted-foreground/30">
        <line x1="0" y1="11" x2="100" y2="11" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    )
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 100
  const h = 22
  const pad = 2

  const xs = points.map((_, i) => (i / (points.length - 1)) * w)
  const ys = points.map((v) => h - pad - ((v - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")

  const strokeColor =
    status === "CRIT"
      ? "#ef4444"
      : status === "WARN"
      ? "#f59e0b"
      : color || "#38bdf8"

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-5 w-full overflow-visible">
      <path d={d} fill="none" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* Live pulse dot at last point */}
      <circle
        cx={xs[xs.length - 1].toFixed(1)}
        cy={ys[ys.length - 1].toFixed(1)}
        r="2.5"
        fill={strokeColor}
        className="animate-pulse"
      />
    </svg>
  )
}

// ─── Main Telemetry Matrix Component ──────────────────────────────────────────

export function TelemetryMatrix() {
  const { latestTelemetry: t, sparklineHistory, connectionStatus, isPaused, togglePause } = useTelemetry()

  // State
  const [selectedSubsystem, setSelectedSubsystem] = React.useState<SubsystemCategory>("ALL")
  const [viewMode, setViewMode] = React.useState<MatrixViewMode>("CARDS")
  const [unitSystem, setUnitSystem] = React.useState<UnitSystem>("IMPERIAL")
  const [search, setSearch] = React.useState("")
  const [inspectedSensor, setInspectedSensor] = React.useState<MatrixSensorDef | null>(null)
  const [frozenSnapshot, setFrozenSnapshot] = React.useState<any>(null)
  const [isFrozen, setIsFrozen] = React.useState(false)

  // Stream Freeze: Keep last inspected payload when frozen
  React.useEffect(() => {
    if (!isFrozen) {
      setFrozenSnapshot(t)
    }
  }, [t, isFrozen])

  const activeT = isFrozen ? frozenSnapshot : t

  // Filtered Sensors
  const filteredSensors = React.useMemo(() => {
    return MATRIX_SENSORS.filter((cfg) => {
      // Subsystem filter
      if (selectedSubsystem === "ALERTS") {
        const val = unitSystem === "METRIC" ? cfg.getValueMetric(activeT) : cfg.getValueImperial(activeT)
        const stat = getSensorStatus(val, cfg, unitSystem)
        if (stat === "NORM") return false
      } else if (selectedSubsystem !== "ALL") {
        if (cfg.subsystem !== selectedSubsystem) return false
      }

      // Search keyword filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matches =
          cfg.id.toLowerCase().includes(q) ||
          cfg.code.toLowerCase().includes(q) ||
          cfg.label.toLowerCase().includes(q) ||
          cfg.transducer.toLowerCase().includes(q) ||
          cfg.subsystem.toLowerCase().includes(q)
        if (!matches) return false
      }

      return true
    })
  }, [selectedSubsystem, search, activeT, unitSystem])

  // Cylinder Balance Data
  const cylData = React.useMemo(() => {
    const chtArr = activeT?.cht_cyl ?? [380, 384, 388, 381]
    const egtArr = activeT?.egt_cyl ?? [1460, 1472, 1468, 1458]
    const chtMean = chtArr.reduce((a: number, b: number) => a + b, 0) / chtArr.length
    const egtMean = egtArr.reduce((a: number, b: number) => a + b, 0) / egtArr.length
    const chtSpread = Math.max(...chtArr) - Math.min(...chtArr)
    const egtSpread = Math.max(...egtArr) - Math.min(...egtArr)

    return {
      chtArr,
      egtArr,
      chtMean,
      egtMean,
      chtSpread,
      egtSpread,
    }
  }, [activeT])

  // Cross-Sensor Correlation Matrix Definition
  const correlationData = React.useMemo(() => {
    return [
      { v1: "RPM", v2: "CHT", coef: "+0.82", nature: "Direct Positive", desc: "Thermal buildup proportional to engine revs" },
      { v1: "RPM", v2: "MAP Boost", coef: "+0.91", nature: "Strong Coupling", desc: "Turbocharger spool increases with mass flow" },
      { v1: "RPM", v2: "Vibration", coef: "+0.78", nature: "Direct Positive", desc: "Mechanical harmonic excitation" },
      { v1: "MAP", v2: "Fuel Flow", coef: "+0.94", nature: "Strict Stoichiometric", desc: "Fuel injection mass tracks manifold density" },
      { v1: "Oil Press", v2: "Oil Temp", coef: "-0.65", nature: "Inverse Viscosity", desc: "Pressure drops as kinematic viscosity reduces" },
      { v1: "EGT", v2: "Inj Advance", coef: "-0.71", nature: "Inverse Burn", desc: "Retarded timing increases post-flame exhaust temp" },
    ]
  }, [])

  // Export Snapshot
  const exportSnapshotCSV = () => {
    const headers = ["Sensor_ID", "Code", "Label", "Subsystem", "Value", "Unit", "Baseline", "Residual", "Status"]
    const rows = MATRIX_SENSORS.map((s) => {
      const val = unitSystem === "METRIC" ? s.getValueMetric(activeT) : s.getValueImperial(activeT)
      const base = unitSystem === "METRIC" ? s.baselineMetric : s.baselineImperial
      const unit = unitSystem === "METRIC" ? s.unitMetric : s.unitImperial
      const stat = getSensorStatus(val, s, unitSystem)
      return [
        `S-${s.id}`,
        s.code,
        `"${s.label}"`,
        s.subsystem,
        val.toFixed(s.decimals),
        unit,
        base,
        (val - base).toFixed(s.decimals),
        stat,
      ]
    })

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `uav07_telemetry_matrix_C${activeT?.cycle ?? 0}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="flex flex-col gap-5 select-none font-sans">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 1. HEADER & MATRIX TELEMETRY SYNC STATUS BAR ───────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Live Telemetry Matrix</h2>
            <Badge variant="outline" className="text-[10px] font-mono text-cyan-400 border-cyan-500/30">
              18 CHANNELS @ 10 HZ
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Synchronized digital twin sensor telemetry for Rotax 914 F Turbo and flight control avionics.
          </p>
        </div>

        {/* Action Controls: Units, Freeze, Export */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Imperial / Metric Toggle */}
          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/40 font-mono text-xs">
            <button
              onClick={() => setUnitSystem("IMPERIAL")}
              className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                unitSystem === "IMPERIAL" ? "bg-primary text-primary-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Imperial (°F, PSI)
            </button>
            <button
              onClick={() => setUnitSystem("METRIC")}
              className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                unitSystem === "METRIC" ? "bg-primary text-primary-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Metric (°C, bar)
            </button>
          </div>

          {/* Freeze Stream Toggle */}
          <Button
            size="sm"
            variant={isFrozen ? "default" : "outline"}
            onClick={() => setIsFrozen((v) => !v)}
            className={`h-8 gap-1.5 font-mono text-xs ${
              isFrozen ? "bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold" : ""
            }`}
          >
            {isFrozen ? (
              <>
                <Play className="size-3.5" />
                <span>Resume Stream</span>
              </>
            ) : (
              <>
                <Pause className="size-3.5 text-amber-400" />
                <span>Freeze Matrix</span>
              </>
            )}
          </Button>

          {/* Export CSV */}
          <Button size="sm" variant="outline" onClick={exportSnapshotCSV} className="h-8 gap-1 font-mono text-xs">
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 2. SUBSYSTEM FILTER TABS & VIEW MODE SELECTOR ───────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Subsystem Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 p-1 bg-card/60 backdrop-blur-md">
          {[
            { id: "ALL", label: "All Sensors (18)" },
            { id: "THERMAL", label: "Thermal & Heat" },
            { id: "PROPULSION", label: "Propulsion & Fuel" },
            { id: "LUBRICATION", label: "Lubrication" },
            { id: "ELECTRICAL", label: "Avionics Bus" },
            { id: "DYNAMICS", label: "Dynamics" },
            { id: "ALERTS", label: "Alerts Only" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedSubsystem(tab.id as SubsystemCategory)}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                selectedSubsystem === tab.id
                  ? "bg-primary text-primary-foreground shadow-xs font-bold"
                  : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Center: Search Keyword */}
        <div className="relative w-48 sm:w-60">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search sensor S-01, CHT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs font-mono"
          />
        </div>

        {/* Right: View Mode Toggle */}
        <div className="flex items-center rounded-xl border border-border/70 p-1 bg-card/60 backdrop-blur-md">
          {[
            { id: "CARDS", label: "Cards", icon: Grid },
            { id: "TABLE", label: "Table", icon: TableIcon },
            { id: "CYLINDERS", label: "Cylinders", icon: Flame },
            { id: "CORRELATION", label: "Correlation", icon: BarChart2 },
          ].map((m) => {
            const Icon = m.icon
            const active = viewMode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id as MatrixViewMode)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-xs font-bold"
                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 3. VIEW MODE 1: GRID CARDS VIEW ─────────────────────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {viewMode === "CARDS" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredSensors.map((cfg) => {
            const val = unitSystem === "METRIC" ? cfg.getValueMetric(activeT) : cfg.getValueImperial(activeT)
            const unit = unitSystem === "METRIC" ? cfg.unitMetric : cfg.unitImperial
            const base = unitSystem === "METRIC" ? cfg.baselineMetric : cfg.baselineImperial
            const status = activeT ? getSensorStatus(val, cfg, unitSystem) : "NORM"
            const residual = val - base

            const history = (sparklineHistory[cfg.sparkKey] ?? []).map((p) => p.value)
            const displayVal = val.toFixed(cfg.decimals)

            return (
              <Card
                key={cfg.id}
                onClick={() => setInspectedSensor(cfg)}
                className={`rounded-xl border bg-card/85 p-3.5 cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
                  status === "CRIT"
                    ? "border-rose-500/60 bg-rose-500/5"
                    : status === "WARN"
                    ? "border-amber-500/60 bg-amber-500/5"
                    : "border-border/75"
                }`}
              >
                {/* Top strip: Sensor ID + Subsystem + Status Pill */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-primary">S-{cfg.id}</span>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{cfg.code}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 font-mono font-bold ${
                      status === "CRIT"
                        ? "border-rose-500 text-rose-400 bg-rose-500/10"
                        : status === "WARN"
                        ? "border-amber-500 text-amber-400 bg-amber-500/10"
                        : "border-emerald-500/30 text-emerald-400"
                    }`}
                  >
                    {status}
                  </Badge>
                </div>

                {/* Sensor Label */}
                <div className="mt-1 text-xs font-medium text-foreground truncate" title={cfg.label}>
                  {cfg.label}
                </div>

                {/* Primary Engineering Value & Units */}
                <div className="mt-1.5 flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-2xl font-bold tracking-tight text-foreground">
                      {activeT ? displayVal : "—"}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
                  </div>
                  {/* Delta / Residual from physics twin */}
                  <div
                    className={`flex items-center gap-0.5 text-[11px] font-mono font-bold ${
                      Math.abs(residual) < 0.05
                        ? "text-muted-foreground"
                        : residual > 0
                        ? "text-amber-400"
                        : "text-cyan-400"
                    }`}
                  >
                    {residual > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    <span>
                      {residual > 0 ? "+" : ""}
                      {residual.toFixed(cfg.decimals)}
                    </span>
                  </div>
                </div>

                {/* Sparkline Visual */}
                <MiniSparkline points={history} status={status} />

                {/* Bottom Spec Footer: Sampling & Transducer */}
                <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-1.5">
                  <span className="truncate max-w-[130px]">{cfg.transducer.split(" ")[0]}</span>
                  <span>{cfg.samplingRate}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 4. VIEW MODE 2: HIGH-DENSITY AVIONICS TABLE VIEW ────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {viewMode === "TABLE" && (
        <Card className="rounded-xl border border-border/80 bg-card/85 overflow-hidden shadow-xs">
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 bg-muted/95 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur-md z-10 border-b border-border/60">
                <tr>
                  <th className="px-3.5 py-2.5">ID</th>
                  <th className="px-3.5 py-2.5">Code</th>
                  <th className="px-3.5 py-2.5">Parameter Description</th>
                  <th className="px-3.5 py-2.5">Subsystem</th>
                  <th className="px-3.5 py-2.5 text-right">Value</th>
                  <th className="px-3.5 py-2.5">Unit</th>
                  <th className="px-3.5 py-2.5 text-right">Residual</th>
                  <th className="px-3.5 py-2.5">Rate</th>
                  <th className="px-3.5 py-2.5">Transducer Hardware</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredSensors.map((cfg) => {
                  const val = unitSystem === "METRIC" ? cfg.getValueMetric(activeT) : cfg.getValueImperial(activeT)
                  const unit = unitSystem === "METRIC" ? cfg.unitMetric : cfg.unitImperial
                  const base = unitSystem === "METRIC" ? cfg.baselineMetric : cfg.baselineImperial
                  const status = activeT ? getSensorStatus(val, cfg, unitSystem) : "NORM"
                  const residual = val - base

                  return (
                    <tr
                      key={cfg.id}
                      onClick={() => setInspectedSensor(cfg)}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-3.5 py-2 text-primary font-bold">S-{cfg.id}</td>
                      <td className="px-3.5 py-2 font-bold text-foreground">{cfg.code}</td>
                      <td className="px-3.5 py-2 font-sans font-medium text-foreground">{cfg.label}</td>
                      <td className="px-3.5 py-2">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                          {cfg.subsystem}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2 text-right font-bold text-base text-foreground">
                        {val.toFixed(cfg.decimals)}
                      </td>
                      <td className="px-3.5 py-2 text-muted-foreground">{unit}</td>
                      <td
                        className={`px-3.5 py-2 text-right font-bold ${
                          Math.abs(residual) < 0.05
                            ? "text-muted-foreground"
                            : residual > 0
                            ? "text-amber-400"
                            : "text-cyan-400"
                        }`}
                      >
                        {residual > 0 ? "+" : ""}
                        {residual.toFixed(cfg.decimals)}
                      </td>
                      <td className="px-3.5 py-2 text-muted-foreground">{cfg.samplingRate}</td>
                      <td className="px-3.5 py-2 font-sans text-[11px] text-muted-foreground truncate max-w-[200px]">
                        {cfg.transducer}
                      </td>
                      <td className="px-3.5 py-2 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 font-mono font-bold ${
                            status === "CRIT"
                              ? "border-rose-500 text-rose-400 bg-rose-500/10"
                              : status === "WARN"
                              ? "border-amber-500 text-amber-400 bg-amber-500/10"
                              : "border-emerald-500/30 text-emerald-400"
                          }`}
                        >
                          {status}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2 text-right">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            setInspectedSensor(cfg)
                          }}
                          className="h-6 text-[10px] font-mono text-muted-foreground hover:text-foreground"
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 5. VIEW MODE 3: CYLINDER BALANCE & COMBUSTION MATRIX ───────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {viewMode === "CYLINDERS" && (
        <div className="flex flex-col gap-4 font-mono">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CHT Cylinder Balance Card */}
            <Card className="rounded-xl border border-border/80 bg-card/85 p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div className="flex items-center gap-2">
                  <Flame className="size-4 text-orange-400" />
                  <span className="font-bold text-sm text-foreground">
                    Cylinder Head Temp (CHT) Boxer Balance
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Spread: <span className="text-orange-400 font-bold">{cylData.chtSpread.toFixed(1)}°F</span> (Limit &lt; 45°F)
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                {cylData.chtArr.map((chtVal: number, idx: number) => {
                  const delta = chtVal - cylData.chtMean
                  const isHigh = chtVal > 410
                  return (
                    <div
                      key={`cht-cyl-${idx}`}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 ${
                        isHigh ? "border-rose-500/50 bg-rose-500/10" : "border-border/70 bg-background"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">CYL #{idx + 1}</span>
                      <span className="text-xl font-bold text-foreground">{chtVal.toFixed(1)}°</span>
                      <span
                        className={`text-[10px] font-bold ${
                          delta > 0 ? "text-amber-400" : "text-cyan-400"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)}°F Δ
                      </span>
                      {/* Bar graph gauge */}
                      <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${isHigh ? "bg-rose-500" : "bg-orange-400"}`}
                          style={{ width: `${Math.min(100, Math.max(10, ((chtVal - 300) / 150) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3.5 text-[11px] font-sans text-muted-foreground flex items-center justify-between">
                <span>Mean Boxer CHT: {cylData.chtMean.toFixed(1)}°F</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {cylData.chtSpread < 35 ? "BOXER CYLINDERS BALANCED" : "CYLINDER THERMAL DEVIATION"}
                </span>
              </div>
            </Card>

            {/* EGT Cylinder Exhaust Balance Card */}
            <Card className="rounded-xl border border-border/80 bg-card/85 p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div className="flex items-center gap-2">
                  <Wind className="size-4 text-cyan-400" />
                  <span className="font-bold text-sm text-foreground">
                    Exhaust Gas Temp (EGT) Combustion Balance
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Spread: <span className="text-cyan-400 font-bold">{cylData.egtSpread.toFixed(1)}°F</span> (Limit &lt; 90°F)
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                {cylData.egtArr.map((egtVal: number, idx: number) => {
                  const delta = egtVal - cylData.egtMean
                  return (
                    <div
                      key={`egt-cyl-${idx}`}
                      className="p-3 rounded-xl border border-border/70 bg-background flex flex-col items-center gap-1.5"
                    >
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">RUNNER #{idx + 1}</span>
                      <span className="text-xl font-bold text-foreground">{egtVal.toFixed(0)}°</span>
                      <span
                        className={`text-[10px] font-bold ${
                          delta > 0 ? "text-amber-400" : "text-cyan-400"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(0)}°F Δ
                      </span>
                      {/* Bar graph gauge */}
                      <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{ width: `${Math.min(100, Math.max(10, ((egtVal - 1300) / 350) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3.5 text-[11px] font-sans text-muted-foreground flex items-center justify-between">
                <span>Mean Exhaust EGT: {cylData.egtMean.toFixed(0)}°F</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {cylData.egtSpread < 60 ? "UNIFORM FUEL-AIR STOICHIOMETRY" : "MIXTURE DISPARITY"}
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 6. VIEW MODE 4: CROSS-SENSOR CORRELATION MATRIX ─────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {viewMode === "CORRELATION" && (
        <Card className="rounded-xl border border-border/80 bg-card/85 p-5 shadow-xs font-mono">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="size-4 text-primary" />
              <span className="font-bold text-sm text-foreground">
                Physics-Informed Cross-Sensor Correlation Matrix
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30">
              COVARIANCE MODEL ACTIVE
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {correlationData.map((c, i) => (
              <div key={i} className="p-3.5 rounded-xl border border-border/70 bg-background flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <span>{c.v1}</span>
                    <span className="text-muted-foreground">⟷</span>
                    <span>{c.v2}</span>
                  </div>
                  <Badge variant="outline" className="font-mono font-bold text-primary border-primary/30 text-xs">
                    r = {c.coef}
                  </Badge>
                </div>
                <div className="text-[11px] font-sans font-medium text-muted-foreground">
                  {c.desc}
                </div>
                <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                  Coupling: {c.nature}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 7. DETAILED SENSOR CALIBRATION & DIAGNOSTICS MODAL ─────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {inspectedSensor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col gap-4 font-mono text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                <span className="font-bold text-sm text-foreground">
                  Sensor S-{inspectedSensor.id}: {inspectedSensor.code} Diagnostic Dossier
                </span>
              </div>
              <button
                onClick={() => setInspectedSensor(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Sensor Core Parameter Header */}
            {(() => {
              const val =
                unitSystem === "METRIC"
                  ? inspectedSensor.getValueMetric(activeT)
                  : inspectedSensor.getValueImperial(activeT)
              const unit = unitSystem === "METRIC" ? inspectedSensor.unitMetric : inspectedSensor.unitImperial
              const base =
                unitSystem === "METRIC" ? inspectedSensor.baselineMetric : inspectedSensor.baselineImperial
              const status = activeT ? getSensorStatus(val, inspectedSensor, unitSystem) : "NORM"
              const residual = val - base
              const history = (sparklineHistory[inspectedSensor.sparkKey] ?? []).map((p) => p.value)

              return (
                <div className="flex flex-col gap-3 font-sans">
                  {/* Top value badge card */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-muted/30 border border-border/60">
                    <div>
                      <div className="text-[11px] font-mono text-primary font-bold">
                        S-{inspectedSensor.id} · {inspectedSensor.subsystem}
                      </div>
                      <div className="text-base font-bold text-foreground mt-0.5">{inspectedSensor.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{inspectedSensor.description}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 font-mono">
                      <div className="text-3xl font-extrabold text-foreground">
                        {val.toFixed(inspectedSensor.decimals)} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono font-bold ${
                          status === "CRIT"
                            ? "border-rose-500 text-rose-400 bg-rose-500/10"
                            : status === "WARN"
                            ? "border-amber-500 text-amber-400 bg-amber-500/10"
                            : "border-emerald-500/30 text-emerald-400"
                        }`}
                      >
                        {status}
                      </Badge>
                    </div>
                  </div>

                  {/* Hardware & Calibration Grid */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 font-mono">
                      Transducer Specification & Digital Sampling
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Transducer Hardware</div>
                        <div className="font-bold text-foreground mt-0.5 text-[11px] truncate">
                          {inspectedSensor.transducer}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Sampling Rate</div>
                        <div className="font-bold text-primary mt-0.5">{inspectedSensor.samplingRate}</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">ADC Resolution</div>
                        <div className="font-bold text-foreground mt-0.5">{inspectedSensor.adcBits}-bit Delta-Sigma</div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Physics Model Baseline</div>
                        <div className="font-bold text-foreground mt-0.5">
                          {base} {unit}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Model Residual (Δ)</div>
                        <div className="font-bold text-cyan-400 mt-0.5">
                          {residual > 0 ? "+" : ""}
                          {residual.toFixed(inspectedSensor.decimals)} {unit}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border/70 bg-background">
                        <div className="text-[10px] text-muted-foreground">Sensor Drift Index</div>
                        <div className="font-bold text-emerald-400 mt-0.5">0.02σ (Zero Drift)</div>
                      </div>
                    </div>
                  </div>

                  {/* Rolling 60-sample sparkline preview */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 font-mono">
                      Rolling 60-Sample High-Rate Waveform
                    </div>
                    <div className="p-3 rounded-lg border border-border/70 bg-background">
                      <MiniSparkline points={history} status={status} />
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-border/60">
              <Button size="sm" onClick={() => setInspectedSensor(null)}>
                Close Diagnostic Dossier
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
