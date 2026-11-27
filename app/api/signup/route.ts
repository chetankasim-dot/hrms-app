import { NextResponse } from "next/server"
import { unscopedPrisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { addDays } from "date-fns"
import { allowCall } from "@/lib/rate-limit"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESERVED = new Set([
  "login", "signup", "invite", "api", "pricing", "platform", "admin",
  "app", "auth", "billing", "settings", "static", "public", "www", "_next",
])

function makeSlug(orgName: string) {
  const base = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/, "")
  if (!base) return "workspace"
  return RESERVED.has(base) ? `${base}-hq` : base
}

const isUniqueError = (e: unknown) => (e as { code?: string })?.code === "P2002"

export async function POST(req: Request) {
  try {
        const xff = req.headers.get("x-forwarded-for")
    const ip = xff ? xff.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? "unknown" : "unknown"
    if (!allowCall(`signup:${ip}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const password = typeof body?.password === "string" ? body.password : ""
    const orgName = typeof body?.orgName === "string" ? body.orgName.trim() : ""

    if (!name || !email || !password || !orgName) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }
    if (name.length > 80 || orgName.length > 60 || email.length > 254) {
      return NextResponse.json({ error: "One of the fields is too long" }, { status: 400 })
    }
    if (orgName.length < 2) {
      return NextResponse.json({ error: "Company name is too short" }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
    }
    if (password.length < 10 || password.length > 72) {
      return NextResponse.json(
        { error: "Password must be between 10 and 72 characters" },
        { status: 400 }
      )
    }

    const passwordHash = await hash(password, 12)
    const baseSlug = makeSlug(orgName)
    const [firstName, ...rest] = name.split(/\s+/)

    for (let attempt = 0; attempt < 5; attempt++) {
      const slug =
        attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`

      try {
        const org = await unscopedPrisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({
            data: {
              name: orgName,
              slug,
              plan: "STARTER",
              billingStatus: "TRIALING",
              trialEndsAt: addDays(new Date(), 14),
              maxSeats: 50,
              aiCallsQuota: 10000,
            },
          })

          const user = await tx.user.create({
            data: {
              orgId: organization.id,
              email,
              name,
              passwordHash,
              role: "HR_ADMIN",
              isActive: true,
            },
          })

          await tx.employee.create({
            data: {
              orgId: organization.id,
              userId: user.id,
              employeeCode: "EMP0001",
              firstName: firstName || name,
              lastName: rest.join(" "),
              designation: "HR Administrator",
            },
          })

          await tx.leaveType.createMany({
            data: [
              { orgId: organization.id, name: "Casual Leave", code: "CL", daysAllowed: 12, isPaid: true },
              { orgId: organization.id, name: "Sick Leave", code: "SL", daysAllowed: 12, isPaid: true },
              { orgId: organization.id, name: "Earned Leave", code: "EL", daysAllowed: 18, carryForward: true, isPaid: true },
            ],
          })

          await tx.department.create({
            data: { orgId: organization.id, name: "General", code: "GEN" },
          })

          return organization
        })

        return NextResponse.json({ success: true, slug: org.slug })
      } catch (err) {
        // Someone else took this slug a moment ago: try again with a new one
        if (isUniqueError(err)) continue
        throw err
      }
    }

    return NextResponse.json({ error: "Could not create the workspace. Try again." }, { status: 409 })
  } catch (err) {
    console.error("Signup error:", err)
    return NextResponse.json({ error: "Could not create the workspace" }, { status: 500 })
  }
}