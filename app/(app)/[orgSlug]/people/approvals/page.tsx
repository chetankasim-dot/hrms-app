import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { getApprovalRows } from "@/server/employees-people"
import { ApprovalsTable } from "@/components/people/approvals-table"

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const session = await auth()

  let rows
  try {
    rows = await getApprovalRows(orgSlug, { userId: session?.user?.id, orgId: session?.user?.orgId }, sp.type)
  } catch {
    notFound()
  }

  const types = [
    { key: undefined, label: "All requests" },
    { key: "Leave", label: "Leave" },
    { key: "Timesheet", label: "Timesheets" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        {types.map((t) => (
          <Link
            key={t.label}
            href={`/${orgSlug}/people/approvals${t.key ? "?type=" + t.key : ""}`}
            className={`rounded-lg border px-3 py-1.5 ${
              sp.type === t.key ? "border-teal-600 bg-teal-50 text-teal-800" : "bg-white text-gray-600"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <ApprovalsTable key={sp.type ?? "all"} rows={rows} orgSlug={orgSlug} />
    </div>
  )
}