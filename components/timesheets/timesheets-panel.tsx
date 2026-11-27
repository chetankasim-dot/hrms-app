"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { saveTimesheet } from "@/server/actions/timesheets"

type Row = { project: string; hours: string[] }

type Props = {
  orgSlug: string
  weekStart: string
  weekLabel: string
  dayLabels: string[]
  status: "none" | "draft" | "submitted" | "approved"
  initialRows: { project: string; hours: number[] }[]
  prevHref: string | null
  nextHref: string | null
}

const SCHEDULED = 40

const STATUS: Record<string, { label: string; cls: string }> = {
  none: { label: "Draft", cls: "bg-amber-100 text-amber-800" },
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-800" },
  submitted: { label: "Submitted", cls: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
}

const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

export function TimesheetsPanel(p: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState("")
  const [done, setDone] = useState("")

  const locked = p.status === "submitted" || p.status === "approved"
  const [rows, setRows] = useState<Row[]>(
    p.initialRows.length > 0
      ? p.initialRows.map((r) => ({ project: r.project, hours: r.hours.map((h) => (h ? String(h) : "")) }))
      : [{ project: "", hours: ["", "", "", "", ""] }]
  )

  const dayTotals = [0, 1, 2, 3, 4].map((i) => rows.reduce((a, r) => a + num(r.hours[i]), 0))
  const grand = dayTotals.reduce((a, b) => a + b, 0)
  const pct = Math.min(100, Math.round((grand / SCHEDULED) * 100))
  const st = STATUS[p.status]

  function setProject(i: number, v: string) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, project: v } : r)))
  }
  function setHour(i: number, d: number, v: string) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, hours: r.hours.map((h, j) => (j === d ? v : h)) } : r)))
  }
  function addRow() {
    setRows((rs) => (rs.length >= 20 ? rs : [...rs, { project: "", hours: ["", "", "", "", ""] }]))
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? [{ project: "", hours: ["", "", "", "", ""] }] : rs.filter((_, k) => k !== i)))
  }

  function save(submit: boolean) {
    setMessage("")
    setDone("")
    if (submit && !window.confirm("Submit this timesheet for approval? You cannot edit it afterwards.")) return
    start(async () => {
      const res = await saveTimesheet(
        p.orgSlug,
        p.weekStart,
        rows.map((r) => ({ project: r.project, hours: r.hours.map(num) })),
        submit
      )
      if (!res.ok) setMessage(res.message ?? "Something went wrong")
      else setDone(submit ? "Submitted for approval" : "Draft saved")
      router.refresh()
    })
  }

  const btn = "rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
  const cell = "w-full rounded-md border border-gray-200 px-2 py-1.5 text-center text-sm disabled:bg-gray-50 disabled:text-gray-500"

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="mt-0.5 text-sm text-gray-500">{p.weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
          {p.prevHref ? (
            <Link href={p.prevHref} className="rounded-lg border bg-white px-3 py-1.5 text-sm">&larr; Previous</Link>
          ) : (
            <span className="rounded-lg border bg-gray-50 px-3 py-1.5 text-sm text-gray-300">&larr; Previous</span>
          )}
          {p.nextHref ? (
            <Link href={p.nextHref} className="rounded-lg border bg-white px-3 py-1.5 text-sm">Next &rarr;</Link>
          ) : (
            <span className="rounded-lg border bg-gray-50 px-3 py-1.5 text-sm text-gray-300">Next &rarr;</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white p-4">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-2 pr-2 font-medium">Project / task</th>
              {p.dayLabels.map((d) => (
                <th key={d} className="w-16 pb-2 text-center font-medium">{d}</th>
              ))}
              <th className="w-14 pb-2 text-center font-medium">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <input
                    value={r.project}
                    onChange={(e) => setProject(i, e.target.value)}
                    disabled={locked}
                    maxLength={80}
                    placeholder="Project or task"
                    className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </td>
                {r.hours.map((h, d) => (
                  <td key={d} className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.25}
                      value={h}
                      onChange={(e) => setHour(i, d, e.target.value)}
                      disabled={locked}
                      className={cell}
                    />
                  </td>
                ))}
                <td className="text-center font-medium">{fmt(r.hours.reduce((a, v) => a + num(v), 0))}</td>
                <td className="text-center">
                  {!locked && (
                    <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-600" aria-label="Remove row">
                      &times;
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t">
              <td className="pt-2 font-semibold">Total</td>
              {dayTotals.map((t, i) => (
                <td key={i} className={`pt-2 text-center font-semibold ${t > 24 ? "text-red-600" : ""}`}>{fmt(t)}</td>
              ))}
              <td className="pt-2 text-center font-semibold">{fmt(grand)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        {!locked && rows.length < 20 && (
          <button onClick={addRow} className="mt-3 text-sm text-teal-700 underline">+ Add a row</button>
        )}
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-teal-800">{fmt(grand)} of {SCHEDULED} hours scheduled</div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-teal-600" style={{ width: pct + "%" }} />
        </div>
      </div>

      {message && <div className="text-sm text-red-600">{message}</div>}
      {done && <div className="text-sm text-green-700">{done}</div>}

      {locked ? (
        <p className="text-sm text-gray-500">
          This week is {p.status}. It can no longer be edited here.
        </p>
      ) : (
        <div className="flex gap-2">
          <button disabled={pending} onClick={() => save(false)} className={`${btn} bg-white text-gray-700`}>
            {pending ? "Saving..." : "Save draft"}
          </button>
          <button disabled={pending} onClick={() => save(true)} className={`${btn} border-teal-600 bg-teal-50 text-teal-800`}>
            Submit for approval
          </button>
        </div>
      )}
    </div>
  )
}