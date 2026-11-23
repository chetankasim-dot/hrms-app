"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"

// Both actions only ever touch the signed-in person's own notifications.
export async function markNotificationRead(orgSlug: string, id: string) {
  try {
    const actor = await requireActor(orgSlug)
    await unscopedPrisma.notification.updateMany({
      where: { id, userId: actor.userId, orgId: actor.orgId },
      data: { isRead: true },
    })
    revalidatePath(`/${orgSlug}/notifications`)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function markAllNotificationsRead(orgSlug: string) {
  try {
    const actor = await requireActor(orgSlug)
    await unscopedPrisma.notification.updateMany({
      where: { userId: actor.userId, orgId: actor.orgId, isRead: false },
      data: { isRead: true },
    })
    revalidatePath(`/${orgSlug}/notifications`)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}