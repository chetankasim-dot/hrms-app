"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { allowCall } from "@/lib/rate-limit"
import { revalidatePath } from "next/cache"
import type { Role, TicketStatus } from "@prisma/client"

export const TICKET_CATEGORIES = ["IT", "HR", "Finance", "Letter request", "Expense claim", "Other"]
const HR_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]
const STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"]

export type TicketResult = { ok: boolean; message?: string; id?: string }

// Best effort: a failed notification never blocks the ticket action
async function notifyUser(orgId: string, userId: string, title: string, body: string, link: string) {
  try {
    await unscopedPrisma.notification.create({
      data: { orgId, userId, title: title.slice(0, 120), body: body.slice(0, 500), type: "helpdesk", link },
    })
  } catch {
    // ignore
  }
}

export async function createTicket(
  orgSlug: string,
  input: { title: string; description: string; category: string }
): Promise<TicketResult> {
  try {
    const actor = await requireActor(orgSlug)
    if (!allowCall(`ticket:${actor.userId}`, 10, 60 * 60 * 1000))
      return { ok: false, message: "Too many tickets in the last hour. Try again later." }

    const title = String(input?.title ?? "").trim()
    const description = String(input?.description ?? "").trim()
    const category = String(input?.category ?? "")
    if (title.length < 3 || title.length > 120) return { ok: false, message: "Title must be 3 to 120 characters" }
    if (description.length < 5 || description.length > 2000)
      return { ok: false, message: "Description must be 5 to 2000 characters" }
    if (!TICKET_CATEGORIES.includes(category)) return { ok: false, message: "Choose a category" }

    const ticket = await unscopedPrisma.helpDeskTicket.create({
      data: {
        orgId: actor.orgId,
        title,
        description,
        category,
        status: "OPEN",
        priority: "MEDIUM",
        createdById: actor.userId,
      },
    })

    revalidatePath(`/${orgSlug}/helpdesk`)
    return { ok: true, id: ticket.id }
  } catch {
    return { ok: false, message: "Could not create the ticket. Try again." }
  }
}

export async function replyToTicket(
  orgSlug: string,
  ticketId: string,
  content: string
): Promise<TicketResult> {
  try {
    const actor = await requireActor(orgSlug)
    if (!allowCall(`reply:${actor.userId}`, 30, 60 * 60 * 1000))
      return { ok: false, message: "Too many replies. Try again later." }

    const text = String(content ?? "").trim()
    if (text.length < 1 || text.length > 2000) return { ok: false, message: "Reply must be 1 to 2000 characters" }

    const ticket = await unscopedPrisma.helpDeskTicket.findFirst({
      where: { id: ticketId, orgId: actor.orgId },
    })
    if (!ticket) return { ok: false, message: "Ticket not found" }

    const isHr = HR_ROLES.includes(actor.role)
    const isOwner = ticket.createdById === actor.userId
    if (!isHr && !isOwner) return { ok: false, message: "Ticket not found" }
    if (ticket.status === "CLOSED") return { ok: false, message: "This ticket is closed" }

    await unscopedPrisma.ticketReply.create({
      data: { orgId: actor.orgId, ticketId: ticket.id, authorId: actor.userId, content: text, isAI: false },
    })

    // HR answering an open ticket moves it along; the owner answering a resolved one reopens it
    if (isHr && !isOwner && ticket.status === "OPEN") {
      await unscopedPrisma.helpDeskTicket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS" } })
    } else if (isOwner && ticket.status === "RESOLVED") {
      await unscopedPrisma.helpDeskTicket.update({ where: { id: ticket.id }, data: { status: "OPEN", resolvedAt: null } })
    }

    // Tell the other side
    if (isHr && !isOwner) {
      await notifyUser(actor.orgId, ticket.createdById, "New reply on your ticket", ticket.title, `/${orgSlug}/helpdesk/${ticket.id}`)
    } else if (isOwner && ticket.assignedToId) {
      await notifyUser(actor.orgId, ticket.assignedToId, "New reply on a ticket", ticket.title, `/${orgSlug}/helpdesk/${ticket.id}`)
    }

    revalidatePath(`/${orgSlug}/helpdesk`)
    revalidatePath(`/${orgSlug}/helpdesk/${ticket.id}`)
    return { ok: true }
  } catch {
    return { ok: false, message: "Could not send the reply. Try again." }
  }
}

export async function setTicketStatus(
  orgSlug: string,
  ticketId: string,
  status: string
): Promise<TicketResult> {
  try {
    const actor = await requireActor(orgSlug, HR_ROLES)
    if (!STATUSES.includes(status as TicketStatus)) return { ok: false, message: "Invalid status" }

    const ticket = await unscopedPrisma.helpDeskTicket.findFirst({
      where: { id: ticketId, orgId: actor.orgId },
    })
    if (!ticket) return { ok: false, message: "Ticket not found" }

    const done = status === "RESOLVED" || status === "CLOSED"
    await unscopedPrisma.helpDeskTicket.update({
      where: { id: ticket.id },
      data: {
        status: status as TicketStatus,
        resolvedAt: done ? new Date() : null,
        assignedToId: ticket.assignedToId ?? actor.userId,
      },
    })

    if (ticket.createdById !== actor.userId) {
      await notifyUser(
        actor.orgId,
        ticket.createdById,
        "Your ticket was updated",
        `${ticket.title}: now ${status.replace("_", " ").toLowerCase()}`,
        `/${orgSlug}/helpdesk/${ticket.id}`
      )
    }

    revalidatePath(`/${orgSlug}/helpdesk`)
    revalidatePath(`/${orgSlug}/helpdesk/${ticket.id}`)
    return { ok: true }
  } catch {
    return { ok: false, message: "Could not update the ticket. Try again." }
  }
}