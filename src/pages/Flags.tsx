import React, { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, ShieldCheck, UserX, Clock, MapPin, TrendingDown, Info, Shield, Download, ChevronDown, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

// ─── Access control ───────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['super_admin', 'ceo', 'general_manager', 'medical_director']
const CAN_EXPORT    = ['super_admin', 'hr', 'medical_director', 'ceo', 'general_manager', 'department_head']
const FACILITY_ID   = 'd917b86c-682c-4f11-b285-0a1cada2b54b'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'Today' | 'This Week' | 'This Month'

type FlaggedStaff = {
  userId: string
  name: string
  employeeId: string
  flagType: 'No Show' | 'Late Arrival' | 'Outside Geofence' | 'Low Attendance'
  detail: string
  severity: 'High' | 'Medium'
  timestamp: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date()
  const end = now

  if (period === 'Today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { start, end }
  }

  if (period === 'This Week') {
    const day = now.getDay() // 0 = Sun … 6 = Sat
    const diffToMonday = day === 0 ? 6 : day - 1
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday)
    return { start, end }
  }

  // This Month
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start, end }
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

async function fetchProfilesMap(userIds: string[]): Promise<Map<string, { full_name: string; employee_id: string }>> {
  const map = new Map<string, { full_name: string; employee_id: string }>()
  if (userIds.length === 0) return map
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, employee_id')
    .in('id', userIds)
  if (error) throw error
  for (const p of (data as any[]) ?? []) {
    map.set(p.id, { full_name: p.full_name, employee_id: p.employee_id })
  }
  return map
}

// ─── Flag builders ────────────────────────────────────────────────────────────

async function buildNoShows(start: Date): Promise<FlaggedStaff[]> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const { data: shiftsData, error: shiftsErr } = await supabase
    .from('shifts')
    .select('id, user_id, starts_at, user:profiles!shifts_user_id_fkey(full_name, employee_id)')
    .eq('facility_id', FACILITY_ID)
    .lte('starts_at', twoHoursAgo.toISOString())
    .gte('starts_at', start.toISOString())
  if (shiftsErr) throw shiftsErr

  const { data: logsData, error: logsErr } = await supabase
    .from('attendance_logs')
    .select('user_id, scanned_at')
    .eq('facility_id', FACILITY_ID)
    .eq('log_type', 'check_in')
    .gte('scanned_at', start.toISOString())
  if (logsErr) throw logsErr

  const checkinDatesByUser = new Map<string, Set<string>>()
  for (const log of (logsData as any[]) ?? []) {
    const key = localDateKey(new Date(log.scanned_at))
    if (!checkinDatesByUser.has(log.user_id)) checkinDatesByUser.set(log.user_id, new Set())
    checkinDatesByUser.get(log.user_id)!.add(key)
  }

  const seen = new Set<string>()
  const result: FlaggedStaff[] = []
  for (const shift of (shiftsData as any[]) ?? []) {
    if (seen.has(shift.user_id)) continue
    const shiftDateKey = localDateKey(new Date(shift.starts_at))
    const hasCheckin = checkinDatesByUser.get(shift.user_id)?.has(shiftDateKey)
    if (!hasCheckin) {
      seen.add(shift.user_id)
      result.push({
        userId: shift.user_id,
        name: shift.user?.full_name ?? 'Unknown',
        employeeId: shift.user?.employee_id ?? '—',
        flagType: 'No Show',
        severity: 'High',
        detail: `Shift at ${formatTime(shift.starts_at)}, no check-in recorded`,
        timestamp: shift.starts_at,
      })
    }
  }
  return result
}

