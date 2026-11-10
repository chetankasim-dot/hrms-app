"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { DashboardData } from "@/server/employees-dashboard"
import { approveItem } from "@/server/actions/dashboard"

/* ---------- Tabs (used by people/layout.tsx) ---------- */

export function PeopleTabs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname()
  const base = `/${orgSlug}/people`
  const tabs = [
    { label: "Dashboard", href: base },
    { label: "Directory", href: `${base}/directory` },
    { label: "Approvals", href: `${base}/approvals` },
    { label: "Reports", href: `${base}/reports` },
  ]
  return (
    <div className="flex gap-6 border-b">
      {tabs.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`pb-2 text-sm ${
              active
                ? "border-b-2 border-teal-600 font-medium text-teal-700"
                : "text-gray-500"
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

/* ---------- Filters ---------- */

export function FilterBar({
  departments,
  locations,
}: {
  departments: string[]
  locations: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function set(key: string, value: string) {
    const p = new URLSearchParams(sp.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    router.push(`${pathname}?${p.toString()}`)
  }

  const cls = "rounded-lg border bg-white px-3 py-1.5 text-sm"
  return (
    <div className="flex justify-end gap-2">
      <select
        className={cls}
        value={sp.get("department") ?? ""}
        onChange={(e) => set("department", e.target.value)}
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        className={cls}
        value={sp.get("location") ?? ""}
        onChange={(e) => set("location", e.target.value)}
      >
        <option value="">All locations</option>
        {locations.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ---------- KPI card ---------- */

function StatCard({
  label,
  value,
  sub,
  dot,
}: {
  label: string
  value: number
  sub: string
  dot: string
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between text-sm text-gray-500">
        {label}
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  )
}

/* ---------- Main dashboard ---------- */

export function DashboardView({
  data,
  orgSlug,
}: {
  data: DashboardData
  orgSlug: string
}) {
  return (
    <div className="space-y-4">
      <FilterBar departments={data.departments} locations={data.locations} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Headcount"
          value={data.headcount}
          sub={`${data.newThisMonth} new this month`}
          dot="bg-teal-600"
        />
        <StatCard
          label="Working today"
          value={data.workingToday}
          sub={`${data.workingFromHome} from home`}
          dot="bg-green-500"
        />
        <StatCard
          label="On leave"
          value={data.onLeave}
          sub={`${data.onLeaveInMyTeam} in your team`}
          dot="bg-amber-500"
        />
        <StatCard
          label="Yet to check in"
          value={data.yetToCheckIn}
          sub={`as of ${data.asOf}`}
          dot="bg-red-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ApprovalsInbox items={data.approvals} orgSlug={orgSlug} />
        <HeadcountByDepartment rows={data.headcountByDepartment} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Celebrations {...data.celebrations} />
        <AskHrAi orgSlug={orgSlug} />
      </div>
    </div>
  )
}

/* ---------- Approvals inbox ---------- */

function ApprovalsInbox({
  items,
  orgSlug,
}: {
  items: DashboardData["approvals"]
  orgSlug: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function approve(a: DashboardData["approvals"][number]) {
    setError("")
    startTransition(async () => {
      try {
        await approveItem(a.kind, a.id, orgSlug)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed")
      }
    })
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex justify-between text-sm">
        <span className="font-semibold">Approvals inbox</span>
        <span className="text-gray-500">{items.length} pending</span>
      </div>
      {error && <div className="mb-2 text-sm text-red-600">{error}</div>}
      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.kind + a.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="font-medium">{a.employeeName}</span>
            <span className="text-gray-500">
              {a.kind}, {a.detail}
            </span>
            <button
              disabled={pending}
              onClick={() => approve(a)}
              className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-1 text-teal-800 disabled:opacity-50"
            >
              Approve
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-gray-500">Nothing pending</li>
        )}
      </ul>
    </div>
  )
}

/* ---------- Headcount by department ---------- */

function HeadcountByDepartment({
  rows,
}: {
  rows: DashboardData["headcountByDepartment"]
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 text-sm font-semibold">Headcount by department</div>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex justify-between">
            <span>{r.name}</span>
            <span>{r.count}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-gray-500">No employees yet</li>
        )}
      </ul>
    </div>
  )
}

/* ---------- Celebrations ---------- */

function Celebrations({
  birthdays,
  newHires,
}: DashboardData["celebrations"]) {
  return (
    <div className="rounded-xl border bg-white p-4 text-sm">
      <div className="mb-2 font-semibold">Celebrations</div>
      <div>Birthday: {birthdays.join(", ") || "None"}</div>
      <div>New hires: {newHires.join(", ") || "None"}</div>
    </div>
  )
}

/* ---------- Ask HR AI ---------- */

function AskHrAi({ orgSlug }: { orgSlug: string }) {
  const [q, setQ] = useState("")
  const [answer, setAnswer] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)

  async function ask() {
    const question = q.trim()
    if (!question || loading) return
    setLoading(true)
    setAnswer("")
    setStatus("Thinking…")

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, orgSlug, history: [] }),
      })
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let full = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // events end with a blank line; keep any partial event in the buffer
        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "text") {
              full += event.text
              setAnswer(full)
              setStatus("")
            } else if (event.type === "tool_start") {
              setStatus("Looking up data…")
            } else if (event.type === "error") {
              setAnswer(event.message ?? "The assistant failed.")
              setStatus("")
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch {
      setAnswer("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
      setStatus("")
    }
  }

  return (
    <div className="rounded-xl border border-teal-600 bg-teal-50 p-4 text-sm">
      <div className="mb-2 font-semibold">Ask HR AI</div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ask()}
        disabled={loading}
        placeholder="Who in my team is on leave this week?"
        className="w-full rounded-lg border bg-white px-3 py-2 disabled:opacity-60"
      />
      {status && <div className="mt-2 text-gray-500">{status}</div>}
      {answer && (
        <div className="prose prose-sm mt-2 max-h-64 max-w-none overflow-y-auto text-gray-800 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}