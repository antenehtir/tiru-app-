import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  Bell, Plus, X, Loader2, AlertCircle,
  Pin, CheckCheck, Megaphone, Info, AlertTriangle, Siren,
} from 'lucide-react'

type NoticePriority = 'info' | 'important' | 'urgent'
type NoticeAudience = 'all' | 'clinical' | 'administrative' | 'department' | 'individual'

type Notice = {
  id: string
  author_id: string
  title: string
  body: string
  priority: NoticePriority
  audience: NoticeAudience
  target_user_id: string | null
  department_id: string | null
  department_ids: string[] | null
  pinned: boolean
  created_at: string
  author: { full_name: string; role: string } | null
  is_read?: boolean
}

type DeptOption = { id: string; name: string }

// Expanded: all leadership + hr + dept heads + coordinator can publish
const CAN_BROADCAST = [
  'super_admin','ceo','general_manager','medical_director',
  'hr','department_head','coordinator',
]

const PRIORITY_CONFIG: Record<NoticePriority, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  info:      { label:'Info',      color:'text-blue-600',  bg:'bg-blue-50 border-blue-200',     Icon: Info },
  important: { label:'Important', color:'text-amber-600', bg:'bg-amber-50 border-amber-200',   Icon: AlertTriangle },
  urgent:    { label:'Urgent',    color:'text-red-600',   bg:'bg-red-50 border-red-200',       Icon: Siren },
}

const AUDIENCE_OPTIONS: { value: NoticeAudience; label: string }[] = [
  { value:'all',            label:'All Staff' },
  { value:'clinical',       label:'Clinical Staff' },
  { value:'administrative', label:'Administrative Staff' },
  { value:'department',     label:'Specific Department(s)' },
  { value:'individual',     label:'Specific Staff Members' },
]

