import { PeopleTabs } from "@/components/people/dashboard"

export default async function PeopleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Employees</h1>
      <PeopleTabs orgSlug={orgSlug} />
      <div className="mt-6">{children}</div>
    </div>
  )
}