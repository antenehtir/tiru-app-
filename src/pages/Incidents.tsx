import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  ShieldAlert, Plus, X, Loader2, AlertCircle,
  ChevronDown, ChevronUp, Clock, CheckCircle2, Eye, Filter,
} from 'lucide-react'
import NewIncidentModal from '../components/NewIncidentModal'

type Severity         = 'low' | 'medium' | 'high' | 'critical'
type IncidentStatus   = 'submitted' | 'under_review' | 'resolved' | 'dismissed'
type IncidentCategory = 'patient_safety'|'medication_error'|'equipment_failure'|'staff_conduct'|'security'|'facility'|'other'

type IncidentReport = {
  id: string
  reporter_id: string
  title: string
  description: string
  severity: Severity
  category: IncidentCategory
  status: IncidentStatus
  location: string | null
  occurred_at: string | null
  resolution_note: string | null
  anonymous: boolean
  created_at: string
  reporter: { full_name: string; role: string } | null
}

const CAN_VIEW_ALL = ['ceo','general_manager','medical_director','hr','super_admin']
const CAN_ACTION   = ['ceo','general_manager','medical_director','super_admin']

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; dot: string }> = {
  low:      { label:'Low',      color:'bg-gray-100 text-gray-600',            dot:'bg-gray-400' },
  medium:   { label:'Medium',   color:'bg-amber-100 text-amber-700',     dot:'bg-amber-400' },
  high:     { label:'High',     color:'bg-orange-100 text-orange-700', dot:'bg-orange-500' },
  critical: { label:'Critical', color:'bg-red-100 text-red-700',             dot:'bg-red-600' },
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string }> = {
  submitted:    { label:'Submitted',    color:'bg-blue-100 text-blue-700' },
  under_review: { label:'Under Review', color:'bg-purple-100 text-purple-700' },
  resolved:     { label:'Resolved',     color:'bg-green-100 text-green-700' },
  dismissed:    { label:'Dismissed',    color:'bg-gray-100 text-gray-500' },
}

const SEVERITIES: Severity[] = ['low','medium','high','critical']

