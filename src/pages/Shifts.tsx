import { useEffect, useState, useCallback } from 'react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, Clock, Plus, X,
  ChevronLeft, ChevronRight,
  User, Building2, AlertCircle, Loader2,
  Stethoscope, Heart, Baby, Pill, Microscope, PhoneCall,
  Upload, Edit2, Trash2, UserCheck, CheckCircle2, RefreshCw,
  Phone, Activity,
} from 'lucide-react'
import ShiftUpload from '../components/ShiftUpload'

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
  user: { full_name: string; phone: string | null } | null
  department: { name: string } | null
}

type ShiftAction   = 'edit' | 'reassign' | 'delete'
type ProfileOption = { id: string; full_name: string }
type DeptOption    = { id: string; name: string }
type GroupName     = 'Medical Doctors' | 'Nurses' | 'Midwives' | 'Pharmacy' | 'Laboratory' | 'Reception'
type ScheduleType  = 'regular' | 'duty'
type ViewMode      = 'week' | 'month'
type NavStep       = 'group' | 'specialty' | 'calendar'
type RepeatPattern = 'daily' | 'weekdays' | 'weekly' | 'custom'

// ─── Static config ────────────────────────────────────────────────────────────

const FACILITY_ID = 'd917b86c-682c-4f11-b285-0a1cada2b54b'

const GROUPS: { name: GroupName; icon: LucideIcon; color: string; description: string }[] = [
  { name: 'Medical Doctors', icon: Stethoscope, color: 'blue',   description: 'Physicians & specialists' },
  { name: 'Nurses',          icon: Heart,       color: 'rose',   description: 'Registered nurses' },
  { name: 'Midwives',        icon: Baby,        color: 'purple', description: 'Midwifery staff' },
  { name: 'Pharmacy',        icon: Pill,        color: 'amber',  description: 'Pharmacists & technicians' },
  { name: 'Laboratory',      icon: Microscope,  color: 'teal',   description: 'Lab technicians' },
  { name: 'Reception',       icon: PhoneCall,   color: 'pink',   description: 'Reception & front desk' },
]

const GROUP_CONFIG: Record<GroupName, {
  departmentName: string | null
  specialties: string[]
  skipLevel2: boolean
}> = {
  'Medical Doctors': { departmentName: null,        specialties: ['General Practice (GP)', 'Internal Medicine', 'Emergency', 'Surgery', 'Pediatrics', 'Gynecology & Obstetrics', 'Radiology'], skipLevel2: false },
  'Nurses':          { departmentName: 'Nursing',   specialties: ['Ward', 'Emergency', 'ICU'],   skipLevel2: false },
  'Midwives':        { departmentName: 'Midwifery', specialties: ['Ward', 'OPD', 'ICU'],         skipLevel2: false },
  'Pharmacy':        { departmentName: 'Pharmacy',   specialties: [], skipLevel2: true },
  'Laboratory':      { departmentName: 'Laboratory', specialties: [], skipLevel2: true },
  'Reception':       { departmentName: 'Reception',  specialties: [], skipLevel2: true },
}

const GROUP_COLORS: Record<string, { card: string; icon: string }> = {
  blue:   { card: 'border-blue-200 bg-blue-50 hover:bg-blue-100',     icon: 'text-blue-500' },
  rose:   { card: 'border-rose-200 bg-rose-50 hover:bg-rose-100',     icon: 'text-rose-500' },
  purple: { card: 'border-purple-200 bg-purple-50 hover:bg-purple-100', icon: 'text-purple-500' },
  amber:  { card: 'border-amber-200 bg-amber-50 hover:bg-amber-100',  icon: 'text-amber-500' },
  teal:   { card: 'border-teal-200 bg-teal-50 hover:bg-teal-100',     icon: 'text-teal-500' },
  pink:   { card: 'border-pink-200 bg-pink-50 hover:bg-pink-100',     icon: 'text-pink-500' },
}

