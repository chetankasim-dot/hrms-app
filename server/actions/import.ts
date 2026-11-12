"use server"

import { unscopedPrisma } from "@/lib/prisma"
import { requireActor } from "@/lib/access"
import { revalidatePath } from "next/cache"
import type { Role } from "@prisma/client"

const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"]
const MAX_ROWS = 500
const MAX_CSV_CHARS = 5_000_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ColumnMapping = {
  csvColumn: string
  hrmsField: string | null
}

export type ImportPreviewResult = {
  total: number
  valid: number
  invalid: number
  sample: Array<{ row: Record<string, string>; errors: string[]; mapped: Record<string, string> }>
}

export type ImportResult = {
  imported: number
  skipped: number
  errors: string[]
}

export async function parseCSVContent(csvText: string): Promise<{
  headers: string[]
  rows: Record<string, string>[]
}> {
  if (typeof csvText !== "string" || csvText.length > MAX_CSV_CHARS) return { headers: [], rows: [] }
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim())
        current = ""
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1, MAX_ROWS + 1).map((line) => {
    const values = parseRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? "" })
    return row
  })

  return { headers, rows }
}

export async function detectColumnMappings(headers: string[]): Promise<ColumnMapping[]> {
  const MAPPING: Record<string, string[]> = {
    fullName: ["employee name", "name", "full name", "full_name", "employee_name"],
    firstName: ["first_name", "firstname", "first name", "fname"],
    lastName: ["last_name", "lastname", "last name", "lname", "surname"],
    email: ["email", "email_id", "email address", "work email", "official email", "company email"],
    employeeCode: ["employee number", "emp_id", "employee_id", "emp_code", "employee code", "emp no", "emp. code"],
    designation: ["designation", "job_title", "title", "position", "role", "job title"],
    department: ["department", "dept", "team", "division"],
    manager: ["manager name", "manager", "reporting_manager", "reports_to", "line_manager", "supervisor"],
    joinDate: ["joined on", "join_date", "joining_date", "date_of_joining", "doj", "hire_date", "joining date", "date of joining"],
    phone: ["phone", "mobile", "contact_no", "phone_number", "mobile_number"],
    grade: ["grade", "level", "band", "pay_grade"],
    gender: ["gender", "sex"],
    location: ["location", "office", "city", "work location"],
    dateOfBirth: ["date of birth", "dob", "date_of_birth", "birth_date", "birthday"],
    employmentType: ["employment_type", "type", "employee_type", "employment type"],
  }

  return headers.map((h) => {
    const normalised = h.toLowerCase().trim()
    if (normalised === "sl.no") return { csvColumn: h, hrmsField: null }
    for (const [field, aliases] of Object.entries(MAPPING)) {
      if (aliases.includes(normalised)) {
        return { csvColumn: h, hrmsField: field }
      }
    }
    return { csvColumn: h, hrmsField: null }
  })
}

export async function detectHRMSSystem(headers: string[]): Promise<string> {
  const normalised = headers.map((h) => h.toLowerCase().trim())
  if (normalised.includes("joined on") && normalised.includes("employee number") && normalised.includes("employee name")) {
    return "greythr"
  }
  if (normalised.includes("employee id") && normalised.includes("official email id")) return "darwinbox"
  if (normalised.includes("work email") && normalised.includes("joining date")) return "keka"
  return "generic"
}

function mapRow(rawRow: Record<string, string>, mappings: ColumnMapping[]) {
  const mapped: Record<string, string> = {}
  for (const m of mappings) {
    if (m.hrmsField && rawRow[m.csvColumn] !== undefined) {
      mapped[m.hrmsField] = String(rawRow[m.csvColumn] ?? "").trim()
    }
  }
  if (mapped.fullName && !mapped.firstName) {
    const parts = mapped.fullName.trim().split(/\s+/)
    mapped.firstName = parts[0] ?? ""
    mapped.lastName = parts.slice(1).join(" ")
  }
  if (mapped.email) mapped.email = mapped.email.toLowerCase()
  return mapped
}

// orgId is accepted so the existing import page keeps compiling, but it is ignored.
// The workspace always comes from the signed-in user.
export async function previewImport(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  _orgId?: string
): Promise<ImportPreviewResult> {
  const actor = await requireActor(undefined, ADMIN_ROLES)
  if (!Array.isArray(rows) || rows.length > MAX_ROWS)
    throw new Error(`Maximum ${MAX_ROWS} rows per import`)

  const validMappings = mappings.filter((m) => m.hrmsField)
  const existingEmails = new Set(
    (await unscopedPrisma.user.findMany({ where: { orgId: actor.orgId }, select: { email: true } }))
      .map((u) => u.email.toLowerCase())
  )

  const seen = new Set<string>()
  const results = rows.map((rawRow) => {
    const mapped = mapRow(rawRow, validMappings)
    const errors: string[] = []
    if (!mapped.email) errors.push("Email required")
    else if (!EMAIL_RE.test(mapped.email)) errors.push("Invalid email")
    else if (existingEmails.has(mapped.email)) errors.push("Already exists")
    else if (seen.has(mapped.email)) errors.push("Appears twice in this file")
    if (mapped.email) seen.add(mapped.email)
    if (!mapped.firstName && !mapped.fullName) errors.push("Name required")
    return { row: rawRow, mapped, errors }
  })

  return {
    total: results.length,
    valid: results.filter((r) => r.errors.length === 0).length,
    invalid: results.filter((r) => r.errors.length > 0).length,
    sample: results.slice(0, 5),
  }
}

