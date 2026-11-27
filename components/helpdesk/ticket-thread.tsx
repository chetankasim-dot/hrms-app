"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { replyToTicket, setTicketStatus } from "@/server/actions/helpdesk"

type Message = {
  id: string
  author: string
  isHrAuthor: boolean
  isMe: boolean
  isAI: boolean
  content: string
  createdAt: string
}

type Props = {
  orgSlug: string
  ticket: {
    id: string
    title: string
    category: string
    status: string
    createdAt: string
    assignee: string | null
  }
  messages: Message[]
  isHr: boolean
}

const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "bg-amber-100 text-amber-800" },
  IN_PROGRESS: { label: "In progress", cls: "bg-blue-100 text-blue-700" },
  ON_HOLD: { label: "On hold", cls: "bg-gray-100 text-gray-600" },
  RESOLVED: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700" },
  CLOSED: { label: "Closed", cls: "bg-gray-100 text-gray-500" },
}

const ACTIONS: [string, string][] = [
  ["IN_PROGRESS", "In progress"],
  ["ON_HOLD", "On hold"],
  ["RESOLVED", "Resolved"],
  ["CLOSED", "Close"],
  ["OPEN", "Reopen"],
]

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

export function TicketThread({ orgSlug, ticket, messages, isHr }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [text, setText] = useState("")
  const [message, setMessage] = useState("")

  const st = STATUS[ticket.status] ?? STATUS.OPEN
  const closed = ticket.status === "CLOSED"

  function send(e: React.FormEvent) {
    e.preventDefault()
    setMessage("")
    start(async () => {
      const res = await replyToTicket(orgSlug, ticket.id, text)
      if (!res.ok) {
        setMessage(res.message ?? "Could not send the reply")
        return
      }
      setText("")
      router.refresh()
    })
  }

  function changeStatus(status: string) {
    setMessage("")
    start(async () => {
      const res = await setTicketStatus(orgSlug, ticket.id, status)
      if (!res.ok) {
        setMessage(res.message ?? "Could not update the ticket")
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Link href={`/${orgSlug}/helpdesk`} className="text-sm text-gray-500 hover:text-black">
        &larr; Back to Help desk
      </Link>

      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold break-words">{ticket.title}</h1>
            <p className="mt-1 text-sm text-gray-500" suppressHydrationWarning>
              {ticket.category} · opened {when(ticket.createdAt)}
              {ticket.assignee ? ` · handled by ${ticket.assignee}` : ""}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
        </div>

        {isHr && (
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            {ACTIONS.filter(([value]) => value !== ticket.status).map(([value, label]) => (
              <button
                key={value}
                disabled={pending}
                onClick={() => changeStatus(value)}
                className="rounded-lg border bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-teal-600 disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm ${
                m.isMe ? "border-teal-600 bg-teal-50" : "bg-white"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-800">{m.isMe ? "You" : m.author}</span>
                {m.isHrAuthor && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">HR</span>}
                {m.isAI && <span className="rounded-full bg-gray-100 px-2 py-0.5">AI</span>}
                <span suppressHydrationWarning>{when(m.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          </li>
        ))}
      </ul>

      {message && <div className="text-sm text-red-600">{message}</div>}

      {closed ? (
        <p className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-500">
          This ticket is closed.{isHr ? " Use Reopen above to continue it." : " Raise a new ticket if you still need help."}
        </p>
      ) : (
        <form onSubmit={send} className="space-y-3 rounded-xl border bg-white p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            required
            placeholder="Write a reply..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 disabled:opacity-50"
          >
            {pending ? "Sending..." : "Send reply"}
          </button>
        </form>
      )}
    </div>
  )
}