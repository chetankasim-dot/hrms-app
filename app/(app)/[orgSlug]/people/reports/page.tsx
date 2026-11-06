import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { getTeamReport } from "@/server/employees-people"
import { FilterBar } from "@/components/people/dashboard"

function Card({ title, children, tint }: { title: string; children: React.ReactNode; tint?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 text-sm ${tint ? "border-teal-600 bg-teal-50" : "bg-white"}`}>
      <div className="mb-3 font-semibold">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, dot }: { label: string; value: number | string; dot?: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        {dot && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </li>
  )
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ department?: string; location?: string }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const session = await auth()

  let r
  try {
    r = await getTeamReport(orgSlug, { userId: session?.user?.id, orgId: session?.user?.orgId }, sp)
  } catch {
    notFound()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">
          {r.title} · {r.total} members
        </h2>
        <FilterBar departments={r.departments} locations={r.locationNames} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Team availability today">
          <ul className="space-y-2">
            <Row label="Work from office" value={r.availability.office} dot="bg-green-500" />
            <Row label="Work from home" value={r.availability.wfh} dot="bg-green-500" />
            <Row label="Yet to check in" value={r.availability.pending} dot="bg-red-500" />
            <Row label="On leave" value={r.availability.leave} dot="bg-amber-500" />
          </ul>
        </Card>

        <Card title="Location diversity">
          <ul className="space-y-2">
            {r.locations.map((l) => (
              <Row key={l.name} label={l.name} value={l.count} />
            ))}
            {r.locations.length === 0 && <li className="text-gray-500">No data</li>}
          </ul>
        </Card>

        <Card title="Smart alerts" tint>
          <ul className="list-disc space-y-1 pl-4">
            {r.alerts.map((a) => (
              <li key={a}>{a}</li>
            ))}
            {r.alerts.length === 0 && <li className="list-none text-gray-500">No alerts today</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ex-employees, last 12 months">
          <ul className="space-y-2">
            {r.exits.map((e) => (
              <li key={e.name + e.date} className="flex justify-between">
                <span>{e.name}</span>
                <span className="text-gray-500">{e.date}</span>
                <span>{e.tenure}</span>
              </li>
            ))}
            {r.exits.length === 0 && <li className="text-gray-500">No exits</li>}
          </ul>
        </Card>

        <Card title="Reports">
          <ul className="space-y-1 text-gray-700">
            <li>Leave: balance, Bradford score, loss of pay</li>
            <li>Attendance: check-ins, presence hours</li>
            <li>Time: logs, scheduled vs worked</li>
            <li>Performance: goals, appraisal, nine-box</li>
            <li>Learning: learner and plan progress</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}