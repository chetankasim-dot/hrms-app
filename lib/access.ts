import { cache } from "react"
import { auth } from "@/lib/auth"
import { unscopedPrisma } from "@/lib/prisma"
import type { Role } from "@prisma/client"

export type Actor = {
  userId: string
  orgId: string
  orgSlug: string
  role: Role
  employeeId: string | null
}

// Checks the signed-in user against the database on every call.
async function loadUser(id: string) {
  return unscopedPrisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      isActive: true,
      orgId: true,
      org: { select: { slug: true } },
      employee: { select: { id: true } },
    },
  })
}

const loadUserCached = cache(loadUser)

export async function requireActor(orgSlug?: string, roles?: Role[]): Promise<Actor> {
  const session = await auth()
  const id = session?.user?.id
  if (!id) throw new Error("Not signed in")

    const user = await loadUserCached(id)
  if (!user || !user.isActive || !user.orgId || !user.org) throw new Error("Not allowed")
  if (orgSlug && user.org.slug !== orgSlug) throw new Error("Not found")
  if (roles && !roles.includes(user.role)) throw new Error("Not allowed")

  return {
    userId: user.id,
    orgId: user.orgId,
    orgSlug: user.org.slug,
    role: user.role,
    employeeId: user.employee?.id ?? null,
  }
}
import { notFound } from "next/navigation"

// Use at the top of a page: shows "not found" unless the user has one of the roles.
export async function requirePageRole(orgSlug: string, roles: Role[]) {
  try {
    return await requireActor(orgSlug, roles)
  } catch {
    notFound()
  }
}