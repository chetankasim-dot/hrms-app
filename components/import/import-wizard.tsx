"use client"

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Upload, ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react"
import { detectColumnMappings, detectHRMSSystem, parseCSVContent, previewImport, executeImport } from "@/server/actions/import"
import type { ColumnMapping, ImportPreviewResult } from "@/server/actions/import"

const HRMS_FIELDS = [
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "fullName", label: "Full name (auto-split)" },
  { value: "email", label: "Email" },
  { value: "employeeCode", label: "Employee code" },
  { value: "designation", label: "Designation" },
  { value: "department", label: "Department" },
  { value: "manager", label: "Manager" },
  { value: "joinDate", label: "Join date" },
  { value: "phone", label: "Phone" },
  { value: "grade", label: "Grade" },
  { value: "gender", label: "Gender" },
  { value: "location", label: "Location" },
  { value: "dateOfBirth", label: "Date of birth" },
  { value: "employmentType", label: "Employment type" },
]

const STEPS = ["Upload", "Map columns", "Preview", "Done"]

type Props = { orgId: string; orgSlug: string }

export function ImportWizard({ orgId, orgSlug }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [detectedSystem, setDetectedSystem] = useState("")
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setCsvFile(file)
    setStatus("Reading file…")

    startTransition(async () => {
      try {
        const text = await file.text()
        const { headers: h, rows: r } = await parseCSVContent(text)
        setHeaders(h)
        setRows(r)

        setStatus("Detecting source system…")
        const system = await detectHRMSSystem(h)
        setDetectedSystem(system)

        setStatus("Auto-mapping columns…")
        const autoMappings = await detectColumnMappings(h)
        setMappings(autoMappings)

        setStatus(null)
        setStep(1)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read file")
        setStatus(null)
      }
    })
  }

  async function handlePreview() {
    setError(null)
    startTransition(async () => {
      try {
        setStatus("Validating data…")
        const result = await previewImport(rows, mappings, orgId)
        setPreview(result)
        setStep(2)
        setStatus(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview failed")
        setStatus(null)
      }
    })
  }

  async function handleImport() {
    setError(null)
    startTransition(async () => {
      try {
        setStatus(`Importing ${preview?.valid} employees…`)
        const r = await executeImport(rows, mappings, orgId)
        setResult(r)
        setStep(3)
        setStatus(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed")
        setStatus(null)
      }
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import employees</h1>
        <p className="text-gray-500 text-sm mt-1">Upload your GreytHR CSV and we'll map everything automatically</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                i < step ? "bg-green-500 text-white" :
                i === step ? "bg-black text-white" :
                "bg-gray-100 text-gray-400"
              }`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`text-xs font-medium ${i === step ? "text-black" : "text-gray-400"}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-4 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Status banner */}
      {status && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50">
          <RefreshCw className="h-4 w-4 text-indigo-600 animate-spin flex-shrink-0" />
          <p className="text-sm text-indigo-700 font-medium">{status}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* STEP 0 — Upload */}
      {step === 0 && (
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center p-16 rounded-xl border-2 border-dashed border-gray-200 hover:border-black hover:bg-gray-50 cursor-pointer transition-all"
        >
          <div className="h-14 w-14 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
            <Upload className="h-6 w-6 text-gray-500" />
          </div>
          <p className="text-base font-semibold mb-1">Drop your CSV here</p>
          <p className="text-sm text-gray-400 mb-1">or click to browse</p>
          <p className="text-xs text-gray-400">GreytHR, Darwinbox, Keka, Excel — all supported</p>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {/* STEP 1 — Map columns */}
      {step === 1 && (
        <div className="space-y-4">
          {detectedSystem && detectedSystem !== "generic" && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              Detected: <strong className="capitalize">{detectedSystem}</strong> · {mappings.filter(m => m.hrmsField).length}/{mappings.length} columns auto-mapped
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{csvFile?.name} · {rows.length} rows</p>
            <p className="text-xs text-gray-400">{mappings.filter(m => m.hrmsField).length} mapped · {mappings.filter(m => !m.hrmsField).length} skipped</p>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_24px_1fr] gap-3 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>CSV column</span><span></span><span>HRMS field</span>
            </div>
            <div className="divide-y divide-gray-100">
              {mappings.map((mapping, idx) => (
                <div key={mapping.csvColumn} className="grid grid-cols-[1fr_24px_1fr] gap-3 px-4 py-2.5 items-center">
                  <div>
                    <p className="text-xs font-mono font-medium">{mapping.csvColumn}</p>
                    {rows[0]?.[mapping.csvColumn] && (
                      <p className="text-[10px] text-gray-400 truncate">e.g. {rows[0][mapping.csvColumn]}</p>
                    )}
                  </div>
                  <ArrowRight className={`h-3.5 w-3.5 flex-shrink-0 ${mapping.hrmsField ? "text-black" : "text-gray-200"}`} />
                  <select
                    value={mapping.hrmsField ?? ""}
                    onChange={(e) => {
                      const updated = [...mappings]
                      updated[idx] = { ...mapping, hrmsField: e.target.value || null }
                      setMappings(updated)
                    }}
                    className={`h-8 px-2 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-black ${
                      mapping.hrmsField ? "border-black bg-gray-50 text-black" : "border-gray-200 text-gray-400"
                    }`}
                  >
                    <option value="">— Skip —</option>
                    {HRMS_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(0)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button onClick={handlePreview} disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
              Preview import <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Preview */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-center">
              <p className="text-3xl font-bold">{preview.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total rows</p>
            </div>
            <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-center">
              <p className="text-3xl font-bold text-green-700">{preview.valid}</p>
              <p className="text-xs text-gray-500 mt-0.5">Ready to import</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center">
              <p className="text-3xl font-bold text-amber-700">{preview.invalid}</p>
              <p className="text-xs text-gray-500 mt-0.5">Will skip</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sample (first 5 rows)</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Email</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Department</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.sample.map((item, i) => (
                    <tr key={i} className={item.errors.length > 0 ? "bg-amber-50" : ""}>
                      <td className="px-3 py-2">{item.mapped.firstName || item.mapped.fullName || "—"} {item.mapped.lastName || ""}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">{item.mapped.email || "—"}</td>
                      <td className="px-3 py-2">{item.mapped.department || "—"}</td>
                      <td className="px-3 py-2">
                        {item.errors.length === 0
                          ? <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Valid</span>
                          : <span className="text-amber-600">{item.errors[0]}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button onClick={handleImport} disabled={isPending || preview.valid === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {isPending ? "Importing…" : `Import ${preview.valid} employees`}
              {!isPending && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Done */}
      {step === 3 && result && (
        <div className="space-y-4">
          <div className="p-8 rounded-xl border border-green-200 bg-green-50 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-800 mb-1">Import complete!</h2>
            <p className="text-green-700">
              <strong>{result.imported}</strong> employees imported · {result.skipped} skipped
            </p>
          </div>

          {result.errors.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
              <p className="text-xs font-semibold text-amber-700 mb-2">Rows skipped</p>
              {result.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-[10px] font-mono text-amber-600">{e}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => router.push(`/${orgSlug}/people`)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800">
              View employees →
            </button>
            <button onClick={() => router.push(`/${orgSlug}`)}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">
              Go to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}