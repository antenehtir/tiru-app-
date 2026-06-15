import { useState } from 'react'
import { AlertTriangle, ShieldCheck, UserX, Clock, MapPin, TrendingDown, Info, Shield } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

// ─── Access control ───────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['super_admin', 'ceo', 'general_manager', 'medical_director']

// ─── Types ────────────────────────────────────────────────────────────────────

type FlagType    = 'no_show' | 'late_arrival' | 'geofence_breach' | 'low_attendance'
type Severity    = 'low' | 'medium' | 'high' | 'critical'
type FlagStatus  = 'open' | 'reviewed' | 'resolved'

// Future use: shape of rows returned from the flags table
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type FlagRow = {
  id: string
  staff_name: string
  department: string
  flag_type: FlagType
  severity: Severity
  datetime: string
  status: FlagStatus
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SUMMARY_CARDS = [
  {
    label: 'No Shows',
    icon: UserX,
    card:  'border-red-200    bg-red-50      ',
    icon_: 'text-red-500',
    count: 'text-red-600     ',
    zero:  'text-red-300     ',
  },
  {
    label: 'Late Arrivals',
    icon: Clock,
    card:  'border-orange-200 bg-orange-50',
    icon_: 'text-orange-500',
    count: 'text-orange-600  ',
    zero:  'text-orange-300  ',
  },
  {
    label: 'Outside Geofence',
    icon: MapPin,
    card:  'border-amber-200  bg-amber-50  ',
    icon_: 'text-amber-500',
    count: 'text-amber-600   ',
    zero:  'text-amber-300   ',
  },
  {
    label: 'Low Attendance',
    icon: TrendingDown,
    card:  'border-blue-200   bg-blue-50    ',
    icon_: 'text-blue-500',
    count: 'text-blue-600    ',
    zero:  'text-blue-300    ',
  },
] as const

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

  type Period = 'today' | 'week' | 'month'
  const [period, setPeriod] = useState<Period>('today')

  const PERIODS: { value: Period; label: string; subtitle: string }[] = [
    { value: 'today', label: 'Today',      subtitle: 'No data yet — today'      },
    { value: 'week',  label: 'This Week',  subtitle: 'No data yet — this week'  },
    { value: 'month', label: 'This Month', subtitle: 'No data yet — this month' },
  ]
  const currentPeriod = PERIODS.find(p => p.value === period)!

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

      {/* ── Period filter ── */}
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

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SUMMARY_CARDS.map(({ label, icon: Icon, card, icon_, count, zero }) => {
          const isLowAttendance = label === 'Low Attendance'
          const subtitle = isLowAttendance
            ? 'No data yet — this month'
            : currentPeriod.subtitle
          return (
            <div
              key={label}
              className={`rounded-xl border-2 p-5 flex flex-col gap-2 ${card}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-600">{label}</p>
                <Icon className={`w-5 h-5 ${icon_}`} />
              </div>
              <p className={`text-3xl font-bold ${count}`}>0</p>
              <p className={`text-xs font-medium ${zero}`}>{subtitle}</p>
              {isLowAttendance && (
                <p className="text-xs text-blue-400 -mt-1">30-day rolling</p>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Flags table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            Active Flags
          </h2>
        </div>

        {/* Table header — hidden on mobile */}
        <div className="hidden md:grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.5fr_1fr] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <span>Staff Member</span>
          <span>Department</span>
          <span>Flag Type</span>
          <span>Severity</span>
          <span>Date / Time</span>
          <span>Status</span>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <ShieldCheck className="w-12 h-12 text-teal-300 mb-4" />
          <p className="text-sm font-medium text-gray-600">
            No flags raised
          </p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm leading-relaxed">
            Flags will appear here automatically once shift and attendance tracking begins.
          </p>
        </div>
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