async function buildLateArrivals(start: Date): Promise<FlaggedStaff[]> {
  const { data: logsData, error: logsErr } = await supabase
    .from('attendance_logs')
    .select('user_id, scanned_at')
    .eq('facility_id', FACILITY_ID)
    .eq('log_type', 'check_in')
    .gte('scanned_at', start.toISOString())
  if (logsErr) throw logsErr

  const { data: shiftsData, error: shiftsErr } = await supabase
    .from('shifts')
    .select('user_id, starts_at')
    .eq('facility_id', FACILITY_ID)
    .gte('starts_at', start.toISOString())
  if (shiftsErr) throw shiftsErr

  const shiftsByUserDate = new Map<string, Map<string, string>>()
  for (const s of (shiftsData as any[]) ?? []) {
    const key = localDateKey(new Date(s.starts_at))
    if (!shiftsByUserDate.has(s.user_id)) shiftsByUserDate.set(s.user_id, new Map())
    shiftsByUserDate.get(s.user_id)!.set(key, s.starts_at)
  }

  const userIds = new Set<string>()
  const flagged: { userId: string; scannedAt: string; startsAt: string; minutesLate: number }[] = []
  for (const log of (logsData as any[]) ?? []) {
    const dateKey = localDateKey(new Date(log.scanned_at))
    const startsAt = shiftsByUserDate.get(log.user_id)?.get(dateKey)
    if (!startsAt) continue
    const minutesLate = (new Date(log.scanned_at).getTime() - new Date(startsAt).getTime()) / 60000
    if (minutesLate > 15) {
      userIds.add(log.user_id)
      flagged.push({ userId: log.user_id, scannedAt: log.scanned_at, startsAt, minutesLate })
    }
  }

  const profileMap = await fetchProfilesMap(Array.from(userIds))

  return flagged.map(f => {
    const p = profileMap.get(f.userId)
    return {
      userId: f.userId,
      name: p?.full_name ?? 'Unknown',
      employeeId: p?.employee_id ?? '—',
      flagType: 'Late Arrival' as const,
      severity: 'Medium' as const,
      detail: `${Math.round(f.minutesLate)} min late (arrived ${formatTime(f.scannedAt)}, shift started ${formatTime(f.startsAt)})`,
      timestamp: f.scannedAt,
    }
  })
}

async function buildOutsideGeofence(start: Date): Promise<FlaggedStaff[]> {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('user_id, scanned_at, log_type, within_geofence')
    .eq('facility_id', FACILITY_ID)
    .eq('within_geofence', false)
    .gte('scanned_at', start.toISOString())
  if (error) throw error

  const rows = (data as any[]) ?? []
  const userIds = Array.from(new Set(rows.map(r => r.user_id)))
  const profileMap = await fetchProfilesMap(userIds)

  return rows.map(r => {
    const p = profileMap.get(r.user_id)
    return {
      userId: r.user_id,
      name: p?.full_name ?? 'Unknown',
      employeeId: p?.employee_id ?? '—',
      flagType: 'Outside Geofence' as const,
      severity: 'Medium' as const,
      detail: `Clocked ${r.log_type === 'check_in' ? 'in' : 'out'} outside facility perimeter`,
      timestamp: r.scanned_at,
    }
  })
}

async function buildLowAttendance(): Promise<FlaggedStaff[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const { data: shiftsData, error: shiftsErr } = await supabase
    .from('shifts')
    .select('user_id')
    .eq('facility_id', FACILITY_ID)
    .gte('starts_at', thirtyDaysAgo.toISOString())
  if (shiftsErr) throw shiftsErr

  const { data: logsData, error: logsErr } = await supabase
    .from('attendance_logs')
    .select('user_id')
    .eq('facility_id', FACILITY_ID)
    .eq('log_type', 'check_in')
    .gte('scanned_at', thirtyDaysAgo.toISOString())
  if (logsErr) throw logsErr

  const scheduledCount = new Map<string, number>()
  for (const s of (shiftsData as any[]) ?? []) {
    scheduledCount.set(s.user_id, (scheduledCount.get(s.user_id) ?? 0) + 1)
  }
  const checkinCount = new Map<string, number>()
  for (const l of (logsData as any[]) ?? []) {
    checkinCount.set(l.user_id, (checkinCount.get(l.user_id) ?? 0) + 1)
  }

  const userIds = Array.from(scheduledCount.keys())
  const profileMap = await fetchProfilesMap(userIds)

  const result: FlaggedStaff[] = []
  for (const [userId, scheduled] of scheduledCount) {
    if (scheduled <= 0) continue
    const checkins = checkinCount.get(userId) ?? 0
    const rate = checkins / scheduled
    if (rate < 0.8) {
      const p = profileMap.get(userId)
      result.push({
        userId,
        name: p?.full_name ?? 'Unknown',
        employeeId: p?.employee_id ?? '—',
        flagType: 'Low Attendance',
        severity: 'High',
        detail: `${Math.round(rate * 100)}% attendance over last 30 days (${checkins}/${scheduled} shifts)`,
        timestamp: thirtyDaysAgo.toISOString(),
      })
    }
  }
  return result
}

// ─── Config ───────────────────────────────────────────────────────────────────

