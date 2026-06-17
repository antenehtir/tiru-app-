import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Activity, RefreshCw, Phone, Clock, Building2, ChevronDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type ShiftEntry = {
  id: string
  starts_at: string
  ends_at: string
  specialty: string | null
  schedule_type: string | null
  department_id: string | null
  user: { id: string; full_name: string; phone: string | null; role: string | null; department_id: string | null } | null
  department: { name: string } | null
}

type AttendanceLog = {
  user_id: string
  attendance_type: 'clock_in' | 'clock_out'
  scanned_at: string
  within_geofence: boolean | null
}

type ShiftStatus = 'PRESENT' | 'LATE' | 'EXPECTED' | 'UPCOMING' | 'CLOCKED_OUT'

type EnrichedShift = ShiftEntry & { status: ShiftStatus; latestLog: AttendanceLog | null; deptName: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatus(shift: ShiftEntry, latestLog: AttendanceLog | null, now: Date): ShiftStatus {
  if (latestLog) {
    return latestLog.attendance_type === 'clock_in' ? 'PRESENT' : 'CLOCKED_OUT'
  }
  const start = new Date(shift.starts_at)
  const diffMs = now.getTime() - start.getTime()
  const diffMin = diffMs / 60000
  if (diffMin > 30)  return 'LATE'
  if (diffMin < -1)  return 'UPCOMING'
  return 'EXPECTED'
}

const STATUS_META: Record<ShiftStatus, { label: string; dot: string; badge: string; border: string }> = {
  PRESENT:    { label: 'Present',    dot: 'bg-green-500', badge: 'bg-green-100 text-green-700', border: 'border-green-200' },
  EXPECTED:   { label: 'Expected',   dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-200' },
  LATE:       { label: 'Late',       dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700',   border: 'border-red-200' },
  UPCOMING:   { label: 'Upcoming',   dot: 'bg-blue-400',  badge: 'bg-blue-100 text-blue-700', border: 'border-blue-200' },
  CLOCKED_OUT:{ label: 'Clocked Out',dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-600', border: 'border-gray-200' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnDuty() {
  const [shifts,    setShifts]    = useState<EnrichedShift[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [now,       setNow]       = useState(new Date())
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())

  const toggleDept = (dept: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  // Clock tick every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  const fetchData = useCallback(async () => {
    setError(null)
    const today     = new Date()
    const dateStr   = today.toISOString().split('T')[0]
    const dayStart  = `${dateStr}T00:00:00`
    const dayEnd    = `${dateStr}T23:59:59`

    const [shiftsRes, attendanceRes, deptsRes] = await Promise.all([
      supabase
        .from('shifts')
        .select(`
          id, starts_at, ends_at, specialty, schedule_type, department_id,
          user:profiles!shifts_user_id_fkey(id, full_name, phone, role, department_id),
          department:departments(name)
        `)
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd)
        .order('starts_at'),

      supabase
        .from('attendance_logs')
        .select('user_id, attendance_type, scanned_at, within_geofence')
        .gte('scanned_at', dayStart)
        .lte('scanned_at', dayEnd)
        .order('scanned_at'),

      supabase
        .from('departments')
        .select('id, name'),
    ])

    if (shiftsRes.error) { setError(shiftsRes.error.message); setLoading(false); return }

    const currentNow = new Date()

    // Build map: user_id → latest log
    const logMap = new Map<string, AttendanceLog>()
    for (const log of (attendanceRes.data ?? []) as AttendanceLog[]) {
      logMap.set(log.user_id, log)
    }

    // Build map: department id → department name (all depts, not just those on shifts)
    const deptMap = new Map<string, string>(
      ((deptsRes.data ?? []) as { id: string; name: string }[]).map(d => [d.id, d.name])
    )

    const enriched: EnrichedShift[] = ((shiftsRes.data ?? []) as unknown as ShiftEntry[]).map(s => {
      const latestLog = s.user ? (logMap.get(s.user.id) ?? null) : null
      const status    = getStatus(s, latestLog, currentNow)
      // Resolve department: shift-level dept_id → profile dept_id → 'Other'
      const deptId  = s.department_id ?? s.user?.department_id ?? null
      const deptName = deptId ? (deptMap.get(deptId) ?? 'Other') : 'Other'
      return { ...s, status, latestLog, deptName }
    })

    setShifts(enriched)
    setLastFetch(new Date())
    setLoading(false)
  }, [])

  // Initial fetch + auto-refresh every 2 minutes
  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 120000)
    return () => clearInterval(t)
  }, [fetchData])

  // Group by department
  const grouped = shifts.reduce<Record<string, EnrichedShift[]>>((acc, s) => {
    ;(acc[s.deptName] ??= []).push(s)
    return acc
  }, {})

  // Summary counts
  const counts = shifts.reduce<Record<ShiftStatus, number>>(
    (acc, s) => { acc[s.status]++; return acc },
    { PRESENT: 0, EXPECTED: 0, LATE: 0, UPCOMING: 0, CLOCKED_OUT: 0 }
  )

  const clockStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dateStr2 = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="relative">
              <Activity className="w-6 h-6 text-green-600" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500">
                <span className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
              </span>
            </span>
            Who's On Duty Now
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{dateStr2}</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            {clockStr}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            title="Refresh"
            className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {!loading && shifts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(['PRESENT', 'EXPECTED', 'LATE', 'UPCOMING', 'CLOCKED_OUT'] as ShiftStatus[]).map(s => (
            counts[s] > 0 && (
              <span key={s} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${STATUS_META[s].badge}`}>
                <span className={`w-2 h-2 rounded-full ${STATUS_META[s].dot}`} />
                {counts[s]} {STATUS_META[s].label}
              </span>
            )
          ))}
          <span className="text-xs text-gray-400 self-center ml-auto">
            {lastFetch ? `Updated ${lastFetch.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && shifts.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No shifts scheduled for today</p>
        </div>
      )}

      {/* ── Accordion departments ── */}
      {!loading && shifts.length > 0 && (
        <div className="space-y-2">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dept, deptShifts]) => {
              const isOpen = expandedDepts.has(dept)
              const deptPresent  = deptShifts.filter(s => s.status === 'PRESENT').length
              const deptLate     = deptShifts.filter(s => s.status === 'LATE').length
              const deptExpected = deptShifts.filter(s => s.status === 'EXPECTED').length
              return (
                <div key={dept} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Department header — tap to expand */}
                  <button
                    onClick={() => toggleDept(dept)}
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-900">{dept}</p>
                        <p className="text-xs text-gray-400">{deptShifts.length} shift{deptShifts.length !== 1 ? 's' : ''} today</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {deptPresent > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />{deptPresent}
                        </span>
                      )}
                      {deptLate > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{deptLate} Late
                        </span>
                      )}
                      {deptExpected > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{deptExpected}
                        </span>
                      )}
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded staff list */}
                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {deptShifts.map(shift => {
                        const meta      = STATUS_META[shift.status]
                        const latestLog = shift.latestLog
                        const startT    = new Date(shift.starts_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        const endT      = new Date(shift.ends_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        return (
                          <div key={shift.id} className="flex items-start gap-3 px-4 py-3">
                            <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${
                              shift.status === 'PRESENT'    ? 'bg-teal-500' :
                              shift.status === 'LATE'       ? 'bg-red-500'  :
                              shift.status === 'EXPECTED'   ? 'bg-amber-500':
                              shift.status === 'CLOCKED_OUT'? 'bg-gray-400' : 'bg-blue-400'
                            }`}>
                              {(shift.user?.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">{shift.user?.full_name ?? '—'}</p>
                                <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.badge}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 capitalize">{shift.user?.role?.replace(/_/g, ' ')}{shift.specialty ? ` · ${shift.specialty}` : ''}</p>
                              <p className="text-xs text-gray-500">{startT} – {endT}</p>
                              {latestLog?.attendance_type === 'clock_in' && (
                                <p className="text-xs text-teal-600">
                                  ✓ In at {new Date(latestLog.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                  {latestLog.within_geofence === false && <span className="text-amber-500 ml-1">(off-site)</span>}
                                </p>
                              )}
                              {latestLog?.attendance_type === 'clock_out' && (
                                <p className="text-xs text-gray-400">✓ Out at {new Date(latestLog.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
                              )}
                              {shift.user?.phone && (
                                <a href={`tel:${shift.user.phone}`} className="inline-flex items-center gap-1 text-xs text-teal-600 mt-0.5">
                                  <Phone className="w-3 h-3" />{shift.user.phone}
                                </a>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
