import { unscopedPrisma } from "@/lib/prisma"
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

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_workforce_snapshot",
    description: "Get headcount stats — total employees, breakdown by department, recent joiners. Use for 'how many employees', 'headcount', 'workforce overview', 'team size'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_employees",
    description: "Search employees by name, email, department, or designation. Returns a list with their details.",
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
    description: "Get full details for one specific employee — their role, department, manager, join date, leave balances.",
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
    description: "Get leave balance for an employee — how many casual, sick, earned leave days they have left.",
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

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  orgId: string,
  viewerUserId?: string,
  viewerRole?: string
): Promise<unknown> {
    const isStaff = !!viewerRole && viewerRole !== "EMPLOYEE"
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
      const employees = await unscopedPrisma.employee.findMany({
        where: {
          orgId,
          status: "ACTIVE",
          ...(department
            ? { department: { name: { contains: department, mode: "insensitive" } } }
            : {}),
          ...(query
            ? {
                OR: [
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                  { designation: { contains: query, mode: "insensitive" } },
                  { employeeCode: { contains: query, mode: "insensitive" } },
                  { user: { email: { contains: query, mode: "insensitive" } } },
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
      return employees.map((e) => ({
        name: `${e.firstName} ${e.lastName}`.trim(),
                email: isStaff ? e.user.email : undefined,
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
      const employee = await unscopedPrisma.employee.findFirst({
        where: {
          orgId,
          OR: [
            ...(name
              ? [{ firstName: { contains: name.split(" ")[0], mode: "insensitive" as const } }]
              : []),
            ...(email
              ? [{ user: { email: { contains: email, mode: "insensitive" as const } } }]
              : []),
          ],
        },
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
      return {
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.user.email,
        code: employee.employeeCode,
        designation: employee.designation,
        department: employee.department?.name,
        manager: employee.manager
          ? `${employee.manager.firstName} ${employee.manager.lastName}`
          : "No manager assigned",
        joinDate: employee.joinDate ? format(employee.joinDate, "dd MMM yyyy") : null,
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
      })
      return employees.map((e) => ({
        name: `${e.firstName} ${e.lastName}`.trim(),
        email: e.user.email,
        designation: e.designation,
        department: e.department?.name,
        joinDate: e.joinDate ? format(e.joinDate, "dd MMM yyyy") : null,
      }))
    }

    case "get_leave_balances": {
                  // Staff may look up anyone. Employees may only look up themselves.
      let selfOnly = false
      if (!isStaff) {
        if (!viewerUserId) return { error: "Not allowed for your role" }
        selfOnly = true
      }
      const { employeeName, employeeEmail } = input as {
        employeeName?: string
        employeeEmail?: string
      }
      const employee = await unscopedPrisma.employee.findFirst({
                where: selfOnly
          ? { orgId, userId: viewerUserId }
          : {
              orgId,
              OR: [
                ...(employeeName
                  ? [{ firstName: { contains: employeeName.split(" ")[0], mode: "insensitive" as const } }]
                  : []),
                ...(employeeEmail
                  ? [{ user: { email: { contains: employeeEmail, mode: "insensitive" as const } } }]
                  : []),
              ],
            },
        include: {
          leaveBalances: {
            include: { leaveType: { select: { name: true, code: true } } },
            where: { year: new Date().getFullYear() },
          },
        },
      })
      if (!employee) return { error: "Employee not found" }
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