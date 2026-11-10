import { notFound } from "next/navigation"
import { requireActor } from "@/lib/access"
import { unscopedPrisma } from "@/lib/prisma"
import Link from "next/link"
import { ArrowLeft, Mail, Phone, Building2, Calendar, User, Award } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { InviteButton } from "@/components/people/invite-button"

const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>
}) {
  const { orgSlug, id } = await params

  // Who is asking, and which workspace they belong to, comes from the database
  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  // Only look inside the caller's own workspace
  const employee = await unscopedPrisma.employee.findFirst({
    where: { id, orgId: actor.orgId },
    include: {
      user: { select: { name: true, email: true } },
      department: { select: { name: true } },
      location: { select: { name: true, city: true } },
      manager: {
        include: { user: { select: { name: true } } },
      },
      directReports: {
        include: { user: { select: { name: true } } },
        where: { status: "ACTIVE" },
      },
      leaveBalances: {
        include: {
          leaveType: { select: { name: true, code: true } },
        },
        where: { year: new Date().getFullYear() },
      },
    },
  })

  if (!employee) notFound()

  // Private details: HR roles, the person themselves, or their direct manager
  const isSelf = !!actor.employeeId && actor.employeeId === employee.id
  const isTheirManager = !!actor.employeeId && employee.managerId === actor.employeeId
  const canSeePrivate = HR_ROLES.includes(actor.role) || isSelf || isTheirManager
    const canInvite = HR_ROLES.includes(actor.role) && !isSelf

  const initials = `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()

  const AVATAR_COLORS = [
    "bg-violet-100 text-violet-700",
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
  ]
  let hash = 0
  for (const ch of employee.firstName + employee.lastName) hash += ch.charCodeAt(0)
  const avatarColor = AVATAR_COLORS[hash % AVATAR_COLORS.length]

  const leaveColors: Record<string, string> = {
    CL: "bg-indigo-50 text-indigo-700 border-indigo-100",
    SL: "bg-amber-50 text-amber-700 border-amber-100",
    EL: "bg-emerald-50 text-emerald-700 border-emerald-100",
  }

  return (
    <div className="max-w-4xl space-y-5">
      <Link
        href={`/${orgSlug}/people`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Employees
      </Link>

      {/* Profile header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className={cn(
            "h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0",
            avatarColor
          )}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">
              {employee.firstName} {employee.lastName}
            </h1>
            <p className="text-gray-500 mt-0.5">
              {employee.designation ?? "No designation"} · {employee.department?.name ?? "No department"}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                {employee.employeeCode}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                {employee.status.replace("_", " ")}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">
                {employee.employmentType.replace("_", " ")}
              </span>
            </div>
          </div>
        </div>
      </div>
            {canInvite && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400 mb-3">
            Sign-in access
          </h2>
          <InviteButton orgSlug={orgSlug} employeeId={employee.id} />
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Details */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400">
            Details
          </h2>
          <div className="space-y-3">
            {canSeePrivate && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Email</p>
                  <p className="text-sm font-medium">{employee.user.email}</p>
                </div>
              </div>
            )}

            {canSeePrivate && employee.phone && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-4 w-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Phone</p>
                  <p className="text-sm font-medium">{employee.phone}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Department</p>
                <p className="text-sm font-medium">{employee.department?.name ?? "—"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Joined</p>
                <p className="text-sm font-medium">
                  {employee.joinDate
                    ? format(new Date(employee.joinDate), "dd MMMM yyyy")
                    : "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-gray-400" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Reports to</p>
                <p className="text-sm font-medium">
                  {employee.manager
                    ? `${employee.manager.firstName} ${employee.manager.lastName}`
                    : "No manager assigned"}
                </p>
              </div>
            </div>

            {canSeePrivate && employee.grade && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <Award className="h-4 w-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Grade</p>
                  <p className="text-sm font-medium">{employee.grade}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Leave balances */}
        {canSeePrivate && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400">
              Leave balances — {new Date().getFullYear()}
            </h2>
            {employee.leaveBalances.length === 0 ? (
              <p className="text-sm text-gray-400">No leave balances set up</p>
            ) : (
              <div className="space-y-3">
                {employee.leaveBalances.map((balance) => {
                  const remaining = balance.allocated + balance.carried - balance.used
                  const pct = balance.allocated > 0
                    ? Math.round(((balance.allocated - balance.used) / balance.allocated) * 100)
                    : 0
                  const colorClass = leaveColors[balance.leaveType.code] ?? "bg-gray-50 text-gray-700 border-gray-100"
                  return (
                    <div key={balance.id} className={cn("p-3 rounded-lg border", colorClass)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold">{balance.leaveType.name}</p>
                        <p className="text-xs font-bold">{remaining} / {balance.allocated} days left</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-current opacity-40 transition-all"
                          style={{ width: `${Math.max(pct, 0)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <p className="text-[10px] opacity-60">Used: {balance.used} days</p>
                        {balance.carried > 0 && (
                          <p className="text-[10px] opacity-60">Carried: {balance.carried}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Direct reports */}
      {employee.directReports.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400 mb-4">
            Direct reports ({employee.directReports.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {employee.directReports.map((report) => (
              <Link key={report.id} href={`/${orgSlug}/people/${report.id}`}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-black transition-colors cursor-pointer">
                  <div className="h-6 w-6 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                    {report.firstName[0]}{report.lastName[0]}
                  </div>
                  <p className="text-sm font-medium">
                    {report.firstName} {report.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{report.designation}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}