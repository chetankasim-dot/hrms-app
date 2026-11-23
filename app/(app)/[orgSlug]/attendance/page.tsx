import { notFound } from "next/navigation"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { AttendancePanel } from "@/components/attendance/attendance-panel"

export const metadata = { title: "Attendance" }

const DAY = 86400000

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

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
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const mondayIndex = (today.getUTCDay() + 6) % 7          // Monday = 0
  const start = new Date(today.getTime() - (mondayIndex + 21) * DAY)  // four week rows, last row is this week

  const [records, leaves] = await Promise.all([
    unscopedPrisma.attendanceRecord.findMany({
      where: { orgId: actor.orgId, employeeId: actor.employeeId, date: { gte: start, lte: today } },
    }),
    unscopedPrisma.leaveRequest.findMany({
      where: {
        orgId: actor.orgId,
        employeeId: actor.employeeId,
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
        fromDate: { lte: today },
        toDate: { gte: start },
      },
      select: { fromDate: true, toDate: true },
    }),
  ])

  const byDate = new Map(records.map((r) => [r.date.getTime(), r]))
  let present = 0
  let wfh = 0
  let missed = 0

  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY)
    const t = d.getTime()
    const weekday = (d.getUTCDay() + 6) % 7 < 5
    const rec = byDate.get(t)
    const onLeave = leaves.some((l) => l.fromDate.getTime() <= t && l.toDate.getTime() >= t)

    let kind: string
    if (t > today.getTime()) kind = "future"
    else if (!weekday) kind = "weekend"
    else if (rec?.checkIn) kind = rec.status === "wfh" ? "wfh" : "present"
    else if (onLeave) kind = "leave"
    else if (t === today.getTime()) kind = "today"
    else kind = "missed"

    if (kind === "present") present++
    if (kind === "wfh") wfh++
    if (kind === "missed") missed++

    return { date: d.toISOString().slice(0, 10), num: d.getUTCDate(), kind }
  })

  const rec = byDate.get(today.getTime())

  return (
    <AttendancePanel
      orgSlug={orgSlug}
      todayLabel={today.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", timeZone: "UTC" })}
      checkInAt={rec?.checkIn ? rec.checkIn.toISOString() : null}
      checkOutAt={rec?.checkOut ? rec.checkOut.toISOString() : null}
      mode={rec?.status ?? null}
      hours={rec?.hoursWorked ?? null}
      days={days}
      present={present}
      wfh={wfh}
      missed={missed}
    />
  )
}