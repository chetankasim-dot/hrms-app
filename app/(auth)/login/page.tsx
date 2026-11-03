"use client"

import { useState, useTransition } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ workspace: "", email: "", password: "" })
  const [step, setStep] = useState<"workspace" | "signin">("workspace")

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        orgSlug: form.workspace,
        redirect: false,
      })
      if (result?.error) {
        setError("Invalid email or password")
        return
      }
      router.push(`/${form.workspace}`)
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Sign in to HRMS</h1>
          {step === "workspace" && (
            <p className="text-gray-500 text-sm mt-1">Enter your workspace to continue</p>
          )}
          {step === "signin" && (
            <p className="text-gray-500 text-sm mt-1">Signing in to <strong>{form.workspace}</strong></p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {step === "workspace" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Workspace</label>
              <input
                type="text"
                value={form.workspace}
                onChange={(e) => setForm(p => ({ ...p, workspace: e.target.value.toLowerCase() }))}
                placeholder="your-company"
                className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <button
              onClick={() => { if (form.workspace) setStep("signin") }}
              className="w-full h-10 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800"
            >
              Continue →
            </button>
            <p className="text-center text-xs text-gray-500">
              No workspace?{" "}
              <Link href="/signup" className="text-black underline">Create one free</Link>
            </p>
          </div>
        )}

        {step === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
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
                onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
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
            <button
              type="button"
              onClick={() => setStep("workspace")}
              className="w-full text-xs text-gray-500 hover:text-gray-800"
            >
              ← Change workspace
            </button>
          </form>
        )}
      </div>
    </div>
  )
}