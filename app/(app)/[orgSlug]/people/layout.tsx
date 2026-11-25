import { notFound } from "next/navigation"
import { PeopleTabs } from "@/components/people/dashboard"
import { requireActor } from "@/lib/access"

const MANAGE_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER"]

export default async function PeopleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  return (
    <div className="p-6">
      <PeopleTabs orgSlug={orgSlug} canManage={MANAGE_ROLES.includes(actor.role)} />
      <div className="mt-6">{children}</div>
    </div>
  )
}