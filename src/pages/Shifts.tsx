import { useEffect, useState, useCallback } from 'react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  CalendarDays, Clock, Plus, X,
  ChevronLeft, ChevronRight,
  User, Building2, AlertCircle, Loader2,
  Stethoscope, Heart, Baby, Pill, Microscope, PhoneCall,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ShiftRow = {
  id: string
  user_id: string
  department_id: string | null
  starts_at: string
  ends_at: string
  shift_type: string | null
  specialty: string | null
  schedule_type: string | null
  notes: string | null
  created_at: string
  user: { full_name: string } | null
  department: { name: string } | null
}

type ProfileOption = { id: string; full_name: string }
type DeptOption    = { id: string; name: string }
type GroupName     = 'Medical Doctors' | 'Nurses' | 'Midwives' | 'Pharmacy' | 'Laboratory' | 'Reception'
type ScheduleType  = 'regular' | 'duty'
type ViewMode      = 'week' | 'month'
type NavStep       = 'group' | 'specialty' | 'calendar'

// ─── Static config ────────────────────────────────────────────────────────────

const GROUPS: {
  name: GroupName
  icon: LucideIcon
  color: string
  description: string
}[] = [
  { name: 'Medical Doctors', icon: Stethoscope, color: 'blue',   description: 'Physicians & specialists' },
  { name: 'Nurses',          icon: Heart,       color: 'rose',   description: 'Registered nurses' },
  { name: 'Midwives',        icon: Baby,        color: 'purple', description: 'Midwifery staff' },
  { name: 'Pharmacy',        icon: Pill,        color: 'amber',  description: 'Pharmacists & technicians' },
  { name: 'Laboratory',      icon: Microscope,  color: 'teal',   description: 'Lab technicians' },
  { name: 'Reception',       icon: PhoneCall,   color: 'pink',   description: 'Reception & front desk' },
]

const GROUP_CONFIG: Record<GroupName, {
  departmentName: string | null   // null = filter by specialty only (Medical Doctors)
  specialties: string[]
  skipLevel2: boolean
}> = {
  'Medical Doctors': {
    departmentName: null,
    specialties: ['General Practice (GP)', 'Internal Medicine', 'Emergency', 'Surgery', 'Pediatrics', 'Gynecology & Obstetrics', 'Radiology'],
    skipLevel2: false,
  },
  'Nurses': {
    departmentName: 'Nursing',
    specialties: ['Ward', 'Emergency', 'ICU'],
    skipLevel2: false,
  },
  'Midwives': {
    departmentName: 'Midwifery',
    specialties: ['Ward', 'OPD', 'ICU'],
    skipLevel2: false,
  },
  'Pharmacy':   { departmentName: 'Pharmacy',   specialties: [], skipLevel2: true },
  'Laboratory': { departmentName: 'Laboratory', specialties: [], skipLevel2: true },
  'Reception':  { departmentName: 'Reception',  specialties: [], skipLevel2: true },
}

const GROUP_COLORS: Record<string, { card: string; icon: string }> = {
  blue:   { card: 'border-blue-200 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-700',     icon: 'text-blue-500' },
  rose:   { card: 'border-rose-200 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:border-rose-700',     icon: 'text-rose-500' },
  purple: { card: 'border-purple-200 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:border-purple-700', icon: 'text-purple-500' },
  amber:  { card: 'border-amber-200 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-700', icon: 'text-amber-500' },
  teal:   { card: 'border-teal-200 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/20 dark:border-teal-700',     icon: 'text-teal-500' },
  pink:   { card: 'border-pink-200 bg-pink-50 hover:bg-pink-100 dark:bg-pink-900/20 dark:border-pink-700',     icon: 'text-pink-500' },
}

