"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { checkIn, checkOut } from "@/server/actions/attendance"

type Day = { date: string; num: number; kind: string }

type Props = {
  orgSlug: string
  todayLabel: string
  checkInAt: string | null
  checkOutAt: string | null
  mode: string | null
  hours: number | null
  days: Day[]
  present: number
  wfh: number
  missed: number
}

const DOT: Record<string, string> = {
  present: "bg-teal-600 text-white",
  wfh: "bg-slate-500 text-white",
  leave: "bg-amber-400 text-gray-900",
  missed: "bg-red-500 text-white",
  weekend: "bg-gray-200 text-gray-500",
  future: "border border-gray-200 bg-white text-gray-300",
  today: "ring-2 ring-teal-600 bg-white text-teal-700",
}

const LEGEND = [
  ["Present", "bg-teal-600"],
  ["Work from home", "bg-slate-500"],
  ["Leave", "bg-amber-400"],
  ["Missed", "bg-red-500"],
]

function timeOf(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

export function AttendancePanel(p: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState("")

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage("")
    start(async () => {
      const res = await fn()
      if (!res.ok) setMessage(res.message ?? "Something went wrong")
      router.refresh()
    })
  }

  const btn = "rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
  const primary = `${btn} border-teal-600 bg-teal-50 text-teal-800`
  const secondary = `${btn} bg-white text-gray-700`

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Attendance</h1>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5">
        <div>
          <div className="text-xs text-gray-500">{p.todayLabel}</div>
          <div className="mt-1 text-lg font-semibold">
            {!p.checkInAt && "Not checked in yet"}
            {p.checkInAt && !p.checkOutAt && (
              <span suppressHydrationWarning>
                Checked in at {timeOf(p.checkInAt)} · {p.mode === "wfh" ? "Home" : "Office"}
              </span>
            )}
            {p.checkInAt && p.checkOutAt && (
              <span suppressHydrationWarning>
                Done for today · {timeOf(p.checkInAt)} to {timeOf(p.checkOutAt)}
                {p.hours !== null ? ` · ${p.hours} hrs` : ""}
              </span>
            )}
          </div>
          {message && <div className="mt-1 text-sm text-red-600">{message}</div>}
        </div>
        <div className="flex gap-2">
          {!p.checkInAt && (
            <>
              <button disabled={pending} onClick={() => run(() => checkIn(p.orgSlug, "office"))} className={primary}>
                Check in (Office)
              </button>
              <button disabled={pending} onClick={() => run(() => checkIn(p.orgSlug, "wfh"))} className={secondary}>
                Work from home
              </button>
            </>
          )}
          {p.checkInAt && !p.checkOutAt && (
            <button disabled={pending} onClick={() => run(() => checkOut(p.orgSlug))} className={primary}>
              Check out
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          ["Present", p.present, "bg-teal-600"],
          ["Work from home", p.wfh, "bg-slate-500"],
          ["Missed days", p.missed, "bg-red-500"],
        ].map(([label, value, dot]) => (
          <div key={label as string} className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              {label}
              <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            </div>
            <div className="mt-1 text-3xl font-semibold">{value}</div>
            <div className="text-xs text-gray-500">last 4 weeks</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-5">
        <div className="mb-3 text-sm font-semibold">Last 4 weeks</div>
        <div className="grid max-w-sm grid-cols-7 gap-2 text-center text-xs text-gray-500">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
          {p.days.map((d) => (
            <div
              key={d.date}
              title={d.date}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[11px] ${DOT[d.kind]}`}
            >
              {d.num}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
          {LEGEND.map(([label, dot]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}