export default function Notices() {
  const { profile } = useAuth()
  const role = profile?.role ?? ''
  const canBroadcast = CAN_BROADCAST.includes(role)

  const [notices,       setNotices]       = useState<Notice[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [formErr,       setFormErr]       = useState<string | null>(null)
  const [departments,   setDepartments]   = useState<DeptOption[]>([])
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [staffList,      setStaffList]      = useState<{id:string; full_name:string; role:string; department:string}[]>([])
  const [selectedStaff,  setSelectedStaff]  = useState<string[]>([])
  const [staffSearch,    setStaffSearch]    = useState('')

  const [form, setForm] = useState({
    title: '', body: '', priority: 'info' as NoticePriority,
    audience: 'all' as NoticeAudience, pinned: false,
  })

  // ── Fetch notices with correct department filtering ──────────────────────
  const fetchNotices = useCallback(async () => {
    setLoading(true); setError(null)

    const { data: noticeData, error: nErr } = await supabase
      .from('notices')
      .select('*, author:profiles!notices_author_id_fkey(full_name, role)')
      .order('pinned',      { ascending: false })
      .order('created_at',  { ascending: false })

    if (nErr) { setError(nErr.message); setLoading(false); return }

    const { data: readData } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('user_id', profile!.id)

    const readSet = new Set((readData ?? []).map((r: { notice_id: string }) => r.notice_id))

    // Filter notices client-side with correct department logic
    const userDeptId = profile?.department_id ?? null

    const visible = ((noticeData as Notice[]) ?? []).filter(n => {
      // Super admin and medical_director always see every notice
      if (['super_admin', 'medical_director'].includes(role)) return true

      // Individually-targeted notice — only the recipient sees it
      if (n.audience === 'individual') return n.target_user_id === profile!.id

      // Department-targeted notice
      if (n.audience === 'department') {
        const ids = n.department_ids ?? (n.department_id ? [n.department_id] : [])
        if (ids.length === 0) return false
        return userDeptId ? ids.includes(userDeptId) : false
      }

      // Clinical staff notices
      if (n.audience === 'clinical') {
        const clinicalRoles = ['physician','nurse','pharmacist','department_head']
        return clinicalRoles.includes(role)
      }

      // Administrative notices
      if (n.audience === 'administrative') {
        const adminRoles = ['hr','coordinator','general_manager','ceo']
        return adminRoles.includes(role)
      }

      // All staff broadcast — everyone sees it
      if (n.audience === 'all') return true

      // Fallback — hide unknown types
      return false
    })

    setNotices(visible.map(n => ({ ...n, is_read: readSet.has(n.id) })))
    setLoading(false)
  }, [profile?.id, profile?.department_id, role])

  useEffect(() => { fetchNotices() }, [fetchNotices])

  useEffect(() => {
    const channel = supabase.channel('notices-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, () => fetchNotices())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchNotices])

  // ── Read receipts ────────────────────────────────────────────────────────
  const markRead = async (noticeId: string) => {
    await supabase.from('notice_reads').upsert(
      { notice_id: noticeId, user_id: profile!.id },
      { onConflict: 'notice_id,user_id', ignoreDuplicates: true }
    )
    setNotices(prev => prev.map(n => n.id === noticeId ? { ...n, is_read: true } : n))
  }

  const markAllRead = async () => {
    const unread = notices.filter(n => !n.is_read)
    if (unread.length === 0) return
    await supabase.from('notice_reads').upsert(
      unread.map(n => ({ notice_id: n.id, user_id: profile!.id })),
      { onConflict: 'notice_id,user_id', ignoreDuplicates: true }
    )
    setNotices(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  const openModal = async () => {
    setFormErr(null)
    setSelectedDepts([])
    setForm({ title:'', body:'', priority:'info', audience:'all', pinned: false })
    if (departments.length === 0) {
      const { data } = await supabase.from('departments').select('id, name').order('name')
      setDepartments((data as DeptOption[]) ?? [])
    }
    if (staffList.length === 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role, department:departments!profiles_department_id_fkey(name)')
        .eq('facility_id', 'd917b86c-682c-4f11-b285-0a1cada2b54b')
        .eq('is_active', true)
        .neq('role', 'kiosk')
        .order('full_name')
      setStaffList(((data as any[]) ?? []).map(s => ({
        id: s.id,
        full_name: s.full_name,
        role: s.role,
        department: s.department?.name ?? '—'
      })))
    }
    setSelectedStaff([])
    setStaffSearch('')
    setModalOpen(true)
  }

  const toggleDept = (id: string) => {
    setSelectedDepts(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }

  const toggleStaff = (id: string) => {
    setSelectedStaff(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const publishNotice = async () => {
    setFormErr(null)
    if (!form.title.trim()) return setFormErr('Title is required.')
    if (!form.body.trim())  return setFormErr('Message body is required.')
    if (form.audience === 'department' && selectedDepts.length === 0)
      return setFormErr('Select at least one department.')
    if (form.audience === 'individual' && selectedStaff.length === 0)
      return setFormErr('Select at least one staff member.')
    setSaving(true)

    const payload: Record<string, unknown> = {
      author_id:      profile!.id,
      title:          form.title.trim(),
      body:           form.body.trim(),
      priority:       form.priority,
      audience:       form.audience,
      pinned:         form.pinned,
      department_id:  form.audience === 'department' ? (selectedDepts[0] ?? null) : null,
      department_ids: form.audience === 'department' ? selectedDepts : null,
      target_user_id: null,
    }

    if (form.audience === 'individual') {
      const inserts = selectedStaff.map(userId => ({
        author_id:      profile!.id,
        title:          form.title.trim(),
        body:           form.body.trim(),
        priority:       form.priority,
        audience:       'individual' as NoticeAudience,
        pinned:         form.pinned,
        target_user_id: userId,
        department_id:  null,
        department_ids: null,
      }))
      const { error: err } = await supabase.from('notices').insert(inserts)
      setSaving(false)
      if (err) { setFormErr(err.message); return }
    } else {
      const { error: err } = await supabase.from('notices').insert(payload)
      setSaving(false)
      if (err) { setFormErr(err.message); return }
    }
    setModalOpen(false)
    fetchNotices()
  }

  const deleteNotice = async (id: string, authorId: string) => {
    if (profile!.id !== authorId && role !== 'super_admin') return
    if (!confirm('Delete this notice?')) return
    await supabase.from('notices').delete().eq('id', id)
    setNotices(prev => prev.filter(n => n.id !== id))
  }

  const unreadCount = notices.filter(n => !n.is_read).length

  // ── Audience label for notice card ───────────────────────────────────────
  const audienceLabel = (n: Notice) => {
    if (n.audience === 'individual') return 'Personal'
    if (n.audience === 'all') return 'All Staff'
    if (n.audience === 'clinical') return 'Clinical'
    if (n.audience === 'administrative') return 'Administrative'
    if (n.audience === 'department') {
      const ids = n.department_ids ?? (n.department_id ? [n.department_id] : [])
      return `${ids.length} Dept${ids.length > 1 ? 's' : ''}`
    }
    return n.audience
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-teal-500" />
            Notices
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">{unreadCount}</span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Facility broadcasts and announcements</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-600 transition-colors">
              <CheckCheck className="w-4 h-4" />Mark all read
            </button>
          )}
          {canBroadcast && (
            <button onClick={openModal}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" />New Notice
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {/* Notice list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading…
        </div>
      ) : notices.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />No notices yet.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map(notice => {
            const cfg  = PRIORITY_CONFIG[notice.priority]
            const Icon = cfg.Icon
            return (
              <div key={notice.id}
                className={`relative rounded-xl border-l-4 p-4 transition-all cursor-pointer ${
                  notice.is_read
                    ? 'bg-white border-l-transparent border border-gray-100'
                    : 'bg-teal-50 border-l-teal-500 border border-teal-100 shadow-sm'
                }`}
                onClick={() => !notice.is_read && markRead(notice.id)}>
                {!notice.is_read && (
                  <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-teal-500" />
                )}
                {notice.pinned && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                    <Pin className="w-3 h-3" />Pinned
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-sm ${notice.is_read ? 'font-medium text-gray-500' : 'font-bold text-gray-900'}`}>{notice.title}</span>
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        notice.audience === 'individual'
                          ? 'text-teal-600 bg-teal-50'
                          : 'text-gray-500 bg-gray-100'
                      }`}>
                        {audienceLabel(notice)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{notice.body}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      <span>{notice.author?.full_name ?? 'System'}</span>
                      <span>·</span>
                      <span>{new Date(notice.created_at).toLocaleString()}</span>
                      {notice.audience !== 'individual' && (profile!.id === notice.author_id || role === 'super_admin') && (
                        <>
                          <span>·</span>
                          <button
                            onClick={e => { e.stopPropagation(); deleteNotice(notice.id, notice.author_id) }}
                            className="text-red-400 hover:text-red-600 transition-colors">
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New Notice Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">New Notice</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4" />{formErr}
                </div>
              )}
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Notice subject…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              {/* Priority + Audience */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as NoticePriority }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none">
                    <option value="info">Info</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Audience</label>
                  <select value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value as NoticeAudience }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none">
                    {AUDIENCE_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
              {/* Multi-department selector */}
              {form.audience === 'department' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Departments * <span className="normal-case font-normal text-gray-400">(select one or more)</span>
                  </label>
                  <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {departments.map(d => (
                      <label key={d.id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors text-sm ${
                          selectedDepts.includes(d.id) ? 'bg-teal-50' : 'hover:bg-gray-50'
                        }`}>
                        <input
                          type="checkbox"
                          checked={selectedDepts.includes(d.id)}
                          onChange={() => toggleDept(d.id)}
                          className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className={selectedDepts.includes(d.id) ? 'font-medium text-teal-700' : 'text-gray-700'}>
                          {d.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedDepts.length > 0 && (
                    <p className="text-xs text-teal-600 mt-1.5 font-medium">
                      {selectedDepts.length} department{selectedDepts.length > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}
              {form.audience === 'individual' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Staff Members * <span className="normal-case font-normal text-gray-400">(select one or more)</span>
                  </label>
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                    placeholder="Search by name or department..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none mb-2"
                  />
                  <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {staffList
                      .filter(s =>
                        s.full_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
                        s.department.toLowerCase().includes(staffSearch.toLowerCase()) ||
                        s.role.toLowerCase().includes(staffSearch.toLowerCase())
                      )
                      .map(s => (
                        <label key={s.id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors text-sm ${
                            selectedStaff.includes(s.id) ? 'bg-teal-50' : 'hover:bg-gray-50'
                          }`}>
                          <input
                            type="checkbox"
                            checked={selectedStaff.includes(s.id)}
                            onChange={() => toggleStaff(s.id)}
                            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${selectedStaff.includes(s.id) ? 'text-teal-700' : 'text-gray-700'}`}>
                              {s.full_name}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{s.role.replace(/_/g, ' ')} · {s.department}</p>
                          </div>
                        </label>
                      ))}
                  </div>
                  {selectedStaff.length > 0 && (
                    <p className="text-xs text-teal-600 mt-1.5 font-medium">
                      {selectedStaff.length} staff member{selectedStaff.length > 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}
              {/* Message */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Message *</label>
                <textarea rows={5} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Write your notice here…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
              </div>
              {/* Pin toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setForm(f => ({ ...f, pinned: !f.pinned }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${form.pinned ? 'bg-teal-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.pinned ? 'translate-x-5' : ''}`} />
                </div>
                <span className="text-sm text-gray-700 flex items-center gap-1">
                  <Pin className="w-3.5 h-3.5" />Pin to top
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={publishNotice} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Publishing…' : 'Publish Notice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
