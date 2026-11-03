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
]

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  orgId: string
): Promise<unknown> {
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
        take: Number(limit),
      })
      return employees.map((e) => ({
        name: `${e.firstName} ${e.lastName}`.trim(),
        email: e.user.email,
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
          joinDate: { gte: subDays(new Date(), Number(days)) },
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
      const { employeeName, employeeEmail } = input as {
        employeeName?: string
        employeeEmail?: string
      }
      const employee = await unscopedPrisma.employee.findFirst({
        where: {
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

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}