const CAN_ADD_SHIFT = ['super_admin', 'ceo', 'general_manager', 'medical_director', 'hr', 'department_head', 'coordinator']

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const REPEAT_PATTERNS: { value: RepeatPattern; label: string }[] = [
  { value: 'daily',    label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly',   label: 'Weekly (same day)' },
  { value: 'custom',   label: 'Custom days' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt12(time: string) {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  return `${h % 12 || 12}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`
}

function isoDate(d: Date) { return d.toISOString().split('T')[0] }

function addDays(d: Date, n: number) {
  const copy = new Date(d); copy.setDate(copy.getDate() + n); return copy
}

function weekStart(d: Date) {
  const copy = new Date(d); copy.setDate(copy.getDate() - copy.getDay()); return copy
}

function monthGridDays(base: Date): Date[] {
  const year = base.getFullYear(); const month = base.getMonth()
  const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0)
  const start = new Date(firstDay); start.setDate(start.getDate() - start.getDay())
  const end = new Date(lastDay); end.setDate(end.getDate() + (6 - end.getDay()))
  const days: Date[] = []; const cur = new Date(start)
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  return days
}

function generateRepeatDates(
  startDate: string,
  pattern: RepeatPattern,
  selectedDays: number[],
  untilDate: string,
): string[] {
  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00')
  const until = new Date(untilDate + 'T00:00:00')
  const startDow = start.getDay()
  let cur = new Date(start)
  while (cur <= until) {
    const dow = cur.getDay()
    let include = false
    if      (pattern === 'daily')    include = true
    else if (pattern === 'weekdays') include = dow >= 1 && dow <= 5
    else if (pattern === 'weekly')   include = dow === startDow
    else if (pattern === 'custom')   include = selectedDays.includes(dow)
    if (include) dates.push(isoDate(cur))
    cur = addDays(cur, 1)
  }
  return dates
}

function formatShiftDate(isoStr: string) {
  return new Date(isoStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── ShiftChip ────────────────────────────────────────────────────────────────

function ShiftChip({ shift, onClick }: { shift: ShiftRow; onClick?: () => void }) {
  const colors = [
    'bg-teal-100   text-teal-800',
    'bg-blue-100   text-blue-800',
    'bg-purple-100 text-purple-800',
    'bg-amber-100  text-amber-800',
    'bg-rose-100   text-rose-800',
  ]
  const colorClass = colors[shift.user_id.charCodeAt(0) % colors.length]
  const startT = shift.starts_at.split('T')[1]?.substring(0, 5) ?? '00:00'
  const endT   = shift.ends_at.split('T')[1]?.substring(0, 5)   ?? '00:00'
  const phone  = shift.user?.phone
  return (
    <div
      className={`relative rounded-md px-1.5 py-1 text-[10px] leading-tight ${colorClass} ${phone ? 'pb-4' : ''} ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
      onClick={onClick}
      title={`${shift.user?.full_name ?? 'Unknown'}\n${fmt12(startT)} – ${fmt12(endT)}${shift.notes ? '\n' + shift.notes : ''}`}
    >
      <div className="font-semibold truncate">{shift.user?.full_name ?? '—'}</div>
      <div className="opacity-75">{fmt12(startT)} – {fmt12(endT)}</div>
      {shift.specialty && <div className="opacity-60 truncate">{shift.specialty}</div>}
      {phone && (
        <a
          href={`tel:${phone}`}
          title={`Call ${shift.user?.full_name ?? ''}`}
          onClick={e => e.stopPropagation()}
          className="absolute bottom-1 right-1 bg-teal-500 hover:bg-teal-600 text-white rounded-full p-0.5 transition-colors"
        >
          <Phone className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

// ─── MobileShiftRow (list item used only in mobile day view) ─────────────────

function MobileShiftRow({ shift, onClick }: { shift: ShiftRow; onClick: () => void }) {
  const AVATAR_COLORS = ['bg-teal-600', 'bg-blue-600', 'bg-purple-600', 'bg-amber-500', 'bg-rose-600']
  const avatarColor = AVATAR_COLORS[shift.user_id.charCodeAt(0) % AVATAR_COLORS.length]
  const initials    = (shift.user?.full_name ?? '').split(' ').filter(Boolean)
    .slice(0, 2).map(w => w[0].toUpperCase()).join('')
  const startT = shift.starts_at.split('T')[1]?.substring(0, 5) ?? '00:00'
  const endT   = shift.ends_at.split('T')[1]?.substring(0, 5)   ?? '00:00'
  const phone  = shift.user?.phone

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors"
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center
                       text-white text-sm font-bold flex-shrink-0 select-none`}>
        {initials || <User className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-sm leading-tight">{shift.user?.full_name ?? '—'}</div>
        <div className="text-sm text-gray-500 mt-0.5">{fmt12(startT)} – {fmt12(endT)}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {shift.specialty && <span className="text-xs text-gray-400">{shift.specialty}</span>}
          {shift.schedule_type && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
              shift.schedule_type === 'duty' ? 'bg-rose-100 text-rose-600' : 'bg-teal-100 text-teal-700'
            }`}>{shift.schedule_type}</span>
          )}
        </div>
      </div>
      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={e => e.stopPropagation()}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-teal-50 hover:bg-teal-100
                     flex items-center justify-center text-teal-600 transition-colors"
          title={`Call ${shift.user?.full_name ?? ''}`}
        >
          <Phone className="w-4 h-4" />
        </a>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Shifts() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role ?? ''

  // ── Navigation state ──
  const [navStep,          setNavStep]          = useState<NavStep>('group')
  const [selectedGroup,    setSelectedGroup]    = useState<GroupName | null>(null)
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null)
  const [scheduleType,     setScheduleType]     = useState<ScheduleType>('regular')

  // ── Calendar state ──
  const [viewMode,   setViewMode]   = useState<ViewMode>('week')
  const [weekBase,   setWeekBase]   = useState(() => weekStart(new Date()))
  const [monthBase,  setMonthBase]  = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })

  // ── Data state ──
  const [shifts,   setShifts]   = useState<ShiftRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // ── Add/Edit modal state ──
  const [modalOpen,    setModalOpen]    = useState(false)
  const [profiles,     setProfiles]     = useState<ProfileOption[]>([])
  const [departments,  setDepartments]  = useState<DeptOption[]>([])
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)
  const [saveSuccess,  setSaveSuccess]  = useState<string | null>(null)
  const [form, setForm] = useState({
    user_id: '', department_id: '', shift_date: isoDate(new Date()),
    start_time: '08:00', end_time: '17:00',
    schedule_type: 'regular', specialty: '', notes: '',
  })

  // ── Repeat state ──
  const [repeatEnabled, setRepeatEnabled] = useState(false)
  const [repeatPattern, setRepeatPattern] = useState<RepeatPattern>('weekly')
  const [repeatDays,    setRepeatDays]    = useState<Set<number>>(new Set())
  const [repeatUntil,   setRepeatUntil]   = useState('')

  // ── Shift detail / action state ──
  const [selectedShift,  setSelectedShift]  = useState<ShiftRow | null>(null)
  const [shiftAction,    setShiftAction]    = useState<ShiftAction | null>(null)
  const [reassignUserId, setReassignUserId] = useState('')
  const [reassigning,    setReassigning]    = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [actionError,    setActionError]    = useState<string | null>(null)

  // ── Bulk upload state ──
  const [uploadOpen, setUploadOpen] = useState(false)

  // ── Mobile day/month view state ──
  const [mobileDate,     setMobileDate]     = useState(() => isoDate(new Date()))
  const [mobileMonthDay, setMobileMonthDay] = useState<string | null>(null)

  // ── Department head: fetch own department name ──
  const [userDeptName, setUserDeptName] = useState('')
  useEffect(() => {
    if (profile?.role === 'department_head' && profile?.department_id) {
      supabase.from('departments').select('name').eq('id', profile.department_id).single()
        .then(({ data }) => { if (data) setUserDeptName(data.name) })
    }
  }, [profile?.department_id, role])

  // ── Pre-load profiles & departments when calendar is shown ──
  useEffect(() => {
    if (navStep !== 'calendar') return
    Promise.all([
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('departments').select('id, name').order('name'),
    ]).then(([{ data: pData }, { data: dData }]) => {
      setProfiles((pData as ProfileOption[]) ?? [])
      setDepartments((dData as DeptOption[]) ?? [])
    })
  }, [navStep])

  // ── Auto-clear saveSuccess banner ──
  useEffect(() => {
    if (!saveSuccess) return
    const t = setTimeout(() => setSaveSuccess(null), 4000)
    return () => clearTimeout(t)
  }, [saveSuccess])

  // ── Derived ──
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekBase, i))
  const monthDays = monthGridDays(monthBase)
  const canAdd    = CAN_ADD_SHIFT.includes(role)
  const todayStr  = isoDate(new Date())

  const DEPT_TO_GROUP: Record<string, GroupName> = {
    'Internal Medicine': 'Medical Doctors', 'Emergency': 'Medical Doctors',
    'Surgery': 'Medical Doctors', 'Pediatrics': 'Medical Doctors',
    'Gynecology & Obstetrics': 'Medical Doctors', 'Radiology': 'Medical Doctors',
    'General Practice': 'Medical Doctors',
    'Nursing': 'Nurses', 'Midwifery': 'Midwives',
    'Pharmacy': 'Pharmacy', 'Laboratory': 'Laboratory', 'Reception': 'Reception',
  }
  const deptHeadGroup: GroupName | null =
    role === 'department_head' && userDeptName ? (DEPT_TO_GROUP[userDeptName] ?? null) : null

  // Returns true if this user can edit/delete/reassign a given shift
  const canManageShift = (shift: ShiftRow): boolean => {
    if (!canAdd) return false
    if (role === 'department_head') {
      return !!profile?.department_id && shift.department_id === profile.department_id
    }
    return true
  }

  // ── Repeat preview count ──
  const repeatPreviewCount =
    repeatEnabled && repeatUntil && repeatUntil >= form.shift_date
      ? generateRepeatDates(form.shift_date, repeatPattern, [...repeatDays], repeatUntil).length
      : 1

  // ── Data fetching ──
  const fetchShifts = useCallback(async () => {
    if (!selectedGroup) return
    setLoading(true); setError(null)

    let fromDate: string, toDate: string
    if (viewMode === 'week') {
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekBase, i))
      fromDate = isoDate(days[0]); toDate = isoDate(days[6])
    } else {
      const days = monthGridDays(monthBase)
      fromDate = isoDate(days[0]); toDate = isoDate(days[days.length - 1])
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('shifts')
      .select('*, user:profiles!shifts_user_id_fkey(full_name, phone), department:departments(name)')
      .gte('starts_at', fromDate + 'T00:00:00')
      .lte('starts_at', toDate + 'T23:59:59')
      .eq('schedule_type', scheduleType)
      .order('starts_at', { ascending: true })

    if (selectedSpecialty) query = query.eq('specialty', selectedSpecialty)

    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }

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

  useEffect(() => {
    if (navStep !== 'calendar') return
    const channel = supabase
      .channel('shifts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => fetchShifts())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchShifts, navStep])

  // ── Navigation ──
  function handleSelectGroup(group: GroupName) {
    setSelectedGroup(group)
    const config = GROUP_CONFIG[group]
    if (config.skipLevel2) { setSelectedSpecialty(null); setNavStep('calendar') }
    else setNavStep('specialty')
  }

  function handleSelectSpecialty(specialty: string) {
    setSelectedSpecialty(specialty); setNavStep('calendar')
  }

  function resetToLevel1() {
    setNavStep('group'); setSelectedGroup(null); setSelectedSpecialty(null)
    setScheduleType('regular'); setShifts([]); setError(null)
  }

  function goBack() {
    if (!selectedGroup) return resetToLevel1()
    const config = GROUP_CONFIG[selectedGroup]
    if (!config.skipLevel2) { setSelectedSpecialty(null); setNavStep('specialty'); setShifts([]); setError(null) }
    else resetToLevel1()
  }

  function navigateMobileDay(delta: number) {
    const next    = addDays(new Date(mobileDate + 'T00:00:00'), delta)
    const nextStr = isoDate(next)
    setMobileDate(nextStr)
    const newWeekBase = weekStart(next)
    if (isoDate(newWeekBase) !== isoDate(weekBase)) setWeekBase(newWeekBase)
  }

  function goToToday() {
    setMobileDate(todayStr)
    const todayWeekBase = weekStart(new Date())
    if (isoDate(todayWeekBase) !== isoDate(weekBase)) setWeekBase(todayWeekBase)
  }

  // ── Add Shift modal ──
  const openModal = () => {
    setFormError(null)
    setRepeatEnabled(false); setRepeatPattern('weekly'); setRepeatDays(new Set()); setRepeatUntil('')
    setForm({
      user_id: '',
      department_id: role === 'department_head' ? (profile?.department_id ?? '') : '',
      shift_date: isoDate(new Date()),
      start_time: '08:00', end_time: '17:00',
      schedule_type: scheduleType,
      specialty: selectedSpecialty ?? '',
      notes: '',
    })
    setModalOpen(true)
  }

  const closeAddModal = () => {
    setModalOpen(false); setFormError(null)
    setRepeatEnabled(false)
  }

  // ── Save shift (add, with optional repeat) ──
  const saveShift = async () => {
    setFormError(null)
    if (!form.user_id)     return setFormError('Please select a staff member.')
    if (!form.shift_date)  return setFormError('Please pick a date.')
    if (form.start_time >= form.end_time) return setFormError('End time must be after start time.')

    if (repeatEnabled) {
      if (!repeatUntil) return setFormError('Please set an end date for repeat.')
      if (repeatUntil < form.shift_date) return setFormError('Repeat end date must be after the shift date.')
      if (repeatPattern === 'custom' && repeatDays.size === 0) return setFormError('Please select at least one day.')
    }

    setSaving(true)

    if (repeatEnabled && repeatUntil) {
      const dates = generateRepeatDates(form.shift_date, repeatPattern, [...repeatDays], repeatUntil)
      const shiftsToInsert = dates.map(date => ({
        user_id:       form.user_id,
        department_id: form.department_id === 'gp' || !form.department_id ? null : form.department_id,
        facility_id:   FACILITY_ID,
        starts_at:     `${date}T${form.start_time}:00`,
        ends_at:       `${date}T${form.end_time}:00`,
        schedule_type: form.schedule_type || 'regular',
        shift_type:    form.schedule_type || 'regular',
        specialty:     form.specialty || null,
        notes:         form.notes     || null,
        status:        'scheduled',
        created_by:    profile!.id,
      }))
      const { error: err } = await supabase.from('shifts').insert(shiftsToInsert)
      setSaving(false)
      if (err) setFormError(err.message)
      else { closeAddModal(); setSaveSuccess(`${dates.length} shifts created successfully`); fetchShifts() }
    } else {
      const { error: err } = await supabase.from('shifts').insert({
        user_id:       form.user_id,
        department_id: form.department_id === 'gp' || !form.department_id ? null : form.department_id,
        starts_at:     `${form.shift_date}T${form.start_time}:00`,
        ends_at:       `${form.shift_date}T${form.end_time}:00`,
        schedule_type: form.schedule_type || 'regular',
        shift_type:    form.schedule_type || 'regular',
        specialty:     form.specialty || null,
        notes:         form.notes     || null,
        status:        'scheduled',
        created_by:    profile!.id,
      })
      setSaving(false)
      if (err) setFormError(err.message)
      else { closeAddModal(); fetchShifts() }
    }
  }

  // ── Edit shift ──
  const openEditModal = () => {
    if (!selectedShift) return
    const startT   = selectedShift.starts_at.split('T')[1]?.substring(0, 5) ?? '08:00'
    const endT     = selectedShift.ends_at.split('T')[1]?.substring(0, 5)   ?? '17:00'
    const dateStr  = selectedShift.starts_at.split('T')[0]
    setFormError(null)
    setRepeatEnabled(false)
    setForm({
      user_id:       selectedShift.user_id,
      department_id: selectedShift.department_id ?? '',
      shift_date:    dateStr,
      start_time:    startT,
      end_time:      endT,
      schedule_type: selectedShift.schedule_type ?? 'regular',
      specialty:     selectedShift.specialty  ?? '',
      notes:         selectedShift.notes      ?? '',
    })
    setShiftAction('edit')
  }

  const updateShift = async () => {
    setFormError(null)
    if (!form.user_id)    return setFormError('Please select a staff member.')
    if (!form.shift_date) return setFormError('Please pick a date.')
    if (form.start_time >= form.end_time) return setFormError('End time must be after start time.')
    setSaving(true)
    const { error: err } = await supabase.from('shifts').update({
      user_id:       form.user_id,
      department_id: form.department_id === 'gp' || !form.department_id ? null : form.department_id,
      starts_at:     `${form.shift_date}T${form.start_time}:00`,
      ends_at:       `${form.shift_date}T${form.end_time}:00`,
      schedule_type: form.schedule_type || 'regular',
      shift_type:    form.schedule_type || 'regular',
      specialty:     form.specialty || null,
      notes:         form.notes     || null,
    }).eq('id', selectedShift!.id)
    setSaving(false)
    if (err) setFormError(err.message)
    else { setSelectedShift(null); setShiftAction(null); fetchShifts() }
  }

  // ── Reassign shift ──
  const openReassign = () => { setReassignUserId(''); setActionError(null); setShiftAction('reassign') }

  const reassignShift = async () => {
    if (!reassignUserId || !selectedShift) return
    setReassigning(true); setActionError(null)

    const { error } = await supabase.from('shifts').update({ user_id: reassignUserId }).eq('id', selectedShift.id)
    if (error) { setReassigning(false); setActionError(error.message); return }

    const shiftDate  = selectedShift.starts_at.split('T')[0]
    const startT     = selectedShift.starts_at.split('T')[1]?.substring(0, 5) ?? ''
    const endT       = selectedShift.ends_at.split('T')[1]?.substring(0, 5)   ?? ''
    const formattedDate = formatShiftDate(shiftDate)

    // Send notices (best effort – broadcast model)
    await supabase.from('notices').insert([
      {
        title: 'Shift Reassigned',
        body: `Your shift on ${formattedDate} (${fmt12(startT)} – ${fmt12(endT)}) has been reassigned to another staff member.`,
      },
      {
        title: 'New Shift Assigned',
        body: `You have been assigned a shift on ${formattedDate} from ${fmt12(startT)} to ${fmt12(endT)}.`,
      },
    ]).then(() => {/* ignore notice errors */})

    setReassigning(false)
    setSelectedShift(null); setShiftAction(null); setReassignUserId('')
    fetchShifts()
  }

  // ── Delete shift ──
  const deleteShift = async () => {
    if (!selectedShift) return
    setDeleting(true)
    const { error } = await supabase.from('shifts').delete().eq('id', selectedShift.id)
    setDeleting(false)
    if (error) { setActionError(error.message); return }
    setSelectedShift(null); setShiftAction(null); fetchShifts()
  }

  const closeDetail = () => { setSelectedShift(null); setShiftAction(null); setActionError(null); setReassignUserId('') }

  // Toggle repeat-day for custom pattern
  const toggleRepeatDay = (day: number) => {
    setRepeatDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day); else next.add(day)
      return next
    })
  }

  // ── Build date → shifts map ──
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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-teal-500" />Shifts
          </h1>
          <p className="text-sm text-gray-500 mt-1">Select a staff group to view their schedule</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {GROUPS.map(({ name, icon: Icon, color, description }) => {
            const { card, icon } = GROUP_COLORS[color]
            return (
              <button key={name} onClick={() => handleSelectGroup(name)}
                className={`rounded-2xl border-2 p-4 md:p-6 min-h-[100px] text-left transition-all duration-150 ${card}`}>
                <Icon className={`w-8 h-8 md:w-9 md:h-9 mb-2 md:mb-3 ${icon}`} />
                <div className="font-semibold text-gray-900 text-sm md:text-[15px]">{name}</div>
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
        <button onClick={resetToLevel1} className="flex items-center gap-1 text-sm text-teal-600 hover:text-teal-700 mb-5">
          <ChevronLeft className="w-4 h-4" />Back to groups
        </button>
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Icon className={`w-6 h-6 ${icon}`} />{selectedGroup}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Select a specialty to continue</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {config.specialties.map(specialty => (
            <button key={specialty} onClick={() => handleSelectSpecialty(specialty)}
              className="rounded-2xl border-2 border-teal-200 bg-teal-50 hover:bg-teal-100 p-4 md:p-5 min-h-[100px] text-left transition-all duration-150">
              <CalendarDays className="w-7 h-7 md:w-6 md:h-6 text-teal-500 mb-2" />
              <div className="font-semibold text-gray-900 text-sm">{specialty}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LEVEL 3 — Calendar
  // ════════════════════════════════════════════════════════════════════════════

  const breadcrumbParts = [selectedGroup, selectedSpecialty].filter(Boolean) as string[]
  const showAddBtn = canAdd && (role !== 'department_head' || selectedGroup === deptHeadGroup)

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-1 flex-wrap text-sm mb-1">
            <button onClick={goBack} className="flex items-center gap-0.5 text-gray-400 hover:text-teal-600 transition-colors mr-1">
              <ChevronLeft className="w-3.5 h-3.5" /><span className="text-xs">Back</span>
            </button>
            {breadcrumbParts.map((part, i) => (
              <span key={part} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-400 select-none">›</span>}
                <span className={i === breadcrumbParts.length - 1 ? 'font-semibold text-gray-800' : 'text-gray-500'}>{part}</span>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="text-gray-400 select-none">›</span>
              <span className="font-semibold capitalize text-teal-600">{scheduleType}</span>
            </span>
            <button onClick={resetToLevel1} title="Change selection"
              className="ml-1 p-0.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-teal-500" />Shifts
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/onduty')}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Activity className="w-4 h-4" />Live
          </button>
          {showAddBtn && (
            <>
              <button
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-2 border border-teal-600 text-teal-600 hover:bg-teal-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />Bulk Upload
              </button>
              <button
                onClick={openModal}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />Add Shift
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Save success banner ── */}
      {saveSuccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{saveSuccess}
        </div>
      )}

      {/* ── Mobile controls ── */}
      <div className="md:hidden space-y-3">
        {/* Schedule type toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['regular', 'duty'] as ScheduleType[]).map(t => (
            <button key={t} onClick={() => setScheduleType(t)}
              className={`flex-1 py-2 font-medium capitalize transition-colors ${
                scheduleType === t ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>{t}</button>
          ))}
        </div>

        {/* Week / Month toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['week', 'month'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`flex-1 py-2 font-medium capitalize transition-colors ${
                viewMode === v ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>{v}</button>
          ))}
        </div>

        {/* Week-only: day navigation + dots */}
        {viewMode === 'week' && (
          <>
            {/* Day navigation: ← prev day | current day | next day → */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => navigateMobileDay(-1)}
                className="flex items-center gap-1 px-3 py-3 text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm">
                  {addDays(new Date(mobileDate + 'T00:00:00'), -1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </button>
              <button
                onClick={goToToday}
                className="flex-1 py-3 text-center hover:bg-gray-50 transition-colors"
              >
                {mobileDate === todayStr ? (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-500 mb-0.5">Today</div>
                    <div className="text-sm font-bold text-teal-700">
                      {new Date(mobileDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-bold text-gray-900">
                      {new Date(mobileDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-[10px] text-teal-500">Tap for today</div>
                  </div>
                )}
              </button>
              <button
                onClick={() => navigateMobileDay(1)}
                className="flex items-center gap-1 px-3 py-3 text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <span className="text-sm">
                  {addDays(new Date(mobileDate + 'T00:00:00'), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Week dots */}
            <div className="flex items-center justify-center gap-4">
              {weekDays.map(day => {
                const dayStr     = isoDate(day)
                const isSelected = dayStr === mobileDate
                const isDayToday = dayStr === todayStr
                return (
                  <button key={dayStr} onClick={() => setMobileDate(dayStr)}
                    className="flex flex-col items-center gap-1 py-1 px-0.5">
                    <span className="text-[9px] font-medium text-gray-400 uppercase">{DAY_LABELS[day.getDay()]}</span>
                    <span className={`w-2 h-2 rounded-full transition-colors ${
                      isSelected ? 'bg-teal-600' : isDayToday ? 'bg-teal-300' : 'bg-gray-300'
                    }`} />
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Desktop controls ── */}
      <div className="hidden md:flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['regular', 'duty'] as ScheduleType[]).map(t => (
            <button key={t} onClick={() => setScheduleType(t)}
              className={`px-4 py-1.5 font-medium capitalize transition-colors ${
                scheduleType === t ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>{t}</button>
          ))}
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['week', 'month'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-4 py-1.5 font-medium capitalize transition-colors ${
                viewMode === v ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => viewMode === 'week' ? setWeekBase(w => addDays(w, -7)) : setMonthBase(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[210px] text-center select-none">
            {viewMode === 'week'
              ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : monthBase.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => viewMode === 'week' ? setWeekBase(w => addDays(w, 7)) : setMonthBase(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => { setWeekBase(weekStart(new Date())); const n = new Date(); setMonthBase(new Date(n.getFullYear(), n.getMonth(), 1)) }}
            className="ml-1 text-xs text-teal-600 hover:underline px-1">
            Today
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* ── Mobile calendar ── */}
      <div className="md:hidden">
        {viewMode === 'week' ? (
          /* ── Week: single day card ── */
          loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading shifts…
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${
                mobileDate === todayStr ? 'bg-teal-50' : ''
              }`}>
                <span className={`font-semibold text-sm tracking-wide ${mobileDate === todayStr ? 'text-teal-700' : 'text-gray-700'}`}>
                  {new Date(mobileDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
                </span>
                {mobileDate === todayStr && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-600">
                    Today <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                  </span>
                )}
              </div>
              {(shiftsByDate[mobileDate] ?? []).length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No shifts scheduled</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(shiftsByDate[mobileDate] ?? []).map(s => (
                    <MobileShiftRow
                      key={s.id}
                      shift={s}
                      onClick={() => { setSelectedShift(s); setShiftAction(null); setActionError(null) }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          /* ── Month: compact grid + bottom-sheet detail ── */
          <div className="space-y-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMonthBase(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {monthBase.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => setMonthBase(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading shifts…
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {DAY_LABELS.map(d => (
                    <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {d[0]}
                    </div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7">
                  {monthDays.map((day, idx) => {
                    const dayStr         = isoDate(day)
                    const isToday        = dayStr === todayStr
                    const isCurrentMonth = day.getMonth() === monthBase.getMonth()
                    const dayShifts      = shiftsByDate[dayStr] ?? []
                    return (
                      <button
                        key={dayStr}
                        onClick={() => setMobileMonthDay(dayStr)}
                        className={`flex flex-col items-center py-2 transition-colors hover:bg-gray-50 active:bg-gray-100 ${
                          idx >= 7 ? 'border-t border-gray-100' : ''
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                          isToday
                            ? 'bg-teal-600 text-white'
                            : isCurrentMonth ? 'text-gray-900' : 'text-gray-300'
                        }`}>
                          {day.getDate()}
                        </span>
                        {dayShifts.length > 0 && isCurrentMonth && (
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <span className="w-1 h-1 rounded-full bg-teal-500" />
                            <span className="text-[9px] font-semibold text-teal-600">{dayShifts.length}</span>
                          </div>
                        )}
                        {dayShifts.length === 0 && <span className="mt-0.5 h-3" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Bottom sheet: day detail */}
            {mobileMonthDay && (
              <>
                <div
                  className="fixed inset-0 bg-black/40 z-40"
                  onClick={() => setMobileMonthDay(null)}
                />
                <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[70vh]">
                  <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 flex-shrink-0" />
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {new Date(mobileMonthDay + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                    </h3>
                    <button onClick={() => setMobileMonthDay(null)} className="p-1 rounded-lg hover:bg-gray-100">
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto pb-6">
                    {(shiftsByDate[mobileMonthDay] ?? []).length === 0 ? (
                      <div className="py-10 text-center">
                        <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">No shifts this day</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {(shiftsByDate[mobileMonthDay] ?? []).map(s => (
                          <MobileShiftRow
                            key={s.id}
                            shift={s}
                            onClick={() => {
                              setMobileMonthDay(null)
                              setSelectedShift(s)
                              setShiftAction(null)
                              setActionError(null)
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Desktop calendar ── */}
      <div className="hidden md:block">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading shifts…
          </div>
        ) : viewMode === 'week' ? (
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(day => {
              const key       = isoDate(day)
              const isToday   = key === todayStr
              const dayShifts = shiftsByDate[key] ?? []
              return (
                <div key={key} className={`min-h-[160px] rounded-xl border p-2 flex flex-col gap-1.5 ${
                  isToday ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white'}`}>
                  <div className="text-center mb-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{DAY_LABELS[day.getDay()]}</div>
                    <div className={`text-sm font-bold ${isToday ? 'text-teal-600' : 'text-gray-700'}`}>{day.getDate()}</div>
                  </div>
                  {dayShifts.length === 0
                    ? <div className="flex-1 flex items-center justify-center text-[10px] text-gray-300">No shifts</div>
                    : dayShifts.map(s => <ShiftChip key={s.id} shift={s} onClick={() => { setSelectedShift(s); setShiftAction(null); setActionError(null) }} />)}
                </div>
              )
            })}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map(day => {
                const key            = isoDate(day)
                const isToday        = key === todayStr
                const isCurrentMonth = day.getMonth() === monthBase.getMonth()
                const dayShifts      = shiftsByDate[key] ?? []
                return (
                  <div key={key} className={`min-h-[90px] rounded-lg border p-1.5 flex flex-col gap-0.5 ${
                    isToday ? 'border-teal-400 bg-teal-50'
                    : isCurrentMonth ? 'border-gray-200 bg-white'
                    : 'border-gray-100 bg-gray-50/50'}`}>
                    <div className={`text-xs font-bold text-center mb-0.5 ${isToday ? 'text-teal-600' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                      {day.getDate()}
                    </div>
                    {dayShifts.slice(0, 3).map(s => (
                      <ShiftChip key={s.id} shift={s} onClick={() => { setSelectedShift(s); setShiftAction(null); setActionError(null) }} />
                    ))}
                    {dayShifts.length > 3 && (
                      <div className="text-[9px] text-gray-400 text-center mt-0.5">+{dayShifts.length - 3} more</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          Add / Edit Shift Modal
          ════════════════════════════════════════════════════════════════════ */}
      {(modalOpen || shiftAction === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {shiftAction === 'edit' ? 'Edit Shift' : 'Add Shift'}
              </h2>
              <button
                onClick={() => shiftAction === 'edit' ? setShiftAction(null) : closeAddModal()}
                className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{formError}
                </div>
              )}

              {/* Staff */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  <User className="inline w-3.5 h-3.5 mr-1" />Staff Member *
                </label>
                <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— Select staff —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  <Building2 className="inline w-3.5 h-3.5 mr-1" />Department
                  {role === 'department_head' && <span className="ml-1 text-gray-400 font-normal normal-case">(your department)</span>}
                </label>
                {role === 'department_head' ? (
                  <input type="text" value={userDeptName || 'Loading…'} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 outline-none cursor-not-allowed" />
                ) : (
                  <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                    <option value="">— None —</option>
                    <option value="gp">General Practice (GP)</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date *</label>
                <input type="date" value={form.shift_date} onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    <Clock className="inline w-3.5 h-3.5 mr-1" />Start *
                  </label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End *</label>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              </div>

              {/* Schedule type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Schedule Type</label>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                  {(['regular', 'duty'] as const).map(t => (
                    <button type="button" key={t} onClick={() => setForm(f => ({ ...f, schedule_type: t }))}
                      className={`flex-1 py-2 font-medium capitalize transition-colors ${
                        form.schedule_type === t ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Specialty */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Specialty</label>
                <input type="text" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                  placeholder="e.g. Internal Medicine, ICU, Ward…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
              </div>

              {/* ── Repeat section (Add mode only) ── */}
              {!shiftAction && (
                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={repeatEnabled}
                      onChange={e => setRepeatEnabled(e.target.checked)}
                      className="w-4 h-4 accent-teal-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Repeat this shift</span>
                  </label>

                  {repeatEnabled && (
                    <div className="space-y-3 pt-1">
                      {/* Pattern */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Repeat Pattern</label>
                        <select
                          value={repeatPattern}
                          onChange={e => {
                            const p = e.target.value as RepeatPattern
                            setRepeatPattern(p)
                            if (p === 'custom') setRepeatDays(new Set())
                          }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                        >
                          {REPEAT_PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>

                      {/* Custom day checkboxes */}
                      {repeatPattern === 'custom' && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Days</label>
                          <div className="flex flex-wrap gap-1.5">
                            {[1, 2, 3, 4, 5, 6, 0].map(d => (
                              <label key={d} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                                repeatDays.has(d) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}>
                                <input type="checkbox" className="hidden" checked={repeatDays.has(d)} onChange={() => toggleRepeatDay(d)} />
                                {DAY_LABELS[d]}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Weekly auto-label */}
                      {repeatPattern === 'weekly' && form.shift_date && (
                        <p className="text-xs text-gray-500">
                          Repeats every <span className="font-medium">{DAY_LABELS[new Date(form.shift_date + 'T00:00:00').getDay()]}</span>
                        </p>
                      )}

                      {/* Until date */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Repeat Until *</label>
                        <input type="date" value={repeatUntil} min={form.shift_date}
                          onChange={e => setRepeatUntil(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                      </div>

                      {/* Preview */}
                      {repeatUntil && (
                        <div className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          This will create <span className="font-semibold">{repeatPreviewCount}</span> shift{repeatPreviewCount !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => shiftAction === 'edit' ? setShiftAction(null) : closeAddModal()}
                className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button
                onClick={shiftAction === 'edit' ? updateShift : saveShift}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : shiftAction === 'edit' ? 'Update Shift' : 'Save Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Shift Detail Modal
          ════════════════════════════════════════════════════════════════════ */}
      {selectedShift && !shiftAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Shift Details</h2>
              <button onClick={closeDetail} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-3">
              {/* Staff */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Staff</p>
                <p className="text-sm font-medium text-gray-900">{selectedShift.user?.full_name ?? '—'}</p>
              </div>
              {/* Department */}
              {selectedShift.department?.name && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Department</p>
                  <p className="text-sm text-gray-700">{selectedShift.department.name}</p>
                </div>
              )}
              {/* Specialty */}
              {selectedShift.specialty && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Specialty</p>
                  <p className="text-sm text-gray-700">{selectedShift.specialty}</p>
                </div>
              )}
              {/* Date */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Date</p>
                <p className="text-sm text-gray-700">{formatShiftDate(selectedShift.starts_at.split('T')[0])}</p>
              </div>
              {/* Time */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Time</p>
                <p className="text-sm text-gray-700">
                  {fmt12(selectedShift.starts_at.split('T')[1]?.substring(0, 5) ?? '00:00')}
                  {' – '}
                  {fmt12(selectedShift.ends_at.split('T')[1]?.substring(0, 5) ?? '00:00')}
                </p>
              </div>
              {/* Schedule type */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Schedule Type</p>
                <p className="text-sm text-gray-700 capitalize">{selectedShift.schedule_type ?? '—'}</p>
              </div>
              {/* Notes */}
              {selectedShift.notes && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                  <p className="text-sm text-gray-600">{selectedShift.notes}</p>
                </div>
              )}

              {actionError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{actionError}
                </div>
              )}
            </div>

            {/* Action buttons — only for authorised users */}
            {canManageShift(selectedShift) && (
              <div className="px-6 pb-5 flex gap-2">
                <button
                  onClick={openEditModal}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors text-gray-700"
                >
                  <Edit2 className="w-4 h-4" />Edit
                </button>
                <button
                  onClick={openReassign}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors text-gray-700"
                >
                  <RefreshCw className="w-4 h-4" />Reassign
                </button>
                <button
                  onClick={() => { setActionError(null); setShiftAction('delete') }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-red-200 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                >
                  <Trash2 className="w-4 h-4" />Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Reassign Modal
          ════════════════════════════════════════════════════════════════════ */}
      {selectedShift && shiftAction === 'reassign' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-teal-500" />Reassign Shift
              </h2>
              <button onClick={closeDetail} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-sm text-gray-600">
                Currently assigned to <span className="font-medium text-gray-900">{selectedShift.user?.full_name ?? '—'}</span>
                <br />
                <span className="text-xs text-gray-400">
                  {formatShiftDate(selectedShift.starts_at.split('T')[0])},&nbsp;
                  {fmt12(selectedShift.starts_at.split('T')[1]?.substring(0, 5) ?? '00:00')}
                  {' – '}
                  {fmt12(selectedShift.ends_at.split('T')[1]?.substring(0, 5) ?? '00:00')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Assign To *
                </label>
                <select value={reassignUserId} onChange={e => setReassignUserId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— Select replacement staff —</option>
                  {profiles.filter(p => p.id !== selectedShift.user_id).map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>

              {actionError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{actionError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setShiftAction(null)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button
                onClick={reassignShift}
                disabled={!reassignUserId || reassigning}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {reassigning && <Loader2 className="w-4 h-4 animate-spin" />}
                {reassigning ? 'Reassigning…' : 'Confirm Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Delete Confirmation Modal
          ════════════════════════════════════════════════════════════════════ */}
      {selectedShift && shiftAction === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Delete Shift?</h2>
            <p className="text-sm text-gray-500 mb-1">
              This will permanently remove the shift for{' '}
              <span className="font-medium text-gray-700">{selectedShift.user?.full_name ?? 'this staff member'}</span>.
            </p>
            <p className="text-xs text-gray-400 mb-5">
              {formatShiftDate(selectedShift.starts_at.split('T')[0])},&nbsp;
              {fmt12(selectedShift.starts_at.split('T')[1]?.substring(0, 5) ?? '00:00')}
              {' – '}
              {fmt12(selectedShift.ends_at.split('T')[1]?.substring(0, 5) ?? '00:00')}
            </p>

            {actionError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{actionError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShiftAction(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={deleteShift} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Upload ── */}
      {uploadOpen && (
        <ShiftUpload
          onClose={() => setUploadOpen(false)}
          onSuccess={() => { setUploadOpen(false); fetchShifts() }}
          departmentId={profile?.department_id}
          uploaderId={profile!.id}
          userRole={role}
        />
      )}
    </div>
  )
}
