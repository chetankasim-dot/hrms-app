"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addEmployee, importEmployees, type BatchResult, type NewEmployee } from "@/server/actions/employees"

const EMPTY: NewEmployee = {
  firstName: "", lastName: "", email: "", designation: "", department: "", location: "",
  managerEmail: "", employmentType: "FULL_TIME", joinDate: "", dateOfBirth: "", phone: "",
  employeeCode: "", gender: "", grade: "", employeeRole: "", companyName: "", workMode: "",
  workLocation: "", shiftTimings: "", serviceLine: "", serviceRegion: "", personalEmail: "",
  maritalStatus: "", aboutMe: "",
}

const TYPES = [
  ["FULL_TIME", "Full time"], ["PART_TIME", "Part time"], ["CONTRACT", "Contract"],
  ["INTERN", "Intern"], ["CONSULTANT", "Consultant"],
]

// Column names are matched after removing spaces and punctuation, so
// "Email ID", "email_id" and "EMAIL ID" are all the same.
const HEADERS: Record<string, keyof NewEmployee> = {
  employeeid: "employeeCode", employeecode: "employeeCode", empid: "employeeCode", empcode: "employeeCode",
  firstname: "firstName", lastname: "lastName",
  email: "email", emailid: "email", workemail: "email", officialemail: "email",
  title: "designation", designation: "designation", jobtitle: "designation",
  department: "department", location: "location",
  reportingto: "managerEmail", manager: "managerEmail", manageremail: "managerEmail",
  employeetype: "employmentType", type: "employmentType", employmenttype: "employmentType",
  dateofjoining: "joinDate", joindate: "joinDate", joiningdate: "joinDate",
  birthdate: "dateOfBirth", dateofbirth: "dateOfBirth", dob: "dateOfBirth", birthday: "dateOfBirth",
  phone: "phone", mobile: "phone",
  gender: "gender", level: "grade", grade: "grade",
  employeerole: "employeeRole", companyname: "companyName",
  workfromhome: "workMode", worklocation: "workLocation", shifttimings: "shiftTimings",
  serviceline: "serviceLine", serviceregion: "serviceRegion",
  otheremail: "personalEmail", personalemail: "personalEmail",
  maritalstatus: "maritalStatus", aboume: "aboutMe", aboutme: "aboutMe",
}

const REQUIRED: Record<string, string> = {
  firstName: "First Name", lastName: "Last Name", email: "Email ID",
  designation: "Title", department: "Department", location: "Location", joinDate: "Date of joining",
}

const TEMPLATE =
  "EmployeeID,First Name,Last Name,Email ID,Location,Department,Title,Date of joining,Other Email,Reporting To,Birth Date,Employee Type,Gender,Level,Phone,Employee Role,Company Name,Work From Home,Work Location,Shift Timings,Service Line,Service Region,Marital Status,AbouMe\n" +
  "9001,Asha,Verma,asha.verma@example.com,Bangalore,Accounting,Associate,09-Mar-2026,,,15-Jun-1995,Permanent,Female,Level 1,,Team member,Valenta AI Pvt Ltd,Hybrid,Bangalore,9:00 AM To 6:00 PM,,,,\n"

const CHUNK = 100
const inputCls = "w-full rounded-lg border bg-white px-3 py-2 text-sm"

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) {
    // Add 12 hours so the calendar day is right whichever time zone the date was read in
    return new Date(v.getTime() + 12 * 3600000).toISOString().slice(0, 10)
  }
  return String(v).trim()
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ",") { row.push(cell); cell = "" }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(cell); rows.push(row); row = []; cell = ""
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function toRows(grid: unknown[][]) {
  const cols = (grid[0] ?? []).map((h) => HEADERS[cellText(h).toLowerCase().replace(/[^a-z]/g, "")])
  const missing = Object.keys(REQUIRED).filter((k) => !cols.includes(k as keyof NewEmployee))
  const rows = grid.slice(1).map((r) => {
    const o: NewEmployee = { ...EMPTY }
    cols.forEach((key, i) => { if (key) o[key] = cellText(r[i]) })
    return o
  })
  return { rows, missing: missing.map((k) => REQUIRED[k]) }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-black">Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-gray-600">{label}</span>
      {children}
    </label>
  )
}

