import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { getOrgChart, type OrgCard } from "@/server/employees-people"
import { ScrollEnd } from "@/components/people/scroll-end"

const DOT: Record<string, string> = {
  office: "bg-green-500",
  wfh: "bg-green-500",
  leave: "bg-amber-500",
  pending: "bg-red-500",
  exited: "bg-gray-400",
}

function Person({ p, openHref, profileHref, selected }: {
  p: OrgCard
  openHref: string
  profileHref: string
  selected?: boolean
}) {
  const hasTeam = p.size > 0
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-sm ${
        selected ? "border-teal-600 bg-teal-50" : "bg-white hover:border-teal-600"
      }`}
    >
      <Link href={hasTeam ? openHref : profileHref} className="flex min-w-0 flex-1 items-center gap-2">
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT[p.status]}`} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{p.name}</div>
          <div className="truncate text-gray-500">
            {p.designation}
            {p.status === "leave" ? " · on leave" : ""}
            {p.status === "pending" ? " · not in yet" : ""}
          </div>
        </div>
      </Link>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        {hasTeam && <span className="rounded-md border bg-gray-100 px-2 py-0.5 text-xs">{p.size}</span>}
        <Link href={profileHref} className="text-xs text-teal-700 underline">Profile</Link>
      </div>
    </div>
  )
}

export default async function OrgChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ root?: string; path?: string }>
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
  const MAX = 200

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
        <ScrollEnd dep={c.root.id + ":" + c.path.join(",")}>
          {c.columns.map((col, ci) => (
            <div key={ci} className="w-72 flex-shrink-0 space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">{col.title}</div>
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {col.cards.slice(0, MAX).map((p) => (
                  <Person
                    key={p.id}
                    p={p}
                    openHref={
                      ci === 0
                        ? `${base}?root=${c.root!.id}`
                        : `${base}?root=${c.root!.id}&path=${[...c.path.slice(0, ci - 1), p.id].join(",")}`
                    }
                    profileHref={`/${orgSlug}/people/${p.id}`}
                    selected={p.id === col.selectedId}
                  />
                ))}
                {col.cards.length > MAX && (
                  <div className="rounded-xl border border-dashed p-3 text-center text-sm text-gray-500">
                    +{col.cards.length - MAX} more. Use the Directory to find them.
                  </div>
                )}
                {col.cards.length === 0 && <div className="text-sm text-gray-500">No direct reports</div>}
              </div>
              {ci === 0 && <div className="text-sm text-gray-500">{c.root!.size} people</div>}
            </div>
          ))}
        </ScrollEnd>
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