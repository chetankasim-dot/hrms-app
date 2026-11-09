"use client"

import { useState, useTransition } from "react"
import { createInvite } from "@/server/actions/invites"

export function InviteButton({ orgSlug, employeeId }: { orgSlug: string; employeeId: string }) {
  const [link, setLink] = useState("")
  const [message, setMessage] = useState("")
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  function create() {
    setMessage("")
    setCopied(false)
    start(async () => {
      const res = await createInvite(orgSlug, employeeId)
      if (res.ok && res.link) setLink(res.link)
      else setMessage(res.message ?? "Could not create invite")
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setMessage("Could not copy. Select the link and copy it by hand.")
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <button
        onClick={create}
        disabled={pending}
        className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 font-medium text-teal-800 disabled:opacity-50"
      >
        {pending ? "Creating..." : link ? "Create a new link" : "Invite to sign in"}
      </button>
      {message && <div className="text-red-600">{message}</div>}
      {link && (
        <div className="space-y-1">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="w-full rounded-lg border bg-white px-3 py-2 text-xs" />
          <div className="flex items-center gap-3">
            <button onClick={copy} className="text-teal-700 underline">Copy link</button>
            {copied && <span className="text-green-700">Copied</span>}
          </div>
          <div className="text-gray-500">Valid for 7 days, one use only. Send it to the person yourself.</div>
        </div>
      )}
    </div>
  )
}