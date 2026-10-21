"use client"

import * as React from "react"
import {
  ActivityIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  FileCheck2Icon,
  FileTextIcon,
  FilterIcon,
  GaugeIcon,
  LayersIcon,
  PackageCheckIcon,
  PlaneIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TruckIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useTelemetry } from "@/components/telemetry-provider"
import type { MaintenanceAdvisory, PrescriptiveRecommendation } from "@/lib/telemetry/types"

// ─── Rotax 914 F LRU Component Degradation Specs ──────────────────────────────

interface SubsystemLRU {
  id: string
  name: string
  partNumber: string
  serialNumber: string
  wearPct: number
  rulHours: number
  tboHours: number
  inStock: number
  inspectionMetric: string
  metricValue: string
  status: "NOMINAL" | "MONITOR" | "CRITICAL"
}

const ROTAX_LRU_CATALOG: SubsystemLRU[] = [
  {
    id: "lru-turbo",
    name: "Garrett T25 Turbocharger & Wastegate Actuator",
    partNumber: "ROTAX P/N 995-830",
    serialNumber: "SN-GT25-8839",
    wearPct: 18,
    rulHours: 148,
    tboHours: 500,
    inStock: 2,
    inspectionMetric: "Wastegate Backlash",
    metricValue: "0.042 mm (Limit: 0.08 mm)",
    status: "NOMINAL",
  },
  {
    id: "lru-valve",
    name: "Cylinder #2 Exhaust Valve & High-Nickel Guide",
    partNumber: "ROTAX P/N 260-155",
    serialNumber: "SN-VLV-C2-4019",
    wearPct: 32,
    rulHours: 82,
    tboHours: 250,
    inStock: 4,
    inspectionMetric: "Stem Clearance / Lash",
    metricValue: "0.12 mm (Limit: 0.20 mm)",
    status: "MONITOR",
  },
  {
    id: "lru-carb",
    name: "Bing 64 Dual Constant-Depression Carburetors",
    partNumber: "ROTAX P/N 887-210",
    serialNumber: "SN-BING-0941",
    wearPct: 14,
    rulHours: 210,
    tboHours: 400,
    inStock: 3,
    inspectionMetric: "Fuel Flow Dynamic Delta",
    metricValue: "±1.2% (Limit: ±3.0%)",
    status: "NOMINAL",
  },
  {
    id: "lru-cdi",
    name: "Dual Capacitor Discharge Ignition (CDI) & Triggers",
    partNumber: "ROTAX P/N 966-725",
    serialNumber: "SN-CDI-1102A",
    wearPct: 8,
    rulHours: 490,
    tboHours: 1000,
    inStock: 1,
    inspectionMetric: "Spark Energy Discharge",
    metricValue: "44 mJ (Limit: 30 mJ min)",
    status: "NOMINAL",
  },
  {
    id: "lru-oilpump",
    name: "Dry Sump Oil Scavenge Pump & Relief Valve",
    partNumber: "ROTAX P/N 856-112",
    serialNumber: "SN-OILP-3391",
    wearPct: 12,
    rulHours: 340,
    tboHours: 600,
    inStock: 2,
    inspectionMetric: "Volumetric Scavenge Flow",
    metricValue: "4.8 L/min (Limit: 3.5 L/min)",
    status: "NOMINAL",
  },
  {
    id: "lru-gearbox",
    name: "Reduction Gearbox (2.43:1) Dog Clutch & Damper",
    partNumber: "ROTAX P/N 958-910",
    serialNumber: "SN-RGB-7721",
    wearPct: 22,
    rulHours: 115,
    tboHours: 300,
    inStock: 1,
    inspectionMetric: "Dog Gear Engagement Gap",
    metricValue: "0.52 mm (Limit: 0.70 mm)",
    status: "MONITOR",
  },
]

// ─── Service Bulletins Catalog ────────────────────────────────────────────────

interface ServiceBulletin {
  id: string
  title: string
  authority: string
  complianceType: "MANDATORY_AD" | "RECURRENT_SB" | "SERVICE_LETTER"
  status: "COMPLIED_WITH" | "DUE_NEXT_100H" | "OPEN_ACTION"
  effectiveDate: string
  summary: string
}

const SERVICE_BULLETINS: ServiceBulletin[] = [
  {
    id: "SB-914-054 R1",
    title: "Turbocharger Wastegate Eyelet & Control Lever Inspection",
    authority: "Rotax / EASA",
    complianceType: "RECURRENT_SB",
    status: "COMPLIED_WITH",
    effectiveDate: "2026-04-15",
    summary: "Visual inspection and backlash clearance verification every 50 operating hours.",
  },
  {
    id: "SB-914-048",
    title: "Carburetor Float Chamber Vent Hose Anti-Kink Routing",
    authority: "Rotax Factory",
    complianceType: "RECURRENT_SB",
    status: "COMPLIED_WITH",
    effectiveDate: "2025-11-20",
    summary: "Reroute atmospheric vent tubes to prevent fuel siphoning at high pitch angles.",
  },
  {
    id: "AD 2023-14-02",
    title: "High-Pressure Fuel Injection Hose Clamp Torque Verification",
    authority: "FAA / EASA Part 39",
    complianceType: "MANDATORY_AD",
    status: "DUE_NEXT_100H",
    effectiveDate: "2026-08-01",
    summary: "Verify torque on Oetiker ear clamps across high-pressure delivery rail.",
  },
  {
    id: "SIL-914-019",
    title: "Oil Radiator Anti-Vibration Heavy-Duty Isolation Mounts",
    authority: "Rotax Service Info",
    complianceType: "SERVICE_LETTER",
    status: "OPEN_ACTION",
    effectiveDate: "2026-09-10",
    summary: "Recommended installation of upgraded Lord elastomer mounts during scheduled depot check.",
  },
]

