import { useEffect, useState, useMemo } from 'react'
import { Phone, Search, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../lib/roles'

interface StaffMember {
  id: string
  full_name: string | null
  role: string | null
  department_id: string | null
  phone: string | null
  employee_id: string | null
}

interface Department {
  id: string
  name: string
}

export default function Staff() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [deptMap, setDeptMap] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchData() {
      const [staffRes, deptRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, role, department_id, phone, employee_id')
          .eq('is_active', true)
          .order('full_name', { ascending: true }),
        supabase
          .from('departments')
          .select('id, name'),
      ])

      if (staffRes.error) { setError(staffRes.error.message); setLoading(false); return }
      if (deptRes.error)  { setError(deptRes.error.message);  setLoading(false); return }

      const map: Record<string, string> = {}
      for (const d of (deptRes.data ?? []) as Department[]) {
        map[d.id] = d.name
      }

      setStaff(staffRes.data ?? [])
      setDeptMap(map)
      setLoading(false)
    }

    fetchData()
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return staff
    return staff.filter((s) => {
      const name = s.full_name?.toLowerCase() ?? ''
      const dept = (s.department_id ? deptMap[s.department_id] ?? '' : '').toLowerCase()
      return name.includes(q) || dept.includes(q)
    })
  }, [staff, deptMap, query])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 font-medium">Error loading staff</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    </div>
  )

  return (
    <div className="p-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-1">
        <Users size={22} className="text-teal-700" />
        <h1 className="text-2xl font-bold text-gray-900">Staff Directory</h1>
      </div>
      <p className="text-gray-500 text-sm mb-5">
        {staff.length} active staff member{staff.length !== 1 ? 's' : ''}
      </p>

      {/* ── Search ── */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or department…"
          className="w-full max-w-sm pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={36} className="text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No staff found</p>
          {query && (
            <p className="text-gray-400 text-sm mt-1">
              No results for "{query}" — try a different name or department.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filtered.map((member) => {
            const deptName = member.department_id ? deptMap[member.department_id] ?? null : null

            return (
              <div key={member.id}
                className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">

                {/* Name */}
                <p className="font-semibold text-gray-900 leading-tight truncate">
                  {member.full_name ?? '—'}
                </p>

                {/* Role badge */}
                {member.role && (
                  <span className="self-start px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-full text-xs font-medium capitalize">
                    {roleLabel(member.role)}
                  </span>
                )}

                {/* Department */}
                {deptName && (
                  <p className="text-xs text-gray-500 truncate">{deptName}</p>
                )}

                {/* Phone */}
                {member.phone ? (
                  <a href={`tel:${member.phone}`}
                    className="flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 transition-colors mt-auto">
                    <Phone size={13} />
                    {member.phone}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-gray-300 mt-auto">
                    <Phone size={13} />
                    No phone
                  </span>
                )}

                {/* Employee ID */}
                {member.employee_id && (
                  <p className="text-[11px] text-gray-400">ID: {member.employee_id}</p>
                )}

              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
