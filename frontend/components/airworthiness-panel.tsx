"use client"

import * as React from "react"
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileCheck2,
  FileCode,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Info,
  Layers,
  Lock,
  Plane,
  Printer,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  UserCheck,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTelemetry } from "@/components/telemetry-provider"

// ─── Life-Limited Components Model ──────────────────────────────────────────

interface ComponentLifeLimit {
  id: string
  name: string
  ata: string
  serialNo: string
  tsnHours: number
  limitHours: number
  tsoHours: number
  limitOvhHours: number
  cycles: number
  status: "AIRWORTHY" | "INSPECTION_DUE" | "CRITICAL"
}

const LIFE_LIMITED_PARTS: ComponentLifeLimit[] = [
  {
    id: "ENG-01",
    name: "Rotax 914 F Turbocharged Engine Core",
    ata: "ATA 72",
    serialNo: "RTX-914F-88492",
    tsnHours: 248.6,
    limitHours: 2000.0,
    tsoHours: 248.6,
    limitOvhHours: 1200.0,
    cycles: 128,
    status: "AIRWORTHY",
  },
  {
    id: "TC-01",
    name: "Garrett T25 Liquid-Cooled Turbocharger",
    ata: "ATA 81",
    serialNo: "GRT-T25-44109",
    tsnHours: 248.6,
    limitHours: 1000.0,
    tsoHours: 248.6,
    limitOvhHours: 1000.0,
    cycles: 128,
    status: "AIRWORTHY",
  },
  {
    id: "RGB-01",
    name: "Propeller Reduction Gearbox (i=2.43)",
    ata: "ATA 72-10",
    serialNo: "RGB-914-11024",
    tsnHours: 248.6,
    limitHours: 1000.0,
    tsoHours: 248.6,
    limitOvhHours: 1000.0,
    cycles: 128,
    status: "AIRWORTHY",
  },
  {
    id: "PROP-01",
    name: "Carbon-Fiber 2-Blade Pusher Propeller",
    ata: "ATA 61",
    serialNo: "PRP-CF2-99042",
    tsnHours: 248.6,
    limitHours: 1500.0,
    tsoHours: 248.6,
    limitOvhHours: 1500.0,
    cycles: 128,
    status: "AIRWORTHY",
  },
  {
    id: "FP-01",
    name: "Dual High-Pressure Pierburg Fuel Pumps",
    ata: "ATA 73",
    serialNo: "PMP-73-00491",
    tsnHours: 248.6,
    limitHours: 600.0,
    tsoHours: 248.6,
    limitOvhHours: 600.0,
    cycles: 128,
    status: "AIRWORTHY",
  },
]

// ─── Airworthiness Directives (AD) & Service Bulletins (SB) ─────────────────

interface ComplianceDirective {
  id: string
  type: "AD" | "SB"
  number: string
  title: string
  issuingBody: "FAA" | "EASA" | "ROTAX"
  effectiveDate: string
  complianceStatus: "COMPLIED_WITH" | "NEXT_DUE" | "OVERDUE"
  recurringInterval: string
  lastCompliedHours: number
  nextDueHours: number
}

const DIRECTIVES: ComplianceDirective[] = [
  {
    id: "DIR-01",
    type: "AD",
    number: "AD 2026-04-12",
    title: "Turbocharger Wastegate Electronic Actuator Arm Play Verification",
    issuingBody: "EASA",
    effectiveDate: "12 Apr 2026",
    complianceStatus: "COMPLIED_WITH",
    recurringInterval: "Every 100 Flight Hours",
    lastCompliedHours: 200.0,
    nextDueHours: 300.0,
  },
  {
    id: "DIR-02",
    type: "AD",
    number: "AD 2026-07-02",
    title: "High-Pressure Fuel Injection Delivery Hose Assembly Clamp Retorque",
    issuingBody: "FAA",
    effectiveDate: "02 Jul 2026",
    complianceStatus: "COMPLIED_WITH",
    recurringInterval: "Every 50 Flight Hours",
    lastCompliedHours: 240.0,
    nextDueHours: 290.0,
  },
  {
    id: "DIR-03",
    type: "SB",
    number: "SB-914-034 R2",
    title: "Dual Capacitive Discharge Ignition (CDI) Harness High-Voltage Resistance",
    issuingBody: "ROTAX",
    effectiveDate: "18 May 2026",
    complianceStatus: "COMPLIED_WITH",
    recurringInterval: "Every 100 Flight Hours",
    lastCompliedHours: 200.0,
    nextDueHours: 300.0,
  },
  {
    id: "DIR-04",
    type: "SB",
    number: "SB-914-039",
    title: "Carburetor Float Chamber Buoyancy & Needle Valve Seat Wear Inspection",
    issuingBody: "ROTAX",
    effectiveDate: "15 Aug 2026",
    complianceStatus: "NEXT_DUE",
    recurringInterval: "Every 50 Flight Hours",
    lastCompliedHours: 200.0,
    nextDueHours: 250.0,
  },
]