export default function Incidents() {
  const { profile } = useAuth()
  const role = profile?.role ?? ''
  const isLeadership = CAN_VIEW_ALL.includes(role)
  const canAction    = CAN_ACTION.includes(role)

  type TabKey = 'mine' | 'all'
  const [tab, setTab] = useState<TabKey>(isLeadership ? 'all' : 'mine')

  const [reports,     setReports]     = useState<IncidentReport[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all')
  const [filterStatus,   setFilterStatus]   = useState<IncidentStatus | 'all'>('all')
  const [showFilters,    setShowFilters]     = useState(false)

  const [modalOpen, setModalOpen] = useState(false)

  type ReviewMode = { id: string; currentStatus: IncidentStatus } | null
  const [reviewMode,     setReviewMode]     = useState<ReviewMode>(null)
  const [reviewStatus,   setReviewStatus]   = useState<IncidentStatus>('under_review')
  const [resolutionNote, setResolutionNote] = useState('')
  const [reviewing,      setReviewing]      = useState(false)
  const [reviewErr,      setReviewErr]      = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true); setError(null)
    let query = supabase
      .from('incident_reports')
      .select(`*, reporter:profiles!incident_reports_reporter_id_fkey(full_name, role)`)
      .order('created_at', { ascending: false })
    if (tab === 'mine') query = query.eq('reporter_id', profile!.id)
    if (filterSeverity !== 'all') query = query.eq('severity', filterSeverity)
    if (filterStatus   !== 'all') query = query.eq('status',   filterStatus)
    const { data, error: err } = await query
    if (err) setError(err.message)
    else setReports((data as IncidentReport[]) ?? [])
    setLoading(false)
  }, [tab, profile?.id, filterSeverity, filterStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchReports() }, [fetchReports])

  const applyReview = async () => {
    if (!reviewMode) return
    setReviewErr(null)

    if (reviewStatus === 'dismissed' && !resolutionNote.trim()) {
      setReviewErr('Please provide a reason for dismissal')
      return
    }

    setReviewing(true)
    const { error: updateErr } = await supabase
      .from('incident_reports')
      .update({
        status: reviewStatus,
        resolution_note: resolutionNote.trim() || null,
      })
      .eq('id', reviewMode.id)

    if (updateErr) {
      console.error('Update error:', updateErr)
      setReviewErr(updateErr.message)
      setReviewing(false)
      return
    }

    const { data: inc } = await supabase
      .from('incident_reports')
      .select('reporter_id, title')
      .eq('id', reviewMode.id)
      .single()
    const { data: { user } } = await supabase.auth.getUser()
    const statusMessages: Record<string, { title: string; body: string; priority: string }> = {
      under_review: {
        title: 'Incident Report - Under Review',
        body: `Your incident report "${inc?.title}" is currently under review by leadership. You will be notified when a resolution is reached.`,
        priority: 'info',
      },
      resolved: {
        title: 'Incident Report - Resolved',
        body: `Your incident report "${inc?.title}" has been reviewed and marked as resolved. Thank you for helping maintain facility safety standards.`,
        priority: 'info',
      },
      dismissed: {
        title: 'Incident Report - Closed',
        body: `Your incident report "${inc?.title}" has been reviewed and closed. Please contact your department head or HR if you have questions.`,
        priority: 'important',
      },
    }
    const msg = statusMessages[reviewStatus]
    if (msg && inc?.reporter_id) {
      const { error: noticeErr } = await supabase.from('notices').insert({
        author_id: user?.id,
        title: msg.title,
        body: msg.body,
        priority: msg.priority,
        audience: 'individual',
        target_user_id: inc.reporter_id,
        pinned: false,
      })
      if (noticeErr) console.error('Notice error:', noticeErr)
    }

    setReviewing(false)
    setReviewMode(null)
    setResolutionNote('')
    setReviewErr(null)
    fetchReports()
  }

  const deleteNotice = async (id: string, reporterId: string) => {
    if (profile!.id !== reporterId && role !== 'super_admin') return
    if (!confirm('Delete this report?')) return
    await supabase.from('incident_reports').delete().eq('id', id)
    setReports(prev => prev.filter(r => r.id !== id))
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const tabs: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'mine', label: 'My Reports',  show: true },
    { key: 'all',  label: 'All Reports', show: isLeadership },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-teal-500" />Incident Reports
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Report and track facility incidents</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />Report Incident
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-1">
          {tabs.filter(t => t.show).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {isLeadership && tab === 'all' && (
          <button onClick={() => setShowFilters(f => !f)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 pb-2">
            <Filter className="w-4 h-4" />Filters
          </button>
        )}
      </div>

      {isLeadership && tab === 'all' && showFilters && (
        <div className="flex gap-3 flex-wrap">
          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value as Severity | 'all')}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
            <option value="all">All severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{SEVERITY_CONFIG[s].label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as IncidentStatus | 'all')}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_CONFIG) as IncidentStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading…
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-40" />No incident reports found.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(rep => {
            const sev    = SEVERITY_CONFIG[rep.severity]
            const stat   = STATUS_CONFIG[rep.status]
            const isOpen = expanded.has(rep.id)
            const reporter = rep.anonymous && tab === 'all' ? 'Anonymous' : (rep.reporter?.full_name ?? 'Unknown')
            return (
              <div key={rep.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleExpand(rep.id)}>
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${sev.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{rep.title}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${sev.color}`}>{sev.label}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${stat.color}`}>{stat.label}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="capitalize">{rep.category.replace('_',' ')}</span>
                      {isLeadership && <span>· {reporter}</span>}
                      <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{new Date(rep.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                    <p className="text-sm text-gray-700">{rep.description}</p>
                    {rep.location    && <p className="text-xs text-gray-500"><span className="font-semibold">Location:</span> {rep.location}</p>}
                    {rep.occurred_at && <p className="text-xs text-gray-500"><span className="font-semibold">Occurred:</span> {new Date(rep.occurred_at).toLocaleString()}</p>}
                    {rep.resolution_note && (
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                        <span className="font-semibold block mb-0.5">Resolution note:</span>{rep.resolution_note}
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {canAction && rep.status !== 'resolved' && rep.status !== 'dismissed' && (
                        <button onClick={() => { setReviewMode({ id: rep.id, currentStatus: rep.status }); setReviewStatus('under_review') }}
                          className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                          <Eye className="w-3.5 h-3.5" />Review / Update Status
                        </button>
                      )}
                      {canAction && (rep.status === 'resolved' || rep.status === 'dismissed') && (
                        <span className="flex items-center gap-1.5 text-xs text-green-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />Closed
                        </span>
                      )}
                      {(profile!.id === rep.reporter_id || role === 'super_admin') && (
                        <button onClick={() => deleteNotice(rep.id, rep.reporter_id)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors ml-auto">
                          Delete
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

      <NewIncidentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        reporterId={profile!.id}
        onSubmitted={fetchReports}
      />

      {reviewMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Update Status</h2>
              <button onClick={() => { setReviewMode(null); setResolutionNote(''); setReviewErr(null) }} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {reviewErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{reviewErr}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">New Status</label>
                <select value={reviewStatus} onChange={e => { setReviewStatus(e.target.value as IncidentStatus); setReviewErr(null) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="under_review">Under Review</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {reviewStatus === 'dismissed'
                    ? 'Reason for dismissal *'
                    : reviewStatus === 'resolved'
                    ? 'Resolution details (optional)'
                    : 'Note (optional)'}
                </label>
                <textarea rows={3} value={resolutionNote} onChange={e => setResolutionNote(e.target.value)}
                  placeholder={reviewStatus === 'dismissed' ? 'Required — explain why this report is being dismissed…' : 'Add a note or resolution detail…'}
                  className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 outline-none resize-none ${
                    reviewStatus === 'dismissed'
                      ? 'border-amber-300 focus:ring-amber-400'
                      : 'border-gray-200 focus:ring-teal-500'
                  }`} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setReviewMode(null); setResolutionNote(''); setReviewErr(null) }} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={applyReview} disabled={reviewing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {reviewing && <Loader2 className="w-4 h-4 animate-spin" />}Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

