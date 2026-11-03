import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getOrg } from "@/lib/tenant"
import { ImportWizard } from "@/components/import/import-wizard"

export default async function ImportPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const org = await getOrg(orgSlug)
  if (!org) redirect("/login")

  return <ImportWizard orgId={org.id} orgSlug={orgSlug} />
}