function AddForm({ orgSlug, departments, locations }: { orgSlug: string; departments: string[]; locations: string[] }) {
  const router = useRouter()
  const [form, setForm] = useState<NewEmployee>(EMPTY)
  const [more, setMore] = useState(false)
  const [message, setMessage] = useState("")
  const [added, setAdded] = useState("")
  const [pending, start] = useTransition()

  const set = (k: keyof NewEmployee) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage("")
    setAdded("")
    start(async () => {
      const res = await addEmployee(orgSlug, form)
      if (res.ok) {
        setAdded(`${form.firstName} ${form.lastName} was added`)
        setForm(EMPTY)
        router.refresh()
      } else setMessage(res.message ?? "Could not add employee")
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name *"><input className={inputCls} value={form.firstName} onChange={set("firstName")} required /></Field>
        <Field label="Last name *"><input className={inputCls} value={form.lastName} onChange={set("lastName")} required /></Field>
        <Field label="Work email *"><input type="email" className={inputCls} value={form.email} onChange={set("email")} required /></Field>
        <Field label="Employee ID (blank = automatic)"><input className={inputCls} value={form.employeeCode} onChange={set("employeeCode")} /></Field>
        <Field label="Designation *"><input className={inputCls} value={form.designation} onChange={set("designation")} required /></Field>
        <Field label="Employment type">
          <select className={inputCls} value={form.employmentType} onChange={set("employmentType")}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Department *">
          <input className={inputCls} list="dept-list" value={form.department} onChange={set("department")} placeholder="Pick or type a new one" required />
        </Field>
        <Field label="Location *">
          <input className={inputCls} list="loc-list" value={form.location} onChange={set("location")} placeholder="Pick or type a new one" required />
        </Field>
        <Field label="Manager (email or employee ID)"><input className={inputCls} value={form.managerEmail} onChange={set("managerEmail")} /></Field>
        <Field label="Join date *"><input type="date" className={inputCls} value={form.joinDate} onChange={set("joinDate")} required /></Field>
        <Field label="Date of birth"><input type="date" className={inputCls} value={form.dateOfBirth} onChange={set("dateOfBirth")} /></Field>
        <Field label="Phone"><input type="tel" className={inputCls} value={form.phone} onChange={set("phone")} /></Field>
      </div>
      <datalist id="dept-list">{departments.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="loc-list">{locations.map((l) => <option key={l} value={l} />)}</datalist>

      <button type="button" onClick={() => setMore((v) => !v)} className="text-sm text-teal-700 underline">
        {more ? "Hide more details" : "More details"}
      </button>

      {more && (
        <div className="grid gap-3 rounded-xl border bg-gray-50 p-4 sm:grid-cols-2">
          <Field label="Gender">
            <select className={inputCls} value={form.gender} onChange={set("gender")}>
              <option value="">Not set</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Level"><input className={inputCls} value={form.grade} onChange={set("grade")} /></Field>
          <Field label="Employee role"><input className={inputCls} value={form.employeeRole} onChange={set("employeeRole")} placeholder="Team member, Team Lead..." /></Field>
          <Field label="Company name"><input className={inputCls} value={form.companyName} onChange={set("companyName")} /></Field>
          <Field label="Work from home"><input className={inputCls} value={form.workMode} onChange={set("workMode")} placeholder="Hybrid, Office, Remote" /></Field>
          <Field label="Work location"><input className={inputCls} value={form.workLocation} onChange={set("workLocation")} /></Field>
          <Field label="Shift timings"><input className={inputCls} value={form.shiftTimings} onChange={set("shiftTimings")} /></Field>
          <Field label="Service line"><input className={inputCls} value={form.serviceLine} onChange={set("serviceLine")} /></Field>
          <Field label="Service region"><input className={inputCls} value={form.serviceRegion} onChange={set("serviceRegion")} /></Field>
          <Field label="Personal email"><input type="email" className={inputCls} value={form.personalEmail} onChange={set("personalEmail")} /></Field>
          <Field label="Marital status"><input className={inputCls} value={form.maritalStatus} onChange={set("maritalStatus")} /></Field>
          <div className="sm:col-span-2">
            <Field label="About me">
              <textarea className={inputCls} rows={3} maxLength={2000} value={form.aboutMe} onChange={set("aboutMe")} />
            </Field>
          </div>
        </div>
      )}

      {message && <div className="text-sm text-red-600">{message}</div>}
      {added && <div className="text-sm text-green-700">{added}. You can add another.</div>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Add employee"}
      </button>
    </form>
  )
}

function ImportPanel({ orgSlug }: { orgSlug: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<NewEmployee[]>([])
  const [report, setReport] = useState<BatchResult | null>(null)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState("")
  const [progress, setProgress] = useState("")
  const [pending, start] = useTransition()

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "employee-import-template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(file: File) {
    setMessage("")
    setReport(null)
    setRows([])
    setDone(false)
    try {
      let grid: unknown[][]
      if (file.name.toLowerCase().endsWith(".csv")) {
        grid = parseCsv((await file.text()).replace(/^\uFEFF/, ""))
      } else {
        const { default: readXlsxFile } = await import("read-excel-file")
        grid = await readXlsxFile(file)
      }
      const parsed = toRows(grid)
      if (parsed.missing.length > 0) {
        setMessage(`Missing column${parsed.missing.length > 1 ? "s" : ""}: ${parsed.missing.join(", ")}. Check the first row of your file.`)
        return
      }
      if (parsed.rows.length === 0) { setMessage("No data rows found"); return }
      if (parsed.rows.length > 500) { setMessage("Maximum 500 rows per file. Split the file and upload it in parts."); return }
      setRows(parsed.rows)
      start(async () => {
        setReport(await importEmployees(orgSlug, parsed.rows, true))
      })
    } catch {
      setMessage("Could not read that file. Use an .xlsx or .csv file.")
    }
  }

  function doImport() {
    start(async () => {
      let ok = 0
      const errs: { row: number; message: string }[] = []
      for (let s = 0; s < rows.length; s += CHUNK) {
        setProgress(`Importing ${Math.min(s + CHUNK, rows.length)} of ${rows.length}...`)
        const res = await importEmployees(orgSlug, rows.slice(s, s + CHUNK), false)
        if (!res.ok) {
          errs.push({ row: s + 2, message: res.message ?? "This batch failed. Run the import again to continue." })
          break
        }
        ok += res.okRows
        res.errors.forEach((e) => errs.push({ row: e.row + s, message: e.message }))
      }
      setProgress("")
      setReport({ ok: true, okRows: ok, errors: errs })
      setDone(true)
      if (ok > 0) router.refresh()
    })
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg bg-gray-50 p-3 text-gray-700">
        <div className="mb-1 font-medium">Columns (first row of the file)</div>
        <div>
          Required: First Name, Last Name, Email ID, Title, Department, Location, Date of joining. Everything else is optional:
          EmployeeID, Reporting To (email or employee ID), Birth Date, Employee Type, Gender, Level, Phone, Other Email and the rest of the Zoho People columns.
          Dates can be 2026-03-09 or 09-Mar-2026. New departments and locations are created automatically. The Employee Status column is ignored.
        </div>
        <button onClick={downloadTemplate} className="mt-2 text-teal-700 underline">Download template (CSV)</button>
      </div>

      <input
        type="file"
        accept=".xlsx,.csv"
        disabled={pending}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        className="block w-full text-sm"
      />

      {message && <div className="text-red-600">{message}</div>}
      {pending && !done && <div className="text-gray-500">{progress || "Working..."}</div>}

      {report && !report.ok && <div className="text-red-600">{report.message}</div>}

      {report && report.ok && (
        <div className="space-y-2">
          <div className={done ? "font-medium text-green-700" : "font-medium"}>
            {done
              ? `${report.okRows} employee${report.okRows === 1 ? "" : "s"} added`
              : `${report.okRows} of ${rows.length} rows are ready to import`}
            {report.errors.length > 0 && `, ${report.errors.length} with problems`}
          </div>
          {report.errors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
              {report.errors.slice(0, 50).map((er, i) => (
                <li key={i}>Row {er.row}: {er.message}</li>
              ))}
            </ul>
          )}
          {!done && (
            <button
              onClick={doImport}
              disabled={pending || report.okRows === 0}
              className="rounded-lg border border-teal-600 bg-teal-50 px-4 py-2 font-medium text-teal-800 disabled:opacity-50"
            >
              {pending ? "Importing..." : `Import ${report.okRows} employee${report.okRows === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function AddEmployees({
  orgSlug,
  departments,
  locations,
}: {
  orgSlug: string
  departments: string[]
  locations: string[]
}) {
  const [open, setOpen] = useState<null | "add" | "import">(null)
  const btn = "rounded-lg border px-4 py-2 text-sm font-medium"

  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setOpen("add")} className={`${btn} border-teal-600 bg-teal-50 text-teal-800`}>
          + Add employee
        </button>
        <button onClick={() => setOpen("import")} className={`${btn} bg-white text-gray-700`}>
          Import Excel
        </button>
      </div>

      {open === "add" && (
        <Modal title="Add employee" onClose={() => setOpen(null)}>
          <AddForm orgSlug={orgSlug} departments={departments} locations={locations} />
        </Modal>
      )}
      {open === "import" && (
        <Modal title="Import employees from Excel" onClose={() => setOpen(null)}>
          <ImportPanel orgSlug={orgSlug} />
        </Modal>
      )}
    </>
  )
}