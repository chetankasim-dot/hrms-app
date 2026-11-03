import { unscopedPrisma } from "@/lib/prisma"
import { cache } from "react"
import type { Organization, Plan } from "@prisma/client"

export async function resolveOrgFromHost(host: string): Promise<Organization | null> {
  const appBase = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN ?? "localhost:3000"
  if (!host.endsWith(appBase) && host !== appBase) {
    return unscopedPrisma.organization.findFirst({ where: { domain: host } })
  }
  const slug = host.replace(`.${appBase}`, "").split(".")[0]
  if (!slug || slug === "app" || host === appBase) return null
  return unscopedPrisma.organization.findUnique({ where: { slug } })
}

export const getOrg = cache(async (orgSlug: string): Promise<Organization | null> => {
  if (!orgSlug) return null
  return unscopedPrisma.organization.findUnique({ where: { slug: orgSlug } })
})

export type Feature =
  | "ats_recruitment" | "performance_reviews" | "compensation"
  | "learning_lms" | "engagement_surveys" | "analytics_advanced"
  | "api_access" | "webhooks" | "custom_workflows" | "multiple_sso"
  | "custom_domain" | "white_label" | "ai_agent" | "ai_agent_advanced"
  | "audit_logs" | "data_export" | "bulk_import"

const PLAN_FEATURES: Record<Plan, Feature[]> = {
  STARTER: ["ai_agent", "audit_logs", "data_export", "bulk_import"],
  GROWTH: [
    "ats_recruitment", "performance_reviews", "compensation", "learning_lms",
    "engagement_surveys", "analytics_advanced", "api_access", "webhooks",
    "custom_workflows", "ai_agent", "ai_agent_advanced", "audit_logs",
    "data_export", "bulk_import",
  ],
  ENTERPRISE: [
    "ats_recruitment", "performance_reviews", "compensation", "learning_lms",
    "engagement_surveys", "analytics_advanced", "api_access", "webhooks",
    "custom_workflows", "multiple_sso", "custom_domain", "white_label",
    "ai_agent", "ai_agent_advanced", "audit_logs", "data_export", "bulk_import",
  ],
}

export function hasFeature(org: Organization, feature: Feature): boolean {
  const overrides = org.features as Record<string, boolean>
  if (feature in overrides) return overrides[feature]
  return PLAN_FEATURES[org.plan]?.includes(feature) ?? false
}

export async function checkSeatLimit(orgId: string) {
  const [org, current] = await Promise.all([
    unscopedPrisma.organization.findUnique({ where: { id: orgId }, select: { maxSeats: true } }),
    unscopedPrisma.user.count({ where: { orgId, isActive: true } }),
  ])
  const max = org?.maxSeats ?? 50
  return { allowed: current < max, current, max }
}

export async function checkAIQuota(orgId: string) {
  const org = await unscopedPrisma.organization.findUnique({
    where: { id: orgId },
    select: { aiCallsQuota: true, aiCallsUsed: true },
  })
  const quota = org?.aiCallsQuota ?? 10000
  const used = org?.aiCallsUsed ?? 0
  return { allowed: used < quota, used, quota }
}

export async function incrementAIUsage(orgId: string, calls = 1) {
  const period = new Date().toISOString().slice(0, 7)
  await Promise.all([
    unscopedPrisma.organization.update({
      where: { id: orgId },
      data: { aiCallsUsed: { increment: calls } },
    }),
    unscopedPrisma.usageRecord.upsert({
      where: { orgId_metric_period: { orgId, metric: "ai_calls", period } },
      create: { orgId, metric: "ai_calls", value: calls, period },
      update: { value: { increment: calls } },
    }),
  ])
}

export const PLAN_LABELS: Record<Plan, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  ENTERPRISE: "Enterprise",
}

export const PLAN_COLORS: Record<Plan, string> = {
  STARTER: "text-gray-600 bg-gray-100",
  GROWTH: "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950",
  ENTERPRISE: "text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-950",
}