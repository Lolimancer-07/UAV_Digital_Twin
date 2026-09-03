"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ActivityIcon, GaugeIcon, ShieldCheckIcon, ZapIcon } from "lucide-react"

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>ENGINE HEALTH INDEX</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            94 / 100
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ShieldCheckIcon /> NOMINAL
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
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>ESTIMATED REMAINING LIFE</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            1,184 cycles
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ActivityIcon /> MODEL LIVE
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
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>BRAKE POWER OUTPUT</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            112.8 BHP
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <GaugeIcon /> NOMINAL
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
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>DIAGNOSTIC ALARMS</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            0 ALARMS
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <ZapIcon /> WITHIN 3σ
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
    </div>
  )
}
