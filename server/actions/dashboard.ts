"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { notifyEmployee } from "@/lib/notify"
import { revalidatePath } from "next/cache"
import type { Role } from "@prisma/client"

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]

export type ApproveResult = { ok: boolean; message?: string }

// Errors with a message that is safe and useful to show to the user
class UserError extends Error {}

function fail(e: unknown): ApproveResult {
  if (e instanceof UserError) return { ok: false, message: e.message }
  if ((e as { code?: string })?.code === "P2034")
    return { ok: false, message: "Another update was happening at the same moment. Please try again." }
  console.error("[approve]", e) // the real error stays in the server log
  return { ok: false, message: "Something went wrong. Please try again." }
}

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })

type Notice = { employeeId: string; title: string; body: string; type: string; link: string }

// Postgres can reject one of two simultaneous writes (P2034). Try once more.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if ((e as { code?: string })?.code === "P2034") return await fn()
    throw e
  }
}

export async function approveItem(
  kind: "Leave" | "Timesheet",
  id: string,
  orgSlug: string
): Promise<ApproveResult> {
  try {
    const actor = await requireActor(orgSlug, APPROVER_ROLES)
    const out: { notice?: Notice } = {}

    await withRetry(() => unscopedPrisma.$transaction(async (tx) => {
      if (kind === "Leave") {
        const req = await tx.leaveRequest.findFirst({
          where: { id, orgId: actor.orgId, status: "PENDING" },
          include: { employee: { select: { managerId: true } } },
        })
        if (!req) throw new UserError("Request not found or already handled")
        if (actor.employeeId && req.employeeId === actor.employeeId)
          throw new UserError("You cannot approve your own request")
        if (actor.role === "MANAGER" && req.employee.managerId !== actor.employeeId)
          throw new UserError("You can only approve requests from your direct reports")

        const res = await tx.leaveRequest.updateMany({
          where: { id, orgId: actor.orgId, status: "PENDING" },
          data: { status: "APPROVED", approverId: actor.employeeId, approvedAt: new Date() },
        })
        if (res.count === 0) throw new UserError("Request not found or already handled")

        const balance = await tx.leaveBalance.findFirst({
          where: {
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            year: req.fromDate.getUTCFullYear(),
          },
          select: { id: true },
        })
        if (balance) {
          // The database does the subtraction itself, so a request that arrives at the
          // same moment cannot be overwritten
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pending: { decrement: req.days },
              used: { increment: req.days },
            },
          })
          await tx.leaveBalance.updateMany({
            where: { id: balance.id, pending: { lt: 0 } },
            data: { pending: 0 },
          })
        }

        out.notice = {
          employeeId: req.employeeId,
          title: "Leave approved",
          body: `Your leave of ${req.days} day${req.days === 1 ? "" : "s"} from ${shortDate(req.fromDate)} was approved.`,
          type: "leave",
          link: `/${orgSlug}/leave`,
        }
      } else {
        const sheet = await tx.timesheet.findFirst({
          where: { id, orgId: actor.orgId, status: "submitted" },
          include: { employee: { select: { managerId: true } } },
        })
        if (!sheet) throw new UserError("Timesheet not found or already handled")
        if (actor.employeeId && sheet.employeeId === actor.employeeId)
          throw new UserError("You cannot approve your own timesheet")
        if (actor.role === "MANAGER" && sheet.employee.managerId !== actor.employeeId)
          throw new UserError("You can only approve timesheets from your direct reports")

        const res = await tx.timesheet.updateMany({
          where: { id, orgId: actor.orgId, status: "submitted" },
          data: { status: "approved" },
        })
        if (res.count === 0) throw new UserError("Timesheet not found or already handled")

        out.notice = {
          employeeId: sheet.employeeId,
          title: "Timesheet approved",
          body: `Your timesheet for the week of ${shortDate(sheet.weekStart)} was approved.`,
          type: "timesheet",
          link: `/${orgSlug}/timesheets`,
        }
      }
    }))

    if (out.notice) await notifyEmployee({ orgId: actor.orgId, ...out.notice })

    revalidatePath(`/${orgSlug}/people`, "layout")
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function approveMany(
  items: { kind: "Leave" | "Timesheet"; id: string }[],
  orgSlug: string
): Promise<{ approved: number; failed: number; firstError: string | null }> {
  let approved = 0
  let failed = 0
  let firstError: string | null = null
  for (const it of items.slice(0, 100)) {
    const res = await approveItem(it.kind, it.id, orgSlug)
    if (res.ok) approved++
    else {
      failed++
      if (!firstError) firstError = res.message ?? "Failed"
    }
  }
  return { approved, failed, firstError }
}