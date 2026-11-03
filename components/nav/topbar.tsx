"use client"

import { usePathname } from "next/navigation"

const ROUTE_LABELS: Record<string, string> = {
  "": "Home",
  agent: "AI Agent",
  people: "Employees",
  recruitment: "Recruitment",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  leave: "Leave",
  attendance: "Attendance",
  timesheets: "Timesheets",
  performance: "Performance",
  compensation: "Compensation",
  learning: "Learning",
  engagement: "Engagement",
  helpdesk: "Help Desk",
  analytics: "Analytics",
  documents: "Documents",
  import: "Import employees",
  admin: "Admin",
  billing: "Billing",
  settings: "Settings",
}

type Props = {
  orgSlug: string
  orgName: string
}

export function Topbar({ orgSlug, orgName }: Props) {
  const pathname = usePathname()
  const segment = pathname.replace(`/${orgSlug}`, "").replace(/^\//, "").split("/")[0]
  const pageTitle = ROUTE_LABELS[segment] ?? segment

  return (
    <header className="fixed top-0 right-0 left-56 h-12 border-b bg-white flex items-center px-5 z-10">
      <h1 className="text-sm font-semibold text-gray-800">{pageTitle}</h1>
    </header>
  )
}