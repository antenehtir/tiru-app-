import React, { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, ShieldCheck, UserX, Clock, TrendingDown, Info, Shield,
  Download, ChevronDown, X, Hourglass, Timer, WifiOff,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import { useFlagRules, RULE_META, SEVERITY_STYLES, type RuleType, type Severity } from '../lib/flagRules'
import { detectFlags, type StaffLite, type ShiftLite, type AttendanceLite, type HeartbeatLite, type Flag } from '../lib/flagEngine'

// ─── Access control ───────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['super_admin', 'ceo', 'general_manager', 'medical_director', 'hr']
const CAN_EXPORT    = ['super_admin', 'hr', 'medical_director', 'ceo', 'general_manager', 'department_head']
const FACILITY_ID   = 'd917b86c-682c-4f11-b285-0a1cada2b54b'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'Today' | 'This Week' | 'This Month'

// ─── Rule-type presentation (icons only — everything else comes from the rules) ─

const RULE_ICONS: Record<RuleType, React.ComponentType<{ className?: string }>> = {
  late_arrival:            Clock,
  no_show:                 UserX,
  low_attendance:          TrendingDown,
  early_departure:         Hourglass,
  weekly_hours_shortfall:  Timer,
  monitoring_gap:          WifiOff,
  custom:                  AlertTriangle,
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }

// Matches the fixed trailing window flagEngine uses for weekly_hours_shortfall.
const WEEKLY_HOURS_LOOKBACK_DAYS = 7
const DEFAULT_LOW_ATTENDANCE_LOOKBACK_DAYS = 30

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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Flags() {
  const { profile } = useAuth()
  const role = profile?.role ?? ''

  const { rules, loading: rulesLoading, error: rulesError } = useFlagRules()

  const [period, setPeriod]               = useState<Period>('Today')
  const [dataLoading, setDataLoading]     = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [flagsExpanded, setFlagsExpanded] = useState(false)
  const [activeFilter, setActiveFilter]   = useState<RuleType | null>(null)

  const [flags, setFlags]                 = useState<Flag[]>([])
  const [employeeIds, setEmployeeIds]     = useState<Map<string, string>>(new Map())

  const PERIODS: { value: Period; label: string }[] = [
    { value: 'Today',      label: 'Today' },
    { value: 'This Week',  label: 'This Week' },
    { value: 'This Month', label: 'This Month' },
  ]

  const loadFlags = useCallback(async () => {
    if (rulesLoading) return
    setDataLoading(true); setError(null)
    try {
      const now = new Date()
      const { start: periodStart } = getPeriodRange(period)

      const lowAttendanceLookback = rules
        .filter(r => r.is_active && r.rule_type === 'low_attendance')
        .map(r => r.threshold_days ?? DEFAULT_LOW_ATTENDANCE_LOOKBACK_DAYS)
      const lookbackDays = Math.max(
        WEEKLY_HOURS_LOOKBACK_DAYS,
        DEFAULT_LOW_ATTENDANCE_LOOKBACK_DAYS,
        ...lowAttendanceLookback,
      )
      const lookbackStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
      const fetchStart = periodStart < lookbackStart ? periodStart : lookbackStart

      const [staffRes, shiftsRes, logsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, employee_id, role, department_id, is_active, created_at')
          .eq('is_active', true),
        supabase
          .from('shifts')
          .select('id, user_id, starts_at, ends_at, department_id, status')
          .eq('facility_id', FACILITY_ID)
          .gte('starts_at', fetchStart.toISOString())
          .lte('starts_at', now.toISOString()),
        supabase
          .from('attendance_logs')
          .select('id, user_id, attendance_type, scanned_at, within_geofence')
          .eq('facility_id', FACILITY_ID)
          .gte('scanned_at', fetchStart.toISOString()),
      ])

      if (staffRes.error) throw staffRes.error
      if (shiftsRes.error) throw shiftsRes.error
      if (logsRes.error) throw logsRes.error

      const staffRows = (staffRes.data as any[]) ?? []
      const staff: StaffLite[] = staffRows.map(p => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        department_id: p.department_id,
        started_at: p.created_at,
        is_active: p.is_active,
      }))
      const idMap = new Map<string, string>(staffRows.map(p => [p.id, p.employee_id ?? '—']))

      const shifts = ((shiftsRes.data as any[]) ?? []) as ShiftLite[]
      const logs = ((logsRes.data as any[]) ?? []) as AttendanceLite[]

      const clockedInUserIds = Array.from(
        new Set(logs.filter(l => l.attendance_type === 'clock_in').map(l => l.user_id))
      )

      let heartbeats: HeartbeatLite[] = []
      if (clockedInUserIds.length) {
        const heartbeatsRes = await supabase
          .from('device_heartbeats')
          .select('id, user_id, pinged_at')
          .in('user_id', clockedInUserIds)
          .gte('pinged_at', periodStart.toISOString())
        if (heartbeatsRes.error) throw heartbeatsRes.error
        heartbeats = ((heartbeatsRes.data as any[]) ?? []) as HeartbeatLite[]
      }

      const allFlags = detectFlags({ rules, staff, shifts, logs, heartbeats, now })
      const periodFlags = allFlags.filter(f => new Date(f.occurred_at).getTime() >= periodStart.getTime())

      setFlags(periodFlags)
      setEmployeeIds(idMap)
    } catch {
      setError('Failed to load flags data. Please refresh.')
    } finally {
      setDataLoading(false)
    }
  }, [period, rules, rulesLoading])

  useEffect(() => { loadFlags() }, [loadFlags])

  const loading = rulesLoading || dataLoading

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

  const activeRuleTypes = Array.from(new Set(rules.filter(r => r.is_active).map(r => r.rule_type)))

  const SUMMARY_CARDS = activeRuleTypes.map(type => {
    const meta = RULE_META[type]
    const typeRules = rules.filter(r => r.is_active && r.rule_type === type)
    const worstSeverity = typeRules.reduce<Severity>(
      (worst, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[worst] ? r.severity : worst),
      'low',
    )
    return {
      type,
      label: meta?.label ?? type,
      icon: RULE_ICONS[type] ?? AlertTriangle,
      badgeClass: SEVERITY_STYLES[worstSeverity],
      items: flags.filter(f => f.rule_type === type),
    }
  })

  const filteredFlags = activeFilter ? flags.filter(f => f.rule_type === activeFilter) : flags

  const canExport = CAN_EXPORT.includes(role)

  function exportFlags() {
    const header = 'Staff Name,Employee ID,Flag Type,Detail,Severity,Date/Time'
    const rows = filteredFlags.map(f =>
      [
        f.staff_name,
        employeeIds.get(f.user_id) ?? '—',
        f.rule_name,
        `"${f.detail.replace(/"/g, '""')}"`,
        f.severity,
        formatDateTime(f.occurred_at),
      ].join(',')
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
        {SUMMARY_CARDS.map(({ type, label, icon: Icon, badgeClass, items }) => {
          const isActive = activeFilter === type
          return (
            <button
              key={type}
              onClick={() => {
                if (isActive) {
                  setActiveFilter(null)
                } else {
                  setActiveFilter(type)
                  setFlagsExpanded(true)
                }
              }}
              className={`rounded-xl border-2 p-5 flex flex-col gap-2 text-left w-full transition-all ${badgeClass} ${isActive ? 'ring-2 ring-teal-500 ring-offset-1' : 'hover:opacity-90'}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{label}</p>
                <Icon className="w-5 h-5" />
              </div>
              {loading ? (
                <div className="h-9 w-12 rounded bg-black/10 animate-pulse" />
              ) : (
                <p className="text-3xl font-bold">{items.length}</p>
              )}
              <p className="text-xs font-medium opacity-70">{period}</p>
            </button>
          )
        })}
        {!loading && SUMMARY_CARDS.length === 0 && (
          <p className="col-span-2 lg:col-span-4 text-sm text-gray-400 py-4">
            No active flag rules configured. Add rules from Admin &gt; Flag rules.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {rulesError && (
        <p className="text-sm text-red-600">Flag rules could not be loaded: {rulesError}</p>
      )}

      {/* ── Active filter pill ── */}
      {activeFilter && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 bg-teal-100 text-teal-800 text-sm font-medium px-3 py-1 rounded-full">
            Showing: {RULE_META[activeFilter]?.label ?? activeFilter}
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
            Active Flags ({flags.length})
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
                  {activeFilter ? `No ${RULE_META[activeFilter]?.label ?? activeFilter} flags for this period` : 'No flags detected for this period'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredFlags.map((flag) => (
                  <div
                    key={flag.key}
                    className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1.3fr_2fr_1fr_1.5fr] gap-1 md:gap-4 px-5 py-3 text-sm"
                  >
                    <span className="font-medium text-gray-800">{flag.staff_name}</span>
                    <span className="text-gray-500">{employeeIds.get(flag.user_id) ?? '—'}</span>
                    <span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-700 border-gray-200">
                        {flag.rule_name}
                      </span>
                    </span>
                    <span className="text-gray-600">{flag.detail}</span>
                    <span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${SEVERITY_STYLES[flag.severity]}`}>
                        {flag.severity}
                      </span>
                    </span>
                    <span className="text-gray-400 text-xs md:text-sm">{formatDateTime(flag.occurred_at)}</span>
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
          {rules.filter(r => r.is_active).map((rule) => {
            const meta = RULE_META[rule.rule_type]
            const Icon = RULE_ICONS[rule.rule_type] ?? AlertTriangle
            return (
              <div
                key={rule.id}
                className="bg-white px-5 py-4 flex items-start gap-3"
              >
                <div className={`rounded-lg p-2 flex-shrink-0 ${SEVERITY_STYLES[rule.severity]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{rule.rule_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {rule.description || meta?.blurb || (meta ? meta.describe(rule) : '')}
                  </p>
                </div>
              </div>
            )
          })}
          {!rulesLoading && rules.filter(r => r.is_active).length === 0 && (
            <div className="bg-white px-5 py-4 text-sm text-gray-400">
              No active flag rules configured.
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
