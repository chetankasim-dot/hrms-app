import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getOrg } from "@/lib/tenant"
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
  const session = await auth()
  if (!session?.user) redirect("/login")

  const org = await getOrg(orgSlug)
  if (!org) redirect("/login?error=OrgNotFound")

  if (session.user.orgId !== org.id && session.user.role !== "SUPER_ADMIN") {
    redirect("/login?error=Forbidden")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        orgSlug={orgSlug}
        orgName={org.name}
        plan={org.plan}
        userName={session.user.name ?? session.user.email ?? "User"}
        userEmail={session.user.email ?? ""}
        role={session.user.role}
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