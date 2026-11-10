import { unscopedPrisma as prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { requireActor } from "@/lib/access"
import type { Role } from "@prisma/client"

export type Viewer = { userId?: string | null; orgId?: string | null }
export type LiveStatus = "office" | "wfh" | "leave" | "pending" | "exited"

const WFH_STATUS = "wfh"
const SUBMITTED = "submitted"
const WEEKLY_HOURS = 40
const DAY = 86400000
const ACTIVE_STATUSES = ["ACTIVE", "ON_LEAVE", "NOTICE_PERIOD"] as const
const ci = "insensitive" as const

function todayUTC() {
  const n = new Date()
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))
}

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })

const fullName = (e: { firstName: string; lastName: string; displayName: string | null }) =>
  e.displayName ?? `${e.firstName} ${e.lastName}`.trim()

async function requireOrg(orgSlug: string, _viewer?: Viewer, roles?: Role[]) {
  const actor = await requireActor(orgSlug, roles)
  const org = await prisma.organization.findUnique({ where: { id: actor.orgId } })
  if (!org) throw new Error("Not found")
  return org
}

function scopeFilter(f: { department?: string; location?: string }): Prisma.EmployeeWhereInput {
  return {
    ...(f.department ? { department: { name: f.department } } : {}),
    ...(f.location ? { location: { name: f.location } } : {}),
  }
}

/* Live status today: on leave > checked in (office / home) > not checked in */
export async function liveStatus(orgId: string, today: Date) {
  const [leaves, att] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        orgId,
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
        fromDate: { lte: today },
        toDate: { gte: today },
      },
      select: { employeeId: true, toDate: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { orgId, date: today },
      select: { employeeId: true, checkIn: true, status: true },
    }),
  ])
  const leaveUntil = new Map<string, Date>()
  for (const l of leaves) {
    const cur = leaveUntil.get(l.employeeId)
    if (!cur || l.toDate > cur) leaveUntil.set(l.employeeId, l.toDate)
  }
  const attMap = new Map(att.map((a) => [a.employeeId, a] as const))

  return (id: string): { status: LiveStatus; label: string } => {
    const until = leaveUntil.get(id)
    if (until) {
      const day = until.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
      return { status: "leave", label: `On leave until ${day}` }
    }
    const a = attMap.get(id)
    if (a?.checkIn) {
      return a.status === WFH_STATUS
        ? { status: "wfh", label: "Work from home" }
        : { status: "office", label: "Work from office" }
    }
    return { status: "pending", label: "Yet to check in" }
  }
}

/* Pending leave that overlaps someone else's leave in the same department */
async function clashMap(
  orgId: string,
  today: Date,
  pending: { id: string; employeeId: string; fromDate: Date; toDate: Date; employee: { departmentId: string | null } }[]
) {
  const others = await prisma.leaveRequest.findMany({
    where: { orgId, status: { in: ["PENDING", "APPROVED", "AUTO_APPROVED"] }, toDate: { gte: today } },
    include: { employee: { select: { firstName: true, lastName: true, displayName: true, departmentId: true } } },
  })
  const result = new Map<string, string>()
  for (const p of pending) {
    if (!p.employee.departmentId) continue
    const hit = others.find(
      (o) =>
        o.employeeId !== p.employeeId &&
        o.employee.departmentId === p.employee.departmentId &&
        o.fromDate <= p.toDate &&
        o.toDate >= p.fromDate
    )
    if (hit) result.set(p.id, fullName(hit.employee))
  }
  return result
}

/* ---------------- Directory ---------------- */

export type PersonCard = {
  id: string
  name: string
  initials: string
  designation: string
  department: string
  location: string
  status: LiveStatus
  statusLabel: string
}

