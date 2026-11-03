import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getOrg } from "@/lib/tenant"
import { unscopedPrisma } from "@/lib/prisma"
import { LeaveDashboard } from "@/components/leave/leave-dashboard"
import { hasPermission } from "@/lib/rbac"

export const metadata = { title: "Leave" }

export default async function LeavePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const org = await getOrg(orgSlug)
  if (!org) redirect("/login")

  const employee = await unscopedPrisma.employee.findFirst({
    where: { userId: session.user.id, orgId: org.id },
    select: { id: true, firstName: true, lastName: true },
  })

  if (!employee) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">No employee record found for your account.</p>
      </div>
    )
  }

  const isManager = hasPermission(session.user.role, "leave:approve")
  const currentYear = new Date().getFullYear()

  // Auto-create leave balances if missing
  const existingBalances = await unscopedPrisma.leaveBalance.count({
    where: { orgId: org.id, employeeId: employee.id, year: currentYear },
  })

  if (existingBalances === 0) {
    const leaveTypes = await unscopedPrisma.leaveType.findMany({
      where: { orgId: org.id },
    })
    if (leaveTypes.length > 0) {
      await unscopedPrisma.leaveBalance.createMany({
        data: leaveTypes.map((lt) => ({
          orgId: org.id,
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

  const [leaveTypes, leaveBalances, myRequests, pendingRequests] = await Promise.all([
    unscopedPrisma.leaveType.findMany({
      where: { orgId: org.id },
      orderBy: { name: "asc" },
    }),

    unscopedPrisma.leaveBalance.findMany({
      where: { orgId: org.id, employeeId: employee.id, year: currentYear },
      include: { leaveType: true },
    }),

    unscopedPrisma.leaveRequest.findMany({
      where: { orgId: org.id, employeeId: employee.id },
      include: { leaveType: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),

    isManager
      ? unscopedPrisma.leaveRequest.findMany({
          where: { orgId: org.id, status: "PENDING" },
          include: {
            leaveType: { select: { name: true, code: true } },
            employee: {
              include: {
                user: { select: { name: true, email: true } },
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ])

  return (
    <LeaveDashboard
      orgId={org.id}
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