import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  Settings, UserPlus, Building2, QrCode, X, Loader2,
  AlertCircle, CheckCircle2, Copy, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Shield,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  full_name: string
  role: string
  email: string | null
  phone: string | null
  employee_id: string | null
  is_active: boolean
  department_id: string | null
  department: { name: string } | null
}

type Department = {
  id: string
  name: string
  description: string | null
  _count?: number
}

type QRCode = {
  id: string
  label: string
  is_active: boolean
  created_at: string
}

type DeptOption = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  'physician','nurse','pharmacist','staff',
  'coordinator','department_head','hr',
  'medical_director','general_manager','ceo','super_admin',
]

const ROLE_COLOR: Record<string, string> = {
  super_admin:      'bg-purple-100 text-purple-700',
  ceo:              'bg-indigo-100 text-indigo-700',
  general_manager:  'bg-blue-100 text-blue-700',
  medical_director: 'bg-teal-100 text-teal-700',
  hr:               'bg-amber-100 text-amber-700',
  department_head:  'bg-orange-100 text-orange-700',
  coordinator:      'bg-cyan-100 text-cyan-700',
  physician:        'bg-green-100 text-green-700',
  nurse:            'bg-emerald-100 text-emerald-700',
  pharmacist:       'bg-lime-100 text-lime-700',
  staff:            'bg-gray-100 text-gray-600',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Admin() {
  const { profile: currentUser } = useAuth()
  const role = currentUser?.role ?? ''

  if (!['super_admin','ceo','general_manager'].includes(role)) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-32 text-gray-400">
        <Shield className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">Access Restricted</p>
        <p className="text-sm mt-1">Admin panel is for Super Admin, CEO and General Manager only.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-teal-500" />Admin Panel
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, departments, and QR codes</p>
      </div>

      <UsersSection />
      <DepartmentsSection />
      <QRCodesSection />
    </div>
  )
}

// ─── Users Section ────────────────────────────────────────────────────────────

