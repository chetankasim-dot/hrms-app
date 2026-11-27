"use server"

import { compare, hash } from "bcryptjs"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { allowCall } from "@/lib/rate-limit"

export type PasswordResult = { ok: boolean; message?: string }

export async function changePassword(
  orgSlug: string,
  current: string,
  next: string
): Promise<PasswordResult> {
  try {
    const actor = await requireActor(orgSlug)

    if (!allowCall(`pw:${actor.userId}`, 5, 15 * 60 * 1000))
      return { ok: false, message: "Too many attempts. Try again in 15 minutes." }

    if (typeof current !== "string" || typeof next !== "string" || !current || !next)
      return { ok: false, message: "Fill in both fields" }
    if (next.length < 10 || next.length > 72)
      return { ok: false, message: "New password must be between 10 and 72 characters" }
    if (next === current)
      return { ok: false, message: "New password must be different from the current one" }

    const user = await unscopedPrisma.user.findUnique({
      where: { id: actor.userId },
      select: { passwordHash: true },
    })
    if (!user?.passwordHash) return { ok: false, message: "This account has no password set" }

    const valid = await compare(current, user.passwordHash)
    if (!valid) return { ok: false, message: "Current password is incorrect" }

    const passwordHash = await hash(next, 12)
    await unscopedPrisma.user.update({ where: { id: actor.userId }, data: { passwordHash } })
    return { ok: true }
  } catch {
    return { ok: false, message: "Could not change the password. Try again." }
  }
}