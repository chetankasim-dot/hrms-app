import { unscopedPrisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { subDays, format, startOfMonth } from "date-fns"

export type AgentTool = {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, unknown>
    required: string[]
  }
}

const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_workforce_snapshot",
    description: "Get headcount stats — total employees, breakdown by department, recent joiners. Use for 'how many employees', 'headcount', 'workforce overview', 'team size'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_employees",
    description: "Search employees by name, email, department, or designation. Returns a list with their details. Email addresses are only shown for people the user is allowed to see.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, or designation to search for" },
        department: { type: "string", description: "Filter by department name" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "get_employee",
    description: "Get details for one specific employee — their role, department, manager, join date. Email and leave balances are only included for HR, the person themselves, and their manager.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Employee full name" },
        email: { type: "string", description: "Employee email address" },
      },
      required: [],
    },
  },
  {
    name: "get_departments",
    description: "List all departments with their headcount. Use for 'what departments do we have', 'team breakdown'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_recent_joiners",
    description: "Get employees who joined recently. Use for 'new joiners', 'who joined recently', 'new hires'.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "How many days back to look (default 90)" },
      },
      required: [],
    },
  },
  {
    name: "get_leave_balances",
    description: "Get leave balance for an employee — how many casual, sick, earned leave days they have left. HR can look up anyone. Managers can look up themselves and their direct reports. Employees can only look up themselves. With no name given, it returns the current user's own balance.",
    input_schema: {
      type: "object",
      properties: {
        employeeName: { type: "string", description: "Employee name" },
        employeeEmail: { type: "string", description: "Employee email" },
      },
      required: [],
    },
  },
  {
    name: "get_leave_schedule",
    description: "Get who is on approved leave on a date or within a date range. Use for 'who is on leave today', 'how many are on leave', 'who is off this week', 'who in my team is on leave'. Omit from/to for today. Use scope 'my_team' when the user says 'my team' or 'my reports'.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD. Defaults to today." },
        to: { type: "string", description: "End date, YYYY-MM-DD. Defaults to the start date." },
        scope: {
          type: "string",
          enum: ["all", "my_team"],
          description: "'my_team' limits results to the current user's direct reports. Default 'all'.",
        },
      },
      required: [],
    },
  },
]

/* ---------- Who may see private details (email, leave balances) ---------- */

type Access = { all: boolean; ids: Set<string>; selfId: string | null }

async function loadAccess(orgId: string, viewerUserId?: string, viewerRole?: string): Promise<Access> {
  const me = viewerUserId
    ? await unscopedPrisma.employee.findFirst({
        where: { userId: viewerUserId, orgId },
        select: { id: true },
      })
    : null

  // HR sees everyone
  if (viewerRole && HR_ROLES.includes(viewerRole)) {
    return { all: true, ids: new Set(), selfId: me?.id ?? null }
  }
  if (!me) return { all: false, ids: new Set(), selfId: null }

  // Everyone else sees themselves, and managers also see their direct reports
  const ids = new Set<string>([me.id])
  if (viewerRole === "MANAGER") {
    const reports = await unscopedPrisma.employee.findMany({
      where: { orgId, managerId: me.id },
      select: { id: true },
    })
    for (const r of reports) ids.add(r.id)
  }
  return { all: false, ids, selfId: me.id }
}

const canSee = (a: Access, employeeId: string) => a.all || a.ids.has(employeeId)

