"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createTicket } from "@/server/actions/helpdesk"

type Ticket = {
  id: string
  title: string
  category: string
  status: string
  createdAt: string
  by: string | null
}

const CATEGORIES = ["IT", "HR", "Finance", "Letter request", "Expense claim", "Other"]

const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "bg-amber-100 text-amber-800" },
  IN_PROGRESS: { label: "In progress", cls: "bg-blue-100 text-blue-700" },
  ON_HOLD: { label: "On hold", cls: "bg-gray-100 text-gray-600" },
  RESOLVED: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700" },
  CLOSED: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
}

export function HelpdeskList({
  orgSlug,
  tickets,
  showAll,
  isHr,
}: {
  orgSlug: string
  tickets: Ticket[]
  showAll: boolean
  isHr: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(CATEGORIES[0])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [message, setMessage] = useState("")
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage("")
    start(async () => {
      const res = await createTicket(orgSlug, { title, description, category })
      if (!res.ok) {
        setMessage(res.message ?? "Something went wrong")
        return
      }
      setTitle("")
      setDescription("")
      setOpen(false)
      router.refresh()
    })
  }

  const field = "mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
  const base = `/${orgSlug}/helpdesk`

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Help desk</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isHr ? "All tickets in your company" : "Your tickets"}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800"
        >
          {open ? "Close" : "+ New ticket"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5">
          <div>
            <label className="text-xs font-medium text-gray-600">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} className={field} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Describe the request</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={5} maxLength={2000} rows={4} className={field} />
          </div>
          {message && <div className="text-sm text-red-600">{message}</div>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 disabled:opacity-50"
          >
            {pending ? "Sending..." : "Submit ticket"}
          </button>
        </form>
      )}

      <div className="flex gap-4 border-b text-sm">
        <Link href={base} className={`pb-2 ${!showAll ? "border-b-2 border-teal-600 font-medium text-teal-700" : "text-gray-500"}`}>
          Open
        </Link>
        <Link href={`${base}?show=all`} className={`pb-2 ${showAll ? "border-b-2 border-teal-600 font-medium text-teal-700" : "text-gray-500"}`}>
          All
        </Link>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
          {showAll ? "No tickets yet." : "No open tickets."}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {tickets.map((t) => {
            const st = STATUS[t.status] ?? STATUS.OPEN
            return (
              <li key={t.id}>
                <Link href={`${base}/${t.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t.title}</div>
                    <div className="mt-0.5 text-xs text-gray-500" suppressHydrationWarning>
                      {t.category}
                      {isHr && t.by ? ` · ${t.by}` : ""} ·{" "}
                      {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </div>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}