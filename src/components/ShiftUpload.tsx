import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onSuccess: () => void
  departmentId?: string | null
  userRole?: string
}

interface ParsedRow {
  staffName: string
  date: string
  startTime: string
  endTime: string
  specialty: string
  scheduleType: string
  notes: string
  userId?: string
  status: 'ready' | 'error'
  errorMsg?: string
}

const FACILITY_ID = 'd917b86c-682c-4f11-b285-0a1cada2b54b'

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShiftUpload({ onClose, onSuccess, departmentId }: Props) {
  const [step, setStep]             = useState<1 | 2>(1)
  const [rows, setRows]             = useState<ParsedRow[]>([])
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Template download ──
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const headers = [
      'Staff Full Name',
      'Date (DD/MM/YYYY)',
      'Start Time (HH:MM)',
      'End Time (HH:MM)',
      'Specialty',
      'Schedule Type (regular/duty)',
      'Notes',
    ]
    const examples = [
      ['Dr. Abebe Girma',   '15/06/2026', '08:00', '17:00', 'Internal Medicine', 'regular', ''],
      ['Tigist Haile',      '15/06/2026', '07:00', '19:00', 'Ward',              'duty',    'Night shift'],
      ['Dr. Yonas Tadesse', '16/06/2026', '09:00', '13:00', 'Surgery',           'regular', ''],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples])
    ws['!cols'] = [22, 18, 16, 14, 20, 24, 20].map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, 'Shifts')
    XLSX.writeFile(wb, 'shifts_template.xlsx')
  }

  // ── File parse ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf, { type: 'array' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]

    if (data.length < 2) return

    // Fetch all profiles for name matching
    const { data: profileData } = await supabase.from('profiles').select('id, full_name')
    const profileMap: Record<string, string> = {}
    for (const p of profileData ?? []) {
      if (p.full_name) profileMap[p.full_name.toLowerCase().trim()] = p.id
    }

    const dataRows = data.slice(1).filter(r => r.some(v => v != null && String(v).trim()))

    const parsed: ParsedRow[] = dataRows.map(row => {
      const staffName    = String(row[0] ?? '').trim()
      const dateRaw      = String(row[1] ?? '').trim()
      const startTimeRaw = String(row[2] ?? '').trim()
      const endTimeRaw   = String(row[3] ?? '').trim()
      const specialty    = String(row[4] ?? '').trim()
      const schedRaw     = String(row[5] ?? '').trim().toLowerCase()
      const notes        = String(row[6] ?? '').trim()

      // Parse DD/MM/YYYY → YYYY-MM-DD
      let date = ''
      const parts = dateRaw.split('/')
      if (parts.length === 3) {
        const [d, m, y] = parts
        date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      }

      const userId       = profileMap[staffName.toLowerCase()]
      const scheduleType = ['regular', 'duty'].includes(schedRaw) ? schedRaw : 'regular'

      let status: 'ready' | 'error' = 'ready'
      let errorMsg: string | undefined

      if (!staffName) {
        status = 'error'; errorMsg = 'Missing staff name'
      } else if (!userId) {
        status = 'error'; errorMsg = 'Staff not found'
      } else if (!date || isNaN(new Date(date).getTime())) {
        status = 'error'; errorMsg = 'Invalid date (use DD/MM/YYYY)'
      } else if (!startTimeRaw || !endTimeRaw) {
        status = 'error'; errorMsg = 'Missing start or end time'
      } else if (startTimeRaw >= endTimeRaw) {
        status = 'error'; errorMsg = 'End time must be after start time'
      }

      return { staffName, date, startTime: startTimeRaw, endTime: endTimeRaw, specialty, scheduleType, notes, userId, status, errorMsg }
    })

    setRows(parsed)
    setImportResult(null)
    setStep(2)
  }

  const readyRows  = rows.filter(r => r.status === 'ready')
  const errorCount = rows.filter(r => r.status === 'error').length

  // ── Import ──
  const handleImport = async () => {
    if (readyRows.length === 0) return
    setImporting(true)

    const shiftsToInsert = readyRows.map(r => ({
      user_id:       r.userId!,
      department_id: departmentId ?? null,
      facility_id:   FACILITY_ID,
      starts_at:     `${r.date}T${r.startTime}:00`,
      ends_at:       `${r.date}T${r.endTime}:00`,
      specialty:     r.specialty     || null,
      schedule_type: r.scheduleType,
      notes:         r.notes         || null,
    }))

    const { error } = await supabase.from('shifts').insert(shiftsToInsert)
    setImporting(false)

    if (error) {
      setImportResult(`Error: ${error.message}`)
    } else {
      setImportResult(`${readyRows.length} shifts imported successfully`)
      setTimeout(() => onSuccess(), 1500)
    }
  }

  const resetToStep1 = () => {
    setStep(1)
    setRows([])
    setImportResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const importDone = importResult?.includes('imported successfully')

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-teal-500" />Bulk Upload Shifts
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Step 1 ── */}
          {step === 1 && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
                <p className="font-semibold">How to bulk upload shifts:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
                  <li>Download the template below and fill it in</li>
                  <li>Staff names must exactly match the system</li>
                  <li>Upload the filled file to preview and import</li>
                </ol>
              </div>

              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-teal-600 text-teal-600 hover:bg-teal-50 rounded-xl font-medium text-sm transition-colors"
              >
                <Download className="w-4 h-4" />Download Template (.xlsx)
              </button>

              <div
                className="border-2 border-dashed border-gray-300 hover:border-teal-400 rounded-xl p-10 text-center cursor-pointer transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Click to upload .xlsx file</p>
                <p className="text-xs text-gray-400 mt-1">Accepts .xlsx and .xls</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <>
              {/* Summary chips */}
              <div className="flex gap-3">
                <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{readyRows.length}</div>
                  <div className="text-xs text-green-600 mt-0.5">Ready to import</div>
                </div>
                <div className={`flex-1 rounded-xl p-3 text-center border ${errorCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`text-2xl font-bold ${errorCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{errorCount}</div>
                  <div className={`text-xs mt-0.5 ${errorCount > 0 ? 'text-red-500' : 'text-gray-400'}`}>Errors</div>
                </div>
              </div>

              {/* Result banner */}
              {importResult && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${
                  importResult.startsWith('Error')
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-green-50 border-green-200 text-green-700'
                }`}>
                  {importResult.startsWith('Error')
                    ? <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                  {importResult}
                </div>
              )}

              {/* Preview table */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {['Staff', 'Date', 'Start', 'End', 'Specialty', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, i) => (
                        <tr key={i} className={row.status === 'error' ? 'bg-red-50/60' : ''}>
                          <td className="px-3 py-2 font-medium max-w-[140px] truncate text-gray-900">
                            {row.staffName || <span className="text-gray-400 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.date || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.startTime || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.endTime || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{row.specialty || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.status === 'ready'
                              ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" />Ready</span>
                              : <span className="flex items-center gap-1 text-red-500 text-xs"><AlertCircle className="w-3.5 h-3.5" />{row.errorMsg}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {!importDone && (
                <button
                  onClick={resetToStep1}
                  className="text-sm text-gray-500 hover:text-teal-600 transition-colors"
                >
                  ← Upload a different file
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 transition-colors"
          >
            {importDone ? 'Close' : 'Cancel'}
          </button>
          {step === 2 && readyRows.length > 0 && !importDone && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              {importing ? 'Importing…' : `Import ${readyRows.length} Shifts`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
