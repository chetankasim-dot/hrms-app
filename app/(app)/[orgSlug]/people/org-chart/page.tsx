import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { getOrgChart, type OrgCard } from "@/server/employees-people"

const DOT: Record<string, string> = {
  office: "bg-green-500",
  wfh: "bg-green-500",
  leave: "bg-amber-500",
  pending: "bg-red-500",
  exited: "bg-gray-400",
}

function Person({ p, href, selected, badge }: {
  p: OrgCard
  href: string
  selected?: boolean
  badge?: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm hover:border-teal-600 ${
        selected ? "border-teal-600 bg-teal-50" : "bg-white"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {!badge && <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT[p.status]}`} />}
        <div className="min-w-0">
          <div className="truncate font-semibold">{p.name}</div>
          <div className="truncate text-gray-500">
            {p.designation}
            {!badge && p.status === "leave" ? " · on leave" : ""}
            {!badge && p.status === "pending" ? " · not in yet" : ""}
          </div>
        </div>
      </div>
      {badge && (
        <span className="rounded-md border bg-gray-100 px-2 py-0.5 text-xs">{p.size}</span>
      )}
    </Link>
  )
}

export default async function OrgChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ root?: string; team?: string }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const session = await auth()

  let c
  try {
    c = await getOrgChart(orgSlug, { userId: session?.user?.id, orgId: session?.user?.orgId }, sp)
  } catch {
    notFound()
  }

  const base = `/${orgSlug}/people/org-chart`
  const MAX = 5

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        <Link href={`/${orgSlug}/people/directory`} className="underline">Directory</Link> › Org chart
      </div>

      <div className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm">
        {c.summary}
      </div>

      {!c.root ? (
        <div className="text-sm text-gray-500">No employees yet</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">Top</div>
            <Person p={c.root} href={`${base}?root=${c.root.id}`} selected badge />
            <div className="text-sm text-gray-500">{c.root.size} people</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">Direct reports</div>
            {c.reports.map((r) => (
              <Person
                key={r.id}
                p={r}
                href={`${base}?root=${c.root!.id}&team=${r.id}`}
                selected={r.id === c.team?.id}
                badge
              />
            ))}
            {c.reports.length === 0 && <div className="text-sm text-gray-500">No direct reports</div>}
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {c.team ? `${c.team.name}'s team` : "Team"}
            </div>
            {c.members.slice(0, MAX).map((m) => (
              <Person key={m.id} p={m} href={`/${orgSlug}/people/${m.id}`} />
            ))}
            {c.members.length > MAX && (
              <div className="rounded-xl border border-dashed p-3 text-center text-sm text-gray-500">
                +{c.members.length - MAX} more in this team
              </div>
            )}
            {c.members.length === 0 && <div className="text-sm text-gray-500">Select a manager with a team</div>}
          </div>
        </div>
      )}

      {c.otherRoots.length > 0 && (
        <div className="text-sm">
          <div className="mb-2 text-gray-500">Other top-level people</div>
          <div className="flex flex-wrap gap-2">
            {c.otherRoots.map((r) => (
              <Link key={r.id} href={`${base}?root=${r.id}`} className="rounded-lg border bg-white px-3 py-1 hover:border-teal-600">
                {r.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}