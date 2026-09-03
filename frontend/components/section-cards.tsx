"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ActivityIcon, FileChartColumnIcon, GaugeIcon, ShieldCheckIcon, ZapIcon } from "lucide-react"

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:grid-cols-5 lg:px-6 dark:*:data-[slot=card]:bg-card">
      <Link href="/prognostics" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>ENGINE HEALTH INDEX</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            94 / 100
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ShieldCheckIcon data-icon="inline-start" /> NOMINAL
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            THRML 96% · LUBR 91%
          </div>
          <div className="text-muted-foreground">
            MECH 88% · ELEC 94%
          </div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/prognostics" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>ESTIMATED REMAINING LIFE</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            1,184 cycles
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ActivityIcon data-icon="inline-start" /> MODEL LIVE
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            TRUE: 1,120 · 95% CI [1,026 — 1,342]
          </div>
          <div className="text-muted-foreground">
            FADEC prediction window
          </div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/thermodynamics" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>BRAKE POWER OUTPUT</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            112.8 BHP
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <GaugeIcon data-icon="inline-start" /> NOMINAL
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            BSFC 238 g/kWh · η 31.4%
          </div>
          <div className="text-muted-foreground">          IMEP 8.42 bar</div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/maintenance" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>DIAGNOSTIC ALARMS</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            0 ALARMS
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ZapIcon data-icon="inline-start" /> WITHIN 3σ
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            NOMINAL STATUS
          </div>
          <div className="text-muted-foreground">          No active advisories</div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/flight-data" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>FLIGHT PROFILE</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            NORMAL ISR
          </CardTitle>
          <CardAction>
            <Badge variant="outline">CYCLE 00420</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">MET 00:42:18</div>
          <div className="text-muted-foreground">Mission profile active</div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/telemetry" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>TELEMETRY LINK</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">12 / 12 online</CardTitle>
          <CardAction><Badge variant="outline"><ActivityIcon data-icon="inline-start" /> 10 HZ LIVE</Badge></CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">0.00% PACKET LOSS</div>
          <div className="text-muted-foreground">All propulsion channels synchronized</div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/airworthiness" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>AIRWORTHINESS</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">VALID</CardTitle>
          <CardAction><Badge variant="outline"><ShieldCheckIcon data-icon="inline-start" /> RELEASED</Badge></CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">0 OPEN LIMITATIONS</div>
          <div className="text-muted-foreground">Certificate current · 184 days</div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/can" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>CAN BUS FDR</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">42.8%</CardTitle>
          <CardAction><Badge variant="outline"><ZapIcon data-icon="inline-start" /> RECORDING</Badge></CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">18,422 FRAMES / MIN</div>
          <div className="text-muted-foreground">No dropped frames or DTCs</div>
        </CardFooter>
      </Card>
      </Link>
      <Link href="/dossier" className="block transition-transform hover:-translate-y-0.5">
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription>DOSSIER EXPORT</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">READY</CardTitle>
          <CardAction><Badge variant="outline"><FileChartColumnIcon data-icon="inline-start" /> 14 SOURCES</Badge></CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">ALL DATA SYNCHRONIZED</div>
          <div className="text-muted-foreground">Last generated 09:41 UTC</div>
        </CardFooter>
      </Card>
      </Link>
    </div>
  )
}