export async function executeImport(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
  _orgId?: string
): Promise<ImportResult> {
  const actor = await requireActor(undefined, ADMIN_ROLES)
  const orgId = actor.orgId
  if (!Array.isArray(rows) || rows.length > MAX_ROWS)
    throw new Error(`Maximum ${MAX_ROWS} rows per import`)

  const validMappings = mappings.filter((m) => m.hrmsField)
  let imported = 0
  let skipped = 0
  const errors: string[] = []

    const orgRow = await unscopedPrisma.organization.findUnique({
    where: { id: orgId },
    select: { maxSeats: true },
  })
  const activeCount = await unscopedPrisma.employee.count({
    where: { orgId, status: { not: "SEPARATED" } },
  })
  let seatsLeft = (orgRow?.maxSeats ?? 50) - activeCount

  const [departments, existingUsers, existingEmployees, leaveTypes] = await Promise.all([
    unscopedPrisma.department.findMany({ where: { orgId } }),
    unscopedPrisma.user.findMany({ where: { orgId }, select: { email: true } }),
    unscopedPrisma.employee.findMany({ where: { orgId }, select: { employeeCode: true } }),
    unscopedPrisma.leaveType.findMany({ where: { orgId } }),
  ])

  const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]))
  const usedEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()))
  const usedCodes = new Set(existingEmployees.map((e) => e.employeeCode))
  let codeCounter =
    existingEmployees.reduce((max, e) => {
      const m = /^EMP(\d+)$/.exec(e.employeeCode)
      return m ? Math.max(max, parseInt(m[1], 10)) : max
    }, 0) + 1

  for (const rawRow of rows) {
    const mapped = mapRow(rawRow, validMappings)

    if (!mapped.email || !EMAIL_RE.test(mapped.email)) { skipped++; continue }
    if (usedEmails.has(mapped.email)) { skipped++; continue }
        if (seatsLeft <= 0) {
      errors.push(`${mapped.email}: seat limit reached for this plan`)
      skipped++
      continue
    }

    try {
      let departmentId: string | undefined
      if (mapped.department) {
        let deptId = deptMap.get(mapped.department.toLowerCase())
        if (!deptId) {
          const newDept = await unscopedPrisma.department.create({
            data: {
              orgId,
              name: mapped.department,
              code:
                (mapped.department.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "DEPT") +
                String(deptMap.size + 1),
            },
          })
          deptMap.set(mapped.department.toLowerCase(), newDept.id)
          deptId = newDept.id
        }
        departmentId = deptId
      }

      let empCode = mapped.employeeCode
      if (!empCode || usedCodes.has(empCode)) {
        while (usedCodes.has(`EMP${String(codeCounter).padStart(4, "0")}`)) codeCounter++
        empCode = `EMP${String(codeCounter).padStart(4, "0")}`
      }
      const firstName = mapped.firstName || mapped.email.split("@")[0]
      const lastName = mapped.lastName || ""

      await unscopedPrisma.$transaction(async (tx) => {
        // No password and no verified email: the person sets a password through an invite.
        const user = await tx.user.create({
          data: {
            orgId,
            email: mapped.email,
            name: `${firstName} ${lastName}`.trim(),
            role: "EMPLOYEE",
            isActive: true,
          },
        })

        const employee = await tx.employee.create({
          data: {
            orgId,
            userId: user.id,
            employeeCode: empCode,
            firstName,
            lastName,
            designation: mapped.designation || null,
            grade: mapped.grade || null,
            gender: mapped.gender || null,
            phone: mapped.phone || null,
            departmentId: departmentId || null,
            joinDate: mapped.joinDate ? parseGreytHRDate(mapped.joinDate) : null,
            employmentType: "FULL_TIME",
          },
        })

        if (leaveTypes.length > 0) {
          await tx.leaveBalance.createMany({
            data: leaveTypes.map((lt) => ({
              orgId,
              employeeId: employee.id,
              leaveTypeId: lt.id,
              year: new Date().getFullYear(),
              allocated: lt.daysAllowed,
            })),
            skipDuplicates: true,
          })
        }
      })

      usedEmails.add(mapped.email)
      usedCodes.add(empCode)
            seatsLeft--
      imported++
    } catch {
      errors.push(`${mapped.email}: could not be imported`)
      skipped++
    }
  }

  revalidatePath(`/${actor.orgSlug}/people`, "layout")
  return { imported, skipped, errors }
}

function parseGreytHRDate(value: string): Date | null {
  if (!value?.trim()) return null
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  }
  const match = value.trim().match(/^(\d{1,2})[\/\-\.]([A-Za-z]{3})[\/\-\.](\d{2,4})$/)
  if (match) {
    const day = parseInt(match[1])
    const month = months[match[2].toLowerCase()]
    let year = parseInt(match[3])
    if (year < 100) year += year < 50 ? 2000 : 1900
    if (month !== undefined) {
      const d = new Date(Date.UTC(year, month, day))
      if (!isNaN(d.getTime())) return d
    }
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}