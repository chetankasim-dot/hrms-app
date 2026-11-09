"use server"

import { createHash, randomBytes } from "crypto"
import { hash } from "bcryptjs"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"
import type { Role } from "@prisma/client"

const HR_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]
const INVITE_DAYS = 7
const MIN_PASSWORD = 10

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

// HR creates a one-time link for a person who has no password yet.
export async function createInvite(
  orgSlug: string,
  employeeId: string
): Promise<{ ok: boolean; link?: string; message?: string }> {
  try {
    const actor = await requireActor(orgSlug, HR_ROLES)

    const emp = await unscopedPrisma.employee.findFirst({
      where: { id: employeeId, orgId: actor.orgId },
      include: { user: { select: { email: true, role: true, isActive: true, passwordHash: true } } },
    })
    if (!emp) return { ok: false, message: "Employee not found" }
    if (!emp.user.isActive) return { ok: false, message: "This account is disabled" }
    if (emp.user.passwordHash) return { ok: false, message: "This person already has a password" }

    // Old unused links for this person stop working
    await unscopedPrisma.organizationInvite.updateMany({
      where: { orgId: actor.orgId, email: emp.user.email, usedAt: null },
      data: { expiresAt: new Date() },
    })

    const raw = randomBytes(32).toString("hex")
    await unscopedPrisma.organizationInvite.create({
      data: {
        orgId: actor.orgId,
        email: emp.user.email,
        role: emp.user.role,
        token: sha(raw),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000),
        invitedById: actor.userId,
      },
    })

    const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
    return { ok: true, link: `${base}/invite/${raw}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not create invite" }
  }
}

// The person opens the link and sets their password.
export async function acceptInvite(
  rawToken: string,
  password: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    if (typeof rawToken !== "string" || rawToken.length < 20) throw new Error("bad")
    if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > 100)
      return { ok: false, message: `Password must be at least ${MIN_PASSWORD} characters` }

    const invite = await unscopedPrisma.organizationInvite.findUnique({
      where: { token: sha(rawToken) },
    })
    if (!invite || invite.usedAt || invite.expiresAt < new Date())
      return { ok: false, message: "This invite link is invalid or has expired" }

    const user = await unscopedPrisma.user.findFirst({
      where: { orgId: invite.orgId, email: invite.email },
    })
    if (!user || !user.isActive || user.passwordHash)
      return { ok: false, message: "This invite link is invalid or has expired" }

    const passwordHash = await hash(password, 12)

    await unscopedPrisma.$transaction(async (tx) => {
      // Mark the link used first; if someone else used it at the same moment, stop
      const used = await tx.organizationInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (used.count === 0) throw new Error("used")
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, emailVerified: new Date() },
      })
    })

    revalidatePath("/login")
    return { ok: true }
  } catch {
    return { ok: false, message: "This invite link is invalid or has expired" }
  }
}