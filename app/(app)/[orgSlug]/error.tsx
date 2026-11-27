"use client"

import { useEffect } from "react"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-500">
        We could not load this page. Your data is safe. Try again, and if it keeps happening, tell your HR admin.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-gray-400">Reference: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-5 rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800"
      >
        Try again
      </button>
    </div>
  )
}