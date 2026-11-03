"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function SignupPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "", email: "", password: "", orgName: ""
  })

  const slug = form.orgName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Signup failed")
        router.push(`/login?workspace=${data.slug}&created=true`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Create your workspace</h1>
          <p className="text-gray-500 text-sm mt-1">Start your 14-day free trial</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Your name</label>
            <input type="text" value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              required placeholder="Priya Sharma"
              className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Work email</label>
            <input type="email" value={form.email}
              onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
              required placeholder="you@company.com"
              className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Password</label>
            <input type="password" value={form.password}
              onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
              required placeholder="At least 8 characters"
              className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Company name</label>
            <input type="text" value={form.orgName}
              onChange={(e) => setForm(p => ({ ...p, orgName: e.target.value }))}
              required placeholder="Acme Technologies"
              className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            {slug && (
              <p className="text-xs text-gray-400 mt-1">
                Workspace: <span className="font-mono text-gray-600">{slug}</span>
              </p>
            )}
          </div>
          <button type="submit" disabled={isPending}
            className="w-full h-10 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {isPending ? "Creating workspace…" : "Create workspace →"}
          </button>
          <p className="text-center text-xs text-gray-500">
            Already have a workspace?{" "}
            <Link href="/login" className="text-black underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}