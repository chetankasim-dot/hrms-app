import { headers } from "next/headers"
const fails = new Map<string, { count: number; resetAt: number }>()
const MAX = 5
const WINDOW_MS = 15 * 60 * 1000

export function isBlocked(key: string) {
  const e = fails.get(key)
  if (!e) return false
  if (Date.now() > e.resetAt) {
    fails.delete(key)
    return false
  }
  return e.count >= MAX
}

export function recordFailure(key: string) {
  const e = fails.get(key)
  if (!e || Date.now() > e.resetAt) {
    fails.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS })
  } else {
    e.count++
  }
}

export function clearFailures(key: string) {
  fails.delete(key)
}
const hits = new Map<string, number[]>()

// Allows `max` calls per `windowMs`. Returns false when the limit is reached.
export function allowCall(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}
// On Railway the proxy adds the real client address at the END of x-forwarded-for
export async function clientIp(): Promise<string> {
  const h = await headers()
  const xff = h.get("x-forwarded-for")
  if (xff) return xff.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? "unknown"
  return h.get("x-real-ip") ?? "unknown"
}