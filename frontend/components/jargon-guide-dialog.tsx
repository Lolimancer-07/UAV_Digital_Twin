"use client"

import * as React from "react"
import {
  BookOpenIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  SearchIcon,
  SparklesIcon,
  LayersIcon,
  CpuIcon,
  FlameIcon,
  WrenchIcon,
  ShieldCheckIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

interface TermItem {
  id: string
  term: string
  name: string
  category: "Thermodynamics" | "AI & Prognostics" | "Avionics & CAN" | "Standards & Maintenance"
  layman: string
  technical: string
  nominalRange: string
  formula?: string
}

const JARGON_DICTIONARY: TermItem[] = [
  {
    id: "imep",
    term: "IMEP",
    name: "Indicated Mean Effective Pressure",
    category: "Thermodynamics",
    layman: "The total theoretical push generated inside the engine cylinders by exploding fuel, before internal mechanical friction steals any power.",
    technical: "Average pressure exerted on the piston face over the complete four-stroke cycle, calculated from indicated work divided by swept displacement.",
    nominalRange: "8.5 – 12.0 bar (varies with MAP)",
    formula: "IMEP = W_indicated / V_swept",
  },
  {
    id: "bmep",
    term: "BMEP",
    name: "Brake Mean Effective Pressure",
    category: "Thermodynamics",
    layman: "The actual, usable pressure delivered to turn the propeller shaft after friction losses. The gold standard for measuring aero engine power efficiency.",
    technical: "Effective working pressure corresponding to net brake power output at the propeller reduction drive: BMEP = IMEP × Mechanical Efficiency.",
    nominalRange: "7.0 – 10.5 bar at cruise power",
    formula: "BMEP = (2 × π × Torque) / V_swept",
  },
  {
    id: "bsfc",
    term: "BSFC",
    name: "Brake Specific Fuel Consumption",
    category: "Thermodynamics",
    layman: "Fuel efficiency rating: how many grams of aviation fuel the engine burns to produce one kilowatt of power for one hour. Lower numbers mean longer loiter time.",
    technical: "Ratio of fuel mass consumption rate to delivered shaft power. Aero piston engines target 270–310 g/(kW·h) at optimum lean-of-peak cruise.",
    nominalRange: "260 – 320 g/(kW·h)",
    formula: "BSFC = Fuel Mass Flow Rate / Brake Power",
  },
  {
    id: "cht",
    term: "CHT",
    name: "Cylinder Head Temperature",
    category: "Thermodynamics",
    layman: "How hot the metal cylinder caps are. If this gets too hot, the aluminum softens, warps, and the engine can seize in flight.",
    technical: "Bulk temperature of aluminum cylinder heads measured at the spark plug gasket or blind well. Sustained temperatures > 430°F trigger structural deformation.",
    nominalRange: "320°F – 410°F (Max continuous: 430°F)",
  },
  {
    id: "egt",
    term: "EGT",
    name: "Exhaust Gas Temperature",
    category: "Thermodynamics",
    layman: "The temperature of burning gases rushing out the tailpipe. Tells pilots instantly whether fuel mixture is too lean, too rich, or if a spark plug failed.",
    technical: "Exhaust gas stagnation temperature in each cylinder runner. Peaking EGT marks stoichiometric burn; cold drops indicate cylinder misfire or valve blow-by.",
    nominalRange: "1380°F – 1580°F (Peak threshold: 1650°F)",
  },
  {
    id: "rul",
    term: "RUL",
    name: "Remaining Useful Life",
    category: "AI & Prognostics",
    layman: "An AI countdown clock showing how many more safe flight cycles or hours the engine can fly before requiring depot maintenance or overhaul.",
    technical: "Expected continuous time or discrete mission cycles prior to operational failure limit, predicted via sequence-to-scalar Long Short-Term Memory (LSTM).",
    nominalRange: "0 – 260 flight cycles",
  },
  {
    id: "mc-dropout",
    term: "MC-Dropout",
    name: "Monte Carlo Dropout",
    category: "AI & Prognostics",
    layman: "A technique where the AI tests itself 20 times with slight random variations to calculate how confident it is in its prediction, producing a true safety margin.",
    technical: "Bayesian approximation performing N=20 stochastic forward passes at test time with Bernoulli dropout p=0.20 to infer epistemic model uncertainty bands.",
    nominalRange: "90% Confidence Interval: ±8 to ±18 cycles",
    formula: "Var(y) = (1/N) ∑ (y_n - μ)^2 + σ_aleatoric^2",
  },
  {
    id: "isolation-forest",
    term: "Isolation Forest",
    name: "Unsupervised Anomaly Detection",
    category: "AI & Prognostics",
    layman: "An AI algorithm that isolates weird sensor behavior by seeing how quickly an observation can be separated from normal cluster patterns.",
    technical: "Tree ensemble partitioning high-dimensional telemetry space. Shorter path lengths across random decision splits signify anomalous operational states.",
    nominalRange: "Score: 0.0 – 0.5 (Nominal) | > 0.65 (Anomaly)",
  },
  {
    id: "xai",
    term: "XAI",
    name: "Explainable AI & Feature Attribution",
    category: "AI & Prognostics",
    layman: "Instead of being a mysterious black box, the AI shows exactly which sensor caused an alarm and explains the physical problem in plain English.",
    technical: "Multi-dimensional z-score and SHAP-aligned feature attribution decomposition mapping multivariate anomalies back to physical sensor variances.",
    nominalRange: "Sum of feature attributions normalized to 100.0%",
  },
  {
    id: "weibull",
    term: "Weibull Hazard",
    name: "Reliability & Hazard Rate λ(t)",
    category: "AI & Prognostics",
    layman: "A statistical curve showing where the engine is in its lifespan: the break-in stage, the reliable middle age, or the steep wear-out phase.",
    technical: "Parametric reliability function modeling time-dependent hazard rate λ(t) = (β/η)(t/η)^(β-1), where β > 1 indicates mechanical fatigue accumulation.",
    nominalRange: "Shape β: 1.0 (constant hazard) to 3.2 (wear-out)",
    formula: "R(t) = exp(-(t/η)^β)",
  },
  {
    id: "can",
    term: "SAE J1939 / CAN",
    name: "Controller Area Network Flight Bus",
    category: "Avionics & CAN",
    layman: "The rugged digital nervous system inside the aircraft that carries sensor data and control commands between the flight computer and engine.",
    technical: "High-integrity two-wire differential serial bus protocol (CAN 2.0B / SAE J1939) operating at 500 kbps with 29-bit arbitration IDs and 8-byte frames.",
    nominalRange: "500 kbit/s, 10 Hz burst broadcast",
  },
  {
    id: "ata-100",
    term: "ATA-100",
    name: "Air Transport Association Specification",
    category: "Standards & Maintenance",
    layman: "The universal aviation numbering system used worldwide so mechanics instantly know which system a work order belongs to (ATA 72 = Engine Core, ATA 79 = Oil, etc.).",
    technical: "Standardized aircraft technical data numbering schema organizing aircraft maintenance documentation, troubleshooting logs, and flight line work orders.",
    nominalRange: "ATA 72 (Core), 73 (Fuel), 75 (Cooling), 77 (Indicating), 79 (Oil), 80 (Ignition)",
  },
]

export function JargonGuideDialog() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState<string>("All")

  const categories = ["All", "Thermodynamics", "AI & Prognostics", "Avionics & CAN", "Standards & Maintenance"]

  const filteredTerms = React.useMemo(() => {
    return JARGON_DICTIONARY.filter((item) => {
      const matchesCategory = category === "All" || item.category === category
      const q = query.toLowerCase()
      const matchesQuery =
        !q ||
        item.term.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.layman.toLowerCase().includes(q) ||
        item.technical.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [query, category])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary"
          >
            <BookOpenIcon className="size-3.5" />
            <span className="hidden sm:inline">Aero & AI Glossary</span>
            <span className="sm:hidden">Guide</span>
          </Button>
        }
      />
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 border-border/70 overflow-hidden">
        <DialogHeader className="p-5 border-b border-border/50 bg-card/60">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
              EXPLAINABLE TWIN
            </Badge>
            <DialogTitle className="text-lg font-bold">Aeronautics & AI Digital Twin Glossary</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Plain-English explanations and engineering formulas designed to make aero propulsion and AI prognostics accessible to judges and operators.
          </DialogDescription>

          {/* Search bar & filter tabs */}
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-full sm:flex-1">
              <SearchIcon className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search terms, formulas, or definitions (e.g., IMEP, RUL, CHT)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-8 text-xs font-sans"
              />
            </div>
            <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    category === cat
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable list of term cards */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-background/50">
          {filteredTerms.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No matching terminology found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filteredTerms.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/70 bg-card/80 p-4 shadow-xs transition-all hover:border-primary/40 hover:bg-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-primary">{item.term}</span>
                    <span className="text-xs font-semibold text-foreground">— {item.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                    {item.category}
                  </Badge>
                </div>

                {/* Layman Plain-English Section */}
                <div className="mt-2.5 flex items-start gap-2 rounded-md bg-primary/5 p-2.5 text-xs text-foreground/90 border border-primary/10">
                  <SparklesIcon className="size-4 shrink-0 text-primary mt-0.5" />
                  <div>
                    <span className="font-semibold text-primary">In Plain English: </span>
                    {item.layman}
                  </div>
                </div>

                {/* Technical Engineering Section */}
                <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Engineering Definition: </span>
                  {item.technical}
                </div>

                {/* Formula & Nominal Range footer */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2 text-[11px] font-mono">
                  {item.formula ? (
                    <div className="text-muted-foreground">
                      Formula: <code className="text-emerald-400">{item.formula}</code>
                    </div>
                  ) : (
                    <div />
                  )}
                  <div className="text-muted-foreground">
                    Nominal Limits: <span className="text-foreground font-semibold">{item.nominalRange}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
