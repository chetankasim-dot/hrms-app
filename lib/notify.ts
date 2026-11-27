import { unscopedPrisma } from "@/lib/prisma"

type Notice = {
  orgId: string
  employeeId: string // the person who should be told
  title: string
  body: string
  type: string
  link?: string
}

// Best effort: a failed notification must never break the action that triggered it.
export async function notifyEmployee(n: Notice) {
  try {
    const emp = await unscopedPrisma.employee.findFirst({
      where: { id: n.employeeId, orgId: n.orgId },
      select: { userId: true },
    })
    if (!emp) return
    await unscopedPrisma.notification.create({
      data: {
        orgId: n.orgId,
        userId: emp.userId,
        title: n.title.slice(0, 120),
        body: n.body.slice(0, 500),
        type: n.type,
        link: n.link ?? null,
      },
    })
  } catch {
    // ignore
  }
}