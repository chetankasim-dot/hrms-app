import { redirect, notFound } from "next/navigation"
import { requireActor, type Actor } from "@/lib/access"
import { unscopedPrisma } from "@/lib/prisma"
import { Sidebar } from "@/components/nav/sidebar"
import { Topbar } from "@/components/nav/topbar"

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  let actor: Actor | null = null
  try {
    actor = await requireActor(orgSlug)
  } catch (e) {
    // Signed out, disabled, or no workspace: go to login.
    // Signed in but wrong workspace ("Not found"): show not found.
    if (e instanceof Error && e.message === "Not found") notFound()
    actor = null
  }
  if (!actor) redirect("/login")

  const [org, user] = await Promise.all([
    unscopedPrisma.organization.findUnique({
      where: { id: actor.orgId },
      select: { name: true, plan: true },
    }),
    unscopedPrisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, email: true },
    }),
  ])
  if (!org) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        orgSlug={orgSlug}
        orgName={org.name}
        plan={org.plan}
        userName={user?.name ?? user?.email ?? "User"}
        userEmail={user?.email ?? ""}
        role={actor.role}
      />
      <Topbar orgSlug={orgSlug} orgName={org.name} />
      <main className="pl-56 pt-12">
        <div className="px-6 py-6 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  )
}