import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { MapPin, Activity, ChevronRight, AlertTriangle, ShieldAlert, CalendarOff } from 'lucide-react'
import NewIncidentModal from '../components/NewIncidentModal'

const LEADERSHIP_ROLES = ['super_admin', 'ceo', 'general_manager', 'medical_director', 'hr']
const ADMIN_OVERVIEW_ROLES = ['super_admin', 'ceo', 'general_manager']
const INCIDENTS_CARD_ROLES = ['physician', 'nurse', 'pharmacist', 'staff', 'department_head', 'coordinator', 'hr', 'medical_director']

export default function Dashboard() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const role = profile?.role ?? ''
  const isLeadership = LEADERSHIP_ROLES.includes(role)
  const showAdminOverview = ADMIN_OVERVIEW_ROLES.includes(role)
  const showIncidentsCard = INCIDENTS_CARD_ROLES.includes(role)

  const [stats, setStats] = useState({
    staff: 0, departments: 0, shifts: 0, leave: 0
  })
  const [sitesCount, setSitesCount] = useState(0)
  const [activeIncidentCount, setActiveIncidentCount] = useState(0)
  const [myIncidents, setMyIncidents] = useState<any[]>([])
  const [incidentModalOpen, setIncidentModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [liveStats, setLiveStats] = useState<{
    present: number; expected: number; late: number; total: number
  } | null>(null)
  const [flagStats, setFlagStats] = useState<{
    noShows: number; lateArrivals: number; geofence: number
  } | null>(null)
  const [pendingLeaveCount, setPendingLeaveCount] = useState<number | null>(null)

  const fetchLive = useCallback(async () => {
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
    const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999)

    const { data: shifts } = await supabase
      .from('shifts')
      .select('id, starts_at, ends_at, user_id')
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString())

    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('user_id, log_type, scanned_at')
      .gte('scanned_at', todayStart.toISOString())

    const logMap = new Map<string, string>()
    ;(logs ?? []).forEach((l: any) => logMap.set(l.user_id, l.log_type))

    let present = 0, expected = 0, late = 0
    const nowMs = now.getTime()

    ;(shifts ?? []).forEach((s: any) => {
      const start = new Date(s.starts_at).getTime()
      const end = new Date(s.ends_at).getTime()
      if (nowMs > end) return
      const lastLog = logMap.get(s.user_id)
      if (lastLog === 'check_in') { present++; return }
      if (lastLog === 'check_out') return
      const minsLate = (nowMs - start) / 60000
      if (minsLate > 30) late++
      else if (minsLate > -30) expected++
    })

    setLiveStats({ present, expected, late, total: present + expected + late })
  }, [])

  const fetchFlags = useCallback(async () => {
    if (!isLeadership) return
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
    const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999)

    const { data: shifts } = await supabase
      .from('shifts')
      .select('id, starts_at, ends_at, user_id')
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString())

    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('user_id, log_type, scanned_at, within_geofence')
      .gte('scanned_at', todayStart.toISOString())

    const logMap = new Map<string, any>()
    ;(logs ?? []).forEach((l: any) => logMap.set(l.user_id, l))

    let noShows = 0, lateArrivals = 0, geofence = 0
    const nowMs = now.getTime()

    ;(shifts ?? []).forEach((s: any) => {
      const start = new Date(s.starts_at).getTime()
      if (nowMs < start) return
      const log = logMap.get(s.user_id)
      const minsAfterStart = (nowMs - start) / 60000
      if (!log) {
        if (minsAfterStart > 120) noShows++
        return
      }
      if (log.log_type === 'check_in' || log.log_type === 'clock_in') {
        const clockInMs = new Date(log.scanned_at).getTime()
        const minsLate = (clockInMs - start) / 60000
        if (minsLate > 15) lateArrivals++
        if (log.within_geofence === false) geofence++
      }
    })

    setFlagStats({ noShows, lateArrivals, geofence })
  }, [isLeadership])

  const fetchMyIncidents = useCallback(async () => {
    if (!showIncidentsCard || !profile?.id) return
    const { data: myInc } = await supabase
      .from('incident_reports')
      .select('id, title, severity, status, created_at')
      .eq('reporter_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(3)
    setMyIncidents(myInc ?? [])
  }, [showIncidentsCard, profile?.id])

  const fetchPendingLeave = useCallback(async () => {
    if (role !== 'medical_director' && role !== 'hr') return
    const statusToCheck = role === 'medical_director' ? 'pending' : 'approved'
    const { count } = await supabase
      .from('leave_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', statusToCheck)
    setPendingLeaveCount(count ?? 0)
  }, [role])

  useEffect(() => {
    if (!profile?.id) return

    async function fetchData() {
      try {
        const fid = profile!.facility_id

        const { count: staff, error: e1 } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
        if (e1) { setError('Staff: ' + e1.message); setLoading(false); return }

        const { count: depts, error: e2 } = await supabase
          .from('departments')
          .select('*', { count: 'exact', head: true })
        if (e2) { setError('Depts: ' + e2.message); setLoading(false); return }

        const today = new Date().toISOString().split('T')[0]
        const { count: shifts, error: e3 } = await supabase
          .from('shifts')
          .select('*', { count: 'exact', head: true })
          .eq('facility_id', fid)
          .gte('starts_at', today + 'T00:00:00')
          .lte('starts_at', today + 'T23:59:59')
        if (e3) { setError('Shifts: ' + e3.message); setLoading(false); return }

        const { count: leave, error: e4 } = await supabase
          .from('leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('facility_id', fid)
          .eq('status', 'pending')
        if (e4) { setError('Leave: ' + e4.message); setLoading(false); return }

        const { count: sites, error: e5 } = await supabase
          .from('sites')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
        if (e5) { setError('Sites: ' + e5.message); setLoading(false); return }

        if (showAdminOverview) {
          const { count: activeInc, error: e7 } = await supabase
            .from('incident_reports')
            .select('*', { count: 'exact', head: true })
            .in('status', ['submitted', 'under_review'])
          if (e7) { setError('Incidents: ' + e7.message); setLoading(false); return }
          setActiveIncidentCount(activeInc ?? 0)
        } else if (showIncidentsCard) {
          await fetchMyIncidents()
        }

        setStats({
          staff: staff ?? 0,
          departments: depts ?? 0,
          shifts: shifts ?? 0,
          leave: leave ?? 0
        })
        setSitesCount(sites ?? 0)

        setLoading(false)
      } catch (e: any) {
        setError(e.message)
        setLoading(false)
      }
    }

    fetchData()
    fetchLive()
    fetchFlags()
    fetchPendingLeave()
    const interval = setInterval(() => { fetchLive(); fetchFlags(); fetchPendingLeave() }, 120000)
    return () => clearInterval(interval)
  }, [profile?.id, isLeadership, showAdminOverview, showIncidentsCard, fetchLive, fetchMyIncidents, fetchPendingLeave])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning'
    : hour < 17 ? 'Good afternoon' : 'Good evening'

  function greetingName(fullName: string | null | undefined): string {
    if (!fullName) return 'there'
    const parts = fullName.trim().split(/\s+/)
    if (parts[0] === 'Dr.' && parts.length >= 2) return `Dr. ${parts[1]}`
    return parts[0]
  }

  const severityColors: Record<string, string> = {
    low: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    submitted:    { label: 'Open',         color: 'bg-blue-100 text-blue-700' },
    under_review: { label: 'Under Review', color: 'bg-yellow-100 text-yellow-700' },
    resolved:     { label: 'Resolved',      color: 'bg-green-100 text-green-700' },
    dismissed:    { label: 'Dismissed',     color: 'bg-gray-100 text-gray-500' },
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-2xl bg-teal-600 animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white text-lg font-bold tracking-tight z-10">Tiru</span>
        </div>
        <div className="absolute -inset-1 rounded-2xl border-2 border-teal-400 animate-ping opacity-30" />
      </div>
      <p className="text-sm text-gray-400 animate-pulse">Loading...</p>
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 font-medium">Query error:</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {greetingName(profile?.full_name)}
        </h1>
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium bg-teal-50 text-teal-700 border border-teal-200 capitalize">
          {profile?.role?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2 md:gap-4 mb-3 md:mb-8">
        {[
          { label: 'Total Staff', value: stats.staff },
          { label: 'Departments', value: stats.departments },
          { label: "Today's Shifts", value: stats.shifts },
          { label: 'Pending Leave', value: stats.leave },
          { label: 'Active Sites', value: sitesCount, icon: <MapPin className="w-4 h-4 text-teal-500 md:mb-1" /> },
        ].map((card) => {
          const hasIcon = 'icon' in card
          return (
            <div key={card.label}
              className={hasIcon
                ? 'col-span-2 md:col-span-1 bg-white border border-gray-200 rounded-lg flex flex-row md:flex-col items-center md:items-start gap-3 md:gap-0 p-3 md:p-4'
                : 'bg-white border border-gray-200 rounded-lg p-3 md:p-4'}>
              {hasIcon && card.icon}
              <p className="text-2xl md:text-3xl font-bold text-teal-700">{card.value}</p>
              <p className="text-xs md:text-sm text-gray-500 md:mt-1">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* ── Live Now Strip ── */}
      {liveStats !== null && (
        <button
          onClick={() => navigate('/onduty')}
          className="w-full mb-3 md:mb-8 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-4 text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-teal-600" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-teal-500 rounded-full border-2 border-white animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-teal-700 transition-colors">
                  Who's On Duty Now
                </p>
                <p className="text-xs text-gray-400">Live · updates every 2 min</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
            {liveStats.present > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />{liveStats.present} Present
              </span>
            )}
            {liveStats.expected > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{liveStats.expected} Expected
              </span>
            )}
            {liveStats.late > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{liveStats.late} Late
              </span>
            )}
            {liveStats.total === 0 && (
              <span className="text-xs text-gray-400">No shifts scheduled yet today</span>
            )}
          </div>
        </button>
      )}

      {/* ── Flags & Alerts Strip (leadership only) ── */}
      {isLeadership && flagStats !== null && (
        <button
          onClick={() => navigate('/flags')}
          className="w-full mb-3 md:mb-8 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-4 text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  flagStats.noShows > 0 ? 'bg-red-50' : 'bg-green-50'
                }`}>
                  <AlertTriangle className={`w-5 h-5 ${
                    flagStats.noShows > 0 ? 'text-red-500' : 'text-green-500'
                  }`} />
                </div>
                {(flagStats.noShows > 0 || flagStats.lateArrivals > 0) && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
                  Flags & Alerts
                </p>
                <p className="text-xs text-gray-400">Today's attendance alerts</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-red-400 transition-colors" />
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            {flagStats.noShows === 0 && flagStats.lateArrivals === 0 && flagStats.geofence === 0 ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />All clear today
              </span>
            ) : (
              <>
                {flagStats.noShows > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{flagStats.noShows} No Show{flagStats.noShows > 1 ? 's' : ''}
                  </span>
                )}
                {flagStats.lateArrivals > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />{flagStats.lateArrivals} Late
                  </span>
                )}
                {flagStats.geofence > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{flagStats.geofence} Off-site
                  </span>
                )}
              </>
            )}
          </div>
        </button>
      )}

      {/* ── Pending Leave Requests Strip (medical_director + hr only) ── */}
      {(role === 'medical_director' || role === 'hr') && pendingLeaveCount !== null && (
        <button
          onClick={() => navigate('/leave')}
          className="w-full mb-3 md:mb-8 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-4 text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                <CalendarOff className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-teal-700 transition-colors">
                  Pending Leave Requests
                </p>
                <p className={`text-xs mt-0.5 ${pendingLeaveCount === 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                  {pendingLeaveCount === 0 ? 'All caught up ✓' : `${pendingLeaveCount} awaiting your review`}
                </p>
              </div>
            </div>
            {pendingLeaveCount > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
            )}
          </div>
        </button>
      )}

      {showAdminOverview ? (
        <button
          onClick={() => navigate('/incidents')}
          className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-teal-300 hover:shadow-sm transition-all">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Active Incidents</h2>
          <p className="text-3xl font-bold text-orange-600">{activeIncidentCount}</p>
          <p className="text-sm text-gray-400 mt-1">Submitted or under review — click to manage</p>
        </button>
      ) : showIncidentsCard ? (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-teal-600" />
            <h2 className="font-bold text-gray-900">Incidents</h2>
          </div>

          <button
            onClick={() => setIncidentModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors">
            <AlertTriangle className="w-4 h-4" />
            Report an Incident
          </button>

          <div className="border-t border-gray-100 mt-4 pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">My Recent Reports</p>
            {myIncidents.length > 0 ? (
              <ul className="space-y-1">
                {myIncidents.map((inc) => {
                  const stat = statusConfig[inc.status] ?? { label: inc.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <li key={inc.id}
                      onClick={() => navigate('/incidents')}
                      className="flex items-start justify-between gap-3 py-2 px-1 -mx-1 rounded-lg border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{inc.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(inc.created_at)}</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${severityColors[inc.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {inc.severity}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stat.color}`}>
                          {stat.label}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No reports submitted yet</p>
            )}
            <button onClick={() => navigate('/incidents')}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium mt-2">
              View all reports →
            </button>
          </div>

          <NewIncidentModal
            open={incidentModalOpen}
            onClose={() => setIncidentModalOpen(false)}
            reporterId={profile!.id}
            onSubmitted={fetchMyIncidents}
          />
        </div>
      ) : null}
    </div>
  )
}
