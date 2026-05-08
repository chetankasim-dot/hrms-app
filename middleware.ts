import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

const PUBLIC_ROUTES = [
  "/", "/pricing", "/login", "/signup", "/invite",
  "/api/auth", "/api/billing/webhook",
]

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  if (pathname.startsWith("/platform")) {
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", baseUrl))
    }
    return NextResponse.next()
  }

  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next()
  }

  if (!session?.user) {
    const loginUrl = new URL("/login", baseUrl)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (session.user.isActive === false) {
    return NextResponse.redirect(new URL("/login?error=AccountDisabled", baseUrl))
  }

  const response = NextResponse.next()
  if (session.user.role) response.headers.set("x-user-role", session.user.role)
  if (session.user.orgId) response.headers.set("x-org-id", session.user.orgId)
  return response
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)" ],
}