function UsersSection() {
  const [users,    setUsers]    = useState<Profile[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [depts,    setDepts]    = useState<DeptOption[]>([])

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [formErr,    setFormErr]    = useState<string | null>(null)
  const [inviteForm, setInviteForm] = useState({
    full_name: '', email: '', phone: '', role: 'staff',
    department_id: '', employee_id: '',
  })

  // Edit role modal
  type EditMode = { id: string; role: string } | null
  const [editMode,  setEditMode]  = useState<EditMode>(null)
  const [newRole,   setNewRole]   = useState('')
  const [updating,  setUpdating]  = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('profiles')
      .select(`*, department:departments(name)`)
      .order('full_name')
    if (err) setError(err.message)
    else setUsers((data as Profile[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    supabase.from('departments').select('id, name').order('name')
      .then(({ data }) => setDepts((data as DeptOption[]) ?? []))
  }, [])

  const sendInvite = async () => {
    setFormErr(null)
    if (!inviteForm.full_name.trim()) return setFormErr('Full name is required.')
    if (!inviteForm.email.trim())     return setFormErr('Email is required.')

    setSaving(true)

    // Create auth user via Supabase admin invite
    const { data: authData, error: authErr } = await supabase.auth.admin.inviteUserByEmail(
      inviteForm.email.trim(),
      { data: { full_name: inviteForm.full_name.trim() } }
    )

    if (authErr) {
      // Fallback: insert profile directly (works when using service role or RLS off)
      const { error: profileErr } = await supabase.from('profiles').insert({
        full_name:     inviteForm.full_name.trim(),
        email:         inviteForm.email.trim(),
        phone:         inviteForm.phone.trim() || null,
        role:          inviteForm.role,
        department_id: inviteForm.department_id || null,
        employee_id:   inviteForm.employee_id.trim() || null,
        is_active:     true,
      })
      setSaving(false)
      if (profileErr) { setFormErr(profileErr.message); return }
    } else {
      // Update profile with extra fields
      if (authData?.user?.id) {
        await supabase.from('profiles').upsert({
          id:            authData.user.id,
          full_name:     inviteForm.full_name.trim(),
          email:         inviteForm.email.trim(),
          phone:         inviteForm.phone.trim() || null,
          role:          inviteForm.role,
          department_id: inviteForm.department_id || null,
          employee_id:   inviteForm.employee_id.trim() || null,
          is_active:     true,
        })
      }
      setSaving(false)
    }

    setInviteOpen(false)
    setInviteForm({ full_name:'', email:'', phone:'', role:'staff', department_id:'', employee_id:'' })
    fetchUsers()
  }

  const updateRole = async () => {
    if (!editMode) return
    setUpdating(true)
    const { error: err } = await supabase
      .from('profiles').update({ role: newRole }).eq('id', editMode.id)
    setUpdating(false)
    if (!err) { setEditMode(null); fetchUsers() }
  }

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('profiles').update({ is_active: !current }).eq('id', id)
    fetchUsers()
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-teal-500" />Staff Accounts
          <span className="text-sm font-normal text-gray-400">({users.length})</span>
        </h2>
        <button onClick={() => { setFormErr(null); setInviteOpen(true) }}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <UserPlus className="w-4 h-4" />Invite Staff
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-3">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const isOpen = expanded.has(u.id)
            return (
              <div key={u.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  onClick={() => toggleExpand(u.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 dark:text-white">{u.full_name}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${ROLE_COLOR[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.role.replace('_',' ')}
                      </span>
                      {!u.is_active && (
                        <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-600">Inactive</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      {u.email && <span>{u.email}</span>}
                      {u.department?.name && <span>· {u.department.name}</span>}
                      {u.employee_id && <span>· {u.employee_id}</span>}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 flex gap-2 flex-wrap">
                    <button onClick={() => { setEditMode({ id: u.id, role: u.role }); setNewRole(u.role) }}
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors">
                      Change Role
                    </button>
                    <button onClick={() => toggleActive(u.id, u.is_active)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${u.is_active ? 'bg-red-50 hover:bg-red-100 text-red-600' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}>
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold">Invite Staff Member</h2>
              <button onClick={() => setInviteOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4" />{formErr}
                </div>
              )}
              {[
                { label:'Full Name *',    key:'full_name',   type:'text',  placeholder:'Dr. Abebe Girma' },
                { label:'Email *',        key:'email',       type:'email', placeholder:'abebe@amc.et' },
                { label:'Phone',          key:'phone',       type:'tel',   placeholder:'+251...' },
                { label:'Employee ID',    key:'employee_id', type:'text',  placeholder:'AMC-002' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={(inviteForm as any)[f.key]}
                    onChange={e => setInviteForm(x => ({ ...x, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
                <select value={inviteForm.role} onChange={e => setInviteForm(x => ({ ...x, role: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none capitalize">
                  {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.replace('_',' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department</label>
                <select value={inviteForm.department_id} onChange={e => setInviteForm(x => ({ ...x, department_id: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— None —</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
              <button onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={sendInvite} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving…' : 'Add Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Change Role</h2>
              <button onClick={() => setEditMode(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">New Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none capitalize">
                {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.replace('_',' ')}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setEditMode(null)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={updateRole} disabled={updating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {updating && <Loader2 className="w-4 h-4 animate-spin" />}Update
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Departments Section ──────────────────────────────────────────────────────

function DepartmentsSection() {
  const [depts,   setDepts]   = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [formErr,   setFormErr]   = useState<string | null>(null)
  const [form, setForm] = useState({ name:'', description:'' })

  const fetchDepts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('departments')
      .select('*')
      .order('name')
    setDepts((data as Department[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchDepts() }, [fetchDepts])

  const saveDept = async () => {
    setFormErr(null)
    if (!form.name.trim()) return setFormErr('Department name is required.')
    setSaving(true)
    const { error: err } = await supabase.from('departments').insert({
      name: form.name.trim(), description: form.description.trim() || null,
    })
    setSaving(false)
    if (err) { setFormErr(err.message); return }
    setModalOpen(false); setForm({ name:'', description:'' }); fetchDepts()
  }

  const deleteDept = async (id: string) => {
    if (!confirm('Delete this department? This cannot be undone.')) return
    await supabase.from('departments').delete().eq('id', id)
    fetchDepts()
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-teal-500" />Departments
          <span className="text-sm font-normal text-gray-400">({depts.length})</span>
        </h2>
        <button onClick={() => { setFormErr(null); setForm({ name:'', description:'' }); setModalOpen(true) }}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Building2 className="w-4 h-4" />Add Department
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {depts.map(d => (
            <div key={d.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm text-gray-900 dark:text-white">{d.name}</div>
                {d.description && <div className="text-xs text-gray-400 mt-0.5">{d.description}</div>}
              </div>
              <button onClick={() => deleteDept(d.id)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Add Department</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4" />{formErr}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Cardiology"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional…"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={saveDept} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── QR Codes Section ─────────────────────────────────────────────────────────

function QRCodesSection() {
  const [qrCodes,  setQrCodes]  = useState<QRCode[]>([])
  const [loading,  setLoading]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [label,    setLabel]    = useState('')
  const [copied,   setCopied]   = useState<string | null>(null)

  const fetchQRCodes = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('entrance_qr_codes')
      .select('*')
      .order('created_at', { ascending: false })
    setQrCodes((data as QRCode[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchQRCodes() }, [fetchQRCodes])

  const generateQR = async () => {
    if (!label.trim()) return
    setGenerating(true)
    const { error: err } = await supabase.from('entrance_qr_codes').insert({
      label: label.trim(), is_active: true,
    })
    setGenerating(false)
    if (!err) { setLabel(''); fetchQRCodes() }
  }

  const toggleQR = async (id: string, current: boolean) => {
    await supabase.from('entrance_qr_codes').update({ is_active: !current }).eq('id', id)
    fetchQRCodes()
  }

  const deleteQR = async (id: string) => {
    if (!confirm('Delete this QR code?')) return
    await supabase.from('entrance_qr_codes').delete().eq('id', id)
    fetchQRCodes()
  }

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <QrCode className="w-5 h-5 text-teal-500" />Entrance QR Codes
          <span className="text-sm font-normal text-gray-400">({qrCodes.length})</span>
        </h2>
      </div>

      <div className="flex gap-2 mb-4">
        <input type="text" value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Label e.g. Main Entrance, Gate B…"
          className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
          onKeyDown={e => e.key === 'Enter' && generateQR()}
        />
        <button onClick={generateQR} disabled={generating || !label.trim()}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Generate
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Each QR code's UUID is its payload. Print the UUID as a QR code (use any QR generator) and mount it at the entrance. Staff scan it with the Attendance page.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />Loading…
        </div>
      ) : qrCodes.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No QR codes yet. Generate one above.</p>
      ) : (
        <div className="space-y-2">
          {qrCodes.map(qr => (
            <div key={qr.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900 dark:text-white">{qr.label}</span>
                  {qr.is_active
                    ? <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">Active</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Inactive</span>
                  }
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">{qr.id}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => copyId(qr.id)} title="Copy UUID"
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  {copied === qr.id
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <Copy className="w-4 h-4 text-gray-400" />
                  }
                </button>
                <button onClick={() => toggleQR(qr.id, qr.is_active)} title={qr.is_active ? 'Deactivate' : 'Activate'}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <RefreshCw className={`w-4 h-4 ${qr.is_active ? 'text-amber-500' : 'text-green-500'}`} />
                </button>
                <button onClick={() => deleteQR(qr.id)} title="Delete"
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
