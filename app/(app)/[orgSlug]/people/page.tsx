import { DashboardView } from "@/components/people/dashboard"
import { AddEmployees } from "@/components/people/add-employees"
import { getEmployeesDashboard } from "@/server/employees-dashboard"
import { requireActor } from "@/lib/access"
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

  let actor
  let data
  try {
    actor = await requireActor(orgSlug)
    data = await getEmployeesDashboard(orgSlug, {
      department: sp.department,
      location: sp.location,
    })
  } catch {
    notFound()
  }

  return (
    <div className="space-y-4">
      {ADMIN_ROLES.includes(actor.role) && (
        <AddEmployees orgSlug={orgSlug} departments={data.departments} locations={data.locations} />
      )}
      <DashboardView data={data} orgSlug={orgSlug} />
    </div>
  )
}