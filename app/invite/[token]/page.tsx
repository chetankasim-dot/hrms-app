"use client"

import { useState, useTransition } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { acceptInvite } from "@/server/actions/invites"

export default function InvitePage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    startTransition(async () => {
      const res = await acceptInvite(token, password)
      if (res.ok) setDone(true)
      else setError(res.message ?? "Something went wrong")
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Welcome to HRMS</h1>
          <p className="text-gray-500 text-sm mt-1">
            {done ? "Your password is set" : "Set a password to activate your account"}
          </p>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-green-700">You can now sign in with your email and password.</p>
            <Link
              href="/login"
              className="block w-full h-10 leading-10 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                autoComplete="new-password"
                className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <p className="mt-1 text-xs text-gray-400">At least 10 characters</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full h-10 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}