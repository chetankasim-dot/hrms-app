import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Credentials from "next-auth/providers/credentials"
import { unscopedPrisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import type { Role } from "@prisma/client"
import { isBlocked, recordFailure, clearFailures } from "@/lib/rate-limit"

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(unscopedPrisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        orgSlug: { label: "Workspace", type: "text" },
      },
            async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password || !credentials?.orgSlug) return null
          const key = `login:${String(credentials.email).toLowerCase()}`
          if (isBlocked(key)) return null

          const org = await unscopedPrisma.organization.findUnique({
            where: { slug: credentials.orgSlug as string },
          })
          const user = org
            ? await unscopedPrisma.user.findFirst({
                where: {
                  orgId: org.id,
                  email: { equals: credentials.email as string, mode: "insensitive" },
                },
              })
            : null
          const valid =
            !!user?.passwordHash &&
            user.isActive &&
            (await compare(credentials.password as string, user.passwordHash))
          if (!valid || !user) {
            recordFailure(key)
            return null
          }

          clearFailures(key)
          return user
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await unscopedPrisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, role: true, isActive: true, orgId: true },
        })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
          token.isActive = dbUser.isActive
          token.orgId = dbUser.orgId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.isActive = token.isActive as boolean
        session.user.orgId = token.orgId as string | null
      }
      return session
    },
    async signIn({ user, account }) {
      if (!user.email) return false
      if (account?.provider !== "credentials") {
        const existingUser = await unscopedPrisma.user.findFirst({
          where: { email: user.email, isActive: false },
        })
        if (existingUser) return false
      }
      return true
    },
        async redirect({ url, baseUrl }) {
      const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL || baseUrl
      try {
        const target = new URL(url, base)
        // Only allow redirects that stay on our own site
        if (target.origin === new URL(base).origin) return target.toString()
      } catch {
        // fall through to the safe default
      }
      return base
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: Role
      isActive: boolean
      orgId: string | null
    }
  }
}