const CAN_ADD_SHIFT = [
  'super_admin', 'ceo', 'general_manager', 'medical_director',
  'hr', 'department_head', 'coordinator',
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function monthGridDays(base: Date): Date[] {
  const year = base.getFullYear()
  const month = base.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const start = new Date(firstDay)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(lastDay)
  end.setDate(end.getDate() + (6 - end.getDay()))
  const days: Date[] = []
  const cur = new Date(start)
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  return days
}

// ─── ShiftChip ────────────────────────────────────────────────────────────────

function ShiftChip({ shift }: { shift: ShiftRow }) {
  const colors = [
    'bg-teal-100   text-teal-800   dark:bg-teal-900/40   dark:text-teal-300',
    'bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300',
    'bg-rose-100   text-rose-800   dark:bg-rose-900/40   dark:text-rose-300',
  ]
  const colorClass = colors[shift.user_id.charCodeAt(0) % colors.length]
  const startT = shift.starts_at.split('T')[1]?.substring(0, 5) ?? '00:00'
  const endT   = shift.ends_at.split('T')[1]?.substring(0, 5) ?? '00:00'
  return (
    <div
      className={`rounded-md px-1.5 py-1 text-[10px] leading-tight ${colorClass} cursor-default`}
      title={`${shift.user?.full_name ?? 'Unknown'}\n${fmt12(startT)} – ${fmt12(endT)}${shift.notes ? '\n' + shift.notes : ''}`}
    >
      <div className="font-semibold truncate">{shift.user?.full_name ?? '—'}</div>
      <div className="opacity-75">{fmt12(startT)} – {fmt12(endT)}</div>
      {shift.specialty && <div className="opacity-60 truncate">{shift.specialty}</div>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Shifts() {
  const { profile } = useAuth()
  const role = profile?.role ?? ''

  // ── Navigation state ──
  const [navStep, setNavStep]               = useState<NavStep>('group')
  const [selectedGroup, setSelectedGroup]   = useState<GroupName | null>(null)
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null)
  const [scheduleType, setScheduleType]     = useState<ScheduleType>('regular')

  // ── Calendar state ──
  const [viewMode, setViewMode]   = useState<ViewMode>('week')
  const [weekBase, setWeekBase]   = useState(() => weekStart(new Date()))
  const [monthBase, setMonthBase] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1)
  })

  // ── Data state ──
  const [shifts, setShifts]   = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Modal state ──
  const [modalOpen, setModalOpen]   = useState(false)
  const [profiles, setProfiles]     = useState<ProfileOption[]>([])
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [form, setForm] = useState({
    user_id: '', department_id: '', shift_date: isoDate(new Date()),
    start_time: '08:00', end_time: '17:00',
    schedule_type: 'regular', specialty: '', notes: '',
  })

  // ── Department head: fetch own department name ──
  const [userDeptName, setUserDeptName] = useState('')
  useEffect(() => {
    if (profile?.role === 'department_head' && profile?.department_id) {
      supabase.from('departments')
        .select('name')
        .eq('id', profile.department_id)
        .single()
        .then(({ data }) => { if (data) setUserDeptName(data.name) })
    }
  }, [profile?.department_id, role])

  // ── Derived ──
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekBase, i))
  const monthDays = monthGridDays(monthBase)
  const canAdd    = CAN_ADD_SHIFT.includes(role)
  const todayStr  = isoDate(new Date())

  // Mapping from department name → group name
  const DEPT_TO_GROUP: Record<string, GroupName> = {
    'Internal Medicine': 'Medical Doctors', 'Emergency': 'Medical Doctors',
    'Surgery': 'Medical Doctors', 'Pediatrics': 'Medical Doctors',
    'Gynecology & Obstetrics': 'Medical Doctors', 'Radiology': 'Medical Doctors',
    'General Practice': 'Medical Doctors',
    'Nursing': 'Nurses', 'Midwifery': 'Midwives',
    'Pharmacy': 'Pharmacy', 'Laboratory': 'Laboratory', 'Reception': 'Reception',
  }
  const deptHeadGroup: GroupName | null =
    role === 'department_head' && userDeptName
      ? (DEPT_TO_GROUP[userDeptName] ?? null)
      : null
  const visibleGroups = deptHeadGroup
    ? GROUPS.filter(g => g.name === deptHeadGroup)
    : GROUPS

  // ── Data fetching ──
  const fetchShifts = useCallback(async () => {
    if (!selectedGroup) return
    setLoading(true); setError(null)

    // Compute date range inside callback (avoids stale closure issues)
    let fromDate: string, toDate: string
    if (viewMode === 'week') {
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekBase, i))
      fromDate = isoDate(days[0])
      toDate   = isoDate(days[6])
    } else {
      const days = monthGridDays(monthBase)
      fromDate = isoDate(days[0])
      toDate   = isoDate(days[days.length - 1])
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('shifts')
      .select('*, user:profiles!shifts_user_id_fkey(full_name), department:departments(name)')
      .gte('starts_at', fromDate + 'T00:00:00')
      .lte('starts_at', toDate + 'T23:59:59')
      .eq('schedule_type', scheduleType)
      .order('starts_at', { ascending: true })

    if (selectedSpecialty) {
      query = query.eq('specialty', selectedSpecialty)
    }

    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }

    // Client-side filter by department name when applicable
    let result = (data as ShiftRow[]) ?? []
    const config = GROUP_CONFIG[selectedGroup]
    if (config.departmentName) {
      result = result.filter(s => s.department?.name === config.departmentName)
    }

    setShifts(result)
    setLoading(false)
  }, [selectedGroup, selectedSpecialty, scheduleType, viewMode, weekBase, monthBase])

  useEffect(() => {
    if (navStep === 'calendar') fetchShifts()
  }, [fetchShifts, navStep])

  // Realtime subscription (only when viewing calendar)
  useEffect(() => {
    if (navStep !== 'calendar') return
    const channel = supabase
      .channel('shifts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => fetchShifts())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchShifts, navStep])

  // ── Navigation handlers ──
  function handleSelectGroup(group: GroupName) {
    setSelectedGroup(group)
    const config = GROUP_CONFIG[group]
    if (config.skipLevel2) {
      setSelectedSpecialty(null)
      setNavStep('calendar')
    } else {
      setNavStep('specialty')
    }
  }

  function handleSelectSpecialty(specialty: string) {
    setSelectedSpecialty(specialty)
    setNavStep('calendar')
  }

  function resetToLevel1() {
    setNavStep('group')
    setSelectedGroup(null)
    setSelectedSpecialty(null)
    setScheduleType('regular')
    setShifts([])
    setError(null)
  }

  function goBack() {
    if (!selectedGroup) return resetToLevel1()
    const config = GROUP_CONFIG[selectedGroup]
    // If the group has specialties, calendar → specialty; otherwise calendar → group
    if (!config.skipLevel2) {
      setSelectedSpecialty(null)
      setNavStep('specialty')
      setShifts([])
      setError(null)
    } else {
      resetToLevel1()
    }
  }

  // ── Modal ──
  const openModal = async () => {
    setFormError(null)
    setForm({
      user_id: '',
      department_id: role === 'department_head' ? (profile?.department_id ?? '') : '',
      shift_date: isoDate(new Date()),
      start_time: '08:00', end_time: '17:00',
      schedule_type: scheduleType,
      specialty: selectedSpecialty ?? '',
      notes: '',
    })
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
    if (!form.user_id)   return setFormError('Please select a staff member.')
    if (!form.shift_date) return setFormError('Please pick a date.')
    if (form.start_time >= form.end_time) return setFormError('End time must be after start time.')
    setSaving(true)
    const { error: err } = await supabase.from('shifts').insert({
      user_id:       form.user_id,
      department_id: form.department_id === 'gp' || !form.department_id ? null : form.department_id,
      starts_at:     form.shift_date + 'T' + form.start_time + ':00',
      ends_at:       form.shift_date + 'T' + form.end_time   + ':00',
      schedule_type: form.schedule_type || null,
      specialty:     form.specialty     || null,
      notes:         form.notes         || null,
    })
    setSaving(false)
    if (err) setFormError(err.message)
    else { setModalOpen(false); fetchShifts() }
  }

  // Build date → shifts map for rendering
  const shiftsByDate: Record<string, ShiftRow[]> = {}
  for (const s of shifts) {
    const key = s.starts_at.split('T')[0]
    if (!shiftsByDate[key]) shiftsByDate[key] = []
    shiftsByDate[key].push(s)
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LEVEL 1 — Group selector
  // ════════════════════════════════════════════════════════════════════════════
  if (navStep === 'group') {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-teal-500" />Shifts
          </h1>
          <p className="text-sm text-gray-500 mt-1">Select a staff group to view their schedule</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {visibleGroups.map(({ name, icon: Icon, color, description }) => {
            const { card, icon } = GROUP_COLORS[color]
            return (
              <button
                key={name}
                onClick={() => handleSelectGroup(name)}
                className={`rounded-2xl border-2 p-6 text-left transition-all duration-150 ${card}`}
              >
                <Icon className={`w-9 h-9 mb-3 ${icon}`} />
                <div className="font-semibold text-gray-900 dark:text-white text-[15px]">{name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{description}</div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LEVEL 2 — Specialty selector
  // ════════════════════════════════════════════════════════════════════════════
  if (navStep === 'specialty' && selectedGroup) {
    const config    = GROUP_CONFIG[selectedGroup]
    const groupInfo = GROUPS.find(g => g.name === selectedGroup)!
    const Icon      = groupInfo.icon
    const { icon }  = GROUP_COLORS[groupInfo.color]

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={resetToLevel1}
          className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mb-5"
        >
          <ChevronLeft className="w-4 h-4" />Back to groups
        </button>

        <div className="mb-7">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Icon className={`w-6 h-6 ${icon}`} />{selectedGroup}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Select a specialty to continue</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {config.specialties.map((specialty) => (
            <button
              key={specialty}
              onClick={() => handleSelectSpecialty(specialty)}
              className="rounded-2xl border-2 border-teal-200 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/20 dark:border-teal-700 p-5 text-left transition-all duration-150"
            >
              <CalendarDays className="w-6 h-6 text-teal-500 mb-2" />
              <div className="font-semibold text-gray-900 dark:text-white text-sm">{specialty}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LEVEL 3 + CALENDAR — Schedule type toggle + calendar view
  // ════════════════════════════════════════════════════════════════════════════

  // Breadcrumb parts (group + optional specialty)
  const breadcrumbParts = [selectedGroup, selectedSpecialty].filter(Boolean) as string[]

  return (
    <div className="p-6 space-y-4">

      {/* ── Header: breadcrumb + Add Shift ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {/* Back + Breadcrumb */}
          <div className="flex items-center gap-1 flex-wrap text-sm mb-1">
            <button
              onClick={goBack}
              className="flex items-center gap-0.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors mr-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="text-xs">Back</span>
            </button>
            {breadcrumbParts.map((part, i) => (
              <span key={part} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-400 select-none">›</span>}
                <span className={i === breadcrumbParts.length - 1
                  ? 'font-semibold text-gray-800 dark:text-gray-100'
                  : 'text-gray-500'}>
                  {part}
                </span>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="text-gray-400 select-none">›</span>
              <span className="font-semibold capitalize text-teal-600">{scheduleType}</span>
            </span>
            <button
              onClick={resetToLevel1}
              title="Change selection"
              className="ml-1 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-teal-500" />Shifts
          </h1>
        </div>

        {canAdd && (role !== 'department_head' || selectedGroup === deptHeadGroup) && (
          <button
            onClick={openModal}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />Add Shift
          </button>
        )}
      </div>

      {/* ── Controls: schedule type + view mode + navigation ── */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* Schedule type toggle (Level 3) */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-sm">
          {(['regular', 'duty'] as ScheduleType[]).map(t => (
            <button
              key={t}
              onClick={() => setScheduleType(t)}
              className={`px-4 py-1.5 font-medium capitalize transition-colors ${
                scheduleType === t
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-sm">
          {(['week', 'month'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-4 py-1.5 font-medium capitalize transition-colors ${
                viewMode === v
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Navigation arrows + label + Today */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => viewMode === 'week'
              ? setWeekBase(w => addDays(w, -7))
              : setMonthBase(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[210px] text-center select-none">
            {viewMode === 'week'
              ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : monthBase.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            }
          </span>

          <button
            onClick={() => viewMode === 'week'
              ? setWeekBase(w => addDays(w, 7))
              : setMonthBase(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              setWeekBase(weekStart(new Date()))
              const n = new Date()
              setMonthBase(new Date(n.getFullYear(), n.getMonth(), 1))
            }}
            className="ml-1 text-xs text-teal-600 hover:underline px-1"
          >
            Today
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* ── Calendar ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading shifts…
        </div>
      ) : viewMode === 'week' ? (

        /* ── Week view ── */
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const key      = isoDate(day)
            const isToday  = key === todayStr
            const dayShifts = shiftsByDate[key] ?? []
            return (
              <div
                key={key}
                className={`min-h-[160px] rounded-xl border p-2 flex flex-col gap-1.5 ${
                  isToday
                    ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <div className="text-center mb-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {DAY_LABELS[day.getDay()]}
                  </div>
                  <div className={`text-sm font-bold ${isToday ? 'text-teal-600' : 'text-gray-700 dark:text-gray-200'}`}>
                    {day.getDate()}
                  </div>
                </div>
                {dayShifts.length === 0
                  ? <div className="flex-1 flex items-center justify-center text-[10px] text-gray-300 dark:text-gray-600">No shifts</div>
                  : dayShifts.map(s => <ShiftChip key={s.id} shift={s} />)
                }
              </div>
            )
          })}
        </div>

      ) : (

        /* ── Month view ── */
        <div>
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const key            = isoDate(day)
              const isToday        = key === todayStr
              const isCurrentMonth = day.getMonth() === monthBase.getMonth()
              const dayShifts      = shiftsByDate[key] ?? []
              return (
                <div
                  key={key}
                  className={`min-h-[90px] rounded-lg border p-1.5 flex flex-col gap-0.5 ${
                    isToday
                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20'
                      : isCurrentMonth
                        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50'
                  }`}
                >
                  <div className={`text-xs font-bold text-center mb-0.5 ${
                    isToday          ? 'text-teal-600'
                    : isCurrentMonth ? 'text-gray-700 dark:text-gray-200'
                    :                  'text-gray-300 dark:text-gray-600'
                  }`}>
                    {day.getDate()}
                  </div>
                  {dayShifts.slice(0, 3).map(s => <ShiftChip key={s.id} shift={s} />)}
                  {dayShifts.length > 3 && (
                    <div className="text-[9px] text-gray-400 text-center mt-0.5">
                      +{dayShifts.length - 3} more
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Add Shift Modal
          ════════════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Shift</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{formError}
                </div>
              )}

              {/* Staff member */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  <User className="inline w-3.5 h-3.5 mr-1" />Staff Member *
                </label>
                <select
                  value={form.user_id}
                  onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="">— Select staff —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  <Building2 className="inline w-3.5 h-3.5 mr-1" />Department
                  {role === 'department_head' && (
                    <span className="ml-1 text-gray-400 font-normal normal-case">(your department)</span>
                  )}
                </label>
                {role === 'department_head' ? (
                  <input
                    type="text"
                    value={userDeptName || 'Loading…'}
                    disabled
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-500 outline-none cursor-not-allowed"
                  />
                ) : (
                  <select
                    value={form.department_id}
                    onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    <option value="">— None —</option>
                    <option value="gp">General Practice (GP)</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Date *
                </label>
                <input
                  type="date"
                  value={form.shift_date}
                  onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              {/* Start / End times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    <Clock className="inline w-3.5 h-3.5 mr-1" />Start *
                  </label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    End *
                  </label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              {/* Schedule type (pre-filled from Level 3) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Schedule Type
                </label>
                <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-sm">
                  {(['regular', 'duty'] as const).map(t => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setForm(f => ({ ...f, schedule_type: t }))}
                      className={`flex-1 py-2 font-medium capitalize transition-colors ${
                        form.schedule_type === t
                          ? 'bg-teal-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Specialty (pre-filled from Level 2) */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Specialty
                </label>
                <input
                  type="text"
                  value={form.specialty}
                  onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                  placeholder="e.g. Internal Medicine, ICU, Ward…"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes…"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveShift}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : 'Save Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
