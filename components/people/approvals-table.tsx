"use client"

import { useState, useTransition } from "react"
import { approveMany } from "@/server/actions/dashboard"
import type { ApprovalRow } from "@/server/employees-people"

export function ApprovalsTable({ rows, orgSlug }: { rows: ApprovalRow[]; orgSlug: string }) {
  const keyOf = (r: ApprovalRow) => r.kind + ":" + r.id
  // Safe requests start ticked, flagged ones don't
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.safe).map(keyOf))
  )
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState("")

  function toggle(k: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function approveSelected() {
    const items = rows
      .filter((r) => selected.has(keyOf(r)))
      .map((r) => ({ kind: r.kind, id: r.id }))
    if (items.length === 0) return
    setMessage("")
    startTransition(async () => {
      const res = await approveMany(items, orgSlug)
      setSelected(new Set())
      setMessage(
        res.failed > 0
          ? `${res.approved} approved, ${res.failed} failed (not allowed or already handled)`
          : `${res.approved} approved`
      )
    })
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b p-4">
        <span className="text-sm text-gray-500">{rows.length} pending</span>
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-gray-600">{message}</span>}
          <button
            onClick={approveSelected}
            disabled={pending || selected.size === 0}
            className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-800 disabled:opacity-50"
          >
            Approve selected ({selected.size})
          </button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="w-10 p-3" />
            <th className="p-3 font-normal">Employee</th>
            <th className="p-3 font-normal">Request</th>
            <th className="p-3 font-normal">Details</th>
            <th className="p-3 font-normal">Check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = keyOf(r)
            return (
              <tr key={k} className="border-t">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(k)}
                    onChange={() => toggle(k)}
                    className="h-4 w-4 accent-teal-600"
                  />
                </td>
                <td className="p-3 font-medium">{r.employeeName}</td>
                <td className="p-3">{r.request}</td>
                <td className="p-3 text-gray-500">{r.details}</td>
                <td className="p-3">
                  <span
                    className={`rounded-lg border px-3 py-1 text-xs ${
                      r.safe
                        ? "border-green-600 bg-green-50 text-green-800"
                        : "border-amber-500 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {r.checkLabel}
                  </span>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-gray-500">
                Nothing pending
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}