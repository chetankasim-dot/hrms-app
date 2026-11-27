import { redirect, notFound } from "next/navigation"
import { requireActor } from "@/lib/access"

export default async function MePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  let actor
  try {
    actor = await requireActor(orgSlug)
  } catch {
    notFound()
  }

  // No employee record means there is no profile to show
  if (!actor.employeeId) notFound()

  redirect(`/${orgSlug}/people/${actor.employeeId}`)
}