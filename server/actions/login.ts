"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { compare } from "bcryptjs"

export type WorkspaceMatch = { slug: string; name: string; email: string }

// Returns only workspaces where the password is correct.
export async function findWorkspaces(
  email: string,
  password: string
): Promise<WorkspaceMatch[]> {
  const cleanEmail = (email ?? "").trim()
  if (!cleanEmail || !password) return []

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
  for (const u of users) {
    if (!u.passwordHash || !u.org) continue
    if (await compare(password, u.passwordHash)) {
      matches.push({ slug: u.org.slug, name: u.org.name, email: u.email })
    }
  }
  return matches
}