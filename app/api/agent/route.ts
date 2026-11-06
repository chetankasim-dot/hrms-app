import { requireActor } from "@/lib/access"
import { getOrg } from "@/lib/tenant"
import { runAgent } from "@/lib/agent/orchestrator"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  let actor
  try {
    actor = await requireActor()
  } catch {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : ""
  const orgSlug = typeof body?.orgSlug === "string" ? body.orgSlug : ""
  if (!message) return new NextResponse("Message required", { status: 400 })
  if (orgSlug !== actor.orgSlug) return new NextResponse("Forbidden", { status: 403 })

  const org = await getOrg(orgSlug)
  if (!org || org.id !== actor.orgId) return new NextResponse("Org not found", { status: 404 })

  // Only user/assistant text from the browser, capped in count and size
  const history = (Array.isArray(body?.history) ? body.history : [])
    .filter(
      (h: unknown): h is { role: "user" | "assistant"; content: string } =>
        !!h &&
        typeof h === "object" &&
        ((h as { role?: unknown }).role === "user" || (h as { role?: unknown }).role === "assistant") &&
        typeof (h as { content?: unknown }).content === "string"
    )
    .slice(-10)
    .map((h: { role: "user" | "assistant"; content: string }) => ({
      role: h.role,
      content: h.content.slice(0, 4000),
    }))

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      try {
        for await (const event of runAgent(message, org.id, org.name, history, actor.userId, actor.role)) {
          send(event)
        }
      } catch (err) {
        console.error("Agent error:", err)
        send({ type: "error", message: "The assistant could not complete that request." })
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