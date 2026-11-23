"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Bot, Users, UserPlus, ClipboardList, DoorOpen,
  CalendarOff, Timer, Clock, TrendingUp, DollarSign, GraduationCap,
  Heart, Headphones, BarChart2, FileText, Shield, Settings, CreditCard,
  Upload, ChevronRight, User, Lock,
} from "lucide-react"
import { cn } from "@/lib/utils"

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Bot, Users, UserPlus, ClipboardList, DoorOpen,
  CalendarOff, Timer, Clock, TrendingUp, DollarSign, GraduationCap,
  Heart, Headphones, BarChart2, FileText, Shield, Settings, CreditCard, Upload, User, Lock,
}

const ALL = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER", "EMPLOYEE"]
const HR = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]
const ADMIN = ["SUPER_ADMIN", "HR_ADMIN"]

type Item = {
  label: string
  href: string
  icon: string
  roles: string[]
  employeeHref?: string // where the link goes for a plain employee
  match?: string // path used to decide if the item is highlighted
}

const NAV: { section: string; items: Item[] }[] = [
  {
    section: "Workspace",
    items: [
      { label: "Home", href: "", icon: "LayoutDashboard", roles: ALL },
      { label: "My profile", href: "/me", icon: "User", roles: ALL },
    ],
  },
  {
    section: "People",
    items: [
      { label: "Employees", href: "/people", icon: "Users", roles: ALL, employeeHref: "/people/directory", match: "/people" },
      { label: "Recruitment", href: "/recruitment", icon: "UserPlus", roles: HR },
      { label: "Onboarding", href: "/onboarding", icon: "ClipboardList", roles: HR },
      { label: "Offboarding", href: "/offboarding", icon: "DoorOpen", roles: HR },
    ],
  },
  {
    section: "Time",
    items: [
      { label: "Leave", href: "/leave", icon: "CalendarOff", roles: ALL },
      { label: "Attendance", href: "/attendance", icon: "Timer", roles: ALL },
      { label: "Timesheets", href: "/timesheets", icon: "Clock", roles: ALL },
    ],
  },
  {
    section: "Performance",
    items: [
      { label: "Performance", href: "/performance", icon: "TrendingUp", roles: ALL },
      { label: "Compensation", href: "/compensation", icon: "DollarSign", roles: HR },
    ],
  },
  {
    section: "Culture",
    items: [
      { label: "Learning", href: "/learning", icon: "GraduationCap", roles: ALL },
      { label: "Engagement", href: "/engagement", icon: "Heart", roles: ALL },
      { label: "Help Desk", href: "/helpdesk", icon: "Headphones", roles: ALL },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { label: "Analytics", href: "/analytics", icon: "BarChart2", roles: HR },
      { label: "Documents", href: "/documents", icon: "FileText", roles: ALL },
    ],
  },
  {
    section: "Settings",
    items: [
      { label: "Account", href: "/account", icon: "Lock", roles: ALL },
      { label: "Import", href: "/import", icon: "Upload", roles: HR },
      { label: "Admin", href: "/admin", icon: "Shield", roles: ADMIN },
      { label: "Billing", href: "/billing", icon: "CreditCard", roles: ADMIN },
      { label: "Settings", href: "/settings", icon: "Settings", roles: ADMIN },
    ],
  },
]

type Props = {
  orgSlug: string
  orgName: string
  plan: string
  userName: string
  userEmail: string
  role: string
}

export function Sidebar({ orgSlug, orgName, plan, userName, role }: Props) {
  const pathname = usePathname()

  const planColors: Record<string, string> = {
    STARTER: "bg-gray-100 text-gray-600",
    GROWTH: "bg-blue-50 text-blue-700",
    ENTERPRISE: "bg-violet-50 text-violet-700",
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  // Only show the items this role can use, and drop sections that end up empty
  const groups = NAV.map((g) => ({
    section: g.section,
    items: g.items.filter((i) => i.roles.includes(role)),
  })).filter((g) => g.items.length > 0)

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 border-r bg-white flex flex-col z-20 overflow-hidden">

      <div className="px-4 py-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-7 w-7 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
            <Bot className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold tracking-tight">HRMS</span>
        </div>
        <p className="text-xs font-medium text-gray-700 truncate">{orgName}</p>
        <span className={cn(
          "inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium",
          planColors[plan] ?? planColors.STARTER
        )}>
          {plan}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {groups.map((group) => (
          <div key={group.section} className="mb-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
              {group.section}
            </p>
            {group.items.map((item) => {
              const target = role === "EMPLOYEE" && item.employeeHref ? item.employeeHref : item.href
              const href = `/${orgSlug}${target}`
              const base = `/${orgSlug}${item.match ?? item.href}`
              const isActive = item.href === ""
                ? pathname === `/${orgSlug}`
                : pathname.startsWith(base)
              const Icon = ICON_MAP[item.icon]
              return (
                <Link key={item.label} href={href}>
                  <div className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors mb-0.5",
                    isActive
                      ? "bg-black text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}>
                    {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
                    <span>{item.label}</span>
                    {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-60" />}
                  </div>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{userName}</p>
            <p className="text-[10px] text-gray-400 truncate">{role.replace("_", " ")}</p>
          </div>
        </div>
        <Link href="/api/auth/signout">
          <div className="text-center text-[10px] text-gray-400 hover:text-gray-700 py-1 rounded hover:bg-gray-50 cursor-pointer">
            Sign out
          </div>
        </Link>
      </div>

    </aside>
  )
}