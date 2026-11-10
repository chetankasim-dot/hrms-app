"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Bot, Users, UserPlus, ClipboardList, DoorOpen,
  CalendarOff, Timer, Clock, TrendingUp, DollarSign, GraduationCap,
  Heart, Headphones, BarChart2, FileText, Shield, Settings, CreditCard,
  Upload, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Bot, Users, UserPlus, ClipboardList, DoorOpen,
  CalendarOff, Timer, Clock, TrendingUp, DollarSign, GraduationCap,
  Heart, Headphones, BarChart2, FileText, Shield, Settings, CreditCard, Upload,
}

const NAV = [
    {
    section: "Workspace",
    items: [
      { label: "Home", href: "", icon: "LayoutDashboard" },
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

type Props = {
  orgSlug: string
  orgName: string
  plan: string
  userName: string
  userEmail: string
  role: string
}

export function Sidebar({ orgSlug, orgName, plan, userName, userEmail, role }: Props) {
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
        {NAV.map((group) => (
          <div key={group.section} className="mb-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
              {group.section}
            </p>
            {group.items.map((item) => {
              const href = `/${orgSlug}${item.href}`
              const isActive = item.href === ""
                ? pathname === `/${orgSlug}`
                : pathname.startsWith(href)
              const Icon = ICON_MAP[item.icon]
              return (
                <Link key={item.href} href={href}>
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