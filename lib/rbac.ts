export type Role = "SUPER_ADMIN" | "HR_ADMIN" | "HR_MANAGER" | "MANAGER" | "EMPLOYEE"

const PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: ["*"],
  HR_ADMIN: [
    "employee:read", "employee:write",
    "leave:read", "leave:approve", "leave:write",
    "attendance:read", "attendance:write",
    "timesheet:read", "timesheet:approve",
    "recruitment:read", "recruitment:write",
    "performance:read", "performance:write",
    "compensation:read", "compensation:write",
    "analytics:read", "analytics:manage",
    "documents:read", "documents:write",
    "helpdesk:read", "helpdesk:manage",
    "admin:access", "admin:users",
  ],
  HR_MANAGER: [
    "employee:read", "employee:write",
    "leave:read", "leave:approve",
    "attendance:read",
    "timesheet:read", "timesheet:approve",
    "recruitment:read", "recruitment:write",
    "performance:read", "performance:write",
    "analytics:read",
    "documents:read",
    "helpdesk:read", "helpdesk:manage",
  ],
  MANAGER: [
    "employee:read",
    "leave:read", "leave:approve",
    "attendance:read",
    "timesheet:read", "timesheet:approve",
    "performance:read", "performance:write",
    "recruitment:read",
    "helpdesk:read",
    "documents:read",
  ],
  EMPLOYEE: [
    "employee:read",
    "leave:read",
    "attendance:read",
    "timesheet:read",
    "performance:read",
    "helpdesk:read",
    "documents:read",
  ],
}

export function hasPermission(role: Role | string, permission: string): boolean {
  const perms = PERMISSIONS[role as Role] ?? []
  return perms.includes("*") || perms.includes(permission)
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  HR_MANAGER: "HR Manager",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
}

export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  HR_ADMIN: "bg-blue-100 text-blue-800",
  HR_MANAGER: "bg-cyan-100 text-cyan-800",
  MANAGER: "bg-emerald-100 text-emerald-800",
  EMPLOYEE: "bg-gray-100 text-gray-700",
}

export const NAV_CONFIG = [
  {
    section: "Workspace",
    items: [
      { label: "Home", href: "", icon: "LayoutDashboard" },
      { label: "AI Agent", href: "/agent", icon: "Bot" },
    ],
  },
  {
    section: "People",
    items: [
      { label: "Employees", href: "/people", icon: "Users" },
      { label: "Recruitment", href: "/recruitment", icon: "UserPlus" },
      { label: "Onboarding", href: "/onboarding", icon: "ClipboardList" },
      { label: "Offboarding", href: "/offboarding", icon: "DoorOpen" },
    ],
  },
  {
    section: "Time",
    items: [
      { label: "Leave", href: "/leave", icon: "CalendarOff" },
      { label: "Attendance", href: "/attendance", icon: "Timer" },
      { label: "Timesheets", href: "/timesheets", icon: "Clock" },
    ],
  },
  {
    section: "Performance",
    items: [
      { label: "Performance", href: "/performance", icon: "TrendingUp" },
      { label: "Compensation", href: "/compensation", icon: "DollarSign" },
    ],
  },
  {
    section: "Culture",
    items: [
      { label: "Learning", href: "/learning", icon: "GraduationCap" },
      { label: "Engagement", href: "/engagement", icon: "Heart" },
      { label: "Help Desk", href: "/helpdesk", icon: "Headphones" },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { label: "Analytics", href: "/analytics", icon: "BarChart2" },
      { label: "Documents", href: "/documents", icon: "FileText" },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Import", href: "/import", icon: "Upload" },
      { label: "Admin", href: "/admin", icon: "Shield" },
      { label: "Billing", href: "/billing", icon: "CreditCard" },
      { label: "Settings", href: "/settings", icon: "Settings" },
    ],
  },
]