import { notFound } from "next/navigation"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { TimesheetsPanel } from "@/components/timesheets/timesheets-panel"

export const metadata = { title: "Timesheets" }

const DAY = 86400000

const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

export default async function TimesheetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams

  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  if (!actor.employeeId) {
    return <p className="py-20 text-center text-gray-500">No employee record found for your account.</p>
  }

  const now = new Date()
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const thisMonday = todayUTC - ((new Date(todayUTC).getUTCDay() + 6) % 7) * DAY
  const minWeek = thisMonday - 12 * 7 * DAY
  const maxWeek = thisMonday + 7 * DAY

  // The chosen week must be a Monday inside the allowed range, otherwise use this week
  let week = thisMonday
  if (sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week)) {
    const t = new Date(`${sp.week}T00:00:00Z`).getTime()
    if (!isNaN(t) && new Date(t).getUTCDay() === 1 && t >= minWeek && t <= maxWeek) week = t
  }
  const monday = new Date(week)

  const sheet = await unscopedPrisma.timesheet.findUnique({
    where: { employeeId_weekStart: { employeeId: actor.employeeId, weekStart: monday } },
    include: { entries: { orderBy: { date: "asc" } } },
  })

  // Group entries by project into Monday to Friday columns
  const byProject = new Map<string, number[]>()
  for (const e of sheet?.entries ?? []) {
    const idx = Math.round((e.date.getTime() - week) / DAY)
    if (idx < 0 || idx > 4) continue
    const key = e.project ?? "Other"
    if (!byProject.has(key)) byProject.set(key, [0, 0, 0, 0, 0])
    byProject.get(key)![idx] += e.hours
  }
  const initialRows = Array.from(byProject.entries()).map(([project, hours]) => ({ project, hours }))

  const status = !sheet
    ? "none"
    : sheet.status === "submitted" || sheet.status === "approved"
      ? sheet.status
      : "draft"

  const dayLabels = [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(week + i * DAY)
    return `${["Mon", "Tue", "Wed", "Thu", "Fri"][i]} ${d.getUTCDate()}`
  })

  return (
    <TimesheetsPanel
      key={iso(week)}
      orgSlug={orgSlug}
      weekStart={iso(week)}
      weekLabel={`Week of ${fmtDay(monday)} to ${fmtDay(new Date(week + 4 * DAY))}`}
      dayLabels={dayLabels}
      status={status}
      initialRows={initialRows}
      prevHref={week > minWeek ? `/${orgSlug}/timesheets?week=${iso(week - 7 * DAY)}` : null}
      nextHref={week < maxWeek ? `/${orgSlug}/timesheets?week=${iso(week + 7 * DAY)}` : null}
    />
  )
}