// ─── Minimum Equipment List (MEL) Dispatch Check ────────────────────────────

interface MelItem {
  code: string
  subsystem: string
  requiredCount: number
  installedCount: number
  dispatchCondition: "GO" | "GO_IF_REDUNDANT" | "NO_GO"
  notes: string
}

const MEL_ITEMS: MelItem[] = [
  { code: "MEL-24-01", subsystem: "28V DC Primary Generator & Lithium Battery", requiredCount: 1, installedCount: 2, dispatchCondition: "GO", notes: "Dual battery bus verified nominal" },
  { code: "MEL-31-01", subsystem: "Crash-Survivable Flight Data Recorder (CSMU)", requiredCount: 1, installedCount: 1, dispatchCondition: "GO", notes: "TSO-C124b solid-state NVM active" },
  { code: "MEL-34-01", subsystem: "Dual High-Rate CAN Bus Transceivers (A & B)", requiredCount: 1, installedCount: 2, dispatchCondition: "GO_IF_REDUNDANT", notes: "Differential 120Ω bus lines online" },
  { code: "MEL-73-01", subsystem: "Dual High-Pressure Injection Fuel Pumps", requiredCount: 1, installedCount: 2, dispatchCondition: "GO_IF_REDUNDANT", notes: "Automatic switchover test passed" },
  { code: "MEL-77-01", subsystem: "Quad Cylinder Head Temperature Sensors (CHT 1-4)", requiredCount: 4, installedCount: 4, dispatchCondition: "GO", notes: "All cylinder channels calibrated" },
  { code: "MEL-34-02", subsystem: "Multi-Spectral EO/IR Optical Turret Gimbal", requiredCount: 0, installedCount: 1, dispatchCondition: "GO", notes: "Non-flight critical mission payload" },
]

// ─── Main Airworthiness Panel Component ───────────────────────────────────────

