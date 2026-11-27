"use client"

import { useState, useTransition } from "react"
import { changePassword } from "@/server/actions/account"

export function ChangePassword({ orgSlug }: { orgSlug: string }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState("")
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage("")
    setDone(false)
    if (next !== confirm) {
      setMessage("The new passwords do not match")
      return
    }
    start(async () => {
      const res = await changePassword(orgSlug, current, next)
      if (res.ok) {
        setDone(true)
        setCurrent("")
        setNext("")
        setConfirm("")
      } else setMessage(res.message ?? "Something went wrong")
    })
  }

  const input = "mt-1.5 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-black focus:outline-none"

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5">
      <div>
        <label className="text-xs font-medium text-gray-600">Current password</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" className={input} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">New password</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} autoComplete="new-password" className={input} />
        <p className="mt-1 text-xs text-gray-400">At least 10 characters</p>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" className={input} />
      </div>
      {message && <div className="text-sm text-red-600">{message}</div>}
      {done && <div className="text-sm text-green-700">Password changed.</div>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Change password"}
      </button>
    </form>
  )
}