export async function getDirectory(
  orgSlug: string,
  viewer: Viewer,
  f: { q?: string; view?: string; department?: string; location?: string; status?: string }
) {
  const org = await requireOrg(orgSlug, viewer)
  const today = todayUTC()
  const ex = f.view === "ex"

  const where: Prisma.EmployeeWhereInput = {
    orgId: org.id,
    status: ex ? "SEPARATED" : { in: [...ACTIVE_STATUSES] },
    ...scopeFilter(f),
    ...(f.q
      ? {
          OR: [
            { firstName: { contains: f.q, mode: ci } },
            { lastName: { contains: f.q, mode: ci } },
            { designation: { contains: f.q, mode: ci } },
            { employeeCode: { contains: f.q, mode: ci } },
            { department: { name: { contains: f.q, mode: ci } } },
          ],
        }
      : {}),
  }

  const [people, statusOf, depts, locs, exCount, activeCount] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: { department: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 300,
    }),
    liveStatus(org.id, today),
    prisma.department.findMany({ where: { orgId: org.id }, select: { name: true } }),
    prisma.location.findMany({ where: { orgId: org.id }, select: { name: true } }),
    prisma.employee.count({ where: { orgId: org.id, status: "SEPARATED" } }),
    prisma.employee.count({ where: { orgId: org.id, status: { in: [...ACTIVE_STATUSES] } } }),
  ])

  const all: PersonCard[] = people.map((p) => {
    const live = ex
      ? { status: "exited" as LiveStatus, label: p.exitDate ? `Left ${fmtDay(p.exitDate)}` : "Former employee" }
      : statusOf(p.id)
    return {
      id: p.id,
      name: fullName(p),
      initials: `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase(),
      designation: p.designation ?? "No designation",
      department: p.department?.name ?? "No department",
      location: p.location?.name ?? "No location",
      status: live.status,
      statusLabel: live.label,
    }
  })

  const pendingCount = all.filter((c) => c.status === "pending").length
  const cards = f.status && !ex ? all.filter((c) => c.status === f.status) : all

  return {
    cards,
    pendingCount,
    activeCount,
    exCount,
    departments: depts.map((d) => d.name).sort(),
    locations: locs.map((l) => l.name).sort(),
  }
}

/* ---------------- Approvals ---------------- */

export type ApprovalRow = {
  kind: "Leave" | "Timesheet"
  id: string
  employeeName: string
  request: string
  details: string
  safe: boolean
  checkLabel: string
}

export async function getApprovalRows(orgSlug: string, viewer: Viewer, type?: string) {
    const org = await requireOrg(orgSlug, viewer, ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"])
  const today = todayUTC()
  const year = today.getUTCFullYear()

  const [leaves, sheets] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { orgId: org.id, status: "PENDING" },
      include: { employee: true, leaveType: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.timesheet.findMany({
      where: { orgId: org.id, status: SUBMITTED },
      include: { employee: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ])

  const [clashes, balances] = await Promise.all([
    clashMap(org.id, today, leaves),
    prisma.leaveBalance.findMany({
      where: { orgId: org.id, year, employeeId: { in: leaves.map((l) => l.employeeId) } },
    }),
  ])

  const rows: ApprovalRow[] = []

  for (const t of sheets) {
    const diff = t.totalHours - WEEKLY_HOURS
    const safe = Math.abs(diff) < 0.01
    rows.push({
      kind: "Timesheet",
      id: t.id,
      employeeName: fullName(t.employee),
      request: `Timesheet, week of ${fmtDay(t.weekStart)}`,
      details: safe
        ? `${t.totalHours} hrs, matches schedule`
        : `${t.totalHours} hrs, ${Math.abs(diff)} ${diff < 0 ? "under" : "over"} schedule`,
      safe,
      checkLabel: safe ? "Safe to approve" : "Check hours",
    })
  }

  for (const l of leaves) {
    const bal = balances.find((b) => b.employeeId === l.employeeId && b.leaveTypeId === l.leaveTypeId)
    const left = bal ? bal.allocated + bal.carried - bal.used - l.days : null
    const clash = clashes.get(l.id)
    const range =
      l.fromDate.getTime() === l.toDate.getTime()
        ? fmtDay(l.fromDate)
        : `${fmtDay(l.fromDate)} to ${fmtDay(l.toDate)}`

    let details = range
    let safe = true
    let checkLabel = "Safe to approve"
    if (left !== null) details += `, ${left} days left after`
    if (clash) {
      details += `, clashes with ${clash}`
      safe = false
      checkLabel = "Team clash"
    } else if (left !== null && left < 0) {
      safe = false
      checkLabel = "Not enough balance"
    }
    rows.push({
      kind: "Leave",
      id: l.id,
      employeeName: fullName(l.employee),
      request: `${l.leaveType.name}, ${l.days} day${l.days === 1 ? "" : "s"}`,
      details,
      safe,
      checkLabel,
    })
  }

  return type === "Leave" || type === "Timesheet" ? rows.filter((r) => r.kind === type) : rows
}

/* ---------------- Reports (team space) ---------------- */

function tenure(from: Date | null, to: Date | null) {
  if (!from || !to) return "-"
  const months = Math.max(
    0,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  )
  if (months < 1) return "< 1 mo"
  if (months < 12) return `${months} mo`
  return `${Math.floor(months / 12)} yr`
}

export async function getTeamReport(    
  orgSlug: string,
  viewer: Viewer,
  f: { department?: string; location?: string }
) {
    const org = await requireOrg(orgSlug, viewer, ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"])
  const today = todayUTC()
  const yearAgo = new Date(today.getTime() - 365 * DAY)
  const scope = scopeFilter(f)
  const empWhere: Prisma.EmployeeWhereInput = { orgId: org.id, status: { in: [...ACTIVE_STATUSES] }, ...scope }

  const [emps, statusOf, stuckSheets, pendingLeaves, exits, depts, locs] = await Promise.all([
    prisma.employee.findMany({
      where: empWhere,
      select: { id: true, location: { select: { name: true } } },
    }),
    liveStatus(org.id, today),
    prisma.timesheet.count({ where: { orgId: org.id, status: SUBMITTED, employee: empWhere } }),
    prisma.leaveRequest.findMany({
      where: { orgId: org.id, status: "PENDING", employee: empWhere },
      include: { employee: true },
    }),
    prisma.employee.findMany({
      where: { orgId: org.id, status: "SEPARATED", exitDate: { gte: yearAgo }, ...scope },
      orderBy: { exitDate: "desc" },
    }),
    prisma.department.findMany({ where: { orgId: org.id }, select: { name: true } }),
    prisma.location.findMany({ where: { orgId: org.id }, select: { name: true } }),
  ])

  const clashes = await clashMap(org.id, today, pendingLeaves)

  const availability = { office: 0, wfh: 0, pending: 0, leave: 0 }
  const byLocation = new Map<string, number>()
  for (const e of emps) {
    const s = statusOf(e.id).status
    if (s === "office" || s === "wfh" || s === "pending" || s === "leave") availability[s]++
    const loc = e.location?.name ?? "No location"
    byLocation.set(loc, (byLocation.get(loc) ?? 0) + 1)
  }

  const alerts: string[] = []
  if (availability.pending > 0) alerts.push(`${availability.pending} not checked in yet`)
  if (stuckSheets > 0) alerts.push(`${stuckSheets} timesheet${stuckSheets === 1 ? "" : "s"} waiting for approval`)
  if (clashes.size > 0) alerts.push(`${clashes.size} leave request${clashes.size === 1 ? "" : "s"} clash with teammates`)
  if (exits.length > 0) alerts.push(`${exits.length} exit${exits.length === 1 ? "" : "s"} in 12 months`)

  return {
    title: f.department ?? "All teams",
    total: emps.length,
    availability,
    locations: [...byLocation.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    alerts,
    exits: exits.slice(0, 5).map((e) => ({
      name: fullName(e),
      date: e.exitDate ? fmtDay(e.exitDate) : "-",
      tenure: tenure(e.joinDate, e.exitDate),
    })),
    departments: depts.map((d) => d.name).sort(),
    locationNames: locs.map((l) => l.name).sort(),
  }
}

/* ---------------- Org chart ---------------- */

export type OrgCard = {
  id: string
  name: string
  designation: string
  status: LiveStatus
  statusLabel: string
  size: number
}

export async function getOrgChart(
  orgSlug: string,
  viewer: Viewer,
  sel: { root?: string; team?: string }
) {
  const org = await requireOrg(orgSlug, viewer)
  const today = todayUTC()

  const [emps, statusOf] = await Promise.all([
    prisma.employee.findMany({
      where: { orgId: org.id, status: { in: [...ACTIVE_STATUSES] } },
      select: {
        id: true, firstName: true, lastName: true, displayName: true,
        designation: true, managerId: true,
      },
    }),
    liveStatus(org.id, today),
  ])

  const byId = new Map(emps.map((e) => [e.id, e] as const))
  const kids = new Map<string, typeof emps>()
  for (const e of emps) {
    if (e.managerId && byId.has(e.managerId)) {
      const arr = kids.get(e.managerId) ?? []
      arr.push(e)
      kids.set(e.managerId, arr)
    }
  }

  // people under someone, at any depth (depth guard protects against loops)
  const size = (id: string, depth = 0): number =>
    depth > 20 ? 0 : (kids.get(id) ?? []).reduce((n, k) => n + 1 + size(k.id, depth + 1), 0)

  const toCard = (e: (typeof emps)[number]): OrgCard => {
    const s = statusOf(e.id)
    return {
      id: e.id,
      name: fullName(e),
      designation: e.designation ?? "No designation",
      status: s.status,
      statusLabel: s.label,
      size: size(e.id),
    }
  }
  const sorted = (list: typeof emps) =>
    list.map(toCard).sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))

  const roots = sorted(emps.filter((e) => !e.managerId || !byId.has(e.managerId)))
  const root = roots.find((r) => r.id === sel.root) ?? roots[0] ?? null
  const reports = root ? sorted(kids.get(root.id) ?? []) : []
  const team = reports.find((r) => r.id === sel.team) ?? reports.find((r) => r.size > 0) ?? null
  const members = team ? sorted(kids.get(team.id) ?? []) : []

  const onLeave = members.filter((m) => m.status === "leave")
  const summary = team
    ? onLeave.length > 0
      ? `${onLeave.length} ${onLeave.length === 1 ? "person" : "people"} in ${team.name}'s team ${onLeave.length === 1 ? "is" : "are"} on leave today: ${onLeave.map((m) => m.name).join(", ")}.`
      : `Nobody in ${team.name}'s team is on leave today.`
    : root
      ? `${root.name} has ${reports.length} direct report${reports.length === 1 ? "" : "s"}.`
      : "No employees yet."

  return {
    root,
    reports,
    team,
    members,
    summary,
    otherRoots: roots.filter((r) => r.id !== root?.id),
  }
}