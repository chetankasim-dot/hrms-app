import { notFound } from "next/navigation"
import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { TicketThread } from "@/components/helpdesk/ticket-thread"

export const metadata = { title: "Ticket" }

const HR_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]

export default async function TicketPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>
}) {
  const { orgSlug, id } = await params

  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  const isHr = HR_ROLES.includes(actor.role)

  // Employees can only open their own tickets, HR can open any ticket in the company
  const ticket = await unscopedPrisma.helpDeskTicket.findFirst({
    where: { id, orgId: actor.orgId, ...(isHr ? {} : { createdById: actor.userId }) },
  })
  if (!ticket) notFound()

  const replies = await unscopedPrisma.ticketReply.findMany({
    where: { ticketId: ticket.id, orgId: actor.orgId },
    orderBy: { createdAt: "asc" },
    take: 200,
  })

  const userIds = [
    ...new Set(
      [ticket.createdById, ticket.assignedToId, ...replies.map((r) => r.authorId)].filter(
        (x): x is string => !!x
      )
    ),
  ]
  const users = await unscopedPrisma.user.findMany({
    where: { id: { in: userIds }, orgId: actor.orgId },
    select: { id: true, name: true, email: true, role: true },
  })
  const byId = new Map(users.map((u) => [u.id, u]))

  // Employees see names only. Email addresses are for HR.
  const nameOf = (userId: string | null | undefined) => {
    const u = userId ? byId.get(userId) : undefined
    return u?.name ?? (isHr ? u?.email : null) ?? "Unknown"
  }
  const hrAuthor = (userId: string | null | undefined) => {
    const u = userId ? byId.get(userId) : undefined
    return !!u && HR_ROLES.includes(u.role)
  }

  const messages = [
    {
      id: "first-" + ticket.id,
      author: nameOf(ticket.createdById),
      isHrAuthor: hrAuthor(ticket.createdById),
      isMe: ticket.createdById === actor.userId,
      isAI: false,
      content: ticket.description,
      createdAt: ticket.createdAt.toISOString(),
    },
    ...replies.map((r) => ({
      id: r.id,
      author: r.isAI ? "AI assistant" : nameOf(r.authorId),
      isHrAuthor: hrAuthor(r.authorId),
      isMe: !!r.authorId && r.authorId === actor.userId,
      isAI: !!r.isAI,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
  ]

  return (
    <TicketThread
      orgSlug={orgSlug}
      isHr={isHr}
      ticket={{
        id: ticket.id,
        title: ticket.title,
        category: ticket.category,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
        assignee: ticket.assignedToId ? nameOf(ticket.assignedToId) : null,
      }}
      messages={messages}
    />
  )
}