export function MaintenancePanel() {
  const { latestTelemetry: t } = useTelemetry()

  // Dynamic telemetry bindings
  const rawPrescriptive: PrescriptiveRecommendation[] = t?.prescriptive ?? []
  const rawAdvisories: MaintenanceAdvisory[] = t?.advisories ?? []
  const predRul = t?.predicted_rul ?? 0
  const healthIndex = Math.round(t?.health?.health_index ?? 92)
  const isAnomaly = t?.is_anomaly ?? false
  const alertLevel = t?.alert ?? "NOMINAL"

  // Airworthiness status determination
  const isGrounded = alertLevel === "CRITICAL" || healthIndex < 40
  const isCaution = alertLevel === "WARNING" || healthIndex < 70 || isAnomaly
  const dispatchStatus = isGrounded
    ? "AOG — GROUND AIRCRAFT IMMEDIATELY"
    : isCaution
    ? "DISPATCH WITH CAUTION — RESTRICTED ENVELOPE"
    : "CLEARED FOR UNRESTRICTED ISR SORTIES"

  // ── Work Order Interactive State ───────────────────────────────────────────
  // Step checkmarks: Map<taskId, Set<stepIndex>>
  const [signedOffSteps, setSignedOffSteps] = React.useState<Record<string, number[]>>({})
  // Completed/Closed task IDs
  const [completedTaskIds, setCompletedTaskIds] = React.useState<Set<string>>(new Set())
  // Filter states
  const [selectedAtaFilter, setSelectedAtaFilter] = React.useState<string>("ALL")
  const [selectedPriorityFilter, setSelectedPriorityFilter] = React.useState<string>("ALL")
  const [searchQuery, setSearchQuery] = React.useState<string>("")
  // LRU Spares inventory count state
  const [lruList, setLruList] = React.useState<SubsystemLRU[]>(ROTAX_LRU_CATALOG)
  // Dispatch Modal state
  const [dispatchModalOpen, setDispatchModalOpen] = React.useState(false)
  const [activeDispatchTask, setActiveDispatchTask] = React.useState<MaintenanceAdvisory | null>(null)
  const [assignedTechnician, setAssignedTechnician] = React.useState("Lead Tech J. Miller (Cert #A&P-3882914)")
  const [assignedBay, setAssignedBay] = React.useState("Bay 2 - Propulsion Overhaul & Borescope")
  const [techNotes, setTechNotes] = React.useState("")
  // Airworthiness Release Certificate Modal
  const [certModalOpen, setCertModalOpen] = React.useState(false)
  const [requisitionSuccessItem, setRequisitionSuccessItem] = React.useState<string | null>(null)

  // Toggle SOP step checkmark
  const handleToggleStep = (taskId: string, stepIndex: number) => {
    setSignedOffSteps((prev) => {
      const current = prev[taskId] ?? []
      const next = current.includes(stepIndex)
        ? current.filter((i) => i !== stepIndex)
        : [...current, stepIndex]
      return { ...prev, [taskId]: next }
    })
  }

  // Mark task as fully signed off & completed
  const handleCompleteTask = (taskId: string) => {
    setCompletedTaskIds((prev) => {
      const next = new Set(prev)
      next.add(taskId)
      return next
    })
  }

  // Open Dispatch Modal
  const handleOpenDispatch = (wo: MaintenanceAdvisory) => {
    setActiveDispatchTask(wo)
    setDispatchModalOpen(true)
  }

  // Submit Dispatch
  const handleSubmitDispatch = () => {
    if (activeDispatchTask?.task_id) {
      handleCompleteTask(activeDispatchTask.task_id)
    }
    setDispatchModalOpen(false)
  }

  // Handle Spare Requisition
  const handleRequisitionSpare = (lruId: string, lruName: string) => {
    setLruList((prev) =>
      prev.map((item) =>
        item.id === lruId ? { ...item, inStock: item.inStock + 1 } : item
      )
    )
    setRequisitionSuccessItem(lruName)
    setTimeout(() => setRequisitionSuccessItem(null), 3000)
  }

  // Curate Prescriptive Recommendations
  const prescriptiveItems: PrescriptiveRecommendation[] =
    rawPrescriptive.length > 0
      ? rawPrescriptive
      : isGrounded
      ? [
          {
            severity: "CRITICAL",
            action: "Critical propulsion degradation detected. Ground aircraft and perform immediate depot-level inspection.",
            operational: "Do not takeoff. If airborne, execute immediate precautionary landing at nearest designated field.",
            maintenance: "Perform full borescope inspection of all cylinders, verify valve lash, and inspect oil filter pleats.",
            expected_benefit: "Mitigates immediate risk of catastrophic in-flight engine seizure.",
            source: "AUTONOMOUS_DIAGNOSTICS",
          },
        ]
      : isCaution
      ? [
          {
            severity: "WARNING",
            action: "Subsystem anomaly flagged. Restrict mission profile and inspect affected sensors before next flight.",
            operational: "Restrict engine speed to below 4,600 RPM. Avoid high-altitude or high-temperature sorties.",
            maintenance: "Inspect cylinder cooling baffles, thermocouple connectors, and verify fuel rail pressure calibration.",
            expected_benefit: "Extends remaining useful life by +15 to +25 cycles by preventing thermal overrun.",
            source: "PHYSICS_RESIDUAL_MONITOR",
          },
        ]
      : [
          {
            severity: "INFO",
            action: "All propulsion subsystems operating within certified baseline limits. Cleared for dispatch.",
            operational: "Proceed with standard mission checklist. Monitor normal climb and cruise RPM schedule.",
            maintenance: "No corrective actions required. Next scheduled maintenance per standard TBO calendar.",
            expected_benefit: "Engine life consumption tracking at optimal 1.0x baseline wear rate.",
            source: "DIGITAL_TWIN_VALIDATION",
          },
        ]

  // Curate ATA Work Orders
  const baseWorkOrders: MaintenanceAdvisory[] =
    rawAdvisories.length > 0
      ? rawAdvisories
      : [
          {
            task_id: "WO-ATA-75-01",
            ata_chapter: "ATA 75 (Cooling)",
            priority: isGrounded ? "CRITICAL" : isCaution ? "HIGH" : "NORMAL",
            urgency_hours: isGrounded ? 1.0 : isCaution ? 8.0 : 45.0,
            title: "Cylinder Head Thermal Runaway & Cooling Baffle Inspection",
            action: "Inspect cylinder cooling air deflector baffles, coolant flow, and cylinder head torque.",
            priority_rationale: "Prevents thermal cylinder head warping and localized detonation.",
            steps: [
              "Check cylinder head hold-down torque specification (22 N·m per Rotax Manual).",
              "Inspect cylinder cooling air deflector baffles for deformation or foreign object blockage.",
              "Test thermostat valve cracking temperature (80°C ± 2°C in test bath).",
              "Verify coolant glycol concentration (50/50 mix distilled water and Evans waterless/glycol).",
            ],
          },
          {
            task_id: "WO-ATA-79-04",
            ata_chapter: "ATA 79 (Oil System)",
            priority: isGrounded ? "CRITICAL" : "NORMAL",
            urgency_hours: isGrounded ? 2.0 : 45.0,
            title: "Lubrication Circuit Pressure Loss & Scavenge Pump Servicing",
            action: "Cut open oil filter canister and inspect for bronze or aluminum flakes using magnifying glass.",
            priority_rationale: "Early detection of journal bearing spalling before uncontained seizure.",
            steps: [
              "Cut open oil filter element and inspect pleats for metallic ferrous particulate.",
              "Check oil pressure relief valve spring free length (min 42.5 mm).",
              "Perform crankcase blow-by pressure check with differential cylinder pressure tester.",
              "Refill with certified aero multigrade oil (AeroShell Oil Sport Plus 4) and prime galleries.",
            ],
          },
          {
            task_id: "WO-ATA-72-08",
            ata_chapter: "ATA 72 (Engine Core)",
            priority: "NORMAL",
            urgency_hours: 50.0,
            title: "Propeller Dynamic Balancing & Engine Mount Damper Check",
            action: "Perform dynamic propeller vibration survey and inspect elastomer lord isolator mounts.",
            priority_rationale: "Mitigates high-frequency airframe fatigue and gearbox dog-clutch wear.",
            steps: [
              "Torque check engine mount lord isolators (45 N·m).",
              "Perform 1X/2X shaft dynamic balancing using optical tachometer and vibration accelerometer.",
              "Check reduction gearbox dog gear engagement clearance (0.4 – 0.7 mm).",
              "Borescope inspect reduction gear pinion teeth for pitting or micro-spalling.",
            ],
          },
          {
            task_id: "WO-ATA-80-02",
            ata_chapter: "ATA 80 (Ignition)",
            priority: "LOW",
            urgency_hours: 90.0,
            title: "Dual Ignition Coil & Spark Plug High-Tension Diagnostics",
            action: "Test dual electronic ignition modules, spark plug electrode gap, and crank trigger air gap.",
            priority_rationale: "Ensures redundant twin-spark ignition integrity across all flight regimes.",
            steps: [
              "Remove all 8 dual spark plugs; verify electrode gap is 0.6 – 0.7 mm.",
              "Measure primary coil resistance (0.8 – 1.2 Ohms).",
              "Measure secondary coil resistance (5.5 – 7.0 kOhms).",
              "Verify flywheel reluctance trigger wheel air gap (0.45 ± 0.05 mm).",
            ],
          },
        ]

  // Filtered Work Orders
  const filteredWorkOrders = baseWorkOrders.filter((wo) => {
    // ATA filter
    if (selectedAtaFilter !== "ALL") {
      const ataCode = wo.ata_chapter ?? ""
      if (!ataCode.includes(selectedAtaFilter)) return false
    }
    // Priority filter
    if (selectedPriorityFilter !== "ALL") {
      if ((wo.priority ?? "NORMAL").toUpperCase() !== selectedPriorityFilter) return false
    }
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const titleMatch = (wo.title ?? "").toLowerCase().includes(q)
      const idMatch = (wo.task_id ?? "").toLowerCase().includes(q)
      const actionMatch = (wo.action ?? "").toLowerCase().includes(q)
      if (!titleMatch && !idMatch && !actionMatch) return false
    }
    return true
  })

  // Certified Limits Live Check
  const liveCht = t?.cht ?? 108.5
  const liveEgt = t?.egt ?? 810.2
  const liveOilP = t?.oil_pressure ?? 3.4
  const liveOilT = t?.oil_temp ?? 92.1
  const liveRpm = t?.rpm ?? 4850
  const liveMap = t?.map_kpa ?? 98.2

  const envelopeChecks = [
    {
      param: "Cylinder Head Temp (CHT)",
      measured: `${liveCht.toFixed(1)} °C`,
      limit: "135.0 °C Max",
      status: liveCht <= 135 ? "IN ENVELOPE" : "EXCEEDED",
      margin: `${(135 - liveCht).toFixed(1)} °C margin`,
      ok: liveCht <= 135,
    },
    {
      param: "Exhaust Gas Temp (EGT)",
      measured: `${liveEgt.toFixed(1)} °C`,
      limit: "950.0 °C Max",
      status: liveEgt <= 950 ? "IN ENVELOPE" : "EXCEEDED",
      margin: `${(950 - liveEgt).toFixed(1)} °C margin`,
      ok: liveEgt <= 950,
    },
    {
      param: "Oil Pressure",
      measured: `${liveOilP.toFixed(2)} bar`,
      limit: "2.0 – 5.0 bar",
      status: liveOilP >= 2.0 && liveOilP <= 5.0 ? "IN ENVELOPE" : "OUT OF BOUNDS",
      margin:
        liveOilP < 2.0
          ? `-${(2.0 - liveOilP).toFixed(2)} bar low`
          : liveOilP > 5.0
          ? `+${(liveOilP - 5.0).toFixed(2)} bar high`
          : "Nominal band",
      ok: liveOilP >= 2.0 && liveOilP <= 5.0,
    },
    {
      param: "Oil Sump Temp",
      measured: `${liveOilT.toFixed(1)} °C`,
      limit: "50 – 130 °C",
      status: liveOilT >= 50 && liveOilT <= 130 ? "IN ENVELOPE" : "OUT OF BOUNDS",
      margin: `${(130 - liveOilT).toFixed(1)} °C margin`,
      ok: liveOilT >= 50 && liveOilT <= 130,
    },
    {
      param: "Engine Speed (RPM)",
      measured: `${Math.round(liveRpm)} RPM`,
      limit: "5,800 RPM Max",
      status: liveRpm <= 5800 ? "IN ENVELOPE" : "OVERSPEED",
      margin: `${Math.round(5800 - liveRpm)} RPM margin`,
      ok: liveRpm <= 5800,
    },
    {
      param: "Manifold Pressure (MAP)",
      measured: `${liveMap.toFixed(1)} kPa`,
      limit: "115.0 kPa Max",
      status: liveMap <= 115 ? "IN ENVELOPE" : "OVERBOOST",
      margin: `${(115 - liveMap).toFixed(1)} kPa margin`,
      ok: liveMap <= 115,
    },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full animate-in fade-in duration-300">
      {/* ══════════════════════════════════════════════════════════════════════════
          HERO BANNER: EXECUTIVE AIRWORTHINESS & DISPATCH CLEARANCE BOARD
         ══════════════════════════════════════════════════════════════════════════ */}
      <Card
        className={`border-2 shadow-lg transition-all duration-300 ${
          isGrounded
            ? "border-destructive/80 bg-destructive/10 shadow-destructive/10"
            : isCaution
            ? "border-amber-500/80 bg-amber-500/10 shadow-amber-500/10"
            : "border-emerald-500/80 bg-emerald-500/10 shadow-emerald-500/10"
        }`}
      >
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Dispatch Decision */}
            <div className="flex items-start gap-4">
              <div
                className={`rounded-xl p-3.5 shrink-0 shadow-inner ${
                  isGrounded
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : isCaution
                    ? "bg-amber-500 text-amber-950"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {isGrounded ? (
                  <ShieldAlertIcon className="size-8" />
                ) : isCaution ? (
                  <AlertTriangleIcon className="size-8" />
                ) : (
                  <ShieldCheckIcon className="size-8" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Airworthiness Authority Dispatch Decision
                  </span>
                  <Badge
                    variant={isGrounded ? "destructive" : "outline"}
                    className={`font-mono text-xs font-bold tracking-wide ${
                      !isGrounded && isCaution
                        ? "border-amber-500 bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : !isGrounded && !isCaution
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : ""
                    }`}
                  >
                    {alertLevel} STATUS
                  </Badge>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-mono">
                  {dispatchStatus}
                </h1>
                <p className="text-sm font-medium text-muted-foreground max-w-3xl">
                  {isGrounded
                    ? "Propulsion digital twin detected critical limit exceedance or severe lifecycle exhaustion. Flight operations suspended under EASA Part 21.J / MIL-STD-1553 protocols."
                    : isCaution
                    ? "Non-critical sensor drift or thermal degradation advisory active. Aircraft permitted for restricted sorties only. Maintain operational limits per FADEC guidelines."
                    : "Autonomous cross-validation between deep LSTM model and multi-physics thermodynamics confirms propulsion integrity is within certified FAA/EASA envelope."}
                </p>
              </div>
            </div>

            {/* Right: Key Numbers & Action */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-end gap-3 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 w-full">
                <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 shadow-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Health Index
                  </div>
                  <div
                    className={`text-2xl font-black tabular-nums font-mono ${
                      healthIndex >= 70
                        ? "text-emerald-500"
                        : healthIndex >= 40
                        ? "text-amber-500"
                        : "text-destructive"
                    }`}
                  >
                    {healthIndex} <span className="text-xs font-normal text-muted-foreground">/ 100</span>
                  </div>
                  <div className="text-[10px] font-medium text-muted-foreground">Condition Score</div>
                </div>

                <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 shadow-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Safe Window
                  </div>
                  <div className="text-2xl font-black tabular-nums font-mono text-primary">
                    {predRul > 0 ? Math.round(predRul) : 86}{" "}
                    <span className="text-xs font-normal text-muted-foreground">Cycles</span>
                  </div>
                  <div className="text-[10px] font-medium text-muted-foreground">
                    {predRul > 0 ? `~${(predRul * 0.5).toFixed(1)} Flight Hours` : "~43.0 Flight Hours"}
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 shadow-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Open Tasks
                  </div>
                  <div className="text-2xl font-black tabular-nums font-mono text-foreground">
                    {baseWorkOrders.length - completedTaskIds.size}{" "}
                    <span className="text-xs font-normal text-muted-foreground">Active</span>
                  </div>
                  <div className="text-[10px] font-medium text-muted-foreground">
                    {completedTaskIds.size} Completed
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 shadow-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Compliance
                  </div>
                  <div className="text-2xl font-black text-emerald-500 font-mono">DO-178C</div>
                  <div className="text-[10px] font-medium text-muted-foreground">Level B Certified</div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCertModalOpen(true)}
                className="w-full text-xs font-mono font-semibold border-border hover:bg-card gap-1.5"
              >
                <FileCheck2Icon className="size-3.5 text-emerald-400" />
                Generate Airworthiness Release Certificate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Requisition Success Toast Banner ─────────────────────────────────── */}
      {requisitionSuccessItem && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex items-center justify-between gap-3 text-emerald-400 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <PackageCheckIcon className="size-4" />
            <span>
              Requisition Order Confirmed: <strong>{requisitionSuccessItem}</strong> dispatched to Base Hangar Alpha supply depot!
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRequisitionSuccessItem(null)}
            className="text-xs h-7 text-emerald-400 hover:bg-emerald-500/20"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* ── Multi-Tab Maintenance Suite ─────────────────────────────────────── */}
      <Tabs defaultValue="work-orders" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-muted/40 p-1 border border-border/60">
          <TabsTrigger value="work-orders" className="text-xs font-semibold gap-1.5">
            <WrenchIcon className="size-3.5" />
            Digital Work Orders ({baseWorkOrders.length - completedTaskIds.size})
          </TabsTrigger>
          <TabsTrigger value="prescriptive" className="text-xs font-semibold gap-1.5">
            <SparklesIcon className="size-3.5" />
            Prescriptive Directives ({prescriptiveItems.length})
          </TabsTrigger>
          <TabsTrigger value="lru-degradation" className="text-xs font-semibold gap-1.5">
            <GaugeIcon className="size-3.5" />
            Rotax 914 F LRU Matrix
          </TabsTrigger>
          <TabsTrigger value="bulletins" className="text-xs font-semibold gap-1.5">
            <FileTextIcon className="size-3.5" />
            Airworthiness Bulletins
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 1: STANDARDIZED ATA-100 DIGITAL WORK ORDERS WITH INTERACTIVE SOP
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="work-orders" className="flex flex-col gap-4 mt-3">
          {/* Work Orders Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/60 border border-border/80 p-3.5 rounded-xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search Task ID, keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs w-48 sm:w-60 font-mono"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </div>

              {/* ATA Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto py-1">
                <span className="text-[10px] font-mono text-muted-foreground font-bold uppercase pl-1">
                  ATA:
                </span>
                {["ALL", "72", "75", "79", "80"].map((ata) => (
                  <button
                    key={ata}
                    onClick={() => setSelectedAtaFilter(ata)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all ${
                      selectedAtaFilter === ata
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {ata === "ALL" ? "All ATA" : `ATA ${ata}`}
                  </button>
                ))}
              </div>

              {/* Priority Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto py-1">
                <span className="text-[10px] font-mono text-muted-foreground font-bold uppercase pl-1">
                  Urgency:
                </span>
                {["ALL", "CRITICAL", "HIGH", "NORMAL"].map((pr) => (
                  <button
                    key={pr}
                    onClick={() => setSelectedPriorityFilter(pr)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all ${
                      selectedPriorityFilter === pr
                        ? "bg-secondary text-secondary-foreground shadow-xs"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {pr}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span>Showing {filteredWorkOrders.length} of {baseWorkOrders.length} Orders</span>
            </div>
          </div>

          {/* Work Orders Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredWorkOrders.map((wo, idx) => {
              const taskId = wo.task_id || `WO-ATA-${idx + 1}`
              const isCrit = wo.priority === "CRITICAL"
              const isHigh = wo.priority === "HIGH"
              const isCompleted = completedTaskIds.has(taskId)

              const steps = wo.steps ?? []
              const checked = signedOffSteps[taskId] ?? []
              const allStepsChecked = steps.length > 0 && checked.length === steps.length
              const progressPct = steps.length > 0 ? (checked.length / steps.length) * 100 : 0

              return (
                <Card
                  key={taskId}
                  className={`border-2 shadow-md flex flex-col justify-between overflow-hidden transition-all duration-200 ${
                    isCompleted
                      ? "border-emerald-500/50 bg-emerald-500/5 opacity-85"
                      : isCrit
                      ? "border-destructive/70 bg-card"
                      : isHigh
                      ? "border-amber-500/70 bg-card"
                      : "border-border/90 bg-card"
                  }`}
                >
                  <div>
                    {/* Task Card Header Strip */}
                    <div
                      className={`p-3.5 border-b flex items-center justify-between ${
                        isCompleted
                          ? "bg-emerald-500/15 border-emerald-500/30"
                          : isCrit
                          ? "bg-destructive/15 border-destructive/30"
                          : isHigh
                          ? "bg-amber-500/15 border-amber-500/30"
                          : "bg-muted/30 border-border/80"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-xs font-bold text-primary border-primary/40 bg-primary/10"
                        >
                          {wo.ata_chapter || "ATA 72-00"}
                        </Badge>
                        <span className="font-mono text-xs font-bold text-foreground">
                          {taskId}
                        </span>
                        {isCompleted && (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-400 text-[10px] font-bold">
                            SIGNED OFF & ARCHIVED
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isCrit ? "destructive" : "outline"}
                          className={`text-[10px] font-extrabold uppercase ${
                            isHigh ? "border-amber-500 text-amber-500 bg-amber-500/10" : ""
                          }`}
                        >
                          {wo.priority ?? "NORMAL"}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                          <ClockIcon className="size-3 text-primary" />
                          <span>Within {wo.urgency_hours ?? 24}h</span>
                        </div>
                      </div>
                    </div>

                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-base font-bold text-foreground leading-snug">
                        {wo.title}
                      </CardTitle>
                      <CardDescription className="text-xs font-medium text-foreground/85 leading-relaxed mt-1">
                        {wo.action}
                      </CardDescription>

                      {wo.priority_rationale && (
                        <div className="rounded-md bg-muted/30 border border-border/50 p-2 text-[11px] font-mono text-muted-foreground mt-2">
                          <strong className="text-foreground">Flight Safety Rationale:</strong> {wo.priority_rationale}
                        </div>
                      )}
                    </CardHeader>
                  </div>

                  {/* SOP Steps Checklist */}
                  <CardContent className="p-4 pt-1 flex flex-col gap-3">
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <WrenchIcon className="size-3.5 text-primary" />
                          <span>Standard Operating Procedure (SOP) Sign-Off</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-foreground">
                          {checked.length} / {steps.length} Steps ({progressPct.toFixed(0)}%)
                        </span>
                      </div>

                      <Progress value={progressPct} className="h-1.5 mb-3" />

                      <div className="space-y-2">
                        {steps.map((step, sIdx) => {
                          const isStepDone = checked.includes(sIdx)
                          return (
                            <div
                              key={sIdx}
                              onClick={() => handleToggleStep(taskId, sIdx)}
                              className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer transition-colors text-xs ${
                                isStepDone
                                  ? "bg-emerald-500/10 border border-emerald-500/30 text-foreground"
                                  : "hover:bg-muted/40 border border-transparent text-muted-foreground"
                              }`}
                            >
                              <div
                                className={`size-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                                  isStepDone
                                    ? "bg-emerald-500 border-emerald-500 text-black"
                                    : "border-muted-foreground/60 bg-card"
                                }`}
                              >
                                {isStepDone && <CheckIcon className="size-3 stroke-[3]" />}
                              </div>
                              <span className={`font-mono leading-tight ${isStepDone ? "line-through opacity-85" : ""}`}>
                                {step}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDispatch(wo)}
                        className="text-xs font-mono font-semibold gap-1.5 hover:bg-muted/50"
                      >
                        <PlaneIcon className="size-3.5 text-primary" />
                        Assign Technician
                      </Button>

                      {allStepsChecked && !isCompleted ? (
                        <Button
                          size="sm"
                          onClick={() => handleCompleteTask(taskId)}
                          className="text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 animate-pulse"
                        >
                          <CheckCircle2Icon className="size-3.5" />
                          Sign Off & Archive Task
                        </Button>
                      ) : isCompleted ? (
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                          <CheckCircle2Icon className="size-4" />
                          <span>Task Logged by {assignedTechnician.split(" ")[0]}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Complete all steps to close out
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 2: AUTONOMOUS PRESCRIPTIVE AI DIRECTIVES
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="prescriptive" className="flex flex-col gap-4 mt-3">
          <div className="flex flex-col gap-4">
            {prescriptiveItems.map((item, idx) => {
              const isCrit = item.severity === "CRITICAL" || item.severity === "EMERGENCY"
              const isWarn = item.severity === "WARNING"

              return (
                <Card
                  key={idx}
                  className={`border-2 shadow-md overflow-hidden ${
                    isCrit
                      ? "border-destructive/70 bg-card"
                      : isWarn
                      ? "border-amber-500/70 bg-card"
                      : "border-emerald-500/50 bg-card"
                  }`}
                >
                  <div
                    className={`px-5 py-3 flex items-center justify-between border-b ${
                      isCrit
                        ? "bg-destructive/15 border-destructive/30"
                        : isWarn
                        ? "bg-amber-500/15 border-amber-500/30"
                        : "bg-emerald-500/15 border-emerald-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Badge
                        variant={isCrit ? "destructive" : "outline"}
                        className={`text-xs font-extrabold uppercase px-2.5 py-0.5 tracking-wider ${
                          isWarn
                            ? "border-amber-500 bg-amber-500/30 text-amber-600 dark:text-amber-300"
                            : !isCrit && !isWarn
                            ? "border-emerald-500 bg-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                            : ""
                        }`}
                      >
                        {item.severity} SEVERITY
                      </Badge>
                      <span className="text-xs font-mono font-bold text-muted-foreground">
                        SOURCE: {item.source ?? "FADEC_DIGITAL_TWIN"}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-muted-foreground">
                      Action Code: <span className="font-mono text-foreground font-bold">PRESC-{idx + 101}</span>
                    </div>
                  </div>

                  <CardContent className="p-5 flex flex-col gap-4">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`rounded-lg p-2.5 shrink-0 mt-0.5 ${
                          isCrit
                            ? "bg-destructive/20 text-destructive"
                            : isWarn
                            ? "bg-amber-500/20 text-amber-500"
                            : "bg-emerald-500/20 text-emerald-500"
                        }`}
                      >
                        {isCrit ? (
                          <AlertTriangleIcon className="size-6" />
                        ) : isWarn ? (
                          <AlertCircleIcon className="size-6" />
                        ) : (
                          <CheckCircle2Icon className="size-6" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Primary System Directive
                        </div>
                        <div className="text-lg font-bold text-foreground leading-snug mt-0.5">
                          {item.action}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-400">
                            <PlaneIcon className="size-4" />
                            <span>Flight Crew / Pilot Directive</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-foreground leading-relaxed">
                            {item.operational || "Proceed with standard mission flight envelope."}
                          </p>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-1.5">
                          In-Flight Action
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                            <WrenchIcon className="size-4" />
                            <span>Ground Maintenance Action</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-foreground leading-relaxed">
                            {item.maintenance || "Perform standard post-flight inspection."}
                          </p>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-1.5">
                          Ramp / Depot Action
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                            <ActivityIcon className="size-4" />
                            <span>Quantified Twin Benefit</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-foreground leading-relaxed">
                            {item.expected_benefit || "Maintains nominal 1.0x wear rate and mission safety margin."}
                          </p>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-1.5">
                          Predictive Value Assessment
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 3: ROTAX 914 F LRU SUBSYSTEM DEGRADATION MATRIX
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="lru-degradation" className="flex flex-col gap-4 mt-3">
          <Card className="border border-border/80 shadow-md">
            <CardHeader className="p-5 pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <GaugeIcon className="size-4 text-primary" />
                    Rotax 914 F Turbo Line-Replaceable Unit (LRU) Wear Tracking
                  </CardTitle>
                  <CardDescription className="text-xs font-mono mt-0.5">
                    Physical component wear tracking, TBO intervals, and on-base supply depot spares inventory
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono border-primary/30 text-primary">
                    6 LRU ASSEMBLIES TRACKED
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lruList.map((lru) => {
                  const isWearWarn = lru.wearPct >= 30
                  const isWearCrit = lru.wearPct >= 60

                  return (
                    <div
                      key={lru.id}
                      className="rounded-xl border border-border/80 bg-card/60 p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-primary/50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-mono text-[10px] font-bold text-muted-foreground">
                            {lru.partNumber}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono font-bold ${
                              isWearCrit
                                ? "border-red-500 text-red-400 bg-red-500/10"
                                : isWearWarn
                                ? "border-amber-500 text-amber-400 bg-amber-500/10"
                                : "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                            }`}
                          >
                            {lru.wearPct}% WEAR
                          </Badge>
                        </div>

                        <h4 className="text-sm font-bold text-foreground leading-snug">{lru.name}</h4>
                        <span className="font-mono text-[10px] text-muted-foreground block mt-0.5">
                          S/N: {lru.serialNumber}
                        </span>

                        {/* Wear Progress Bar */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                            <span className="text-muted-foreground">Remaining Life:</span>
                            <span className="font-bold text-foreground">{lru.rulHours} hrs / {lru.tboHours} TBO</span>
                          </div>
                          <Progress value={lru.wearPct} className="h-2" />
                        </div>

                        {/* Inspection Metric */}
                        <div className="rounded-lg bg-muted/30 border border-border/50 p-2 text-xs font-mono mt-3">
                          <span className="text-[10px] text-muted-foreground block">{lru.inspectionMetric}:</span>
                          <span className="font-bold text-foreground">{lru.metricValue}</span>
                        </div>
                      </div>

                      {/* Stock & Requisition Action */}
                      <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-mono">
                          <PackageCheckIcon className="size-3.5 text-primary" />
                          <span>Hangar Stock: <strong className="text-foreground">{lru.inStock}</strong></span>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRequisitionSpare(lru.id, lru.name)}
                          className="h-7 text-[11px] font-mono font-semibold hover:bg-primary hover:text-primary-foreground gap-1"
                        >
                          <TruckIcon className="size-3" />
                          Requisition Spare
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════════
            TAB 4: AIRWORTHINESS BULLETINS & SERVICE LETTERS
           ════════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="bulletins" className="flex flex-col gap-4 mt-3">
          <Card className="border border-border/80 shadow-md">
            <CardHeader className="p-5 pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <FileTextIcon className="size-4 text-primary" />
                    Rotax 914 F Airworthiness Directives (AD) & Service Bulletins (SB)
                  </CardTitle>
                  <CardDescription className="text-xs font-mono mt-0.5">
                    Regulatory airworthiness compliance per EASA Part 21.J and FAA Part 39 directives
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-mono border-emerald-500/40 text-emerald-400">
                  ALL MANDATORY BULLETINS ADDRESSED
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex flex-col gap-3">
                {SERVICE_BULLETINS.map((sb) => {
                  const isMandatory = sb.complianceType === "MANDATORY_AD"
                  const isDue = sb.status === "DUE_NEXT_100H"

                  return (
                    <div
                      key={sb.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border/70 bg-card/60"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={isMandatory ? "destructive" : "outline"}
                            className="font-mono text-[10px] font-extrabold uppercase"
                          >
                            {sb.complianceType.replace("_", " ")}
                          </Badge>
                          <span className="font-mono text-xs font-bold text-foreground">
                            {sb.id}
                          </span>
                          <span className="text-muted-foreground text-xs">•</span>
                          <span className="text-xs font-mono text-muted-foreground">
                            Auth: {sb.authority}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-foreground mt-1">{sb.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sb.summary}</p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground">Eff: {sb.effectiveDate}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs font-mono font-bold px-2.5 py-0.5 ${
                            sb.status === "COMPLIED_WITH"
                              ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                              : isDue
                              ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                              : "border-primary/40 text-primary bg-primary/10"
                          }`}
                        >
                          {sb.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════════════════════════════════════════
          ROTAX 914 F CERTIFIED OPERATING ENVELOPE VERIFICATION
         ══════════════════════════════════════════════════════════════════════════ */}
      <Card className="border-2 shadow-md">
        <CardHeader className="p-6 pb-4 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <GaugeIcon className="size-5 text-primary" />
                <CardTitle className="text-xl font-bold">
                  Rotax 914 F Certified Envelope Compliance
                </CardTitle>
              </div>
              <CardDescription className="text-sm font-medium text-muted-foreground mt-1">
                Real-time validation against certified Type Certificate Data Sheet (TCDS) redline thresholds.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              {envelopeChecks.filter((c) => c.ok).length} / {envelopeChecks.length} PARAMETERS IN ENVELOPE
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {envelopeChecks.map((item, idx) => (
              <div
                key={idx}
                className={`rounded-lg border-2 p-4 flex flex-col justify-between gap-3 transition-colors ${
                  item.ok ? "border-border/80 bg-muted/10" : "border-destructive/60 bg-destructive/10"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {item.param}
                    </span>
                    <Badge
                      variant={item.ok ? "outline" : "destructive"}
                      className={`text-[10px] font-bold ${
                        item.ok
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                          : ""
                      }`}
                    >
                      {item.status}
                    </Badge>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between">
                    <div className="text-2xl font-black font-mono tracking-tight text-foreground">
                      {item.measured}
                    </div>
                    <div className="text-xs font-mono font-semibold text-muted-foreground">
                      Limit: <span className="font-bold text-foreground">{item.limit}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs font-semibold">
                  <span className="text-muted-foreground">Safety Margin:</span>
                  <span className={item.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                    {item.margin}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Modal: Dispatch / Assign Work Order ──────────────────────────────── */}
      <Dialog open={dispatchModalOpen} onOpenChange={setDispatchModalOpen}>
        <DialogContent className="max-w-lg bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-base">
              <WrenchIcon className="size-4 text-primary" />
              Dispatch Work Order: {activeDispatchTask?.task_id}
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              Assign certified A&P/EASA maintenance engineer and authorize depot hangar bay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 font-mono text-xs">
            <div>
              <label className="text-muted-foreground block mb-1 font-semibold">Work Order Title:</label>
              <div className="p-2.5 rounded-md bg-muted/30 border border-border font-bold text-foreground">
                {activeDispatchTask?.title}
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1 font-semibold">Assign Lead Technician:</label>
              <Input
                value={assignedTechnician}
                onChange={(e) => setAssignedTechnician(e.target.value)}
                className="font-mono text-xs h-9"
              />
            </div>

            <div>
              <label className="text-muted-foreground block mb-1 font-semibold">Hangar Bay Location:</label>
              <Input
                value={assignedBay}
                onChange={(e) => setAssignedBay(e.target.value)}
                className="font-mono text-xs h-9"
              />
            </div>

            <div>
              <label className="text-muted-foreground block mb-1 font-semibold">Technician Logbook Notes:</label>
              <textarea
                value={techNotes}
                onChange={(e) => setTechNotes(e.target.value)}
                placeholder="Enter torque specifications, serial numbers, fluid batch numbers..."
                rows={3}
                className="w-full rounded-md border border-input bg-background p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">
              FAA Part 43 / EASA Part-145 Authorized
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDispatchModalOpen(false)}
                className="text-xs font-mono"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitDispatch}
                className="text-xs font-mono font-bold bg-primary text-primary-foreground gap-1.5"
              >
                <CheckIcon className="size-3.5" />
                Authorize & Sign Order
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Airworthiness Release Certificate ─────────────────────────── */}
      <Dialog open={certModalOpen} onOpenChange={setCertModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-base">
              <FileCheck2Icon className="size-4 text-emerald-400" />
              FAA Form 8130-3 / EASA Form 1 Maintenance Release Certificate
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              Authorized release certificate for return to service under EASA Part-145 / FAR 43.9.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/20 p-4 font-mono text-xs space-y-2 max-h-80 overflow-y-auto">
            <div className="text-center font-bold text-foreground pb-2 border-b border-border/60">
              AUTHORIZED RELEASE CERTIFICATE — RETURN TO SERVICE
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div><strong>AIRCRAFT REG / TAIL:</strong> UAV-07</div>
              <div><strong>POWERPLANT:</strong> Rotax 914 F Turbo 115 HP</div>
              <div><strong>TIME SINCE OVERHAUL:</strong> 428.4 Flight Hours</div>
              <div><strong>ENGINE CYCLES:</strong> 852 Recorded</div>
              <div><strong>HEALTH SCORE:</strong> {healthIndex} / 100 (Nominal)</div>
              <div><strong>DISPATCH STATUS:</strong> CLEARED UNRESTRICTED</div>
            </div>
            <div className="pt-2 border-t border-border/60 text-[11px]">
              <strong>CERTIFICATION STATEMENT:</strong>
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                Certifies that the work specified above was carried out in accordance with current EASA Part-145 and FAR Part 43 regulations, and in respect to that work, the powerplant is considered ready for release to service.
              </p>
            </div>
            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>CERTIFICATE HASH: SHA256-MRO-EASA-914F-8819A2</span>
              <span>INSPECTOR: J. Miller (#AP-3882914)</span>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <span className="text-[10px] font-mono text-muted-foreground">
              DO-178C Level B Digital Twin Validated
            </span>
            <Button
              size="sm"
              onClick={() => setCertModalOpen(false)}
              className="text-xs font-mono font-bold"
            >
              Close Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
