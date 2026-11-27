"use client"

import { useEffect, useRef } from "react"

export function ScrollEnd({ children, dep }: { children: React.ReactNode; dep: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" })
  }, [dep])

  return (
    <div ref={ref} className="flex gap-4 overflow-x-auto pb-4">
      {children}
    </div>
  )
}