export function AirworthinessPanel() {
  const { latestTelemetry } = useTelemetry()
  const activeUavId = latestTelemetry?.uav_id ?? "UAV-01"

  // Certificate Modal & Stamp State
  const [certModalOpen, setCertModalOpen] = React.useState(false)
  const [signModalOpen, setSignModalOpen] = React.useState(false)
  const [signerName, setSignerName] = React.useState("A. Mehta, Lead Propulsion Inspector")
  const [inspectorLicense, setInspectorLicense] = React.useState("FAA A&P 449210-IA")
  const [signedStamp, setSignedStamp] = React.useState<string | null>(
    "EASA-FORM-1-2026-88492-CERTIFIED"
  )
  const [signedDate, setSignedDate] = React.useState("22 Oct 2026, 01:45 UTC")
  const [searchTerm, setSearchTerm] = React.useState("")

  const handleSignRelease = () => {
    const stamp = `CERT-AUTH-${Date.now().toString(16).toUpperCase()}`
    setSignedStamp(stamp)
    setSignedDate(new Date().toUTCString())
    setSignModalOpen(false)
  }

  const printCertificate = () => {
    window.print()
  }

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto w-full font-sans select-none">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 1. TOP AIRWORTHINESS RELEASE STATUS BANNER ─────────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 backdrop-blur-md shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <ShieldCheck className="size-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Airworthiness & Release Certification
                </h1>
                <Badge variant="outline" className="text-[10px] font-mono font-bold text-emerald-400 border-emerald-500/40 bg-emerald-500/15">
                  AUTHORIZED FOR FLIGHT
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Standard Airworthiness Certificate · FAR Part 21 & EASA CS-LUAV Compliant · {activeUavId} Rotax 914 F Turbo
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCertModalOpen(true)}
              className="h-8 gap-1.5 font-mono text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/15"
            >
              <FileCheck2 className="size-3.5" />
              <span>EASA Form 1 / 8130-3</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setSignModalOpen(true)}
              className="h-8 gap-1.5 font-mono text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs"
            >
              <Stamp className="size-3.5" />
              <span>Sign Release</span>
            </Button>
          </div>
        </div>

        {/* 4 Quick Airworthiness KPI Pills */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5 border-t border-emerald-500/20 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-background/60 border border-border/70">
            <div className="text-[10px] text-muted-foreground uppercase">Airframe Flight Time</div>
            <div className="text-base font-bold text-foreground mt-0.5">248.6 hrs TSN</div>
            <div className="text-[10px] text-muted-foreground">128 Complete Cycles</div>
          </div>
          <div className="p-2.5 rounded-lg bg-background/60 border border-border/70">
            <div className="text-[10px] text-muted-foreground uppercase">Open Limitations</div>
            <div className="text-base font-bold text-emerald-400 mt-0.5">0 Open Limits</div>
            <div className="text-[10px] text-muted-foreground">Full Envelope Cleared</div>
          </div>
          <div className="p-2.5 rounded-lg bg-background/60 border border-border/70">
            <div className="text-[10px] text-muted-foreground uppercase">Certificate Expiry</div>
            <div className="text-base font-bold text-foreground mt-0.5">184 Days Left</div>
            <div className="text-[10px] text-muted-foreground">Valid to 18 Mar 2027</div>
          </div>
          <div className="p-2.5 rounded-lg bg-background/60 border border-border/70">
            <div className="text-[10px] text-muted-foreground uppercase">Release Sign-off</div>
            <div className="text-base font-bold text-cyan-400 mt-0.5">A. Mehta, IA</div>
            <div className="text-[10px] text-muted-foreground">Digital Seal Valid</div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 2. COMPONENT LIFE LIMITS & TIME SINCE NEW / OVERHAUL ──────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Card className="rounded-xl border border-border/80 bg-card/85 overflow-hidden shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3.5 px-5 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">
                Life-Limited Parts (LLP) & Overhaul Tracking
              </CardTitle>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Time Since New (TSN), Time Since Overhaul (TSO), and cycles for Rotax 914 F major assemblies.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30 w-fit">
            TBO LIMIT: 2,000 HRS
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="px-4 py-2.5">Component / Assembly</th>
                  <th className="px-4 py-2.5">ATA</th>
                  <th className="px-4 py-2.5">Serial Number</th>
                  <th className="px-4 py-2.5 text-right">TSN (Hrs)</th>
                  <th className="px-4 py-2.5 text-right">Hours to Overhaul</th>
                  <th className="px-4 py-2.5">Life Consumed</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {LIFE_LIMITED_PARTS.map((part) => {
                  const remOvh = part.limitOvhHours - part.tsoHours
                  const pct = Math.round((part.tsoHours / part.limitOvhHours) * 100)
                  return (
                    <tr key={part.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-sans font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Plane className="size-3.5 text-primary flex-shrink-0" />
                          <span>{part.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{part.ata}</td>
                      <td className="px-4 py-3 font-bold text-foreground">{part.serialNo}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {part.tsnHours.toFixed(1)} h
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">
                        {remOvh.toFixed(1)} h
                      </td>
                      <td className="px-4 py-3 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        >
                          {part.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 3. AIRWORTHINESS DIRECTIVES (AD) & SERVICE BULLETINS (SB) ─────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: AD & SB Compliance Matrix */}
        <Card className="rounded-xl border border-border/80 bg-card/85 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-cyan-400" />
              <span className="font-bold text-sm text-foreground">
                Airworthiness Directives & Service Bulletins
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-cyan-400 border-cyan-500/30">
              100% COMPLIANT
            </Badge>
          </div>

          <div className="mt-4 flex flex-col gap-2.5 font-mono text-xs">
            {DIRECTIVES.map((d) => (
              <div
                key={d.id}
                className="p-3 rounded-xl border border-border/70 bg-background/80 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary">{d.number}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono text-muted-foreground">
                      {d.issuingBody}
                    </Badge>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 font-mono ${
                      d.complianceStatus === "COMPLIED_WITH"
                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                        : "border-amber-500/30 text-amber-400 bg-amber-500/10"
                    }`}
                  >
                    {d.complianceStatus === "COMPLIED_WITH" ? "COMPLIED WITH" : "NEXT DUE IN 1.4h"}
                  </Badge>
                </div>
                <div className="font-sans text-xs text-foreground font-medium">
                  {d.title}
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                  <span>Interval: {d.recurringInterval}</span>
                  <span>Next Due: {d.nextDueHours}h (Current 248.6h)</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Right: Minimum Equipment List (MEL) Dispatch Check */}
        <Card className="rounded-xl border border-border/80 bg-card/85 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span className="font-bold text-sm text-foreground">
                Minimum Equipment List (MEL) Dispatch Clearance
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-emerald-400 border-emerald-500/30">
              DISPATCH CLEARED
            </Badge>
          </div>

          <div className="mt-4 flex flex-col gap-2 font-mono text-xs">
            {MEL_ITEMS.map((item) => (
              <div
                key={item.code}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-background/80"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary text-[11px]">{item.code}</span>
                    <span className="font-sans font-medium text-foreground text-xs">{item.subsystem}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{item.notes}</div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-2 py-0.5 font-mono font-bold ${
                    item.dispatchCondition === "GO"
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                      : "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                  }`}
                >
                  {item.dispatchCondition}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 4. EASA FORM 1 / FAA 8130-3 CERTIFICATE MODAL ───────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {certModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col gap-4 font-mono text-xs max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-emerald-400" />
                <span className="font-bold text-sm text-foreground">
                  EASA Form 1 / FAA Form 8130-3 Authorized Release Certificate
                </span>
              </div>
              <button
                onClick={() => setCertModalOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Official Certificate Paper Simulation */}
            <div className="border border-border/80 bg-background rounded-xl p-6 font-sans text-xs space-y-4 shadow-inner">
              <div className="flex items-center justify-between border-b-2 border-primary/30 pb-3">
                <div>
                  <div className="font-bold text-sm text-foreground uppercase tracking-wide">
                    AUTHORIZED RELEASE CERTIFICATE · AIRWORTHINESS APPROVAL
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    EASA Form 1 / FAA Form 8130-3 Dual Release
                  </div>
                </div>
                <div className="font-mono text-right text-xs">
                  <div className="font-bold text-primary">TRACKING NO: WO-2026-914F-88</div>
                  <div className="text-[10px] text-muted-foreground">STATE OF REGISTRY: IN / DGCA</div>
                </div>
              </div>

              {/* Certificate Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-[11px]">
                <div className="p-2 rounded border border-border/60 bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">1. Approving Competent Authority</span>
                  <div className="font-bold text-foreground">DGCA / FAA BILATERAL</div>
                </div>
                <div className="p-2 rounded border border-border/60 bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">2. Form 1 Tracking Number</span>
                  <div className="font-bold text-foreground">UAV07-88492-REL-01</div>
                </div>
                <div className="p-2 rounded border border-border/60 bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">3. Organization Name & Address</span>
                  <div className="font-bold text-foreground">Aero-Digital Twin Maintenance Org</div>
                </div>
                <div className="p-2 rounded border border-border/60 bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">4. Work Order / Contract</span>
                  <div className="font-bold text-foreground">PO-2026-ISR-0420</div>
                </div>
                <div className="p-2 rounded border border-border/60 bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">5. Item Description</span>
                  <div className="font-bold text-foreground">Rotax 914 F MALE UAV Engine Core</div>
                </div>
                <div className="p-2 rounded border border-border/60 bg-muted/20">
                  <span className="text-[9px] text-muted-foreground uppercase">6. Part Number & Serial</span>
                  <div className="font-bold text-foreground">914F-CORE · SN 88492</div>
                </div>
              </div>

              {/* Statement of Airworthiness */}
              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs">
                <div className="font-bold font-mono text-emerald-300 mb-1">
                  Certifies that the whole work specified was carried out in accordance with Part-M / Part-145:
                </div>
                <div>
                  "The aircraft assembly identified above was inspected, tested, and found to be in condition for safe operation and conforms to the approved type design specifications."
                </div>
              </div>

              {/* Signature Block */}
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/60 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground">Authorized Signature & Inspector Stamp:</span>
                  <div className="mt-1 font-bold text-cyan-400">{signedStamp}</div>
                  <div className="text-[11px] text-foreground font-semibold">{signerName}</div>
                  <div className="text-[10px] text-muted-foreground">License: {inspectorLicense}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground">Date of Signature:</span>
                  <div className="mt-1 font-bold text-foreground">{signedDate}</div>
                  <div className="text-[10px] text-emerald-400 font-bold">STATUS: SIGNED & VALID</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <Button size="sm" variant="outline" onClick={printCertificate} className="gap-1 font-mono text-xs">
                <Printer className="size-3.5" />
                Print Certificate
              </Button>
              <Button size="sm" onClick={() => setCertModalOpen(false)}>
                Close Viewer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ── 5. SIGN RELEASE AUTHORIZATION MODAL ─────────────────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {signModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col gap-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Stamp className="size-4 text-emerald-400" />
                <span className="font-bold text-sm text-foreground">
                  Sign Airworthiness Release Authorization
                </span>
              </div>
              <button
                onClick={() => setSignModalOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 font-sans text-xs">
              <div>
                <label className="text-[11px] font-mono text-muted-foreground font-bold">Inspector Name & Title</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-muted-foreground font-bold">A&P License / Inspection Authorization (IA)</label>
                <input
                  type="text"
                  value={inspectorLicense}
                  onChange={(e) => setInspectorLicense(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-hidden"
                />
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200 text-[11px]">
                By stamping this release, you certify that UAV-07 has met all airworthiness criteria with zero open limitations and is authorized for active mission dispatch.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60 font-mono">
              <Button size="sm" variant="ghost" onClick={() => setSignModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSignRelease}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                Apply Cryptographic Stamp
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
