"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import { isBlocked, recordFailure, clearFailures, clientIp } from "@/lib/rate-limit"

// A real bcrypt hash of a random string, used so "no user" takes as long as "wrong password"
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.7n0m0c5Y2hQ6Fz3sQ7xK9w1bq5aS"

export type WorkspaceMatch = { slug: string; name: string; email: string }

// Returns only workspaces where the password is correct.
export async function findWorkspaces(
  email: string,
  password: string
): Promise<WorkspaceMatch[]> {
  const cleanEmail = (email ?? "").trim()
  if (!cleanEmail || !password) return []

    const ip = await clientIp()
  const key = `login:${cleanEmail.toLowerCase()}:${ip}`
  if (isBlocked(key)) return []

  const users = await unscopedPrisma.user.findMany({
    where: {
      email: { equals: cleanEmail, mode: "insensitive" },
      isActive: true,
      orgId: { not: null },
      passwordHash: { not: null },
    },
    include: { org: { select: { slug: true, name: true } } },
    take: 20,
  })

  const matches: WorkspaceMatch[] = []
  if (users.length === 0) await compare(password, DUMMY_HASH)
  for (const u of users) {
    if (!u.passwordHash || !u.org) continue
    if (await compare(password, u.passwordHash)) {
      matches.push({ slug: u.org.slug, name: u.org.name, email: u.email })
    }
  }

  if (matches.length === 0) recordFailure(key)
  else clearFailures(key)

  return matches
}