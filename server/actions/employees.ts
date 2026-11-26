"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"
import type { EmploymentType } from "@prisma/client"

const MAX_ROWS = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

export type NewEmployee = {
  firstName: string
  lastName: string
  email: string
  designation: string
  department: string
  location: string
  managerEmail: string // the manager's email OR employee ID (for example "Sonu Goyal 2004")
  employmentType: string
  joinDate: string
  dateOfBirth: string
  phone: string
  employeeCode?: string
  gender?: string
  grade?: string
  employeeRole?: string
  companyName?: string
  workMode?: string
  workLocation?: string
  shiftTimings?: string
  serviceLine?: string
  serviceRegion?: string
  personalEmail?: string
  maritalStatus?: string
  aboutMe?: string
}

export type BatchResult = {
  ok: boolean
  message?: string
  okRows: number
  errors: { row: number; message: string }[]
}

const TYPE_MAP: Record<string, EmploymentType> = {
  fulltime: "FULL_TIME",
  permanent: "FULL_TIME",
  direct: "FULL_TIME",
  regular: "FULL_TIME",
  parttime: "PART_TIME",
  contract: "CONTRACT",
  oncontract: "CONTRACT",
  contractor: "CONTRACT",
  contractual: "CONTRACT",
  intern: "INTERN",
  consultant: "CONSULTANT",
}
const typeKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()

async function requireAdmin(orgSlug: string) {
  const actor = await requireActor(orgSlug, ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"])
  const org = await unscopedPrisma.organization.findUnique({ where: { id: actor.orgId } })
  if (!org) throw new Error("Not found")
  return org
}

function parseDate(s: string): Date | null {
  const v = s.trim()
  if (!v) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    return isNaN(d.getTime()) ? null : d
  }
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    const d = new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]))
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function clean(r: NewEmployee) {
  const t = (s?: string) => (s ?? "").trim()
  const o = (s?: string) => (t(s) ? t(s) : null)
  return {
    firstName: t(r.firstName),
    lastName: t(r.lastName),
    email: t(r.email).toLowerCase(),
    designation: t(r.designation),
    department: t(r.department),
    location: t(r.location),
    managerRef: t(r.managerEmail),
    employmentType: t(r.employmentType),
    joinDate: t(r.joinDate),
    dateOfBirth: t(r.dateOfBirth),
    phone: t(r.phone),
    employeeCode: t(r.employeeCode),
    gender: o(r.gender),
    grade: o(r.grade),
    employeeRole: o(r.employeeRole),
    companyName: o(r.companyName),
    workMode: o(r.workMode),
    workLocation: o(r.workLocation),
    shiftTimings: o(r.shiftTimings),
    serviceLine: o(r.serviceLine),
    serviceRegion: o(r.serviceRegion),
    personalEmail: t(r.personalEmail) ? t(r.personalEmail).toLowerCase() : null,
    maritalStatus: o(r.maritalStatus),
    aboutMe: t(r.aboutMe) ? t(r.aboutMe).slice(0, 2000) : null,
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
    ["Join date", r.joinDate],
  ]
  for (const [label, v] of required) if (!v) return `${label} is required`

  if (!EMAIL_RE.test(r.email)) return "Email is not valid"
  if (r.personalEmail && !EMAIL_RE.test(r.personalEmail)) return "Personal email is not valid"
  if (r.managerRef && r.managerRef.toLowerCase() === r.email) return "A person cannot be their own manager"
  if (r.employmentType && !TYPE_MAP[typeKey(r.employmentType)])
    return `Employment type "${r.employmentType}" is not recognised`
  if (r.phone) {
    const digits = r.phone.replace(/\D/g, "")
    if (digits.length < 7 || digits.length > 15) return "Phone must have 7 to 15 digits"
  }
  if (!parseDate(r.joinDate)) return "Join date must be YYYY-MM-DD or DD-Mon-YYYY"
  if (r.dateOfBirth && !parseDate(r.dateOfBirth)) return "Date of birth must be YYYY-MM-DD or DD-Mon-YYYY"
  return null
}

