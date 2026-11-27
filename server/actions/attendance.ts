"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"

export type AttendanceResult = { ok: boolean; message?: string }

// Same "today" rule the dashboard uses, so the numbers agree
function today() {
  const n = new Date()
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))
}

export async function checkIn(
  orgSlug: string,
  mode: "office" | "wfh"
): Promise<AttendanceResult> {
  try {
    const actor = await requireActor(orgSlug)
    if (!actor.employeeId) return { ok: false, message: "You do not have an employee record" }
    if (mode !== "office" && mode !== "wfh") return { ok: false, message: "Choose office or work from home" }

    const date = today()
    const existing = await unscopedPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: actor.employeeId, date } },
    })
    if (existing?.checkIn) return { ok: false, message: "You have already checked in today" }

    const data = { checkIn: new Date(), status: mode === "wfh" ? "wfh" : "present", source: "web" }
    if (existing) {
      await unscopedPrisma.attendanceRecord.update({ where: { id: existing.id }, data })
    } else {
      await unscopedPrisma.attendanceRecord.create({
        data: { orgId: actor.orgId, employeeId: actor.employeeId, date, ...data },
      })
    }

    revalidatePath(`/${orgSlug}/attendance`)
    revalidatePath(`/${orgSlug}/people`, "layout")
    return { ok: true }
  } catch {
    return { ok: false, message: "Could not check in. Try again." }
  }
}

export async function checkOut(orgSlug: string): Promise<AttendanceResult> {
  try {
    const actor = await requireActor(orgSlug)
    if (!actor.employeeId) return { ok: false, message: "You do not have an employee record" }

    const rec = await unscopedPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: actor.employeeId, date: today() } },
    })
    if (!rec?.checkIn) return { ok: false, message: "You have not checked in today" }
    if (rec.checkOut) return { ok: false, message: "You have already checked out today" }

    const out = new Date()
    const hours = Math.round(((out.getTime() - rec.checkIn.getTime()) / 3600000) * 100) / 100
    await unscopedPrisma.attendanceRecord.update({
      where: { id: rec.id },
      data: { checkOut: out, hoursWorked: hours },
    })

    revalidatePath(`/${orgSlug}/attendance`)
    revalidatePath(`/${orgSlug}/people`, "layout")
    return { ok: true }
  } catch {
    return { ok: false, message: "Could not check out. Try again." }
  }
}