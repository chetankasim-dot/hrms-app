import { auth } from "@/lib/auth"
import { getOrg } from "@/lib/tenant"
import { runAgent } from "@/lib/agent/orchestrator"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { message, orgSlug, history = [] } = await req.json()

  if (!message?.trim()) {
    return new NextResponse("Message required", { status: 400 })
  }

  const org = await getOrg(orgSlug)
  if (!org) {
    return new NextResponse("Org not found", { status: 404 })
  }

  if (session.user.orgId !== org.id && session.user.role !== "SUPER_ADMIN") {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        )
      }

      try {
        for await (const event of runAgent(
          message,
          org.id,
          org.name,
          history,
          session.user.id
        )) {
          send(event)
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Agent failed",
        })
      }

      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}