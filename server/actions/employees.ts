"use server"

import { requireActor } from "@/lib/access"
import { unscopedPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import type { EmploymentType } from "@prisma/client"

const MAX_ROWS = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type NewEmployee = {
  firstName: string
  lastName: string
  email: string
  designation: string
  department: string
  location: string
  managerEmail: string
  employmentType: string
  joinDate: string
  dateOfBirth: string
  phone: string
}

export type BatchResult = {
  ok: boolean
  message?: string
  okRows: number
  errors: { row: number; message: string }[]
}

const TYPE_MAP: Record<string, EmploymentType> = {
  fulltime: "FULL_TIME",
  parttime: "PART_TIME",
  contract: "CONTRACT",
  contractor: "CONTRACT",
  intern: "INTERN",
  consultant: "CONSULTANT",
}
const typeKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")

async function requireAdmin(orgSlug: string) {
  const actor = await requireActor(orgSlug, ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"])
  const org = await unscopedPrisma.organization.findUnique({ where: { id: actor.orgId } })
  if (!org) throw new Error("Not found")
  return org
}

function clean(r: NewEmployee) {
  const t = (s?: string) => (s ?? "").trim()
  return {
    firstName: t(r.firstName),
    lastName: t(r.lastName),
    email: t(r.email).toLowerCase(),
    designation: t(r.designation),
    department: t(r.department),
    location: t(r.location),
    managerEmail: t(r.managerEmail).toLowerCase(),
    employmentType: t(r.employmentType),
    joinDate: t(r.joinDate),
    dateOfBirth: t(r.dateOfBirth),
    phone: t(r.phone),
  }
}

function check(r: ReturnType<typeof clean>): string | null {
  const required: [string, string][] = [
    ["First name", r.firstName],
    ["Last name", r.lastName],
    ["Email", r.email],
    ["Designation", r.designation],
    ["Department", r.department],
    ["Location", r.location],
    ["Manager email", r.managerEmail],
    ["Employment type", r.employmentType],
    ["Join date", r.joinDate],
    ["Date of birth", r.dateOfBirth],
    ["Phone", r.phone],
  ]
  for (const [label, v] of required) if (!v) return `${label} is required`

  if (!EMAIL_RE.test(r.email)) return "Email is not valid"
  if (!EMAIL_RE.test(r.managerEmail)) return "Manager email is not valid"
  if (r.managerEmail === r.email) return "A person cannot be their own manager"
  if (!TYPE_MAP[typeKey(r.employmentType)])
    return `Employment type "${r.employmentType}" is not recognised`

  const digits = r.phone.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) return "Phone must have 7 to 15 digits"

  for (const [label, v] of [
    ["Join date", r.joinDate],
    ["Date of birth", r.dateOfBirth],
  ] as const) {
    if (!DATE_RE.test(v) || isNaN(new Date(`${v}T00:00:00Z`).getTime()))
      return `${label} must be YYYY-MM-DD`
  }
  return null
}

const toDate = (s: string) => (s ? new Date(`${s}T00:00:00Z`) : null)

async function runBatch(orgSlug: string, input: NewEmployee[], dryRun: boolean): Promise<BatchResult> {
  const org = await requireAdmin(orgSlug)
  const orgId = org.id

  const [codes, active] = await Promise.all([
    unscopedPrisma.employee.findMany({
      where: { orgId, employeeCode: { startsWith: "EMP" } },
      select: { employeeCode: true },
    }),
    unscopedPrisma.employee.count({ where: { orgId, status: { not: "SEPARATED" } } }),
  ])
  let nextNo =
    codes.reduce((max, c) => {
      const m = /^EMP(\d+)$/.exec(c.employeeCode)
      return m ? Math.max(max, parseInt(m[1], 10)) : max
    }, 0) + 1
  let seatsLeft = org.maxSeats - active

  const seen = new Set<string>()
  const deptCache = new Map<string, string>()
  const locCache = new Map<string, string>()
  const errors: BatchResult["errors"] = []
  let okRows = 0

  async function deptId(name: string) {
    const key = name.toLowerCase()
    const hit = deptCache.get(key)
    if (hit) return hit
    let d = await unscopedPrisma.department.findFirst({
      where: { orgId, name: { equals: name, mode: "insensitive" } },
    })
    if (!d) {
      const base = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "DEPT"
      let code = base
      let n = 1
      while (await unscopedPrisma.department.findFirst({ where: { orgId, code } })) code = base + ++n
      d = await unscopedPrisma.department.create({ data: { orgId, name, code } })
    }
    deptCache.set(key, d.id)
    return d.id
  }

  async function locId(name: string) {
    const key = name.toLowerCase()
    const hit = locCache.get(key)
    if (hit) return hit
    let l = await unscopedPrisma.location.findFirst({
      where: { orgId, name: { equals: name, mode: "insensitive" } },
    })
    if (!l) l = await unscopedPrisma.location.create({ data: { orgId, name, city: name } })
    locCache.set(key, l.id)
    return l.id
  }

  for (let i = 0; i < input.length; i++) {
    const rowNo = i + 2 // row 1 of the sheet is the header
    const r = clean(input[i])
    if (!r.firstName && !r.lastName && !r.email) continue // blank row
    const fail = (message: string) => errors.push({ row: rowNo, message })

    const problem = check(r)
    if (problem) { fail(problem); continue }
    if (seen.has(r.email)) { fail("Email appears twice in this file"); continue }

    const exists = await unscopedPrisma.user.findFirst({
      where: { orgId, email: { equals: r.email, mode: "insensitive" } },
      select: { id: true },
    })
    if (exists) { fail("Email already exists in this workspace"); continue }
    if (seatsLeft <= 0) { fail("Seat limit reached for this plan"); continue }

    let managerId: string | null = null
    if (r.managerEmail) {
      const m = await unscopedPrisma.employee.findFirst({
        where: { orgId, user: { email: { equals: r.managerEmail, mode: "insensitive" } } },
        select: { id: true },
      })
      if (m) managerId = m.id
      else if (!seen.has(r.managerEmail)) { fail(`Manager "${r.managerEmail}" not found`); continue }
    }

    if (dryRun) {
      seen.add(r.email)
      seatsLeft--
      okRows++
      continue
    }

    try {
      const departmentId = r.department ? await deptId(r.department) : null
      const locationId = r.location ? await locId(r.location) : null
      const user = await unscopedPrisma.user.create({
        data: { orgId, email: r.email, name: `${r.firstName} ${r.lastName}`, role: "EMPLOYEE" },
      })
      try {
        await unscopedPrisma.employee.create({
          data: {
            orgId,
            userId: user.id,
            employeeCode: `EMP${String(nextNo).padStart(4, "0")}`,
            firstName: r.firstName,
            lastName: r.lastName,
            phone: r.phone || null,
            designation: r.designation || null,
            departmentId,
            locationId,
            managerId,
            employmentType: r.employmentType ? TYPE_MAP[typeKey(r.employmentType)] : "FULL_TIME",
            joinDate: toDate(r.joinDate),
            dateOfBirth: toDate(r.dateOfBirth),
          },
        })
      } catch (e) {
        await unscopedPrisma.user.delete({ where: { id: user.id } }) // no orphan login row
        throw e
      }
      seen.add(r.email)
      seatsLeft--
      nextNo++
      okRows++
    } catch {
      fail("Could not save this row")
    }
  }

  return { ok: true, okRows, errors }
}

export async function addEmployee(orgSlug: string, data: NewEmployee): Promise<BatchResult> {
  try {
    const res = await runBatch(orgSlug, [data], false)
    if (res.okRows === 0)
      return { ok: false, message: res.errors[0]?.message ?? "Nothing to add", okRows: 0, errors: res.errors }
    revalidatePath(`/${orgSlug}/people`, "layout")
    return res
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed", okRows: 0, errors: [] }
  }
}

export async function importEmployees(
  orgSlug: string,
  rows: NewEmployee[],
  dryRun: boolean
): Promise<BatchResult> {
  try {
    if (rows.length > MAX_ROWS)
      return { ok: false, message: `Maximum ${MAX_ROWS} rows per file`, okRows: 0, errors: [] }
    const res = await runBatch(orgSlug, rows, dryRun)
    if (!dryRun && res.okRows > 0) revalidatePath(`/${orgSlug}/people`, "layout")
    return res
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed", okRows: 0, errors: [] }
  }
}