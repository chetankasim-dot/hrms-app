import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getOrg } from "@/lib/tenant"
import { ImportWizard } from "@/components/import/import-wizard"
import { requirePageRole } from "@/lib/access"

export default async function ImportPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
    await requirePageRole(orgSlug, ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER"])
  const session = await auth()
  if (!session?.user) redirect("/login")

  const org = await getOrg(orgSlug)
  if (!org) redirect("/login")

  return <ImportWizard orgId={org.id} orgSlug={orgSlug} />
}