import { requirePageRole } from "@/lib/access"
import { ChangePassword } from "@/components/account/change-password"

export const metadata = { title: "Account" }

export default async function AccountPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  await requirePageRole(orgSlug, ["SUPER_ADMIN", "HR_ADMIN", "HR_MANAGER", "MANAGER", "EMPLOYEE"])

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Account and security</h1>
      <p className="text-sm text-gray-500">Change the password you use to sign in.</p>
      <ChangePassword orgSlug={orgSlug} />
    </div>
  )
}