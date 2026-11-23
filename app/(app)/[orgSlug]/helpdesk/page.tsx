import { notFound } from "next/navigation"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { HelpdeskList } from "@/components/helpdesk/helpdesk-list"

export const metadata = { title: "Help desk" }

const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]

export default async function HelpdeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ show?: string }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams

  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  const isHr = HR_ROLES.includes(actor.role)
  const showAll = sp.show === "all"

  const tickets = await unscopedPrisma.helpDeskTicket.findMany({
    where: {
      orgId: actor.orgId,
      // Employees only ever see their own tickets
      ...(isHr ? {} : { createdById: actor.userId }),
      ...(showAll ? {} : { status: { notIn: ["RESOLVED", "CLOSED"] } }),
    },
    include: { createdBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <HelpdeskList
      orgSlug={orgSlug}
      isHr={isHr}
      showAll={showAll}
      tickets={tickets.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        by: t.createdBy.name ?? t.createdBy.email,
      }))}
    />
  )
}