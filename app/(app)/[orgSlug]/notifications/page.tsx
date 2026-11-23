import { notFound } from "next/navigation"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { NotificationsList } from "@/components/notifications/notifications-list"

export const metadata = { title: "Notifications" }

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  // Only the signed-in person's own notifications
  const items = await unscopedPrisma.notification.findMany({
    where: { userId: actor.userId, orgId: actor.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return (
    <NotificationsList
      orgSlug={orgSlug}
      items={items.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  )
}