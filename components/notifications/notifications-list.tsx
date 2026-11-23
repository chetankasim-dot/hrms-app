"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/notifications"

type Item = {
  id: string
  title: string
  body: string
  link: string | null
  isRead: boolean
  createdAt: string
}

export function NotificationsList({ orgSlug, items }: { orgSlug: string; items: Item[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const unread = items.filter((i) => !i.isRead).length

  function readOne(id: string) {
    start(async () => {
      await markNotificationRead(orgSlug, id)
      router.refresh()
    })
  }

  function readAll() {
    start(async () => {
      await markAllNotificationsRead(orgSlug)
      router.refresh()
    })
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="mt-0.5 text-sm text-gray-500">{unread} unread</p>
        </div>
        {unread > 0 && (
          <button
            onClick={readAll}
            disabled={pending}
            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Mark all as read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
          You have no notifications yet.
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {items.map((n) => {
            const inner = (
              <div className="flex gap-3 p-4">
                <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${n.isRead ? "bg-gray-200" : "bg-teal-600"}`} />
                <div className="min-w-0">
                  <div className={`text-sm ${n.isRead ? "text-gray-700" : "font-semibold"}`}>{n.title}</div>
                  <div className="mt-0.5 text-sm text-gray-600">{n.body}</div>
                  <div className="mt-1 text-xs text-gray-400" suppressHydrationWarning>
                    {new Date(n.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            )
            return (
              <li key={n.id} className={n.isRead ? "" : "bg-teal-50/40"}>
                {n.link && n.link.startsWith("/") ? (
                  <Link href={n.link} onClick={() => !n.isRead && readOne(n.id)} className="block hover:bg-gray-50">
                    {inner}
                  </Link>
                ) : (
                  <button onClick={() => !n.isRead && readOne(n.id)} className="block w-full text-left hover:bg-gray-50">
                    {inner}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}