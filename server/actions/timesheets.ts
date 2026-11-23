"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"

export type TimesheetRow = { project: string; hours: number[] } // 5 numbers, Monday to Friday
export type TimesheetResult = { ok: boolean; message?: string }

const DAY = 86400000
const MAX_ROWS = 20

// A week is identified by its Monday, written YYYY-MM-DD
function parseMonday(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  if (isNaN(d.getTime()) || d.getUTCDay() !== 1) return null
  return d
}

export async function saveTimesheet(
  orgSlug: string,
  weekStart: string,
  rows: TimesheetRow[],
  submit: boolean
): Promise<TimesheetResult> {
  try {
    const actor = await requireActor(orgSlug)
    if (!actor.employeeId) return { ok: false, message: "You do not have an employee record" }

    const monday = parseMonday(weekStart)
    if (!monday) return { ok: false, message: "Invalid week" }

    const now = new Date()
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const thisMonday = todayUTC - ((new Date(todayUTC).getUTCDay() + 6) % 7) * DAY
    if (monday.getTime() > thisMonday + 7 * DAY) return { ok: false, message: "That week is too far ahead" }
    if (monday.getTime() < thisMonday - 12 * 7 * DAY) return { ok: false, message: "That week is too old to edit" }

    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return { ok: false, message: "Too many rows" }

    const clean: { project: string; hours: number[] }[] = []
    const dayTotals = [0, 0, 0, 0, 0]
    for (const r of rows) {
      const project = String(r?.project ?? "").trim().slice(0, 80)
      const hours = Array.isArray(r?.hours) ? r.hours.slice(0, 5) : []
      const nums = [0, 1, 2, 3, 4].map((i) => {
        const v = Number(hours[i] ?? 0)
        return Number.isFinite(v) ? Math.round(Math.min(Math.max(v, 0), 24) * 4) / 4 : 0
      })
      const total = nums.reduce((a, b) => a + b, 0)
      if (!project && total === 0) continue // empty row
      if (!project) return { ok: false, message: "Every row with hours needs a project or task name" }
      nums.forEach((v, i) => (dayTotals[i] += v))
      clean.push({ project, hours: nums })
    }

    if (dayTotals.some((t) => t > 24)) return { ok: false, message: "A day cannot have more than 24 hours" }
    const grand = dayTotals.reduce((a, b) => a + b, 0)
    if (submit && grand === 0) return { ok: false, message: "Enter some hours before submitting" }

    const employeeId = actor.employeeId
    const orgId = actor.orgId

    await unscopedPrisma.$transaction(async (tx) => {
      const existing = await tx.timesheet.findUnique({
        where: { employeeId_weekStart: { employeeId, weekStart: monday } },
      })
      if (existing && existing.status !== "draft") throw new Error("LOCKED")

      const sheet = existing
        ? await tx.timesheet.update({
            where: { id: existing.id },
            data: { status: submit ? "submitted" : "draft", totalHours: grand },
          })
        : await tx.timesheet.create({
            data: { orgId, employeeId, weekStart: monday, status: submit ? "submitted" : "draft", totalHours: grand },
          })

      await tx.timesheetEntry.deleteMany({ where: { timesheetId: sheet.id, orgId } })

      const entries = clean.flatMap((r) =>
        r.hours
          .map((h, i) => ({ h, i }))
          .filter((x) => x.h > 0)
          .map((x) => ({
            orgId,
            timesheetId: sheet.id,
            date: new Date(monday.getTime() + x.i * DAY),
            project: r.project,
            hours: x.h,
          }))
      )
      if (entries.length > 0) await tx.timesheetEntry.createMany({ data: entries })
    })

    revalidatePath(`/${orgSlug}/timesheets`)
    revalidatePath(`/${orgSlug}/people`, "layout")
    return { ok: true }
  } catch (e) {
    if (e instanceof Error && e.message === "LOCKED")
      return { ok: false, message: "This week is already submitted and can no longer be edited" }
    return { ok: false, message: "Could not save the timesheet. Try again." }
  }
}