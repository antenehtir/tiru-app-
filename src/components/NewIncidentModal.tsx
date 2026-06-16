import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { X, Loader2, AlertCircle } from 'lucide-react'

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IncidentCategory =
  | 'patient_safety' | 'medication_error' | 'equipment_failure'
  | 'staff_conduct' | 'security' | 'facility' | 'other'

const CATEGORIES: { value: IncidentCategory; label: string }[] = [
  { value:'patient_safety',    label:'Patient Safety' },
  { value:'medication_error',  label:'Medication Error' },
  { value:'equipment_failure', label:'Equipment Failure' },
  { value:'staff_conduct',     label:'Staff Conduct' },
  { value:'security',          label:'Security' },
  { value:'facility',          label:'Facility / Infrastructure' },
  { value:'other',             label:'Other' },
]

const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
}
const SEVERITIES: IncidentSeverity[] = ['low','medium','high','critical']

type Props = {
  open: boolean
  onClose: () => void
  reporterId: string
  onSubmitted: () => void
}

export default function NewIncidentModal({ open, onClose, reporterId, onSubmitted }: Props) {
  const [saving,  setSaving]  = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    title:'', description:'', severity:'medium' as IncidentSeverity,
    category:'other' as IncidentCategory, location:'', occurred_at:'', anonymous: false,
  })

  const resetForm = () => setForm({
    title:'', description:'', severity:'medium', category:'other',
    location:'', occurred_at:'', anonymous: false,
  })

  const handleClose = () => {
    setFormErr(null)
    onClose()
  }

  const submitReport = async () => {
    setFormErr(null)
    if (!form.title.trim())       return setFormErr('Title is required.')
    if (!form.description.trim()) return setFormErr('Description is required.')
    setSaving(true)
    const { error: err } = await supabase.from('incident_reports').insert({
      reporter_id: reporterId, title: form.title.trim(),
      description: form.description.trim(), severity: form.severity,
      category: form.category, location: form.location.trim() || null,
      occurred_at: form.occurred_at || null, anonymous: form.anonymous, status: 'submitted',
    })
    setSaving(false)
    if (err) { setFormErr(err.message); return }
    resetForm()
    onClose()
    onSubmitted()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">Report an Incident</h2>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {formErr && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4" />{formErr}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title *</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Brief summary of the incident"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as IncidentCategory }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Severity</label>
              <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as IncidentSeverity }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description *</label>
            <textarea rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe what happened in detail…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Location</label>
              <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Ward 3, Pharmacy"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">When it occurred</label>
              <input type="datetime-local" value={form.occurred_at} onChange={e => setForm(f => ({ ...f, occurred_at: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => setForm(f => ({ ...f, anonymous: !f.anonymous }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.anonymous ? 'bg-teal-500' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.anonymous ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-gray-700">Submit anonymously</span>
            <span className="text-xs text-gray-400">(your name hidden from leadership)</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={handleClose} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={submitReport} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
