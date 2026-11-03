import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getOrg } from "@/lib/tenant"
import { AgentHome } from "@/components/home/agent-home"

export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const org = await getOrg(orgSlug)
  if (!org) redirect("/login")

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" :
    "Good evening"

  const firstName = session.user.name?.split(" ")[0] ?? "there"

  return (
    <AgentHome
      orgName={org.name}
      orgSlug={orgSlug}
      orgId={org.id}
      userName={session.user.name ?? session.user.email ?? "there"}
      greeting={greeting}
      firstName={firstName}
    />
  )
}