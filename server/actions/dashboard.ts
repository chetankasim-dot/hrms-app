"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

const APPROVER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]

export async function approveItem(kind: "Leave" | "Timesheet", id: string, orgSlug: string) {
  const session = await auth()
  const user = session?.user
  if (!user?.orgId || !APPROVER_ROLES.includes(user.role as string)) throw new Error("Not allowed")

  if (kind === "Leave") {
    const approver = await prisma.employee.findUnique({ where: { userId: user.id } })
    const res = await prisma.leaveRequest.updateMany({
      where: { id, orgId: user.orgId, status: "PENDING" },
      data: { status: "APPROVED", approverId: approver?.id, approvedAt: new Date() },
    })
    if (res.count === 0) throw new Error("Request not found or already handled")
  } else {
    const res = await prisma.timesheet.updateMany({
      where: { id, orgId: user.orgId, status: "submitted" },
      data: { status: "approved" },
    })
    if (res.count === 0) throw new Error("Timesheet not found or already handled")
  }
  revalidatePath(`/${orgSlug}/people`)
}