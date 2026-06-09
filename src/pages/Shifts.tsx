import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  CalendarDays,
  Clock,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Building2,
  AlertCircle,
  Loader2,
} from 'lucide-react'

type ShiftRow = {
  id: string
  user_id: string
  department_id: string | null
  shift_date: string
  start_time: string
  end_time: string
  notes: string | null
  created_at: string
  user: { full_name: string } | null
  department: { name: string } | null
}

type ProfileOption = { id: string; full_name: string }
type DeptOption    = { id: string; name: string }

const CAN_ADD_SHIFT = [
  'super_admin','ceo','general_manager','medical_director',
  'hr','department_head','coordinator',
]

function fmt12(time: string) {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${mStr} ${suffix}`
}

function isoDate(d: Date) { return d.toISOString().split('T')[0] }

function addDays(d: Date, n: number) {
  const copy = new Date(d); copy.setDate(copy.getDate() + n); return copy
}

function weekStart(d: Date) {
  const copy = new Date(d); copy.setDate(copy.getDate() - copy.getDay()); return copy
}

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function Shifts() {
  const { profile } = useAuth()
  const role = profile?.role ?? ''
  const [weekBase, setWeekBase] = useState(() => weekStart(new Date()))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekBase, i))
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    user_id:'', department_id:'', shift_date: isoDate(new Date()),
    start_time:'08:00', end_time:'17:00', notes:'',
  })

  const fetchShifts = useCallback(async () => {
    setLoading(true); setError(null)
    const from = isoDate(weekDays[0])
    const to   = isoDate(weekDays[6])
    const { data, error: err } = await supabase
      .from('shifts')
      .select(`*, user:profiles!shifts_user_id_fkey(full_name), department:departments(name)`)
      .gte('shift_date', from).lte('shift_date', to)
      .order('start_time', { ascending: true })
    if (err) setError(err.message)
    else setShifts((data as ShiftRow[]) ?? [])
    setLoading(false)
  }, [weekBase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchShifts() }, [fetchShifts])

  useEffect(() => {
    const channel = supabase.channel('shifts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => fetchShifts())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchShifts])

  const openModal = async () => {
    setFormError(null)
    setForm({ user_id:'', department_id:'', shift_date: isoDate(new Date()), start_time:'08:00', end_time:'17:00', notes:'' })
    const [{ data: pData }, { data: dData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('departments').select('id, name').order('name'),
    ])
    setProfiles((pData as ProfileOption[]) ?? [])
    setDepartments((dData as DeptOption[]) ?? [])
    setModalOpen(true)
  }

  const saveShift = async () => {
    setFormError(null)
    if (!form.user_id) return setFormError('Please select a staff member.')
    if (!form.shift_date) return setFormError('Please pick a date.')
    if (form.start_time >= form.end_time) return setFormError('End time must be after start time.')
    setSaving(true)
    const { error: err } = await supabase.from('shifts').insert({
      user_id: form.user_id, department_id: form.department_id || null,
      shift_date: form.shift_date, start_time: form.start_time + ':00',
      end_time: form.end_time + ':00', notes: form.notes || null,
    })
    setSaving(false)
    if (err) setFormError(err.message)
    else { setModalOpen(false); fetchShifts() }
  }

  const shiftsByDate: Record<string, ShiftRow[]> = {}
  for (const s of shifts) {
    if (!shiftsByDate[s.shift_date]) shiftsByDate[s.shift_date] = []
    shiftsByDate[s.shift_date].push(s)
  }

  const canAdd = CAN_ADD_SHIFT.includes(role)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-teal-500" />Shifts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Weekly schedule overview</p>
        </div>
        {canAdd && (
          <button onClick={openModal} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />Add Shift
          </button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button onClick={() => setWeekBase(w => addDays(w, -7))} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[220px] text-center">
          {weekDays[0].toLocaleDateString('en-US', { month:'short', day:'numeric' })}
          {' – '}
          {weekDays[6].toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
        </span>
        <button onClick={() => setWeekBase(w => addDays(w, 7))} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronRight className="w-5 h-5" />
        </button>
        <button onClick={() => setWeekBase(weekStart(new Date()))} className="ml-2 text-xs text-teal-600 hover:underline">This week</button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading shifts…
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const key = isoDate(day)
            const isToday = key === isoDate(new Date())
            const dayShifts = shiftsByDate[key] ?? []
            return (
              <div key={key} className={`min-h-[160px] rounded-xl border p-2 flex flex-col gap-1.5 ${isToday ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                <div className="text-center mb-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{DAY_LABELS[day.getDay()]}</div>
                  <div className={`text-sm font-bold ${isToday ? 'text-teal-600' : 'text-gray-700 dark:text-gray-200'}`}>{day.getDate()}</div>
                </div>
                {dayShifts.length === 0
                  ? <div className="flex-1 flex items-center justify-center text-[10px] text-gray-300 dark:text-gray-600">No shifts</div>
                  : dayShifts.map(s => <ShiftChip key={s.id} shift={s} />)
                }
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Shift</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"><User className="inline w-3.5 h-3.5 mr-1" />Staff Member *</label>
                <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— Select staff —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"><Building2 className="inline w-3.5 h-3.5 mr-1" />Department</label>
                <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date *</label>
                <input type="date" value={form.shift_date} onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"><Clock className="inline w-3.5 h-3.5 mr-1" />Start *</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End *</label>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button onClick={saveShift} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving…' : 'Save Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShiftChip({ shift }: { shift: ShiftRow }) {
  const colors = [
    'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  ]
  const colorClass = colors[shift.user_id.charCodeAt(0) % colors.length]
  return (
    <div className={`rounded-md px-1.5 py-1 text-[10px] leading-tight ${colorClass} cursor-default`}
      title={`${shift.user?.full_name ?? 'Unknown'}\n${fmt12(shift.start_time)} – ${fmt12(shift.end_time)}${shift.notes ? '\n' + shift.notes : ''}`}>
      <div className="font-semibold truncate">{shift.user?.full_name ?? '—'}</div>
      <div className="opacity-75">{fmt12(shift.start_time)} – {fmt12(shift.end_time)}</div>
      {shift.department?.name && <div className="opacity-60 truncate">{shift.department.name}</div>}
    </div>
  )
}
