import { NextResponse } from "next/server"
import { unscopedPrisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { addDays } from "date-fns"

export async function POST(req: Request) {
  try {
    const { name, email, password, orgName } = await req.json()

    if (!name || !email || !password || !orgName) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 })
    }

    const baseSlug = orgName.toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30)

    let slug = baseSlug
    let i = 1
    while (await unscopedPrisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${i++}`
    }

    const passwordHash = await hash(password, 12)

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
          emailVerified: new Date(),
        },
      })

      await tx.employee.create({
        data: {
          orgId: organization.id,
          userId: user.id,
          employeeCode: "EMP0001",
          firstName: name.split(" ")[0] ?? name,
          lastName: name.split(" ").slice(1).join(" ") || "",
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
    console.error(err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create workspace" },
      { status: 500 }
    )
  }
}