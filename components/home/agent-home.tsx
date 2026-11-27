"use client"

import { useState, useRef, useEffect } from "react"
import { ArrowUp, Bot, Zap, Users, BarChart2, Calendar, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  toolsUsed?: string[]
  streaming?: boolean
}

type Props = {
  orgName: string
  orgSlug: string
  orgId: string
  userName: string
  greeting: string
  firstName: string
}

const TOOL_LABELS: Record<string, string> = {
  get_workforce_snapshot: "Checking headcount",
  search_employees: "Searching employees",
  get_employee: "Fetching employee details",
  get_departments: "Loading departments",
  get_recent_joiners: "Finding recent joiners",
  get_leave_balances: "Checking leave balances",
  get_leave_schedule: "Checking leave schedule",
}

export function AgentHome({ orgName, orgSlug, greeting, firstName }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeToolName, setActiveToolName] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const SUGGESTIONS = [
    { icon: <Users className="h-4 w-4" />, text: "How many employees do we have and what departments?" },
    { icon: <Search className="h-4 w-4" />, text: "Show me everyone in the HR team" },
    { icon: <BarChart2 className="h-4 w-4" />, text: "Who joined in the last 6 months?" },
    { icon: <Calendar className="h-4 w-4" />, text: "Who is on leave today?" },
  ]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px"
    }
  }, [input])

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    }
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
      toolsUsed: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput("")
    setIsStreaming(true)
    setActiveToolName(null)

    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, orgSlug, history }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error("HTTP " + res.status)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Events end with a blank line. Keep any half-received event for the next chunk.
        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "text") {
              const chunk: string = event.text
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m
                )
              )
            } else if (event.type === "tool_start") {
              const name: string = event.toolName
              setActiveToolName(name)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id && !(m.toolsUsed ?? []).includes(name)
                    ? { ...m, toolsUsed: [...(m.toolsUsed ?? []), name] }
                    : m
                )
              )
            } else if (event.type === "tool_done") {
              setActiveToolName(null)
            } else if (event.type === "error") {
              const msg: string = event.message ?? "The assistant could not complete that request."
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: msg } : m))
              )
            }
          } catch {
            // ignore malformed events
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m))
      )
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "Something went wrong. Please try again.", streaming: false }
              : m
          )
        )
      }
    } finally {
      setIsStreaming(false)
      setActiveToolName(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {!hasMessages && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
          <div className="h-14 w-14 rounded-2xl bg-black flex items-center justify-center mb-5">
            <Bot className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-center mb-2">
            {greeting}, {firstName}
          </h1>
          <p className="text-gray-500 text-center mb-10">
            Ask me anything about {orgName}&apos;s people and HR data
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                onClick={() => sendMessage(s.text)}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-black hover:bg-gray-50 text-left transition-all group"
              >
                <span className="text-gray-400 group-hover:text-black transition-colors flex-shrink-0">
                  {s.icon}
                </span>
                <span className="text-sm text-gray-600 group-hover:text-black transition-colors">
                  {s.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasMessages && (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                  msg.role === "user"
                    ? "bg-black text-white rounded-tr-sm"
                    : "bg-white border border-gray-200 rounded-tl-sm"
                )}>
                  {msg.role === "assistant" && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.toolsUsed.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-medium border border-indigo-100">
                          <Zap className="h-2.5 w-2.5" />
                          {TOOL_LABELS[t] ?? t}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.streaming && !msg.content && (
                    <div className="flex gap-1 items-center py-1">
                      {activeToolName ? (
                        <span className="text-xs text-gray-500 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          {TOOL_LABELS[activeToolName] ?? activeToolName}…
                        </span>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </>
                      )}
                    </div>
                  )}

                  {msg.content && (
                    msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-p:leading-relaxed [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_thead]:bg-gray-50 [&_th]:border [&_th]:border-gray-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-gray-500 [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_tr:hover]:bg-gray-50">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => null }}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      <div className="border-t bg-white px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className={cn(
            "flex items-end gap-3 rounded-2xl border bg-white transition-all",
            "focus-within:border-black focus-within:ring-2 focus-within:ring-black/5 border-gray-200"
          )}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasMessages ? "Ask a follow-up…" : "Ask anything about " + orgName + "'s people…"}
              rows={1}
              className="flex-1 bg-transparent resize-none px-4 py-3.5 text-sm focus:outline-none placeholder:text-gray-400"
              style={{ maxHeight: "160px", scrollbarWidth: "none" }}
            />
            <div className="pr-3 pb-3 flex-shrink-0">
              {isStreaming ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="h-8 w-8 rounded-xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                >
                  <span className="h-3 w-3 rounded-sm bg-red-500" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center transition-all",
                    input.trim() ? "bg-black text-white hover:bg-gray-800" : "bg-gray-100 text-gray-300 cursor-not-allowed"
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-2">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}