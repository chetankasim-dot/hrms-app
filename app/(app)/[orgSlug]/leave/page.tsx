import { redirect } from "next/navigation"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor, type Actor } from "@/lib/access"
import { LeaveDashboard } from "@/components/leave/leave-dashboard"

export const metadata = { title: "Leave" }

const APPROVER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]

export default async function LeavePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  let actor: Actor | null = null
  try {
    actor = await requireActor(orgSlug)
  } catch {
    actor = null
  }
  if (!actor) redirect("/login")

  const employee = actor.employeeId
    ? await unscopedPrisma.employee.findFirst({
        where: { id: actor.employeeId, orgId: actor.orgId },
        select: { id: true, firstName: true, lastName: true },
      })
    : null

  if (!employee) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">No employee record found for your account.</p>
      </div>
    )
  }

  const orgId = actor.orgId
  const isManager = APPROVER_ROLES.includes(actor.role)
  const currentYear = new Date().getFullYear()

  // Create this year's balances the first time the page is opened.
  // (Still a write during a page view: it moves to a scheduled job later.)
  const existingBalances = await unscopedPrisma.leaveBalance.count({
    where: { orgId, employeeId: employee.id, year: currentYear },
  })

  if (existingBalances === 0) {
    const types = await unscopedPrisma.leaveType.findMany({ where: { orgId } })
    if (types.length > 0) {
      await unscopedPrisma.leaveBalance.createMany({
        data: types.map((lt) => ({
          orgId,
          employeeId: employee.id,
          leaveTypeId: lt.id,
          year: currentYear,
          allocated: lt.daysAllowed,
          used: 0,
          pending: 0,
          carried: 0,
        })),
        skipDuplicates: true,
      })
    }
  }

  // A plain manager only sees requests from their direct reports
  const pendingScope =
    actor.role === "MANAGER" ? { employee: { managerId: actor.employeeId } } : {}

  const [leaveTypes, leaveBalances, myRequests, pendingRequests] = await Promise.all([
    unscopedPrisma.leaveType.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
    }),

    unscopedPrisma.leaveBalance.findMany({
      where: { orgId, employeeId: employee.id, year: currentYear },
      include: { leaveType: true },
    }),

    unscopedPrisma.leaveRequest.findMany({
      where: { orgId, employeeId: employee.id },
      include: { leaveType: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),

    isManager
      ? unscopedPrisma.leaveRequest.findMany({
          where: { orgId, status: "PENDING", ...pendingScope },
          include: {
            leaveType: { select: { name: true, code: true } },
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                user: { select: { name: true } },
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: 100,
        })
      : Promise.resolve([]),
  ])

  return (
    <LeaveDashboard
      orgId={orgId}
      orgSlug={orgSlug}
      employeeId={employee.id}
      employeeName={employee.firstName + " " + employee.lastName}
      isManager={isManager}
      leaveTypes={leaveTypes}
      leaveBalances={leaveBalances}
      myRequests={myRequests}
      pendingRequests={pendingRequests}
    />
  )
}