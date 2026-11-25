import { notFound } from "next/navigation"
import { requireActor } from "@/lib/access"
import { unscopedPrisma } from "@/lib/prisma"
import Link from "next/link"
import { ArrowLeft, Mail, Phone, Building2, Calendar, User, Award, MapPin, Briefcase } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { InviteButton } from "@/components/people/invite-button"

const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]
const DAY = 86400000

function tenure(from: Date | null) {
  if (!from) return "-"
  const now = new Date()
  const months = Math.max(0, (now.getFullYear() - from.getUTCFullYear()) * 12 + (now.getMonth() - from.getUTCMonth()))
  if (months < 1) return "< 1 mo"
  if (months < 12) return `${months} mo`
  const y = Math.floor(months / 12)
  const m = months % 12
  return m ? `${y} yr ${m} mo` : `${y} yr`
}

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  AUTO_APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
}

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>
}) {
  const { orgSlug, id } = await params

  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  const employee = await unscopedPrisma.employee.findFirst({
    where: { id, orgId: actor.orgId },
    include: {
      user: { select: { name: true, email: true } },
      department: { select: { name: true } },
      location: { select: { name: true, city: true } },
      manager: { include: { user: { select: { name: true } } } },
      directReports: {
        include: { user: { select: { name: true } } },
        where: { status: "ACTIVE" },
      },
      leaveBalances: {
        include: { leaveType: { select: { name: true, code: true } } },
        where: { year: new Date().getFullYear() },
      },
    },
  })
  if (!employee) notFound()

  const isSelf = !!actor.employeeId && actor.employeeId === employee.id
  const isTheirManager = !!actor.employeeId && employee.managerId === actor.employeeId
  const canSeePrivate = HR_ROLES.includes(actor.role) || isSelf || isTheirManager
  const canInvite = HR_ROLES.includes(actor.role) && !isSelf

  // Numbers for the stat cards, only loaded when the viewer may see them
  const now = new Date()
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
  const thisMonday = new Date(todayUTC - ((new Date(todayUTC).getUTCDay() + 6) % 7) * DAY)

  const presentDays = canSeePrivate
    ? await unscopedPrisma.attendanceRecord.count({
        where: { orgId: actor.orgId, employeeId: employee.id, date: { gte: monthStart, lte: new Date(todayUTC) }, checkIn: { not: null } },
      })
    : 0
  const sheet = canSeePrivate
    ? await unscopedPrisma.timesheet.findUnique({
        where: { employeeId_weekStart: { employeeId: employee.id, weekStart: thisMonday } },
        select: { totalHours: true },
      })
    : null
  const requests = canSeePrivate
    ? await unscopedPrisma.leaveRequest.findMany({
        where: { orgId: actor.orgId, employeeId: employee.id },
        include: { leaveType: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : []

  const leaveLeft = employee.leaveBalances.reduce((a, b) => a + b.allocated + b.carried - b.used, 0)
  const initials = `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()

  const AVATAR_COLORS = [
    "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
  ]
  let hash = 0
  for (const ch of employee.firstName + employee.lastName) hash += ch.charCodeAt(0)
  const avatarColor = AVATAR_COLORS[hash % AVATAR_COLORS.length]

  const leaveColors: Record<string, string> = {
    CL: "bg-indigo-50 text-indigo-700 border-indigo-100",
    SL: "bg-amber-50 text-amber-700 border-amber-100",
    EL: "bg-emerald-50 text-emerald-700 border-emerald-100",
  }

  const Row = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl space-y-5">
      <Link
        href={`/${orgSlug}/people/directory`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Directory
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <div className={cn("h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0", avatarColor)}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">
              {employee.firstName} {employee.lastName}
              {isSelf && <span className="ml-2 text-sm font-normal text-gray-400">(you)</span>}
            </h1>
            <p className="text-gray-500 mt-0.5">
              {employee.designation ?? "No designation"} · {employee.department?.name ?? "No department"}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">{employee.employeeCode}</span>
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

      {canSeePrivate && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Leave left", String(leaveLeft), "days this year"],
            ["Hours this week", String(sheet?.totalHours ?? 0), "of 40 scheduled"],
            ["Present", String(presentDays), "days this month"],
            ["Tenure", tenure(employee.joinDate), "with the company"],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-xl border bg-white p-4">
              <div className="text-sm text-gray-500">{label}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
              <div className="text-xs text-gray-500">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {isSelf && !employee.phone && (
        <div className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm">
          Your phone number is not on file yet. Ask HR to add it. Editing your own details is coming soon.
        </div>
      )}

      {canInvite && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400 mb-3">Sign-in access</h2>
          <InviteButton orgSlug={orgSlug} employeeId={employee.id} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400">Details</h2>
          <div className="space-y-3">
            {canSeePrivate && <Row icon={Mail} label="Email" value={employee.user.email} />}
            {canSeePrivate && employee.phone && <Row icon={Phone} label="Phone" value={employee.phone} />}
            <Row icon={Building2} label="Department" value={employee.department?.name ?? "-"} />
            <Row icon={MapPin} label="Location" value={employee.location?.name ?? "-"} />
            <Row icon={Briefcase} label="Employment type" value={employee.employmentType.replace("_", " ")} />
            <Row icon={Calendar} label="Joined" value={employee.joinDate ? format(new Date(employee.joinDate), "dd MMMM yyyy") : "-"} />
            <Row icon={User} label="Reports to" value={employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : "No manager assigned"} />
            {canSeePrivate && employee.grade && <Row icon={Award} label="Grade" value={employee.grade} />}
          </div>
        </div>

        {canSeePrivate && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400">
              Leave balances: {new Date().getFullYear()}
            </h2>
            {employee.leaveBalances.length === 0 ? (
              <p className="text-sm text-gray-400">No leave balances yet. They are created when the person first opens Leave.</p>
            ) : (
              <div className="space-y-3">
                {employee.leaveBalances.map((b) => {
                  const remaining = b.allocated + b.carried - b.used
                  const pct = b.allocated > 0 ? Math.round(((b.allocated - b.used) / b.allocated) * 100) : 0
                  const colorClass = leaveColors[b.leaveType.code] ?? "bg-gray-50 text-gray-700 border-gray-100"
                  return (
                    <div key={b.id} className={cn("p-3 rounded-lg border", colorClass)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold">{b.leaveType.name}</p>
                        <p className="text-xs font-bold">{remaining} / {b.allocated} days left</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                        <div className="h-full rounded-full bg-current opacity-40" style={{ width: `${Math.max(pct, 0)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {canSeePrivate && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-400 mb-3">Recent leave requests</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-gray-400">No leave requests yet.</p>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">{r.leaveType.name}</span>
                    <span className="ml-2 text-gray-500">
                      {format(new Date(r.fromDate), "dd MMM")} to {format(new Date(r.toDate), "dd MMM yyyy")} · {r.days} day{r.days === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_CLS[r.status] ?? STATUS_CLS.PENDING)}>
                    {r.status.replace("_", " ").toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                  <p className="text-sm font-medium">{report.firstName} {report.lastName}</p>
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