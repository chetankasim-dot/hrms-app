import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { getDirectory, type PersonCard } from "@/server/employees-people"
import { FilterBar } from "@/components/people/dashboard"

type SP = { q?: string; view?: string; department?: string; location?: string; status?: string }

const DOT: Record<string, string> = {
  office: "bg-green-500",
  wfh: "bg-green-500",
  leave: "bg-amber-500",
  pending: "bg-red-500",
  exited: "bg-gray-400",
}

function Cards({ cards, orgSlug }: { cards: PersonCard[]; orgSlug: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((p) => (
        <Link
          key={p.id}
          href={`/${orgSlug}/people/${p.id}`}
          className="flex items-center gap-3 rounded-xl border bg-white p-4 hover:border-teal-600"
        >
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 border-teal-600 bg-teal-50 text-sm font-semibold">
            {p.initials}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.name}</div>
            <div className="truncate text-sm text-gray-500">{p.designation}</div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT[p.status]}`} />
              {p.statusLabel}
            </div>
          </div>
        </Link>
      ))}
      {cards.length === 0 && <div className="text-sm text-gray-500">No people found</div>}
    </div>
  )
}

export default async function DirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<SP>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const session = await auth()

  let data
  try {
    data = await getDirectory(orgSlug, { userId: session?.user?.id, orgId: session?.user?.orgId }, sp)
  } catch {
    notFound()
  }

  const view = sp.view ?? "all"
  const link = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...changes })) if (v) p.set(k, v)
    const s = p.toString()
    return `/${orgSlug}/people/directory${s ? "?" + s : ""}`
  }

  const subTabs = [
    { key: "all", label: `All (${data.activeCount})` },
    { key: "designation", label: "By designation" },
    { key: "location", label: "By location" },
    { key: "ex", label: `Ex-employees (${data.exCount})` },
  ]

  const groups: Record<string, PersonCard[]> = {}
  if (view === "designation" || view === "location") {
    for (const c of data.cards) {
      const key = view === "designation" ? c.designation : c.location
      ;(groups[key] ??= []).push(c)
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar departments={data.departments} locations={data.locations} />

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search by name, role, code or department"
          className="w-full rounded-xl border-2 border-teal-600 bg-white px-4 py-2.5 text-sm"
        />
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        {sp.department && <input type="hidden" name="department" value={sp.department} />}
        {sp.location && <input type="hidden" name="location" value={sp.location} />}
      </form>

      <div className="flex gap-6 text-sm">
        {subTabs.map((t) => (
          <Link
            key={t.key}
            href={link({ view: t.key === "all" ? undefined : t.key, status: undefined })}
            className={view === t.key ? "font-medium text-teal-700" : "text-gray-500"}
          >
            {t.label}
          </Link>
        ))}
                <Link href={`/${orgSlug}/people/org-chart`} className="text-gray-500">Org chart</Link>
      </div>

      {view !== "ex" && data.pendingCount > 0 && (
        <div className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm">
          {data.pendingCount} {data.pendingCount === 1 ? "person is" : "people are"} yet to check in.{" "}
          {sp.status === "pending" ? (
            <Link href={link({ status: undefined })} className="font-medium underline">Show all</Link>
          ) : (
            <Link href={link({ status: "pending" })} className="font-medium underline">View list</Link>
          )}
        </div>
      )}

      {view === "designation" || view === "location" ? (
        Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, cards]) => (
            <div key={name}>
              <div className="mb-2 text-sm font-semibold">{name} ({cards.length})</div>
              <Cards cards={cards} orgSlug={orgSlug} />
            </div>
          ))
      ) : (
        <Cards cards={data.cards} orgSlug={orgSlug} />
      )}
    </div>
  )
}