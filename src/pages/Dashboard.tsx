import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

export default function Dashboard() {
  const { profile } = useAuthStore()
  const [stats, setStats] = useState({
    staff: 0, departments: 0, shifts: 0, leave: 0
  })
  const [incidents, setIncidents] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.facility_id) return

    async function fetchData() {
      try {
        const fid = profile!.facility_id

        const { count: staff, error: e1 } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('facility_id', fid)
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

        const { data: inc, error: e5 } = await supabase
          .from('incident_reports')
          .select('id, title, severity, created_at')
          .eq('facility_id', fid)
          .order('created_at', { ascending: false })
          .limit(5)
        if (e5) { setError('Incidents: ' + e5.message); setLoading(false); return }

        setStats({
          staff: staff ?? 0,
          departments: depts ?? 0,
          shifts: shifts ?? 0,
          leave: leave ?? 0
        })
        setIncidents(inc ?? [])
        setLoading(false)
      } catch (e: any) {
        setError(e.message)
        setLoading(false)
      }
    }

    fetchData()
  }, [profile?.facility_id])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning'
    : hour < 17 ? 'Good afternoon' : 'Good evening'

  const MEDICAL_ROLES = ['physician', 'medical_director', 'surgeon', 'doctor']
  function greetingName(fullName: string | null | undefined, role: string | null | undefined): string {
    if (!fullName) return 'there'
    const parts = fullName.trim().split(/\s+/)
    if (role && MEDICAL_ROLES.includes(role)) {
      // For "Dr. Abebe Girma" → "Dr. Abebe"; for "Yonas Tadesse" → "Yonas"
      if (parts[0].toLowerCase().replace('.', '') === 'dr' && parts.length >= 2) {
        return `${parts[0]} ${parts[1]}`
      }
      return parts[0]
    }
    // Non-medical: just the first name
    return parts[0]
  }

  const severityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  }

  if (loading) return (
    <div className="p-6">
      <p className="text-gray-500 text-sm">Loading dashboard data...</p>
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
          {greeting}, {greetingName(profile?.full_name, profile?.role)}
        </h1>
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium bg-teal-50 text-teal-700 border border-teal-200 capitalize">
          {profile?.role?.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Staff', value: stats.staff },
          { label: 'Departments', value: stats.departments },
          { label: "Today's Shifts", value: stats.shifts },
          { label: 'Pending Leave', value: stats.leave },
        ].map((card) => (
          <div key={card.label}
            className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-3xl font-bold text-teal-700">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Recent Incidents
        </h2>
        {incidents.length > 0 ? (
          <ul className="space-y-3">
            {incidents.map((inc) => (
              <li key={inc.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700">{inc.title}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${severityColors[inc.severity]}`}>
                  {inc.severity}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            No incidents reported yet.
          </p>
        )}
      </div>
    </div>
  )
}
