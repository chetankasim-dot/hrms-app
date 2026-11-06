"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"
import type { Prisma, Role } from "@prisma/client"

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]
const HR_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]
const DAY = 86400000

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

// Moves days out of "pending" (and optionally into "used") for the request's year
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
  })
  if (!balance) return
  await tx.leaveBalance.update({
    where: { id: balance.id },
    data: {
      pending: Math.max(0, balance.pending - req.days),
      ...(addToUsed ? { used: { increment: req.days } } : {}),
    },
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
}) {
  const actor = await requireActor(data.orgSlug)
  if (!actor.employeeId) throw new Error("You do not have an employee record")

  const from = parseDate(data.fromDate)
  const to = parseDate(data.toDate)
  if (!from || !to) throw new Error("Invalid dates")
  if (to < from) throw new Error("End date must be after start date")
  if ((to.getTime() - from.getTime()) / DAY > 366) throw new Error("Date range is too long")
  if (from.getUTCFullYear() !== to.getUTCFullYear())
    throw new Error("Leave cannot span two calendar years. Submit two requests.")

  const days = workingDays(from, to)
  if (days === 0) throw new Error("The selected dates have no working days")

  const leaveType = await unscopedPrisma.leaveType.findFirst({
    where: { id: data.leaveTypeId, orgId: actor.orgId },
    select: { id: true },
  })
  if (!leaveType) throw new Error("Leave type not found")

  const employeeId = actor.employeeId
  const year = from.getUTCFullYear()

  await unscopedPrisma.$transaction(
    async (tx) => {
      const balance = await tx.leaveBalance.findFirst({
        where: { orgId: actor.orgId, employeeId, leaveTypeId: leaveType.id, year },
      })
      if (!balance) throw new Error("No leave balance found")
      const available = balance.allocated + balance.carried - balance.used - balance.pending
      if (days > available) throw new Error("Insufficient balance. Available: " + available + " days")

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
      if (overlap) throw new Error("You already have leave on some of these dates")

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
  )

  revalidatePath("/" + actor.orgSlug + "/leave")
  return { success: true, days }
}

export async function approveLeave(data: { requestId: string; orgId?: string; orgSlug: string }) {
  const actor = await requireActor(data.orgSlug, APPROVER_ROLES)

  await unscopedPrisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findFirst({
      where: { id: data.requestId, orgId: actor.orgId, status: "PENDING" },
      include: { employee: { select: { managerId: true } } },
    })
    if (!req) throw new Error("Request not found or already handled")
    if (actor.employeeId && req.employeeId === actor.employeeId)
      throw new Error("You cannot approve your own request")
    if (actor.role === "MANAGER" && req.employee.managerId !== actor.employeeId)
      throw new Error("Not allowed")

    const res = await tx.leaveRequest.updateMany({
      where: { id: req.id, orgId: actor.orgId, status: "PENDING" },
      data: { status: "APPROVED", approverId: actor.employeeId, approvedAt: new Date() },
    })
    if (res.count === 0) throw new Error("Request not found or already handled")

    await settleBalance(tx, req, true)
  })

  revalidatePath("/" + actor.orgSlug + "/leave")
  return { success: true }
}

export async function rejectLeave(data: { requestId: string; reason: string; orgId?: string; orgSlug: string }) {
  const actor = await requireActor(data.orgSlug, APPROVER_ROLES)

  await unscopedPrisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findFirst({
      where: { id: data.requestId, orgId: actor.orgId, status: "PENDING" },
      include: { employee: { select: { managerId: true } } },
    })
    if (!req) throw new Error("Request not found or already handled")
    if (actor.employeeId && req.employeeId === actor.employeeId)
      throw new Error("You cannot reject your own request")
    if (actor.role === "MANAGER" && req.employee.managerId !== actor.employeeId)
      throw new Error("Not allowed")

    const res = await tx.leaveRequest.updateMany({
      where: { id: req.id, orgId: actor.orgId, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectionNote: (data.reason ?? "").slice(0, 500),
        approverId: actor.employeeId,
      },
    })
    if (res.count === 0) throw new Error("Request not found or already handled")

    await settleBalance(tx, req, false)
  })

  revalidatePath("/" + actor.orgSlug + "/leave")
  return { success: true }
}

export async function cancelLeave(data: { requestId: string; orgId?: string; orgSlug: string }) {
  const actor = await requireActor(data.orgSlug)

  await unscopedPrisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findFirst({
      where: { id: data.requestId, orgId: actor.orgId, status: "PENDING" },
    })
    if (!req) throw new Error("Only pending requests can be cancelled")

    const isOwner = !!actor.employeeId && req.employeeId === actor.employeeId
    if (!isOwner && !HR_ROLES.includes(actor.role)) throw new Error("Not allowed")

    const res = await tx.leaveRequest.updateMany({
      where: { id: req.id, orgId: actor.orgId, status: "PENDING" },
      data: { status: "CANCELLED" },
    })
    if (res.count === 0) throw new Error("Only pending requests can be cancelled")

    await settleBalance(tx, req, false)
  })

  revalidatePath("/" + actor.orgSlug + "/leave")
  return { success: true }
}