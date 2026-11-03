"use client"

import { useState, useTransition } from "react"
import { Calendar, CheckCircle, XCircle, Clock, Plus, ChevronRight, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { applyLeave, approveLeave, rejectLeave, cancelLeave } from "@/server/actions/leave"

type LeaveType = {
  id: string
  name: string
  code: string
  daysAllowed: number
  isPaid: boolean
}

type LeaveBalance = {
  id: string
  allocated: number
  used: number
  pending: number
  carried: number
  leaveType: LeaveType
}

type LeaveRequest = {
  id: string
  fromDate: Date
  toDate: Date
  days: number
  reason: string | null
  status: string
  leaveType: { name: string; code: string }
}

type PendingRequest = {
  id: string
  fromDate: Date
  toDate: Date
  days: number
  reason: string | null
  status: string
  leaveType: { name: string; code: string }
  employee: {
    firstName: string
    lastName: string
    user: { name: string | null; email: string }
    department: { name: string } | null
  }
}

type Props = {
  orgId: string
  orgSlug: string
  employeeId: string
  employeeName: string
  isManager: boolean
  leaveTypes: LeaveType[]
  leaveBalances: LeaveBalance[]
  myRequests: LeaveRequest[]
  pendingRequests: PendingRequest[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "Pending",
    color: "bg-amber-50 text-amber-700 border-amber-100",
    icon: <Clock className="h-3 w-3" />,
  },
  APPROVED: {
    label: "Approved",
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  REJECTED: {
    label: "Rejected",
    color: "bg-red-50 text-red-700 border-red-100",
    icon: <XCircle className="h-3 w-3" />,
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-gray-100 text-gray-500 border-gray-200",
    icon: <XCircle className="h-3 w-3" />,
  },
}

const LEAVE_COLORS: Record<string, string> = {
  CL: "bg-indigo-50 border-indigo-100",
  SL: "bg-amber-50 border-amber-100",
  EL: "bg-emerald-50 border-emerald-100",
}

const LEAVE_BAR_COLORS: Record<string, string> = {
  CL: "bg-indigo-500",
  SL: "bg-amber-500",
  EL: "bg-emerald-500",
}

type Tab = "balances" | "apply" | "history" | "approvals"

export function LeaveDashboard({
  orgId, orgSlug, employeeId, employeeName,
  isManager, leaveTypes, leaveBalances, myRequests, pendingRequests,
}: Props) {
  const [tab, setTab] = useState<Tab>("balances")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const [form, setForm] = useState({
    leaveTypeId: leaveTypes[0]?.id ?? "",
    fromDate: "",
    toDate: "",
    reason: "",
  })

  const selectedBalance = leaveBalances.find((b) => b.leaveType.id === form.leaveTypeId)
  const available = selectedBalance
    ? selectedBalance.allocated + selectedBalance.carried - selectedBalance.used - selectedBalance.pending
    : 0

  const requestedDays = form.fromDate && form.toDate
    ? Math.max(0, Math.ceil(
        (new Date(form.toDate).getTime() - new Date(form.fromDate).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1)
    : 0

  function showMessage(type: "success" | "error", msg: string) {
    if (type === "success") { setSuccess(msg); setError(null) }
    else { setError(msg); setSuccess(null) }
    setTimeout(() => { setSuccess(null); setError(null) }, 4000)
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const result = await applyLeave({
          employeeId, leaveTypeId: form.leaveTypeId,
          fromDate: form.fromDate, toDate: form.toDate,
          reason: form.reason, orgId, orgSlug,
        })
        showMessage("success", "Leave applied for " + result.days + " days. Pending approval.")
        setForm((p) => ({ ...p, fromDate: "", toDate: "", reason: "" }))
        setTab("history")
      } catch (err) {
        showMessage("error", err instanceof Error ? err.message : "Failed to apply")
      }
    })
  }

  function handleApprove(requestId: string) {
    startTransition(async () => {
      try {
        await approveLeave({ requestId, orgId, orgSlug })
        showMessage("success", "Leave approved")
      } catch (err) {
        showMessage("error", err instanceof Error ? err.message : "Failed to approve")
      }
    })
  }

  function handleReject(requestId: string) {
    if (!rejectReason.trim()) { setError("Please enter a reason"); return }
    startTransition(async () => {
      try {
        await rejectLeave({ requestId, reason: rejectReason, orgId, orgSlug })
        showMessage("success", "Leave rejected")
        setRejectingId(null)
        setRejectReason("")
      } catch (err) {
        showMessage("error", err instanceof Error ? err.message : "Failed to reject")
      }
    })
  }

  function handleCancel(requestId: string) {
    startTransition(async () => {
      try {
        await cancelLeave({ requestId, orgId, orgSlug })
        showMessage("success", "Leave request cancelled")
      } catch (err) {
        showMessage("error", err instanceof Error ? err.message : "Failed to cancel")
      }
    })
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "balances", label: "My balances" },
    { id: "apply", label: "Apply for leave" },
    { id: "history", label: "My requests", count: myRequests.filter((r) => r.status === "PENDING").length || undefined },
    ...(isManager ? [{ id: "approvals" as Tab, label: "Approvals", count: pendingRequests.length || undefined }] : []),
  ]

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Leave</h1>
        <p className="text-gray-500 text-sm mt-0.5">{employeeName} · {new Date().getFullYear()}</p>
      </div>

      {(error || success) && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-xl border text-sm",
          success ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
        )}>
          {success ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
          {success ?? error}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              tab === t.id
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            {t.label}
            {t.count ? (
              <span className="h-5 min-w-5 px-1 rounded-full bg-black text-white text-[10px] flex items-center justify-center">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "balances" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {leaveBalances.map((b) => {
              const remaining = b.allocated + b.carried - b.used
              const pct = b.allocated > 0 ? Math.round((b.used / b.allocated) * 100) : 0
              const barColor = LEAVE_BAR_COLORS[b.leaveType.code] ?? "bg-gray-400"
              const cardColor = LEAVE_COLORS[b.leaveType.code] ?? "bg-gray-50 border-gray-100"
              return (
                <div key={b.id} className={cn("rounded-xl border p-5 space-y-3", cardColor)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{b.leaveType.name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{b.leaveType.isPaid ? "Paid" : "Unpaid"}</p>
                    </div>
                    <span className="text-2xl font-bold">{remaining}</span>
                  </div>
                  <div>
                    <div className="h-2 rounded-full bg-black/10 overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", barColor)}
                        style={{ width: Math.min(pct, 100) + "%" }} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
                      <span>Used: {b.used} days</span>
                      <span>Total: {b.allocated} days</span>
                    </div>
                  </div>
                  {b.pending > 0 && (
                    <p className="text-[10px] text-amber-600 font-medium">{b.pending} days pending approval</p>
                  )}
                  {b.carried > 0 && (
                    <p className="text-[10px] text-gray-500">{b.carried} days carried forward</p>
                  )}
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setTab("apply")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Apply for leave
          </button>
        </div>
      )}

      {tab === "apply" && (
        <form onSubmit={handleApply} className="space-y-5 max-w-lg">
          <div className="space-y-4 bg-white border border-gray-200 rounded-xl p-5">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Leave type</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {leaveTypes.map((lt) => {
                  const bal = leaveBalances.find((b) => b.leaveType.id === lt.id)
                  const avail = bal ? bal.allocated + bal.carried - bal.used - bal.pending : 0
                  return (
                    <button
                      key={lt.id}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, leaveTypeId: lt.id }))}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all",
                        form.leaveTypeId === lt.id
                          ? "border-black bg-black text-white"
                          : "border-gray-200 bg-white hover:border-gray-400"
                      )}
                    >
                      <p className="text-xs font-bold">{lt.code}</p>
                      <p className="text-[10px] mt-0.5 opacity-70">{avail} days left</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">From</label>
                <input
                  type="date"
                  value={form.fromDate}
                  onChange={(e) => setForm((p) => ({ ...p, fromDate: e.target.value }))}
                  required
                  className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">To</label>
                <input
                  type="date"
                  value={form.toDate}
                  min={form.fromDate}
                  onChange={(e) => setForm((p) => ({ ...p, toDate: e.target.value }))}
                  required
                  className="mt-1.5 h-10 w-full px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {requestedDays > 0 && (
              <div className={cn(
                "flex items-center justify-between px-4 py-3 rounded-lg border text-sm font-medium",
                requestedDays > available
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              )}>
                <span>{requestedDays} day{requestedDays > 1 ? "s" : ""} requested</span>
                <span>{available} available</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Reason <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                rows={3}
                placeholder="Brief reason for leave..."
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-black resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || requestedDays === 0 || requestedDays > available}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Submitting…" : "Submit leave request"}
            </button>
            <button
              type="button"
              onClick={() => setTab("balances")}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {myRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-10 w-10 text-gray-200 mb-3" />
              <p className="font-medium text-gray-500">No leave requests yet</p>
              <button
                onClick={() => setTab("apply")}
                className="mt-3 text-sm text-black underline"
              >
                Apply for leave
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_80px_100px_80px] gap-4 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <span>Type</span>
                <span>Dates</span>
                <span>Days</span>
                <span>Status</span>
                <span></span>
              </div>
              {myRequests.map((req) => {
                const status = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.PENDING
                return (
                  <div key={req.id} className="grid grid-cols-[1fr_1fr_80px_100px_80px] gap-4 px-4 py-3 border-t border-gray-100 items-center">
                    <div>
                      <p className="text-sm font-medium">{req.leaveType.name}</p>
                      {req.reason && (
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{req.reason}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm">{format(new Date(req.fromDate), "dd MMM")}</p>
                      <p className="text-[10px] text-gray-400">to {format(new Date(req.toDate), "dd MMM yyyy")}</p>
                    </div>
                    <p className="text-sm font-medium">{req.days}d</p>
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-medium w-fit",
                      status.color
                    )}>
                      {status.icon}
                      {status.label}
                    </span>
                    <div>
                      {req.status === "PENDING" && (
                        <button
                          onClick={() => handleCancel(req.id)}
                          disabled={isPending}
                          className="text-[10px] text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === "approvals" && isManager && (
        <div className="space-y-3">
          {pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-10 w-10 text-gray-200 mb-3" />
              <p className="font-medium text-gray-500">No pending requests</p>
              <p className="text-sm text-gray-400">All caught up!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                        {req.employee.firstName[0]}{req.employee.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {req.employee.firstName} {req.employee.lastName}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {req.employee.department?.name} · {req.employee.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold">{req.days} days</p>
                      <p className="text-[10px] text-gray-400">{req.leaveType.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                    {format(new Date(req.fromDate), "dd MMM yyyy")} → {format(new Date(req.toDate), "dd MMM yyyy")}
                    {req.reason && <span className="ml-2 text-gray-400">· {req.reason}</span>}
                  </div>

                  {rejectingId === req.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Reason for rejection..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-red-200 text-sm focus:outline-none focus:border-red-400"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={isPending}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirm rejection
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason("") }}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectingId(req.id)}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}