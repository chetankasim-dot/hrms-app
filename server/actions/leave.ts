"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { notifyEmployee } from "@/lib/notify"
import { revalidatePath } from "next/cache"
import type { Prisma, Role } from "@prisma/client"

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]
const HR_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]
const DAY = 86400000

export type LeaveResult = { ok: boolean; message?: string; days?: number }

// Errors with a message that is safe and useful to show to the user
class UserError extends Error {}

function fail(e: unknown): LeaveResult {
  if (e instanceof UserError) return { ok: false, message: e.message }
  if ((e as { code?: string })?.code === "P2034")
    return { ok: false, message: "Another update was happening at the same moment. Please try again." }
  console.error("[leave]", e) // the real error stays in the server log
  return { ok: false, message: "Something went wrong. Please try again." }
}

// Postgres can reject one of two simultaneous writes (P2034). Try once more.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if ((e as { code?: string })?.code === "P2034") return await fn()
    throw e
  }
}

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })

// Midnight UTC of the given date
function parseDate(s: string): Date | null {
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// Counts Monday to Friday only
function workingDays(from: Date, to: Date): number {
  let n = 0
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) n++
  }
  return n
}

type LeaveRow = { employeeId: string; leaveTypeId: string; fromDate: Date; days: number }

// Moves days out of "pending" (and optionally into "used") for the request's year.
// The database does the arithmetic itself, so two requests at the same moment
// cannot overwrite each other's numbers.
async function settleBalance(
  tx: Prisma.TransactionClient,
  req: LeaveRow,
  addToUsed: boolean
) {
  const balance = await tx.leaveBalance.findFirst({
    where: {
      employeeId: req.employeeId,
      leaveTypeId: req.leaveTypeId,
      year: req.fromDate.getUTCFullYear(),
    },
    select: { id: true },
  })
  if (!balance) return
  await tx.leaveBalance.update({
    where: { id: balance.id },
    data: {
      pending: { decrement: req.days },
      ...(addToUsed ? { used: { increment: req.days } } : {}),
    },
  })
  // Never leave a negative pending number behind
  await tx.leaveBalance.updateMany({
    where: { id: balance.id, pending: { lt: 0 } },
    data: { pending: 0 },
  })
}

// orgId and employeeId are accepted so existing pages keep compiling,
// but they are ignored. The server uses the signed-in user instead.
export async function applyLeave(data: {
  employeeId?: string
  leaveTypeId: string
  fromDate: string
  toDate: string
  reason?: string
  orgId?: string
  orgSlug: string
}): Promise<LeaveResult> {
  try {
    const actor = await requireActor(data.orgSlug)
    if (!actor.employeeId) throw new UserError("You do not have an employee record")

    const from = parseDate(data.fromDate)
    const to = parseDate(data.toDate)
    if (!from || !to) throw new UserError("Invalid dates")
    if (to < from) throw new UserError("End date must be after start date")
    if ((to.getTime() - from.getTime()) / DAY > 366) throw new UserError("Date range is too long")
    if (from.getUTCFullYear() !== to.getUTCFullYear())
      throw new UserError("Leave cannot span two calendar years. Submit two requests.")

    const days = workingDays(from, to)
    if (days === 0) throw new UserError("The selected dates have no working days")

    const leaveType = await unscopedPrisma.leaveType.findFirst({
      where: { id: data.leaveTypeId, orgId: actor.orgId },
      select: { id: true },
    })
    if (!leaveType) throw new UserError("Leave type not found")

    const employeeId = actor.employeeId
    const year = from.getUTCFullYear()

    // Create this year's balances the first time they are needed (for example January leave booked in December)
    const hasBalances = await unscopedPrisma.leaveBalance.count({
      where: { orgId: actor.orgId, employeeId, year },
    })
    if (hasBalances === 0) {
      const types = await unscopedPrisma.leaveType.findMany({ where: { orgId: actor.orgId } })
      if (types.length > 0) {
        await unscopedPrisma.leaveBalance.createMany({
          data: types.map((lt) => ({
            orgId: actor.orgId,
            employeeId,
            leaveTypeId: lt.id,
            year,
            allocated: lt.daysAllowed,
            used: 0,
            pending: 0,
            carried: 0,
          })),
          skipDuplicates: true,
        })
      }
    }

    await withRetry(() => unscopedPrisma.$transaction(
      async (tx) => {
        const balance = await tx.leaveBalance.findFirst({
          where: { orgId: actor.orgId, employeeId, leaveTypeId: leaveType.id, year },
        })
        if (!balance) throw new UserError("No leave balance found")
        const available = balance.allocated + balance.carried - balance.used - balance.pending
        if (days > available) throw new UserError("Insufficient balance. Available: " + available + " days")

        const overlap = await tx.leaveRequest.findFirst({
          where: {
            orgId: actor.orgId,
            employeeId,
            status: { in: ["PENDING", "APPROVED", "AUTO_APPROVED"] },
            fromDate: { lte: to },
            toDate: { gte: from },
          },
          select: { id: true },
        })
        if (overlap) throw new UserError("You already have leave on some of these dates")

        await tx.leaveRequest.create({
          data: {
            orgId: actor.orgId,
            employeeId,
            leaveTypeId: leaveType.id,
            fromDate: from,
            toDate: to,
            days,
            reason: data.reason?.slice(0, 500) ?? null,
            status: "PENDING",
          },
        })
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { pending: { increment: days } },
        })
      },
      { isolationLevel: "Serializable" }
    ))

    revalidatePath("/" + actor.orgSlug + "/leave")
    return { ok: true, days }
  } catch (e) {
    return fail(e)
  }
}

