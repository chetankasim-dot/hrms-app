"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"
import type { Role } from "@prisma/client"

const APPROVER_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]

export async function approveItem(kind: "Leave" | "Timesheet", id: string, orgSlug: string) {
  const actor = await requireActor(orgSlug, APPROVER_ROLES)

  await unscopedPrisma.$transaction(async (tx) => {
    if (kind === "Leave") {
      const req = await tx.leaveRequest.findFirst({
        where: { id, orgId: actor.orgId, status: "PENDING" },
        include: { employee: { select: { managerId: true } } },
      })
      if (!req) throw new Error("Request not found or already handled")
      if (actor.employeeId && req.employeeId === actor.employeeId)
        throw new Error("You cannot approve your own request")
      if (actor.role === "MANAGER" && req.employee.managerId !== actor.employeeId)
        throw new Error("Not allowed")

      const res = await tx.leaveRequest.updateMany({
        where: { id, orgId: actor.orgId, status: "PENDING" },
        data: { status: "APPROVED", approverId: actor.employeeId, approvedAt: new Date() },
      })
      if (res.count === 0) throw new Error("Request not found or already handled")

      const balance = await tx.leaveBalance.findFirst({
        where: {
          employeeId: req.employeeId,
          leaveTypeId: req.leaveTypeId,
          year: req.fromDate.getUTCFullYear(),
        },
      })
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pending: Math.max(0, balance.pending - req.days),
            used: { increment: req.days },
          },
        })
      }
    } else {
      const sheet = await tx.timesheet.findFirst({
        where: { id, orgId: actor.orgId, status: "submitted" },
        include: { employee: { select: { managerId: true } } },
      })
      if (!sheet) throw new Error("Timesheet not found or already handled")
      if (actor.employeeId && sheet.employeeId === actor.employeeId)
        throw new Error("You cannot approve your own timesheet")
      if (actor.role === "MANAGER" && sheet.employee.managerId !== actor.employeeId)
        throw new Error("Not allowed")

      const res = await tx.timesheet.updateMany({
        where: { id, orgId: actor.orgId, status: "submitted" },
        data: { status: "approved" },
      })
      if (res.count === 0) throw new Error("Timesheet not found or already handled")
    }
  })

  revalidatePath(`/${orgSlug}/people`, "layout")
}

export async function approveMany(
  items: { kind: "Leave" | "Timesheet"; id: string }[],
  orgSlug: string
) {
  let approved = 0
  let failed = 0
  for (const it of items.slice(0, 100)) {
    try {
      await approveItem(it.kind, it.id, orgSlug)
      approved++
    } catch {
      failed++
    }
  }
  return { approved, failed }
}