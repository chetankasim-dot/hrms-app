import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Credentials from "next-auth/providers/credentials"
import { unscopedPrisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import type { Role } from "@prisma/client"

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
        if (!credentials?.email || !credentials?.password || !credentials?.orgSlug) {
          return null
        }
        const org = await unscopedPrisma.organization.findUnique({
          where: { slug: credentials.orgSlug as string },
        })
        if (!org) return null

        const user = await unscopedPrisma.user.findFirst({
          where: { orgId: org.id, email: credentials.email as string },
        })
        if (!user?.passwordHash) return null

        const valid = await compare(credentials.password as string, user.passwordHash)
        if (!valid) return null

        return user
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