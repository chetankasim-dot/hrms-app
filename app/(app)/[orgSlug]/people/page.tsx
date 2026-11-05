import { DashboardView } from "@/components/people/dashboard"
import { getEmployeesDashboard } from "@/server/employees-dashboard"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"

export default async function EmployeesDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ department?: string; location?: string }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const session = await auth()

  let data
  try {
    data = await getEmployeesDashboard(
      orgSlug,
      { userId: session?.user?.id, orgId: session?.user?.orgId ?? undefined },
      { department: sp.department, location: sp.location }
    )
  } catch {
    notFound()
  }
  return <DashboardView data={data} orgSlug={orgSlug} />
}