async function runBatch(orgSlug: string, input: NewEmployee[], dryRun: boolean): Promise<BatchResult> {
  const org = await requireAdmin(orgSlug)
  const orgId = org.id

  const [existing, active] = await Promise.all([
    unscopedPrisma.employee.findMany({ where: { orgId }, select: { id: true, employeeCode: true } }),
    unscopedPrisma.employee.count({ where: { orgId, status: { not: "SEPARATED" } } }),
  ])

  const codeToId = new Map<string, string>(existing.map((e) => [norm(e.employeeCode), e.id]))
  let nextNo =
    existing.reduce((max, e) => {
      const m = /^EMP(\d+)$/i.exec(e.employeeCode)
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
    let d = await unscopedPrisma.department.findFirst({ where: { orgId, name: { equals: name, mode: "insensitive" } } })
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
    let l = await unscopedPrisma.location.findFirst({ where: { orgId, name: { equals: name, mode: "insensitive" } } })
    if (!l) l = await unscopedPrisma.location.create({ data: { orgId, name, city: name } })
    locCache.set(key, l.id)
    return l.id
  }

  // Finds a manager from an email, or from text that ends in an employee ID
  async function findManager(ref: string): Promise<{ found: boolean; id: string | null }> {
    if (!ref) return { found: true, id: null }
    if (ref.includes("@")) {
      const m = await unscopedPrisma.employee.findFirst({
        where: { orgId, user: { email: { equals: ref, mode: "insensitive" } } },
        select: { id: true },
      })
      if (m) return { found: true, id: m.id }
      return { found: seen.has(ref.toLowerCase()), id: null }
    }
    const t = norm(ref)
    let best: { k: string; id: string } | null = null
    for (const [k, id] of codeToId) {
      if (!t.endsWith(k)) continue
      const before = t[t.length - k.length - 1]
      if (before !== undefined && /[a-z0-9]/.test(before)) continue
      if (!best || k.length > best.k.length) best = { k, id }
    }
    return best ? { found: true, id: best.id === "pending" ? null : best.id } : { found: false, id: null }
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

    if (r.employeeCode && codeToId.has(norm(r.employeeCode))) { fail(`Employee ID "${r.employeeCode}" already exists`); continue }

    const mgr = await findManager(r.managerRef)
    if (!mgr.found) { fail(`Manager "${r.managerRef}" not found`); continue }

    let code = r.employeeCode
    if (!code) {
      while (codeToId.has(`emp${String(nextNo).padStart(4, "0")}`)) nextNo++
      code = `EMP${String(nextNo).padStart(4, "0")}`
    }

    if (dryRun) {
      seen.add(r.email)
      codeToId.set(norm(code), "pending")
      seatsLeft--
      okRows++
      continue
    }

    try {
      const departmentId = await deptId(r.department)
      const locationId = await locId(r.location)
      const user = await unscopedPrisma.user.create({
        data: { orgId, email: r.email, name: `${r.firstName} ${r.lastName}`, role: "EMPLOYEE" },
      })
      let emp
      try {
        emp = await unscopedPrisma.employee.create({
          data: {
            orgId,
            userId: user.id,
            employeeCode: code,
            firstName: r.firstName,
            lastName: r.lastName,
            phone: r.phone || null,
            designation: r.designation,
            departmentId,
            locationId,
            managerId: mgr.id,
            employmentType: r.employmentType ? TYPE_MAP[typeKey(r.employmentType)] : "FULL_TIME",
            joinDate: parseDate(r.joinDate),
            dateOfBirth: r.dateOfBirth ? parseDate(r.dateOfBirth) : null,
            gender: r.gender,
            grade: r.grade,
            employeeTypeLabel: r.employmentType || null,
            employeeRole: r.employeeRole,
            companyName: r.companyName,
            workMode: r.workMode,
            workLocation: r.workLocation,
            shiftTimings: r.shiftTimings,
            serviceLine: r.serviceLine,
            serviceRegion: r.serviceRegion,
            personalEmail: r.personalEmail,
            maritalStatus: r.maritalStatus,
            aboutMe: r.aboutMe,
          },
        })
      } catch (e) {
        await unscopedPrisma.user.delete({ where: { id: user.id } }) // no orphan login row
        throw e
      }
      seen.add(r.email)
      codeToId.set(norm(code), emp.id)
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