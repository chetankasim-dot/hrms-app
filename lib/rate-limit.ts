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