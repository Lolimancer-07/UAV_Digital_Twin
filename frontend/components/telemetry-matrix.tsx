"use client"

import { ActivityIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const channels = [
  ["01", "ENGINE SPEED", "5,802", "RPM"], ["02", "CYL HEAD TEMP (AVG)", "356", "°F"],
  ["03", "EXHAUST GAS TEMP", "1,228", "°F"], ["04", "OIL GALLERY PRESSURE", "61.4", "PSI"],
  ["05", "OIL SUMP TEMP", "204", "°F"], ["06", "FUEL MASS FLOW", "32.8", "L/HR"],
  ["07", "FUEL RAIL PRESSURE", "3.42", "BAR"], ["08", "OVERALL VIBRATION RMS", "0.18", "G"],
  ["09", "VIBRATION KURTOSIS", "3.14", "K4"], ["10", "28V ELECTRICAL BUS", "27.8", "VDC"],
  ["11", "ALTERNATOR CURRENT LOAD", "18.6", "A"], ["12", "INJECTION TIMING", "14.2", "°BTDC"],
]

export function TelemetryMatrix() {
  return (
    <section className="px-4 lg:px-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground">LIVE SENSOR ARRAY</p>
          <h2 className="mt-1 text-lg font-semibold tracking-wide">TELEMETRY MATRIX <span className="font-normal text-muted-foreground">— 12 SYNCHRONIZED SENSOR CHANNELS @ 10 HZ</span></h2>
        </div>
        <Badge variant="outline" className="text-primary"><ActivityIcon /> 10.0 HZ · LIVE</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {channels.map(([id, label, value, unit], index) => (
          <Card key={id} className="rounded-md border-border/80 bg-card/80">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] tracking-[0.12em] text-muted-foreground"><span className="mr-2 font-mono text-primary">S-{id}</span>{label}</CardTitle>
              <Badge variant="outline" className="text-[9px] text-primary">NORM</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 font-mono text-2xl font-semibold">{value}<span className="text-xs font-normal text-muted-foreground">{unit}</span></div>
              <svg viewBox="0 0 120 24" preserveAspectRatio="none" className="mt-3 h-6 w-full text-primary" aria-label={`${label} sparkline`}>
                <polyline points={`0,${17 - index % 3} 15,${12 + index % 4} 30,${16 - index % 2} 45,${8 + index % 5} 60,${13 - index % 3} 75,${7 + index % 4} 90,${11 - index % 2} 120,${5 + index % 4}`} fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
