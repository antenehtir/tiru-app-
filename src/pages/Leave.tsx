import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  CalendarOff, Plus, X, Loader2, AlertCircle,
  CheckCircle2, XCircle, Clock, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'recorded'
type LeaveType   = 'annual' | 'sick' | 'emergency' | 'maternity' | 'paternity' | 'unpaid' | 'other'

type LeaveRequest = {
  id: string
  user_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason: string | null
  status: LeaveStatus
  medical_director_note: string | null
  approver_note: string | null
  approved_by: string | null
  hr_note: string | null
  created_at: string
  requester: { full_name: string; role: string } | null
}

const LEADERSHIP = ['ceo','general_manager','super_admin']
const CAN_APPROVE = ['medical_director','super_admin','ceo','general_manager']
const CAN_RECORD  = ['hr']

const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  recorded: 'bg-blue-100 text-blue-700',
}

const LEAVE_TYPES: LeaveType[] = ['annual','sick','emergency','maternity','paternity','unpaid','other']

export default function Leave() {
  const { profile } = useAuth()
  const role = profile?.role ?? ''
  const isLeadership = LEADERSHIP.includes(role)
  const canApprove     = CAN_APPROVE.includes(role)
  const isHR         = CAN_RECORD.includes(role)
  const canSeeAll    = isLeadership || canApprove || isHR

  type TabKey = 'mine' | 'pending' | 'all'
  const defaultTab: TabKey = canApprove ? 'pending' : (canSeeAll ? 'all' : 'mine')
  const [tab, setTab] = useState<TabKey>(defaultTab)

  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [approverMap, setApproverMap] = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [modalOpen, setModalOpen] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [formErr,   setFormErr]   = useState<string | null>(null)
  const [form, setForm] = useState({
    leave_type: 'annual' as LeaveType,
    start_date: '', end_date: '', reason: '',
  })

  type ActionMode = { id: string; action: 'approve' | 'reject' | 'record' } | null
  const [actionMode,     setActionMode]     = useState<ActionMode>(null)
  const [actionNote,     setActionNote]     = useState('')
  const [actioning,      setActioning]      = useState(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true); setError(null)
    let query = supabase
      .from('leave_requests')
      .select(`*, approver_note, approved_by, requester:profiles!leave_requests_user_id_fkey(full_name, role)`)
      .order('created_at', { ascending: false })
    if (tab === 'mine')    query = query.eq('user_id', profile!.id)
    if (tab === 'pending') query = query.eq('status', 'pending')
    const { data, error: err } = await query
    if (err) { setError(err.message); setLoading(false); return }
    const rows = (data as LeaveRequest[]) ?? []
    setRequests(rows)

    // approved_by references auth.users, so PostgREST can't join profiles —
    // resolve the approver names with a separate lookup keyed by id.
    const approverIds = rows.map(r => r.approved_by).filter(Boolean) as string[]
    if (approverIds.length > 0) {
      const { data: approverProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', approverIds)
      setApproverMap(
        Object.fromEntries((approverProfiles ?? []).map(p => [p.id, p.full_name]))
      )
    }
    setLoading(false)
  }, [tab, profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchRequests() }, [fetchRequests])

  // Approvers + HR land on the Pending tab once their profile loads (async)
  useEffect(() => {
    if (!profile) return
    if (['medical_director','hr','super_admin','ceo','general_manager'].includes(profile.role ?? '')) {
      setTab('pending')
    }
  }, [profile?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitRequest = async () => {
    setFormErr(null)
    if (!form.start_date || !form.end_date) return setFormErr('Please set start and end dates.')
    if (form.start_date > form.end_date)    return setFormErr('End date must be after start date.')
    setSaving(true)
    const { error: err } = await supabase.from('leave_requests').insert({
      user_id: profile!.id, leave_type: form.leave_type,
      start_date: form.start_date, end_date: form.end_date,
      reason: form.reason || null, status: 'pending',
    })
    setSaving(false)
    if (err) { setFormErr(err.message); return }

    // Notify approvers (HR + Medical Director + CEO + GM + Super Admin) individually
    // that a new leave request needs review — not all staff (non-blocking)
    const { data: approverProfiles } = await supabase
      .from('profiles')
      .select('id, role')
      .in('role', ['hr', 'medical_director', 'ceo', 'general_manager', 'super_admin'])
    for (const approver of approverProfiles ?? []) {
      if (approver.id === profile?.id) continue // don't self-notify
      const { error: noticeErr } = await supabase.from('notices').insert({
        author_id: profile?.id,
        title: `New Leave Request: ${profile?.full_name}`,
        body: `${form.leave_type} leave requested from ${form.start_date} to ${form.end_date}. Reason: ${form.reason || 'None'}. Please review in the Leave Requests section.`,
        priority: 'info',
        audience: 'individual',
        target_user_id: approver.id,
        pinned: false,
      })
      if (noticeErr) console.error('New leave request notice error:', noticeErr)
    }

    setModalOpen(false)
    setTab('mine')
    fetchRequests()
  }

  const applyAction = async () => {
    if (!actionMode) return
    setActioning(true)
    const updates: Record<string, unknown> = {}
    if (actionMode.action === 'approve') { updates.status = 'approved'; updates.approver_note = actionNote || null; updates.approved_by = profile?.id ?? null }
    else if (actionMode.action === 'reject') { updates.status = 'rejected'; updates.approver_note = actionNote || null; updates.approved_by = profile?.id ?? null }
    else if (actionMode.action === 'record') { updates.status = 'recorded'; updates.hr_note = actionNote || null }
    const { error: err } = await supabase.from('leave_requests').update(updates).eq('id', actionMode.id)

    if (!err && (actionMode.action === 'approve' || actionMode.action === 'reject')) {
      const req = requests.find(r => r.id === actionMode.id)
      if (req) {
        const approved = actionMode.action === 'approve'
        const note = actionNote.trim()
        const { data: { user } } = await supabase.auth.getUser()
        const { error: noticeErr } = await supabase.from('notices').insert({
          author_id: user?.id ?? null,
          title: approved ? 'Leave Request Approved ✓' : 'Leave Request Not Approved',
          body: approved
            ? `Your leave request from ${req.start_date} to ${req.end_date} has been approved.`
            : `Your leave request from ${req.start_date} to ${req.end_date} was not approved.${note ? ` Reason: ${note}` : ''}`,
          priority: 'info',
          audience: 'individual',
          target_user_id: req.user_id,
          department_id: null,
          department_ids: null,
          pinned: false,
        })
        if (noticeErr) console.error('Notice error:', noticeErr)

        // Audit log — record the approver's identity (non-blocking)
        const { error: auditErr } = await supabase.from('audit_log').insert({
          facility_id: 'd917b86c-682c-4f11-b285-0a1cada2b54b',
          actor_id: profile?.id,
          actor_name: profile?.full_name,
          action: approved ? 'Leave Approved' : 'Leave Rejected',
          target_user_id: req.user_id,
          target_name: req.requester?.full_name ?? 'Staff Member',
          details: `${req.leave_type} leave · ${req.start_date} to ${req.end_date}${note ? ' · Note: ' + note : ''}`,
          created_at: new Date().toISOString(),
        })
        if (auditErr) console.error('Audit log insert failed:', auditErr)

        // Notify HR when a non-HR approver actions leave, so they can record it.
        // Send individual notices to each HR user (not the requester themselves).
        if (profile?.role !== 'hr') {
          const newStatus = approved ? 'approved' : 'rejected'
          const requesterName = req.requester?.full_name ?? 'Staff Member'
          const { data: hrUsers } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'hr')
          for (const hrUser of (hrUsers ?? []).filter(u => u.id !== req.user_id)) {
            const { error: hrNoticeErr } = await supabase.from('notices').insert({
              author_id: profile?.id,
              title: `Leave ${approved ? 'Approved' : 'Rejected'}: ${requesterName}`,
              body: `${req.leave_type} leave from ${req.start_date} to ${req.end_date} has been ${newStatus} by ${profile?.full_name}. Please record this in your HR system.`,
              priority: 'info',
              audience: 'individual',
              target_user_id: hrUser.id,
              pinned: false,
            })
            if (hrNoticeErr) console.error('HR notice error:', hrNoticeErr)
          }
        }
      }
    }

    setActioning(false)
    if (!err) { setActionMode(null); setActionNote(''); fetchRequests() }
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'mine',    label: 'My Requests',     show: true },
    { key: 'pending', label: 'Pending Approval', show: canApprove || isHR },
    { key: 'all',     label: 'All Requests',     show: canSeeAll },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarOff className="w-6 h-6 text-teal-500" />Leave Requests
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit and track leave applications</p>
        </div>
        <button
          onClick={() => { setFormErr(null); setForm({ leave_type:'annual', start_date:'', end_date:'', reason:'' }); setModalOpen(true) }}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />New Request
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading…
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />No leave requests found.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => {
            const isOpen = expanded.has(req.id)
            const isOwn  = req.user_id === profile?.id
            return (
              <div key={req.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(req.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">
                        {req.requester?.full_name ?? (isOwn ? profile?.full_name : '—')}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">{req.leave_type}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${STATUS_COLOR[req.status]}`}>{req.status}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{req.start_date} → {req.end_date}
                      &nbsp;·&nbsp;
                      {Math.max(1, Math.round((new Date(req.end_date).getTime() - new Date(req.start_date).getTime()) / 86400000) + 1)} day(s)
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                    {req.reason && <p className="text-sm text-gray-600"><span className="font-semibold">Reason:</span> {req.reason}</p>}
                    {req.approved_by && (req.status === 'approved' || req.status === 'rejected') && (
                      <p className={`text-sm font-semibold ${req.status === 'approved' ? 'text-green-700' : 'text-red-700'}`}>
                        {req.status === 'approved' ? 'Approved by:' : 'Rejected by:'} {approverMap[req.approved_by ?? ''] ?? 'Unknown'}
                      </p>
                    )}
                    {req.approver_note && <p className="text-sm text-gray-600"><span className="font-semibold">Reviewer note:</span> {req.approver_note}</p>}
                    {req.hr_note && <p className="text-sm text-gray-600"><span className="font-semibold">HR note:</span> {req.hr_note}</p>}
                    <p className="text-xs text-gray-400">Submitted: {new Date(req.created_at).toLocaleString()}</p>
                    <div className="flex gap-2 flex-wrap">
                      {canApprove && req.status === 'pending' && (
                        <>
                          <button onClick={() => setActionMode({ id: req.id, action: 'approve' })}
                            className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                            <CheckCircle2 className="w-3.5 h-3.5" />Approve
                          </button>
                          <button onClick={() => setActionMode({ id: req.id, action: 'reject' })}
                            className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                            <XCircle className="w-3.5 h-3.5" />Reject
                          </button>
                        </>
                      )}
                      {isHR && req.status === 'approved' && (
                        <button onClick={() => setActionMode({ id: req.id, action: 'record' })}
                          className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                          <FileText className="w-3.5 h-3.5" />Mark Recorded
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">New Leave Request</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4" />{formErr}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Leave Type</label>
                <select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value as LeaveType }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none capitalize">
                  {LEAVE_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Date *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">End Date *</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Reason</label>
                <textarea rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Optional…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={submitRequest} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold capitalize">{actionMode.action === 'record' ? 'Mark as Recorded' : actionMode.action}</h2>
              <button onClick={() => { setActionMode(null); setActionNote('') }} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Note (optional)</label>
              <textarea rows={3} value={actionNote} onChange={e => setActionNote(e.target.value)}
                placeholder="Add a note…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setActionMode(null); setActionNote('') }} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={applyAction} disabled={actioning}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60
                  ${actionMode.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
                  ${actionMode.action === 'reject'  ? 'bg-red-600 hover:bg-red-700' : ''}
                  ${actionMode.action === 'record'  ? 'bg-blue-600 hover:bg-blue-700' : ''}
                `}>
                {actioning && <Loader2 className="w-4 h-4 animate-spin" />}Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

