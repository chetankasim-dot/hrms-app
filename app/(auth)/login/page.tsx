"use client"

import { useState, useTransition } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { findWorkspaces, type WorkspaceMatch } from "@/server/actions/login"

export default function LoginPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ email: "", password: "" })
  const [choices, setChoices] = useState<WorkspaceMatch[] | null>(null)

  async function enter(slug: string, email: string) {
    const result = await signIn("credentials", {
      email,
      password: form.password,
      orgSlug: slug,
      redirect: false,
    })
    if (result?.error) {
      setError("Invalid email or password")
      setChoices(null)
      return
    }
    router.push(`/${slug}`)
  }

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const matches = await findWorkspaces(form.email, form.password)
      if (matches.length === 0) {
        setError("Invalid email or password")
      } else if (matches.length === 1) {
        await enter(matches[0].slug, matches[0].email)
      } else {
        setChoices(matches)
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Sign in to HRMS</h1>
          <p className="text-gray-500 text-sm mt-1">
            {choices ? "Choose your workspace" : "Enter your email and password"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!choices && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
                placeholder="you@company.com"
                className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                required
                className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full h-10 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-center text-xs text-gray-500">
              No workspace?{" "}
              <Link href="/signup" className="text-black underline">Create one free</Link>
            </p>
          </form>
        )}

        {choices && (
          <div className="space-y-3">
            {choices.map((c) => (
              <button
                key={c.slug}
                disabled={isPending}
                onClick={() => {
                  setError(null)
                  startTransition(async () => { await enter(c.slug, c.email) })
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm hover:border-black disabled:opacity-50"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-gray-500">{c.slug}</div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setChoices(null)}
              className="w-full text-xs text-gray-500 hover:text-gray-800"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}