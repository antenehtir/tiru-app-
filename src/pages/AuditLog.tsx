import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { ClipboardList, Loader2, Shield } from 'lucide-react'

// â”€â”€â”€ Access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ALLOWED_ROLES = ['super_admin', 'ceo']

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Tab = 'profile_changes' | 'leave' | 'incidents' | 'notices'

type Row = {
  id: string
  created_at: string
  [key: string]: any
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    approved:   'bg-green-100 text-green-700',
    rejected:   'bg-red-100   text-red-600',
    pending:    'bg-amber-100 text-amber-700',
    recorded:   'bg-blue-100  text-blue-700',
    published:  'bg-teal-100  text-teal-700',
    submitted:  'bg-gray-100  text-gray-600',
    reviewed:   'bg-indigo-100 text-indigo-700',
    resolved:   'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[value] ?? 'bg-gray-100 text-gray-600'}`}>
      {value}
    </span>
  )
}

// â”€â”€â”€ Tab content components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProfileChangesTab() {
  const [rows, setRows]     = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profile_change_requests')
      .select('*, user:profiles!profile_change_requests_user_id_fkey(full_name), reviewer:profiles!profile_change_requests_reviewed_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows((data as Row[]) ?? []); setLoading(false) })
  }, [])

  const FIELD_LABEL: Record<string, string> = {
    full_name: 'Full Name', phone: 'Phone', email: 'Email',
  }

  if (loading) return <LoadingRow />
  if (!rows.length) return <EmptyRow />

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <Th>Date / Time</Th><Th>Action</Th><Th>Staff Member</Th><Th>Details</Th><Th>Reviewed By</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
            <Td>{fmtDate(r.created_at)}</Td>
            <Td><StatusBadge value={r.status} /></Td>
            <Td>{r.user?.full_name ?? 'â€”'}</Td>
            <Td>
              <span className="font-medium">{FIELD_LABEL[r.field_name] ?? r.field_name}:</span>{' '}
              <span className="line-through text-gray-400">{r.current_value || 'â€”'}</span>
              {' â†’ '}
              <span className="text-teal-700">{r.requested_value}</span>
              {r.reason && <span className="text-gray-400 italic ml-1">"{r.reason}"</span>}
            </Td>
            <Td>{r.reviewer?.full_name ?? 'â€”'}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function LeaveActivityTab() {
  const [rows, setRows]     = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('leave_requests')
      .select('*, requester:profiles!leave_requests_user_id_fkey(full_name)')
      .in('status', ['approved', 'rejected', 'recorded'])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows((data as Row[]) ?? []); setLoading(false) })
  }, [])

  if (loading) return <LoadingRow />
  if (!rows.length) return <EmptyRow />

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <Th>Date / Time</Th><Th>Action</Th><Th>Staff Member</Th><Th>Details</Th><Th>Done By</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
            <Td>{fmtDate(r.created_at)}</Td>
            <Td><StatusBadge value={r.status} /></Td>
            <Td>{r.requester?.full_name ?? 'â€”'}</Td>
            <Td>{r.leave_type ?? r.type ?? 'â€”'}{r.start_date ? ` Â· ${r.start_date}` : ''}{r.end_date ? ` â€“ ${r.end_date}` : ''}</Td>
            <Td>â€”</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IncidentActivityTab() {
  const [rows, setRows]     = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('incident_reports')
      .select('*, reporter:profiles!incident_reports_reporter_id_fkey(full_name)')
      .not('status', 'eq', 'submitted')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows((data as Row[]) ?? []); setLoading(false) })
  }, [])

  if (loading) return <LoadingRow />
  if (!rows.length) return <EmptyRow />

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <Th>Date / Time</Th><Th>Action</Th><Th>Reporter</Th><Th>Details</Th><Th>Severity</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
            <Td>{fmtDate(r.created_at)}</Td>
            <Td><StatusBadge value={r.status} /></Td>
            <Td>{r.reporter?.full_name ?? 'â€”'}</Td>
            <Td className="max-w-xs truncate">{r.title ?? 'â€”'}</Td>
            <Td><StatusBadge value={r.severity ?? 'â€”'} /></Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function NoticeActivityTab() {
  const [rows, setRows]     = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('notices')
      .select('*, author:profiles!notices_author_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRows((data as Row[]) ?? []); setLoading(false) })
  }, [])

  if (loading) return <LoadingRow />
  if (!rows.length) return <EmptyRow />

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <Th>Date / Time</Th><Th>Action</Th><Th>Author</Th><Th>Title</Th><Th>Audience</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
            <Td>{fmtDate(r.created_at)}</Td>
            <Td><StatusBadge value="published" /></Td>
            <Td>{r.author?.full_name ?? 'â€”'}</Td>
            <Td className="max-w-xs truncate">{r.title ?? 'â€”'}</Td>
            <Td className="capitalize">{r.audience ?? 'all'}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// â”€â”€â”€ Small shared primitives â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left whitespace-nowrap">{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-gray-700 ${className}`}>{children}</td>
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
      <Loader2 className="w-5 h-5 animate-spin" />Loadingâ€¦
    </div>
  )
}

function EmptyRow() {
  return (
    <p className="text-sm text-gray-400 text-center py-10">No activity recorded yet.</p>
  )
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TABS: { value: Tab; label: string }[] = [
  { value: 'profile_changes', label: 'Profile Changes'  },
  { value: 'leave',           label: 'Leave Activity'   },
  { value: 'incidents',       label: 'Incident Activity'},
  { value: 'notices',         label: 'Notice Activity'  },
]

export default function AuditLog() {
  const profile = useAuthStore(s => s.profile)
  const role    = profile?.role ?? ''
  const [activeTab, setActiveTab] = useState<Tab>('profile_changes')

  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-32 text-gray-400">
        <Shield className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium text-gray-500">Access Restricted</p>
        <p className="text-sm mt-1">Audit Log is visible to Super Admin and CEO only.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-teal-500" />
          Audit Log
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">System activity and change history</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm w-fit flex-wrap">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={`px-4 py-1.5 font-medium transition-colors ${
              activeTab === value
                ? 'bg-teal-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {activeTab === 'profile_changes' && <ProfileChangesTab />}
        {activeTab === 'leave'           && <LeaveActivityTab />}
        {activeTab === 'incidents'       && <IncidentActivityTab />}
        {activeTab === 'notices'         && <NoticeActivityTab />}
      </div>
    </div>
  )
}

