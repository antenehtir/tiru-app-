import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

interface Shift {
  id: string
  shift_type: string
  starts_at: string
  ends_at: string
  status: string
  profile: { full_name: string | null } | null
}

const SHIFT_COLORS: Record<string, string> = {
  morning:   'bg-amber-50  border-amber-200  text-amber-900',
  afternoon: 'bg-blue-50   border-blue-200   text-blue-900',
  night:     'bg-indigo-50 border-indigo-200 text-indigo-900',
}
const SHIFT_DEFAULT = 'bg-gray-50 border-gray-200 text-gray-800'

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-sky-100   text-sky-700',
  active:    'bg-green-100 text-green-700',
  changed:   'bg-amber-100 text-amber-700',
  covered:   'bg-teal-100  text-teal-700',
  completed: 'bg-gray-100  text-gray-500',
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ROLES_CAN_ADD = ['super_admin', 'admin', 'department_head', 'coordinator']

function weekStart(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Shifts() {
  const { profile } = useAuthStore()
  const [shifts,    setShifts]    = useState<Shift[]>([])
  const [weekBegin, setWeekBegin] = useState(() => weekStart(new Date()))
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  useEffect(() => {
    const fid = profile?.facility_id
    if (!fid) return

    setLoading(true)
    setError('')

    const from = weekBegin.toISOString()
    const to   = addDays(weekBegin, 7).toISOString()

    supabase
      .from('shifts')
      .select('id, shift_type, starts_at, ends_at, status, profile:profiles(full_name)')
      .eq('facility_id', fid)
      .gte('starts_at', from)
      .lt('starts_at', to)
      .order('starts_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { setError(error.message); setLoading(false); return }
        setShifts((data as unknown as Shift[]) ?? [])
        setLoading(false)
      })
  }, [profile?.facility_id, weekBegin])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekBegin, i)),
    [weekBegin],
  )

  const shiftsByDay = useMemo(() => {
    const map: Record<string, Shift[]> = {}
    for (const d of weekDays) map[d.toDateString()] = []
    for (const s of shifts) {
      const key = new Date(s.starts_at).toDateString()
      map[key]?.push(s)
    }
    return map
  }, [shifts, weekDays])

  const today        = new Date().toDateString()
  const canAdd       = profile?.role ? ROLES_CAN_ADD.includes(profile.role) : false
  const weekLabel    = `${fmtDate(weekBegin)} – ${fmtDate(addDays(weekBegin, 6))}`

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 font-medium">Error loading shifts</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    </div>
  )

  // ── Page ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Calendar size={22} className="text-teal-700" />
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
        </div>
        {canAdd && (
          <button className="flex items-center gap-2 px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus size={15} />
            Add Shift
          </button>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setWeekBegin(w => addDays(w, -7))}
          aria-label="Previous week"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>

        <span className="text-sm font-medium text-gray-700 w-40 text-center">
          {weekLabel}
        </span>

        <button
          onClick={() => setWeekBegin(w => addDays(w, 7))}
          aria-label="Next week"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronRight size={20} />
        </button>

        <button
          onClick={() => setWeekBegin(weekStart(new Date()))}
          className="ml-1 px-2.5 py-1 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
        >
          Today
        </button>
      </div>

      {/* Week grid — horizontal scroll on mobile */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-2" style={{ minWidth: '560px' }}>
          {weekDays.map((day, i) => {
            const key       = day.toDateString()
            const isToday   = key === today
            const dayShifts = shiftsByDay[key] ?? []

            return (
              <div key={key} className="flex-1 min-w-[120px] flex flex-col">

                {/* Day column header */}
                <div className={`text-center rounded-lg py-2 mb-2 select-none ${
                  isToday ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide">
                    {DAY_LABELS[i]}
                  </p>
                  <p className={`text-sm font-bold mt-0.5 ${isToday ? 'text-white' : 'text-gray-800'}`}>
                    {fmtDate(day)}
                  </p>
                </div>

                {/* Shift cards */}
                <div className="flex flex-col gap-2 flex-1">
                  {dayShifts.length === 0 ? (
                    <p className="text-center text-xs text-gray-300 py-6">No shifts</p>
                  ) : (
                    dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className={`border rounded-lg p-2.5 text-xs ${SHIFT_COLORS[shift.shift_type] ?? SHIFT_DEFAULT}`}
                      >
                        {/* Staff name */}
                        <p className="font-semibold truncate leading-snug">
                          {shift.profile?.full_name ?? 'Unknown'}
                        </p>

                        {/* Shift type */}
                        <p className="capitalize opacity-70 mt-0.5">
                          {shift.shift_type}
                        </p>

                        {/* Time range */}
                        <p className="font-mono mt-1">
                          {fmtTime(shift.starts_at)}–{fmtTime(shift.ends_at)}
                        </p>

                        {/* Status badge */}
                        <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_COLORS[shift.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {shift.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>

              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