export async function approveLeave(data: { requestId: string; orgId?: string; orgSlug: string }): Promise<LeaveResult> {
  try {
    const actor = await requireActor(data.orgSlug, APPROVER_ROLES)
    const out: { employeeId?: string; days?: number; from?: Date } = {}

    await withRetry(() => unscopedPrisma.$transaction(async (tx) => {
      const req = await tx.leaveRequest.findFirst({
        where: { id: data.requestId, orgId: actor.orgId, status: "PENDING" },
        include: { employee: { select: { managerId: true } } },
      })
      if (!req) throw new UserError("Request not found or already handled")
      if (actor.employeeId && req.employeeId === actor.employeeId)
        throw new UserError("You cannot approve your own request")
      if (actor.role === "MANAGER" && req.employee.managerId !== actor.employeeId)
        throw new UserError("You can only approve requests from your direct reports")

      const res = await tx.leaveRequest.updateMany({
        where: { id: req.id, orgId: actor.orgId, status: "PENDING" },
        data: { status: "APPROVED", approverId: actor.employeeId, approvedAt: new Date() },
      })
      if (res.count === 0) throw new UserError("Request not found or already handled")

      await settleBalance(tx, req, true)
      out.employeeId = req.employeeId
      out.days = req.days
      out.from = req.fromDate
    }))

    if (out.employeeId && out.days !== undefined && out.from) {
      await notifyEmployee({
        orgId: actor.orgId,
        employeeId: out.employeeId,
        title: "Leave approved",
        body: `Your leave of ${out.days} day${out.days === 1 ? "" : "s"} from ${shortDate(out.from)} was approved.`,
        type: "leave",
        link: `/${actor.orgSlug}/leave`,
      })
    }

    revalidatePath("/" + actor.orgSlug + "/leave")
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function rejectLeave(data: { requestId: string; reason: string; orgId?: string; orgSlug: string }): Promise<LeaveResult> {
  try {
    const actor = await requireActor(data.orgSlug, APPROVER_ROLES)
    const out: { employeeId?: string; days?: number; from?: Date } = {}
    const reason = (data.reason ?? "").slice(0, 500)

    await withRetry(() => unscopedPrisma.$transaction(async (tx) => {
      const req = await tx.leaveRequest.findFirst({
        where: { id: data.requestId, orgId: actor.orgId, status: "PENDING" },
        include: { employee: { select: { managerId: true } } },
      })
      if (!req) throw new UserError("Request not found or already handled")
      if (actor.employeeId && req.employeeId === actor.employeeId)
        throw new UserError("You cannot reject your own request")
      if (actor.role === "MANAGER" && req.employee.managerId !== actor.employeeId)
        throw new UserError("You can only reject requests from your direct reports")

      const res = await tx.leaveRequest.updateMany({
        where: { id: req.id, orgId: actor.orgId, status: "PENDING" },
        data: {
          status: "REJECTED",
          rejectionNote: reason,
          approverId: actor.employeeId,
        },
      })
      if (res.count === 0) throw new UserError("Request not found or already handled")

      await settleBalance(tx, req, false)
      out.employeeId = req.employeeId
      out.days = req.days
      out.from = req.fromDate
    }))

    if (out.employeeId && out.days !== undefined && out.from) {
      await notifyEmployee({
        orgId: actor.orgId,
        employeeId: out.employeeId,
        title: "Leave rejected",
        body: `Your leave of ${out.days} day${out.days === 1 ? "" : "s"} from ${shortDate(out.from)} was rejected.${reason ? " Reason: " + reason : ""}`,
        type: "leave",
        link: `/${actor.orgSlug}/leave`,
      })
    }

    revalidatePath("/" + actor.orgSlug + "/leave")
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function cancelLeave(data: { requestId: string; orgId?: string; orgSlug: string }): Promise<LeaveResult> {
  try {
    const actor = await requireActor(data.orgSlug)

    await withRetry(() => unscopedPrisma.$transaction(async (tx) => {
      const req = await tx.leaveRequest.findFirst({
        where: { id: data.requestId, orgId: actor.orgId, status: "PENDING" },
      })
      if (!req) throw new UserError("Only pending requests can be cancelled")

      const isOwner = !!actor.employeeId && req.employeeId === actor.employeeId
      if (!isOwner && !HR_ROLES.includes(actor.role)) throw new UserError("You cannot cancel this request")

      const res = await tx.leaveRequest.updateMany({
        where: { id: req.id, orgId: actor.orgId, status: "PENDING" },
        data: { status: "CANCELLED" },
      })
      if (res.count === 0) throw new UserError("Only pending requests can be cancelled")

      await settleBalance(tx, req, false)
    }))

    revalidatePath("/" + actor.orgSlug + "/leave")
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}