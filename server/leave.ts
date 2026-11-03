"use server"

import { auth } from "@/lib/auth"
import { unscopedPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { hasPermission } from "@/lib/rbac"

export async function applyLeave(data: {
  employeeId: string
  leaveTypeId: string
  fromDate: string
  toDate: string
  reason?: string
  orgId: string
  orgSlug: string
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const from = new Date(data.fromDate)
  const to = new Date(data.toDate)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new Error("Invalid dates")
  if (to < from) throw new Error("End date must be after start date")

  const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const balance = await unscopedPrisma.leaveBalance.findFirst({
    where: {
      orgId: data.orgId,
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      year: new Date().getFullYear(),
    },
  })

  if (!balance) throw new Error("No leave balance found")

  const available = balance.allocated + balance.carried - balance.used - balance.pending
  if (days > available) {
    throw new Error("Insufficient balance. Available: " + available + " days")
  }

  await unscopedPrisma.$transaction(async (tx) => {
    await tx.leaveRequest.create({
      data: {
        orgId: data.orgId,
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        fromDate: from,
        toDate: to,
        days,
        reason: data.reason ?? null,
        status: "PENDING",
      },
    })
    await tx.leaveBalance.updateMany({
      where: {
        orgId: data.orgId,
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        year: new Date().getFullYear(),
      },
      data: { pending: { increment: days } },
    })
  })

  revalidatePath("/" + data.orgSlug + "/leave")
  return { success: true, days }
}

export async function approveLeave(data: {
  requestId: string
  orgId: string
  orgSlug: string
}) {
  const session = await auth()
  if (!session?.user || !hasPermission(session.user.role, "leave:approve")) {
    throw new Error("Unauthorized")
  }

  const request = await unscopedPrisma.leaveRequest.findFirst({
    where: { id: data.requestId, orgId: data.orgId },
  })
  if (!request) throw new Error("Request not found")
  if (request.status !== "PENDING") throw new Error("Request is not pending")

  await unscopedPrisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: data.requestId },
      data: {
        status: "APPROVED",
        approverId: session.user.id,
        approvedAt: new Date(),
      },
    })
    await tx.leaveBalance.updateMany({
      where: {
        orgId: data.orgId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year: new Date().getFullYear(),
      },
      data: {
        used: { increment: request.days },
        pending: { decrement: request.days },
      },
    })
  })

  revalidatePath("/" + data.orgSlug + "/leave")
  return { success: true }
}

export async function rejectLeave(data: {
  requestId: string
  reason: string
  orgId: string
  orgSlug: string
}) {
  const session = await auth()
  if (!session?.user || !hasPermission(session.user.role, "leave:approve")) {
    throw new Error("Unauthorized")
  }

  const request = await unscopedPrisma.leaveRequest.findFirst({
    where: { id: data.requestId, orgId: data.orgId },
  })
  if (!request) throw new Error("Request not found")

  await unscopedPrisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: data.requestId },
      data: {
        status: "REJECTED",
        rejectionNote: data.reason,
        approverId: session.user.id,
      },
    })
    await tx.leaveBalance.updateMany({
      where: {
        orgId: data.orgId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year: new Date().getFullYear(),
      },
      data: { pending: { decrement: request.days } },
    })
  })

  revalidatePath("/" + data.orgSlug + "/leave")
  return { success: true }
}

export async function cancelLeave(data: {
  requestId: string
  orgId: string
  orgSlug: string
}) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const request = await unscopedPrisma.leaveRequest.findFirst({
    where: { id: data.requestId, orgId: data.orgId },
  })
  if (!request) throw new Error("Request not found")
  if (request.status !== "PENDING") throw new Error("Only pending requests can be cancelled")

  await unscopedPrisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: data.requestId },
      data: { status: "CANCELLED" },
    })
    await tx.leaveBalance.updateMany({
      where: {
        orgId: data.orgId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year: new Date().getFullYear(),
      },
      data: { pending: { decrement: request.days } },
    })
  })

  revalidatePath("/" + data.orgSlug + "/leave")
  return { success: true }
}