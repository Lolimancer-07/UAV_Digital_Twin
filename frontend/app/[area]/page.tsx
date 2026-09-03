import { notFound } from "next/navigation"
import { ModuleDetailPage } from "@/components/module-detail-page"
import { moduleDetails } from "@/lib/module-data"

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params
  const detail = moduleDetails[area]
  if (!detail) notFound()
  return <ModuleDetailPage detail={detail} />
}
