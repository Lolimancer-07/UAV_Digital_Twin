import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ModuleDetailPage } from "@/components/module-detail-page"
import { moduleDetails } from "@/lib/module-data"

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const { area } = await params
  const detail = moduleDetails[area]
  if (!detail) return { title: "UAV-07 | Propulsion GCS" }
  return {
    title: `${detail.title} | UAV-07 Propulsion GCS`,
    description: detail.description,
  }
}

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params
  const detail = moduleDetails[area]
  if (!detail) notFound()
  return <ModuleDetailPage detail={detail} />
}
