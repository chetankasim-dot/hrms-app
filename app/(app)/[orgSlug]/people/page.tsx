import { DashboardView } from "@/components/people/dashboard"
import { AddEmployees } from "@/components/people/add-employees"
import { getEmployeesDashboard } from "@/server/employees-dashboard"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]

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

  const canManage = ADMIN_ROLES.includes(session?.user?.role as string)

  return (
    <div className="space-y-4">
      {canManage && (
        <AddEmployees orgSlug={orgSlug} departments={data.departments} locations={data.locations} />
      )}
      <DashboardView data={data} orgSlug={orgSlug} />
    </div>
  )
}