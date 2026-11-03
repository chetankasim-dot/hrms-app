import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function Page({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={"/" + orgSlug} className="text-sm text-gray-500 hover:text-black">← Dashboard</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium capitalize">recruitment</span>
      </div>
      <div className="bg-white rounded-xl border p-12 text-center">
        <h1 className="text-2xl font-bold capitalize mb-2">recruitment</h1>
        <p className="text-gray-500">This module is being built. Check back soon.</p>
      </div>
    </div>
  )
}
