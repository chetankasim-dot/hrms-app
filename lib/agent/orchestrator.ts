import Anthropic from "@anthropic-ai/sdk"
import { AGENT_TOOLS, executeTool } from "./tools"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = `You are an intelligent HR assistant for {ORG_NAME}. You help HR teams and employees get instant answers about their workforce using natural language.

You have access to real employee data for {ORG_NAME}. Always use your tools to fetch live data before answering — never guess or make up numbers.

Today's date is {TODAY} (YYYY-MM-DD). Use it to work out "today", "this week" and "next week" before calling tools that take dates.

## Guidelines
- Be concise and friendly. Use bullet points and bold for key data.
- Always call a tool first before answering any question about employees, headcount, departments, or leave.
- Always use proper markdown tables (with | headers |) when showing lists of employees, departments, or any structured data. Never use plain text for tabular data.
- Use ₹ for currency, DD/MM/YYYY for dates.
- Address the user warmly. Get straight to the answer.
- If asked something outside HR (weather, coding, etc.), politely say you're focused on HR topics.

## Examples of what you can help with
- "How many employees do we have?" → use get_workforce_snapshot
- "Show me the engineering team" → use search_employees with department filter
- "Who joined recently?" → use get_recent_joiners
- "What's Chetan's leave balance?" → use get_leave_balances
- "Tell me about Pratheek" → use get_employee
- "Who is on leave today / this week?" → use get_leave_schedule (scope my_team if they say "my team")`

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_done"; toolName: string; result: unknown }
  | { type: "done" }
  | { type: "error"; message: string }

export async function* runAgent(
  userMessage: string,
  orgId: string,
  orgName: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
    userId?: string,
  userRole?: string
): AsyncGenerator<StreamEvent> {
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = SYSTEM_PROMPT
    .replace(/{ORG_NAME}/g, orgName)
    .replace(/{TODAY}/g, today)

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ]

  const tools = AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))

  let iterations = 0
  const MAX_ITERATIONS = 5

  while (iterations < MAX_ITERATIONS) {
    iterations++

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    })

    // Stream text blocks
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        // Stream word by word for effect
        const words = block.text.split(" ")
        for (const word of words) {
          yield { type: "text", text: word + " " }
          await new Promise((r) => setTimeout(r, 10))
        }
      }
    }

    // Handle tool use
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      break
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUseBlocks) {
      yield { type: "tool_start", toolName: toolUse.name }

      try {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          orgId,
          userId,
          userRole
        )
        yield { type: "tool_done", toolName: toolUse.name, result }
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Tool failed"
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error: ${errMsg}`,
          is_error: true,
        })
      }
    }

    messages.push({ role: "assistant", content: response.content })
    messages.push({ role: "user", content: toolResults })
  }

  yield { type: "done" }
}