// "Sonu Goyal": every word must match the first or the last name
function nameWhere(name: string): Prisma.EmployeeWhereInput {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 4)
  return {
    AND: words.map((w) => ({
      OR: [
        { firstName: { contains: w, mode: "insensitive" } },
        { lastName: { contains: w, mode: "insensitive" } },
      ],
    })),
  }
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  orgId: string,
  viewerUserId?: string,
  viewerRole?: string
): Promise<unknown> {
  const isStaff = !!viewerRole && viewerRole !== "EMPLOYEE"

  // Worked out once, and only if a tool needs it
  let accessCache: Access | null = null
  const access = async () => (accessCache ??= await loadAccess(orgId, viewerUserId, viewerRole))

  switch (toolName) {

    case "get_workforce_snapshot": {
      const [total, byDept, newThisMonth] = await Promise.all([
        unscopedPrisma.employee.count({ where: { orgId, status: "ACTIVE" } }),
        unscopedPrisma.department.findMany({
          where: { orgId },
          include: {
            _count: { select: { employees: { where: { status: "ACTIVE" } } } },
          },
          orderBy: { name: "asc" },
        }),
        unscopedPrisma.employee.count({
          where: {
            orgId,
            status: "ACTIVE",
            joinDate: { gte: startOfMonth(new Date()) },
          },
        }),
      ])
      return {
        totalActive: total,
        newThisMonth,
        departments: byDept
          .filter((d) => d._count.employees > 0)
          .map((d) => ({ name: d.name, headcount: d._count.employees })),
      }
    }

    case "search_employees": {
      const { query, department, limit = 10 } = input as {
        query?: string
        department?: string
        limit?: number
      }
      const q = typeof query === "string" ? query.trim() : ""
      const employees = await unscopedPrisma.employee.findMany({
        where: {
          orgId,
          status: "ACTIVE",
          ...(department
            ? { department: { name: { contains: department, mode: "insensitive" } } }
            : {}),
          ...(q
            ? {
                OR: [
                  nameWhere(q),
                  { designation: { contains: q, mode: "insensitive" } },
                  { employeeCode: { contains: q, mode: "insensitive" } },
                  { user: { email: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          user: { select: { name: true, email: true } },
          department: { select: { name: true } },
          manager: { include: { user: { select: { name: true } } } },
        },
        take: Math.min(Math.max(Number(limit) || 10, 1), 25),
      })
      const a = isStaff ? await access() : null
      return employees.map((e) => ({
        name: `${e.firstName} ${e.lastName}`.trim(),
        // Email only for people this user may see
        email: a && canSee(a, e.id) ? e.user.email : undefined,
        code: e.employeeCode,
        designation: e.designation,
        department: e.department?.name,
        manager: e.manager
          ? `${e.manager.firstName} ${e.manager.lastName}`
          : null,
        joinDate: e.joinDate ? format(e.joinDate, "dd MMM yyyy") : null,
      }))
    }

    case "get_employee": {
      if (!isStaff) return { error: "Not allowed for your role" }
      const { name, email } = input as { name?: string; email?: string }

      const OR: Prisma.EmployeeWhereInput[] = []
      if (typeof name === "string" && name.trim()) OR.push(nameWhere(name))
      if (typeof email === "string" && email.trim())
        OR.push({ user: { email: { contains: email.trim(), mode: "insensitive" } } })
      if (OR.length === 0) return { error: "Give a name or an email address" }

      const employee = await unscopedPrisma.employee.findFirst({
        where: { orgId, OR },
        include: {
          user: { select: { name: true, email: true } },
          department: { select: { name: true } },
          manager: { include: { user: { select: { name: true } } } },
          leaveBalances: {
            include: { leaveType: { select: { name: true, code: true } } },
          },
        },
      })
      if (!employee) return { error: "Employee not found" }

      const a = await access()
      const base = {
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        code: employee.employeeCode,
        designation: employee.designation,
        department: employee.department?.name,
        manager: employee.manager
          ? `${employee.manager.firstName} ${employee.manager.lastName}`
          : "No manager assigned",
        joinDate: employee.joinDate ? format(employee.joinDate, "dd MMM yyyy") : null,
      }

      if (!canSee(a, employee.id)) {
        return {
          ...base,
          note: "Email and leave balances are only available for yourself and your direct reports.",
        }
      }
      return {
        ...base,
        email: employee.user.email,
        leaveBalances: employee.leaveBalances.map((b) => ({
          type: b.leaveType.name,
          allocated: b.allocated,
          used: b.used,
          remaining: b.allocated + b.carried - b.used,
        })),
      }
    }

    case "get_departments": {
      const departments = await unscopedPrisma.department.findMany({
        where: { orgId },
        include: {
          _count: { select: { employees: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { name: "asc" },
      })
      return departments
        .filter((d) => d._count.employees > 0)
        .map((d) => ({
          name: d.name,
          headcount: d._count.employees,
        }))
    }

    case "get_recent_joiners": {
      const { days = 90 } = input as { days?: number }
      const employees = await unscopedPrisma.employee.findMany({
        where: {
          orgId,
          status: "ACTIVE",
          joinDate: { gte: subDays(new Date(), Math.min(Math.max(Number(days) || 90, 1), 730)) },
        },
        include: {
          user: { select: { name: true, email: true } },
          department: { select: { name: true } },
        },
        orderBy: { joinDate: "desc" },
        take: 100,
      })
      const a = await access()
      return employees.map((e) => ({
        name: `${e.firstName} ${e.lastName}`.trim(),
        // Email only for people this user may see
        email: canSee(a, e.id) ? e.user.email : undefined,
        designation: e.designation,
        department: e.department?.name,
        joinDate: e.joinDate ? format(e.joinDate, "dd MMM yyyy") : null,
      }))
    }

    case "get_leave_balances": {
      if (!viewerUserId || !viewerRole) return { error: "Not allowed for your role" }
      const { employeeName, employeeEmail } = input as {
        employeeName?: string
        employeeEmail?: string
      }
      const a = await access()

      const OR: Prisma.EmployeeWhereInput[] = []
      if (typeof employeeName === "string" && employeeName.trim()) OR.push(nameWhere(employeeName))
      if (typeof employeeEmail === "string" && employeeEmail.trim())
        OR.push({ user: { email: { contains: employeeEmail.trim(), mode: "insensitive" } } })

      let where: Prisma.EmployeeWhereInput
      if (viewerRole === "EMPLOYEE" || OR.length === 0) {
        // Employees, and anyone who gave no name, get their own balance
        if (!a.selfId) return { error: "No employee record found for your account" }
        where = { id: a.selfId, orgId }
      } else {
        // HR searches everyone. A manager only searches themselves and their direct reports.
        where = { orgId, OR, ...(a.all ? {} : { id: { in: [...a.ids] } }) }
      }

      const employee = await unscopedPrisma.employee.findFirst({
        where,
        include: {
          leaveBalances: {
            include: { leaveType: { select: { name: true, code: true } } },
            where: { year: new Date().getFullYear() },
          },
        },
      })
      if (!employee) {
        return {
          error: a.all
            ? "Employee not found"
            : "Employee not found among you and your direct reports",
        }
      }
      return {
        employee: `${employee.firstName} ${employee.lastName}`.trim(),
        year: new Date().getFullYear(),
        balances: employee.leaveBalances.map((b) => ({
          type: b.leaveType.name,
          code: b.leaveType.code,
          allocated: b.allocated,
          used: b.used,
          remaining: b.allocated + b.carried - b.used,
        })),
      }
    }

    case "get_leave_schedule": {
      if (!viewerRole || viewerRole === "EMPLOYEE") return { error: "Not allowed for your role" }
      const { from, to, scope = "all" } = input as {
        from?: string
        to?: string
        scope?: string
      }

      const now = new Date()
      const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
      const parse = (s?: string) => {
        if (!s) return null
        const d = new Date(`${s}T00:00:00Z`)
        return isNaN(d.getTime()) ? null : d
      }
      const start = parse(from) ?? todayUTC
      const end = parse(to) ?? start
      if (end < start) return { error: "'to' date must not be before 'from' date" }

      const employeeFilter: { managerId?: string } = {}
      if (scope === "my_team") {
        if (!viewerUserId) return { error: "Cannot tell who the current user is" }
        const me = await unscopedPrisma.employee.findFirst({
          where: { userId: viewerUserId, orgId },
          select: { id: true },
        })
        if (!me) return { error: "The current user has no employee record, so no team was found" }
        employeeFilter.managerId = me.id
      }

      const requests = await unscopedPrisma.leaveRequest.findMany({
        where: {
          orgId,
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
          fromDate: { lte: end },
          toDate: { gte: start },
          employee: employeeFilter,
        },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
          leaveType: { select: { name: true } },
        },
        orderBy: { fromDate: "asc" },
        take: 100,
      })

      const fmtUTC = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/")
      return {
        from: fmtUTC(start),
        to: fmtUTC(end),
        scope,
        employeesOnLeave: new Set(requests.map((r) => r.employeeId)).size,
        leaves: requests.map((r) => ({
          name: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
          department: r.employee.department?.name ?? null,
          leaveType: r.leaveType.name,
          fromDate: fmtUTC(r.fromDate),
          toDate: fmtUTC(r.toDate),
          days: r.days,
        })),
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}