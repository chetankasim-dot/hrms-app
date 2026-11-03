"use client"

import { useState } from "react"
import { Search, Users, X, Mail, Building2, Calendar, User, Award, Phone } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

type LeaveBalance = {
  id: string
  allocated: number
  used: number
  carried: number
  leaveType: { name: string; code: string }
}

type Employee = {
  id: string
  firstName: string
  lastName: string
  employeeCode: string
  designation: string | null
  joinDate: Date | null
  phone: string | null
  grade: string | null
  employmentType: string
  status: string
  user: { name: string | null; email: string }
  department: { id: string; name: string } | null
  manager: { firstName: string; lastName: string } | null
  leaveBalances: LeaveBalance[]
}

type Department = {
  id: string
  name: string
  _count: { employees: number }
}

type Props = {
  employees: Employee[]
  departments: Department[]
  orgSlug: string
  currentUserId: string
}

const COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
]

const LEAVE_COLORS: Record<string, string> = {
  CL: "bg-indigo-50 border-indigo-100 text-indigo-700",
  SL: "bg-amber-50 border-amber-100 text-amber-700",
  EL: "bg-emerald-50 border-emerald-100 text-emerald-700",
}

function getColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i)
  return COLORS[h % COLORS.length]
}

function getInitials(first: string, last: string) {
  return (first[0] ?? "") + (last[0] ?? "")
}

function EmployeePanel({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const color = getColor(emp.firstName + emp.lastName)
  const initials = getInitials(emp.firstName, emp.lastName)
  const balances = emp.leaveBalances ?? []

  const details = [
    { icon: Mail, label: "Email", value: emp.user.email },
    { icon: Building2, label: "Department", value: emp.department?.name },
    { icon: User, label: "Manager", value: emp.manager ? emp.manager.firstName + " " + emp.manager.lastName : null },
    { icon: Calendar, label: "Joined", value: emp.joinDate ? format(new Date(emp.joinDate), "dd MMM yyyy") : null },
    { icon: Phone, label: "Phone", value: emp.phone },
    { icon: Award, label: "Grade", value: emp.grade },
  ].filter((d) => d.value)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <p className="font-semibold text-sm">Employee profile</p>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          <div className="flex items-start gap-4">
            <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold flex-shrink-0", color)}>
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight">
                {emp.firstName} {emp.lastName}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{emp.designation ?? "No designation"}</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {emp.employeeCode}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100">
                  {emp.status}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">
                  {emp.employmentType.replace("_", " ")}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Details</p>
            {details.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">{item.label}</p>
                  <p className="text-sm font-medium truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          {balances.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Leave balances — {new Date().getFullYear()}
              </p>
              <div className="space-y-2">
                {balances.map((b) => {
                  const remaining = b.allocated + b.carried - b.used
                  const pct = b.allocated > 0
                    ? Math.round(((b.allocated - b.used) / b.allocated) * 100)
                    : 0
                  const colorClass = LEAVE_COLORS[b.leaveType.code] ?? "bg-gray-50 border-gray-100 text-gray-700"
                  return (
                    <div key={b.id} className={cn("p-3 rounded-lg border", colorClass)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold">{b.leaveType.name}</p>
                        <p className="text-xs font-bold">{remaining} / {b.allocated} left</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-current opacity-40"
                          style={{ width: Math.max(pct, 0) + "%" }}
                        />
                      </div>
                      <p className="text-[10px] opacity-60 mt-1">Used: {b.used} days</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function GridCard({ emp, onClick }: { emp: Employee; onClick: () => void }) {
  const color = getColor(emp.firstName + emp.lastName)
  const initials = getInitials(emp.firstName, emp.lastName)
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-black hover:shadow-sm transition-all cursor-pointer"
    >
      <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center text-lg font-bold mb-3", color)}>
        {initials}
      </div>
      <p className="font-semibold text-sm truncate text-gray-900">{emp.firstName} {emp.lastName}</p>
      <p className="text-xs text-gray-500 truncate mt-0.5">{emp.designation ?? "—"}</p>
      <div className="mt-3 pt-3 border-t border-gray-100">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
          {emp.department?.name ?? "No department"}
        </span>
      </div>
    </div>
  )
}

function ListRow({ emp, onClick }: { emp: Employee; onClick: () => void }) {
  const color = getColor(emp.firstName + emp.lastName)
  const initials = getInitials(emp.firstName, emp.lastName)
  return (
    <div
      onClick={onClick}
      className="grid grid-cols-[2fr_2fr_1.5fr_1fr_80px] gap-4 px-4 py-3 border-t border-gray-100 items-center hover:bg-gray-50 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0", color)}>
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate text-gray-900">{emp.firstName} {emp.lastName}</p>
          <p className="text-[10px] text-gray-400 truncate">{emp.user.email}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 truncate">{emp.designation ?? "—"}</p>
      <p className="text-sm text-gray-600 truncate">{emp.department?.name ?? "—"}</p>
      <p className="text-sm text-gray-500">
        {emp.joinDate ? format(new Date(emp.joinDate), "MMM yyyy") : "—"}
      </p>
      <p className="text-xs font-mono text-gray-400">{emp.employeeCode}</p>
    </div>
  )
}

export function PeopleList({ employees, departments }: Props) {
  const [search, setSearch] = useState("")
  const [dept, setDept] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [selected, setSelected] = useState<Employee | null>(null)

  const filtered = employees.filter((e) => {
    const name = (e.firstName + " " + e.lastName).toLowerCase()
    const matchSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      e.user.email.toLowerCase().includes(search.toLowerCase()) ||
      (e.designation ?? "").toLowerCase().includes(search.toLowerCase()) ||
      e.employeeCode.toLowerCase().includes(search.toLowerCase())
    const matchDept = !dept || e.department?.id === dept
    return matchSearch && matchDept
  })

  return (
    <div className="space-y-5">
      {selected && (
        <EmployeePanel emp={selected} onClose={() => setSelected(null)} />
      )}

      <div>
        <h1 className="text-2xl font-bold">Employees</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {employees.length} active · {departments.length} departments
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setDept("")}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
            !dept ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          )}
        >
          All ({employees.length})
        </button>
        {departments.map((d) => (
          <button
            key={d.id}
            onClick={() => setDept(d.id === dept ? "" : d.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
              dept === d.id ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            )}
          >
            {d.name} ({d._count.employees})
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, email, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-black"
          />
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setView("grid")}
            className={cn("px-3 py-1 rounded text-xs font-medium",
              view === "grid" ? "bg-black text-white" : "text-gray-500 hover:text-black")}
          >
            Grid
          </button>
          <button
            onClick={() => setView("list")}
            className={cn("px-3 py-1 rounded text-xs font-medium",
              view === "list" ? "bg-black text-white" : "text-gray-500 hover:text-black")}
          >
            List
          </button>
        </div>
        <p className="text-sm text-gray-400">{filtered.length} shown</p>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-10 w-10 text-gray-200 mb-3" />
          <p className="font-medium text-gray-500">No employees found</p>
        </div>
      )}

      {view === "grid" && filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((emp) => (
            <GridCard key={emp.id} emp={emp} onClick={() => setSelected(emp)} />
          ))}
        </div>
      )}

      {view === "list" && filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_80px] gap-4 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>Employee</span>
            <span>Role</span>
            <span>Department</span>
            <span>Joined</span>
            <span>Code</span>
          </div>
          {filtered.map((emp) => (
            <ListRow key={emp.id} emp={emp} onClick={() => setSelected(emp)} />
          ))}
        </div>
      )}
    </div>
  )
}