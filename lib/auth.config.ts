import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { Role } from "@prisma/client"

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        orgSlug: { label: "Workspace", type: "text" },
      },
      async authorize() {
        return null
      },
    }),
  ],
  callbacks: {
    // Edge-safe: only copies values already stored in the token. No database access here.
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.isActive = token.isActive as boolean
        session.user.orgId = (token.orgId as string | null) ?? null
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
}