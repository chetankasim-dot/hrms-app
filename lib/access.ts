import { cache } from "react"
import { notFound } from "next/navigation"
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

// The person is not signed in, is switched off, or has no access.
export class AuthError extends Error {
  constructor(message: "Not signed in" | "Not allowed" | "Not found") {
    super(message)
    this.name = "AuthError"
  }
}

// The database or network failed. This is not the same as being signed out.
export class ServiceError extends Error {
  constructor() {
    super("The service is temporarily unavailable")
    this.name = "ServiceError"
  }
}

export const isServiceError = (e: unknown) => e instanceof Error && e.name === "ServiceError"
export const isAuthError = (e: unknown) => e instanceof Error && e.name === "AuthError"

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Checks the signed-in user against the database on every request.
// One quick retry covers a short database hiccup.
async function loadUser(id: string) {
  const query = () =>
    unscopedPrisma.user.findUnique({
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

  try {
    return await query()
  } catch {
    await pause(300)
    try {
      return await query()
    } catch (second) {
      console.error("[access] database lookup failed", second) // the real error stays in the server log
      throw new ServiceError()
    }
  }
}

const loadUserCached = cache(loadUser)

export async function requireActor(orgSlug?: string, roles?: Role[]): Promise<Actor> {
  const session = await auth()
  const id = session?.user?.id
  if (!id) throw new AuthError("Not signed in")

  const user = await loadUserCached(id)
  if (!user || !user.isActive || !user.orgId || !user.org) throw new AuthError("Not allowed")
  if (orgSlug && user.org.slug !== orgSlug) throw new AuthError("Not found")
  if (roles && !roles.includes(user.role)) throw new AuthError("Not allowed")

  return {
    userId: user.id,
    orgId: user.orgId,
    orgSlug: user.org.slug,
    role: user.role,
    employeeId: user.employee?.id ?? null,
  }
}

// Use at the top of a page: shows "not found" unless the user has one of the roles.
// A database failure is not "not found", so it goes to the error page instead.
export async function requirePageRole(orgSlug: string, roles: Role[]) {
  try {
    return await requireActor(orgSlug, roles)
  } catch (e) {
    if (isServiceError(e)) throw e
    notFound()
  }
}