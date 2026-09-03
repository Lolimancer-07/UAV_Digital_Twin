"use client"

import { Pie, PieChart } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartData = [
  { subsystem: "thermal", channels: 4, fill: "var(--color-thermal)" },
  { subsystem: "mechanical", channels: 3, fill: "var(--color-mechanical)" },
  { subsystem: "lubrication", channels: 3, fill: "var(--color-lubrication)" },
  { subsystem: "electrical", channels: 2, fill: "var(--color-electrical)" },
]

const chartConfig = {
  channels: { label: "Channels" },
  thermal: { label: "Thermal", color: "var(--chart-1)" },
  mechanical: { label: "Mechanical", color: "var(--chart-2)" },
  lubrication: { label: "Lubrication", color: "var(--chart-3)" },
  electrical: { label: "Electrical", color: "var(--chart-4)" },
} satisfies ChartConfig

export function TelemetryDistribution() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>TELEMETRY MATRIX</CardTitle>
        <CardDescription>12 synchronized channels by subsystem</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-75"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="channels"
              nameKey="subsystem"
              innerRadius={58}
              outerRadius={88}
              strokeWidth={3}
            />
            <ChartLegend
              content={<ChartLegendContent nameKey="subsystem" />}
              className="flex-wrap gap-x-4 gap-y-1"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