const FLAG_TYPE_BADGE: Record<FlaggedStaff['flagType'], string> = {
  'No Show':          'bg-red-100 text-red-700',
  'Late Arrival':     'bg-orange-100 text-orange-700',
  'Outside Geofence': 'bg-amber-100 text-amber-700',
  'Low Attendance':   'bg-blue-100 text-blue-700',
}

const SEVERITY_BADGE: Record<FlaggedStaff['severity'], string> = {
  High:   'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-800',
}

const FLAG_RULES = [
  {
    icon: UserX,
    iconClass: 'text-red-500 bg-red-50',
    title: 'No Show',
    desc: 'Staff member has no clock-in recorded 2 hours after their scheduled shift start.',
  },
  {
    icon: Clock,
    iconClass: 'text-orange-500 bg-orange-50',
    title: 'Late Arrival',
    desc: 'Clock-in time is 15 or more minutes after the scheduled shift start.',
  },
  {
    icon: MapPin,
    iconClass: 'text-amber-500 bg-amber-50',
    title: 'Geofence Breach',
    desc: 'GPS location at clock-in was outside the 150 m facility radius.',
  },
  {
    icon: TrendingDown,
    iconClass: 'text-blue-500 bg-blue-50',
    title: 'Low Attendance',
    desc: 'Staff attendance rate fell below 80% over the last 30 days.',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function Flags() {
  const { profile } = useAuth()
  const role = profile?.role ?? ''

  const [period, setPeriod]               = useState<Period>('Today')
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [flagsExpanded, setFlagsExpanded] = useState(false)
  const [activeFilter, setActiveFilter]   = useState<FlaggedStaff['flagType'] | null>(null)

  const [noShows,         setNoShows]         = useState<FlaggedStaff[]>([])
  const [lateArrivals,    setLateArrivals]    = useState<FlaggedStaff[]>([])
  const [outsideGeofence, setOutsideGeofence] = useState<FlaggedStaff[]>([])
  const [lowAttendance,   setLowAttendance]   = useState<FlaggedStaff[]>([])

  const PERIODS: { value: Period; label: string }[] = [
    { value: 'Today',      label: 'Today' },
    { value: 'This Week',  label: 'This Week' },
    { value: 'This Month', label: 'This Month' },
  ]

  const loadFlags = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { start } = getPeriodRange(period)
      const [ns, la, og, lowAtt] = await Promise.all([
        buildNoShows(start),
        buildLateArrivals(start),
        buildOutsideGeofence(start),
        buildLowAttendance(),
      ])
      setNoShows(ns)
      setLateArrivals(la)
      setOutsideGeofence(og)
      setLowAttendance(lowAtt)
    } catch {
      setError('Failed to load flags data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { loadFlags() }, [loadFlags])

  // Access guard
  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-32 text-gray-400">
        <Shield className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium text-gray-500">Access Restricted</p>
        <p className="text-sm mt-1">Flags & Alerts is visible to leadership roles only.</p>
      </div>
    )
  }

  const SUMMARY_CARDS: {
    label: string; filterKey: FlaggedStaff['flagType']; icon: React.ComponentType<{ className?: string }>
    card: string; icon_: string; count: string; items: FlaggedStaff[]
  }[] = [
    { label: 'No Shows',         filterKey: 'No Show',           icon: UserX,        card: 'border-red-200 bg-red-50',       icon_: 'text-red-500',    count: 'text-red-600',    items: noShows },
    { label: 'Late Arrivals',    filterKey: 'Late Arrival',      icon: Clock,        card: 'border-orange-200 bg-orange-50', icon_: 'text-orange-500', count: 'text-orange-600', items: lateArrivals },
    { label: 'Outside Geofence', filterKey: 'Outside Geofence',  icon: MapPin,       card: 'border-amber-200 bg-amber-50',   icon_: 'text-amber-500',  count: 'text-amber-600',  items: outsideGeofence },
    { label: 'Low Attendance',   filterKey: 'Low Attendance',    icon: TrendingDown, card: 'border-blue-200 bg-blue-50',     icon_: 'text-blue-500',   count: 'text-blue-600',   items: lowAttendance },
  ]

  const allFlags: FlaggedStaff[] = [...noShows, ...lateArrivals, ...outsideGeofence, ...lowAttendance]
    .sort((a, b) => {
      const sevRank = (s: FlaggedStaff['severity']) => (s === 'High' ? 0 : 1)
      const sevDiff = sevRank(a.severity) - sevRank(b.severity)
      if (sevDiff !== 0) return sevDiff
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })

  const canExport    = CAN_EXPORT.includes(role)
  const filteredFlags = activeFilter ? allFlags.filter(f => f.flagType === activeFilter) : allFlags

  function exportFlags() {
    const header = 'Staff Name,Employee ID,Flag Type,Detail,Severity,Date/Time'
    const rows = filteredFlags.map(f =>
      [f.name, f.employeeId, f.flagType, `"${f.detail.replace(/"/g, '""')}"`, f.severity, formatDateTime(f.timestamp)].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Tiru-Flags-${period.replace(/ /g, '-')}-${new Date().toLocaleDateString()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          Flags &amp; Alerts
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Automated attendance and shift compliance alerts
        </p>
      </div>

      {/* ── Period filter + Export ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm w-fit">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`px-4 py-1.5 font-medium transition-colors ${
                period === value
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {canExport && (
          <button
            onClick={exportFlags}
            className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />Export
          </button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SUMMARY_CARDS.map(({ label, filterKey, icon: Icon, card, icon_, count, items }) => {
          const isLowAttendance = label === 'Low Attendance'
          const isActive = activeFilter === filterKey
          return (
            <button
              key={label}
              onClick={() => {
                if (isActive) {
                  setActiveFilter(null)
                } else {
                  setActiveFilter(filterKey)
                  setFlagsExpanded(true)
                }
              }}
              className={`rounded-xl border-2 p-5 flex flex-col gap-2 text-left w-full transition-all ${card} ${isActive ? 'ring-2 ring-teal-500 ring-offset-1' : 'hover:opacity-90'}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-600">{label}</p>
                <Icon className={`w-5 h-5 ${icon_}`} />
              </div>
              {loading ? (
                <div className="h-9 w-12 rounded bg-gray-200 animate-pulse" />
              ) : (
                <p className={`text-3xl font-bold ${count}`}>{items.length}</p>
              )}
              <p className="text-xs font-medium text-gray-400">
                {isLowAttendance ? '(30-day)' : period}
              </p>
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* ── Active filter pill ── */}
      {activeFilter && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 bg-teal-100 text-teal-800 text-sm font-medium px-3 py-1 rounded-full">
            Showing: {activeFilter}
            <button onClick={() => setActiveFilter(null)} className="text-teal-600 hover:text-teal-800 ml-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* ── Flags table (collapsible) ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setFlagsExpanded(prev => !prev)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Active Flags ({allFlags.length})
          </h2>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${flagsExpanded ? 'rotate-180' : ''}`} />
        </button>

        {flagsExpanded && (
          <>
            {/* Table header — hidden on mobile */}
            <div className="hidden md:grid grid-cols-[1.5fr_1fr_1.3fr_2fr_1fr_1.5fr] gap-4 px-5 py-3 bg-gray-50 border-t border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <span>Staff Name</span>
              <span>Employee ID</span>
              <span>Flag Type</span>
              <span>Detail</span>
              <span>Severity</span>
              <span>Date / Time</span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <p className="text-sm text-gray-400">Loading flags…</p>
              </div>
            ) : filteredFlags.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <ShieldCheck className="w-12 h-12 text-teal-300 mb-4" />
                <p className="text-sm font-medium text-gray-500">
                  {activeFilter ? `No ${activeFilter} flags for this period` : 'No flags detected for this period'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredFlags.map((flag, i) => (
                  <div
                    key={`${flag.userId}-${flag.flagType}-${flag.timestamp}-${i}`}
                    className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1.3fr_2fr_1fr_1.5fr] gap-1 md:gap-4 px-5 py-3 text-sm"
                  >
                    <span className="font-medium text-gray-800">{flag.name}</span>
                    <span className="text-gray-500">{flag.employeeId}</span>
                    <span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${FLAG_TYPE_BADGE[flag.flagType]}`}>
                        {flag.flagType}
                      </span>
                    </span>
                    <span className="text-gray-600">{flag.detail}</span>
                    <span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[flag.severity]}`}>
                        {flag.severity}
                      </span>
                    </span>
                    <span className="text-gray-400 text-xs md:text-sm">{formatDateTime(flag.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── How flags work ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Info className="w-4 h-4 text-teal-500" />
          <h2 className="text-base font-semibold text-gray-800">
            How flags work
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-100">
          {FLAG_RULES.map(({ icon: Icon, iconClass, title, desc }) => (
            <div
              key={title}
              className="bg-white px-5 py-4 flex items-start gap-3"
            >
              <div className={`rounded-lg p-2 flex-shrink-0 ${iconClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
