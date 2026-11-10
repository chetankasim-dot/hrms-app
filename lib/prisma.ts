import { PrismaClient } from "@prisma/client"
import { AsyncLocalStorage } from "async_hooks"

export const orgContext = new AsyncLocalStorage<{ orgId: string }>()

export function getOrgId(): string {
  const ctx = orgContext.getStore()
  if (!ctx?.orgId) throw new Error("No org context")
  return ctx.orgId
}

const TENANT_MODELS = new Set([
  "employee", "department", "location", "leaveType", "leaveBalance",
  "leaveRequest", "attendanceRecord", "timesheet", "timesheetEntry",
  "jobPosting", "candidate", "application", "interview", "applicationNote",
  "employeeDocument", "onboardingTask", "offboardingCase", "offboardingTask",
  "assetReturn", "iTProvisioningRequest", "performanceReview",
  "performanceReview2", "peerFeedback", "reviewCycle", "goal", "goalUpdate",
  "compensationRecord", "salaryBand", "meritCycle", "meritIncrement",
  "course", "courseEnrollment", "pulseSurvey", "surveyResponse",
  "recognition", "helpDeskTicket", "ticketReply", "agentConversation",
  "agentMessage", "auditLog", "notification", "usageRecord",
])

type LooseArgs = { data?: unknown; where?: Record<string, unknown> }

function makePrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelName = model ? model.charAt(0).toLowerCase() + model.slice(1) : ""
          if (!modelName || !TENANT_MODELS.has(modelName)) return query(args)

          const ctx = orgContext.getStore()
                    if (!ctx?.orgId) throw new Error("No org context: use withOrg() or unscopedPrisma")

          const orgId = ctx.orgId
          const a = args as LooseArgs

          if (operation === "createMany" && a.data) {
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d) => ({
              ...(d as Record<string, unknown>),
              orgId,
            }))
          } else if (operation === "create" && a.data) {
            a.data = { ...(a.data as Record<string, unknown>), orgId }
          }

          if (
            ["findMany", "findFirst", "findUnique", "count", "aggregate",
              "update", "updateMany", "delete", "deleteMany", "upsert"].includes(operation)
          ) {
            a.where = { ...(a.where ?? {}), orgId }
          }

          return query(a as typeof args)
        },
      },
    },
  })
}

type ExtendedPrismaClient = ReturnType<typeof makePrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? makePrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export function withOrg<T>(orgId: string, fn: () => T): T {
  return orgContext.run({ orgId }, fn)
}

const globalForUnscopedPrisma = globalThis as unknown as {
  unscopedPrisma: PrismaClient | undefined
}

export const unscopedPrisma =
  globalForUnscopedPrisma.unscopedPrisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") {
  globalForUnscopedPrisma.unscopedPrisma = unscopedPrisma
}