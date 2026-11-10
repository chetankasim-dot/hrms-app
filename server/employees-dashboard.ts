import { unscopedPrisma as prisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import type { Prisma } from "@prisma/client"

const WFH_STATUS = "wfh"
const SUBMITTED = "submitted"
const APPROVER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]

export type DashboardData = {
  headcount: number
  newThisMonth: number
  workingToday: number
  workingFromHome: number
  onLeave: number
  onLeaveInMyTeam: number
  yetToCheckIn: number
  asOf: string
  approvals: { id: string; employeeName: string; kind: "Timesheet" | "Leave"; detail: string }[]
  headcountByDepartment: { name: string; count: number }[]
  celebrations: { birthdays: string[]; newHires: string[] }
  departments: string[]
  locations: string[]
}

const nameOf = (e: { firstName: string; lastName: string; displayName: string | null }) =>
  e.displayName ?? `${e.firstName} ${e.lastName}`

export async function getEmployeesDashboard(
  orgSlug: string,
  filters: { department?: string; location?: string }
): Promise<DashboardData> {
  // Who is asking, and which workspace they belong to, comes from the database
  const actor = await requireActor(orgSlug)
  const org = await prisma.organization.findUnique({ where: { id: actor.orgId } })
  if (!org) throw new Error("Not found")

  const canApprove = APPROVER_ROLES.includes(actor.role)
  // A plain manager only sees requests from their direct reports
  const reportScope: Prisma.EmployeeWhereInput =
    actor.role === "MANAGER" ? { managerId: actor.employeeId ?? "none" } : {}

  const now = new Date()
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
  const weekAhead = new Date(today.getTime() + 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const empWhere: Prisma.EmployeeWhereInput = {
    orgId: org.id,
    status: { in: ["ACTIVE", "ON_LEAVE", "NOTICE_PERIOD"] },
    ...(filters.department && { department: { name: filters.department } }),
    ...(filters.location && { location: { name: filters.location } }),
  }

  const me = actor.employeeId ? { id: actor.employeeId } : null

  const onLeaveWhere: Prisma.LeaveRequestWhereInput = {
    orgId: org.id,
    status: { in: ["APPROVED", "AUTO_APPROVED"] },
    fromDate: { lte: today },
    toDate: { gte: today },
    employee: empWhere,
  }

  const [
    headcount, newThisMonth, checkedIn, wfh, onLeave, onLeaveTeam,
    pendingLeaves, pendingSheets, byDept, people, depts, locs,
  ] = await Promise.all([
    prisma.employee.count({ where: empWhere }),
    prisma.employee.count({ where: { ...empWhere, joinDate: { gte: monthStart } } }),
    prisma.attendanceRecord.count({
      where: { orgId: org.id, date: today, checkIn: { not: null }, employee: empWhere },
    }),
    prisma.attendanceRecord.count({
      where: { orgId: org.id, date: today, status: WFH_STATUS, employee: empWhere },
    }),
    prisma.leaveRequest.count({ where: onLeaveWhere }),
    me
      ? prisma.leaveRequest.count({
          where: { ...onLeaveWhere, employee: { ...empWhere, managerId: me.id } },
        })
      : Promise.resolve(0),
    canApprove
      ? prisma.leaveRequest.findMany({
          where: { orgId: org.id, status: "PENDING", employee: reportScope },
          include: { employee: true },
          orderBy: { createdAt: "asc" },
          take: 10,
        })
      : Promise.resolve([]),
    canApprove
      ? prisma.timesheet.findMany({
          where: { orgId: org.id, status: SUBMITTED, employee: reportScope },
          include: { employee: true },
          orderBy: { createdAt: "asc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.employee.groupBy({ by: ["departmentId"], where: empWhere, _count: { _all: true } }),
    prisma.employee.findMany({
      where: empWhere,
      select: { firstName: true, lastName: true, displayName: true, dateOfBirth: true, joinDate: true },
    }),
    prisma.department.findMany({ where: { orgId: org.id }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { orgId: org.id }, select: { name: true } }),
  ])

  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })

  return {
    headcount,
    newThisMonth,
    workingToday: checkedIn,
    workingFromHome: wfh,
    onLeave,
    onLeaveInMyTeam: onLeaveTeam,
    yetToCheckIn: Math.max(headcount - checkedIn - onLeave, 0),
    asOf: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    approvals: [
      ...pendingSheets.map((t) => ({
        id: t.id, employeeName: nameOf(t.employee), kind: "Timesheet" as const, detail: fmt(t.weekStart),
      })),
      ...pendingLeaves.map((l) => ({
        id: l.id, employeeName: nameOf(l.employee), kind: "Leave" as const,
        detail: `${l.days} day${l.days === 1 ? "" : "s"}, ${fmt(l.fromDate)}`,
      })),
    ],
    headcountByDepartment: byDept
      .map((g) => ({
        name: depts.find((d) => d.id === g.departmentId)?.name ?? "Other departments",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    celebrations: {
      birthdays: people
        .filter((p) => {
          if (!p.dateOfBirth) return false
          const next = new Date(Date.UTC(now.getFullYear(), p.dateOfBirth.getUTCMonth(), p.dateOfBirth.getUTCDate()))
          return next >= today && next <= weekAhead
        })
        .map(nameOf),
      newHires: people.filter((p) => p.joinDate && p.joinDate >= monthAgo).map(nameOf),
    },
    departments: depts.map((d) => d.name).sort(),
    locations: locs.map((l) => l.name).sort(),
  }
}