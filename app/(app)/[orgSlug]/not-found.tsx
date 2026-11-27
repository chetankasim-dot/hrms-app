"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function NotFound() {
  // The first part of the address is the workspace name
  const slug = usePathname().split("/")[1]

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-gray-500">
        This page does not exist, or you do not have access to it.
      </p>
      <Link
        href={slug ? `/${slug}` : "/login"}
        className="mt-5 inline-block rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800"
      >
        Back to Home
      </Link>
    </div>
  )
}