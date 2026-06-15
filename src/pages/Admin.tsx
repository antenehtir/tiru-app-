import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  Settings, UserPlus, Building2, QrCode, X, Loader2,
  AlertCircle, CheckCircle2, Copy, RefreshCw, Trash2,
  ChevronDown, ChevronUp, Shield, MapPin, Pencil, Bell, XCircle, MessageSquare,
  Camera, PenLine,
} from 'lucide-react'

// â"€â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Site = {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  geofence_radius: number | null
  is_active: boolean
}

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
  avatar_url: string | null
  signature_url: string | null
  kiosk_id: string | null
  pin: string | null
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

type DeptOption  = { id: string; name: string }
type SiteOption  = { id: string; name: string }

type ChangeRequest = {
  id: string
  user_id: string
  field_name: string
  current_value: string | null
  requested_value: string
  reason: string | null
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
  created_at?: string
  profile?: { full_name: string; role: string } | null
}

// â"€â"€â"€ Constants â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

function FeedbackSection() {
  const [feedbacks, setFeedbacks] = useState<{id:string; name:string|null; message:string; submitted_at:string; is_read:boolean}[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('feedback')
      .select('*')
      .order('submitted_at', { ascending: false })
      .then(({ data }) => {
        setFeedbacks((data as any[]) ?? [])
        setLoading(false)
      })
  }, [])

  const markRead = async (id: string) => {
    await supabase.from('feedback').update({ is_read: true }).eq('id', id)
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f))
  }

  const unread = feedbacks.filter(f => !f.is_read).length

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-teal-500" />
          Feedback
          {unread > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">{unread}</span>
          )}
        </h2>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading...
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No feedback submitted yet.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {feedbacks.map(f => (
            <div key={f.id}
              className={`px-6 py-4 transition-colors cursor-pointer hover:bg-gray-50 ${f.is_read ? 'opacity-60' : 'bg-amber-50/40'}`}
              onClick={() => !f.is_read && markRead(f.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800">
                      {f.name ?? 'Anonymous'}
                    </span>
                    {!f.is_read && (
                      <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{f.message}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                  {new Date(f.submitted_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// â"€â"€â"€ Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-teal-500" />Admin Panel
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage users, departments, and QR codes</p>
      </div>

      {role === 'super_admin' && <SitesSection />}
      <UsersSection currentRole={role} />
      <DepartmentsSection />
      <QRCodesSection />
      <FeedbackSection />
    </div>
  )
}

// â"€â"€â"€ Sites Section â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const EMPTY_SITE_FORM = { name: '', address: '', latitude: '', longitude: '', geofence_radius: '150' }

function SitesSection() {
  const [sites,     setSites]     = useState<Site[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editSite,  setEditSite]  = useState<Site | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [formErr,   setFormErr]   = useState<string | null>(null)
  const [form,      setForm]      = useState(EMPTY_SITE_FORM)

  const fetchSites = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('sites').select('*').order('name')
    setSites((data as Site[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSites() }, [fetchSites])

  const openAdd = () => {
    setEditSite(null)
    setForm(EMPTY_SITE_FORM)
    setFormErr(null)
    setModalOpen(true)
  }

  const openEdit = (s: Site) => {
    setEditSite(s)
    setForm({
      name:            s.name,
      address:         s.address ?? '',
      latitude:        s.latitude != null ? String(s.latitude) : '',
      longitude:       s.longitude != null ? String(s.longitude) : '',
      geofence_radius: s.geofence_radius != null ? String(s.geofence_radius) : '150',
    })
    setFormErr(null)
    setModalOpen(true)
  }

  const saveSite = async () => {
    setFormErr(null)
    if (!form.name.trim())     return setFormErr('Site name is required.')
    if (!form.latitude.trim()) return setFormErr('Latitude is required.')
    if (!form.longitude.trim()) return setFormErr('Longitude is required.')
    const lat = parseFloat(form.latitude)
    const lng = parseFloat(form.longitude)
    if (isNaN(lat) || isNaN(lng)) return setFormErr('Latitude and longitude must be valid numbers.')

    setSaving(true)
    const payload = {
      name:            form.name.trim(),
      address:         form.address.trim() || null,
      latitude:        lat,
      longitude:       lng,
      geofence_radius: form.geofence_radius ? parseInt(form.geofence_radius, 10) : 150,
    }
    const { error: err } = editSite
      ? await supabase.from('sites').update(payload).eq('id', editSite.id)
      : await supabase.from('sites').insert({ ...payload, is_active: true })
    setSaving(false)
    if (err) { setFormErr(err.message); return }
    setModalOpen(false)
    fetchSites()
  }

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('sites').update({ is_active: !current }).eq('id', id)
    fetchSites()
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-teal-500" />Sites &amp; Locations
          <span className="text-sm font-normal text-gray-400">({sites.length})</span>
        </h2>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <MapPin className="w-4 h-4" />Add Site
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />Loading...
        </div>
      ) : sites.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No sites yet. Add one above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sites.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-100 px-4 py-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm text-gray-900">{s.name}</span>
                {s.is_active
                  ? <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 flex-shrink-0">Active</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 flex-shrink-0">Inactive</span>
                }
              </div>
              {s.address && <div className="text-xs text-gray-500">{s.address}</div>}
              <div className="text-xs text-gray-400 font-mono">
                {s.latitude != null && s.longitude != null
                  ? `${s.latitude}, ${s.longitude}`
                  : <span className="italic">No coordinates</span>
                }
              </div>
              <div className="text-xs text-gray-400">
                Geofence: {s.geofence_radius ?? 150} m
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => openEdit(s)}
                  className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors">
                  <Pencil className="w-3 h-3" />Edit
                </button>
                <button onClick={() => toggleActive(s.id, s.is_active)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${s.is_active ? 'bg-red-50 hover:bg-red-100 text-red-600' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}>
                  {s.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editSite ? 'Edit Site' : 'Add Site'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4" />{formErr}
                </div>
              )}
              {([
                { label: 'Site Name *',  key: 'name',      type: 'text',   placeholder: 'e.g. Main Campus' },
                { label: 'Address',      key: 'address',   type: 'text',   placeholder: 'e.g. 123 Hospital Rd' },
                { label: 'Latitude *',   key: 'latitude',  type: 'number', placeholder: 'e.g. 9.0054' },
                { label: 'Longitude *',  key: 'longitude', type: 'number', placeholder: 'e.g. 38.7636' },
              ] as { label: string; key: keyof typeof form; type: string; placeholder: string }[]).map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                  <input type={f.type} step="any" placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Geofence Radius (metres)</label>
                <input type="number" min="1" placeholder="150"
                  value={form.geofence_radius}
                  onChange={e => setForm(x => ({ ...x, geofence_radius: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <p className="text-xs text-gray-400">
                Tip: Right-click your location on Google Maps to copy coordinates.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={saveSite} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? 'Saving…' : editSite ? 'Update Site' : 'Add Site'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// â"€â"€â"€ Users Section â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function UsersSection({ currentRole }: { currentRole: string }) {
  const [users,    setUsers]    = useState<Profile[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [depts,    setDepts]    = useState<DeptOption[]>([])
  const [sites,    setSites]    = useState<SiteOption[]>([])

  // Pending change requests
  const [pendingRequests, setPendingRequests] = useState<ChangeRequest[]>([])
  const [pendingLoading,  setPendingLoading]  = useState(false)
  const [dismissedIds,    setDismissedIds]    = useState<Set<string>>(new Set())
  const pendingRef = useRef<HTMLDivElement>(null)
  const pendingCount = pendingRequests.length

  // Reject reason modal
  const [rejectModal,  setRejectModal]  = useState<{ requestId: string; userId: string; fieldName: string; staffName: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Invite modal
  const [inviteOpen,  setInviteOpen]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [formErr,     setFormErr]     = useState<string | null>(null)
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null)
  const [inviteForm,  setInviteForm]  = useState({
    full_name: '', email: '', phone: '', role: 'staff',
    department_id: '', employee_id: '', kiosk_id: '',
  })

  // Edit role modal
  type EditMode = { id: string; role: string } | null
  const [editMode,  setEditMode]  = useState<EditMode>(null)
  const [newRole,   setNewRole]   = useState('')
  const [updating,  setUpdating]  = useState(false)

  // Edit profile modal (super_admin only)
  type EditProfileTarget = Profile | null
  const [editProfileTarget, setEditProfileTarget] = useState<EditProfileTarget>(null)
  const [editProfileForm,   setEditProfileForm]   = useState({
    full_name: '', email: '', phone: '', employee_id: '',
    role: 'staff', department_id: '', site_id: '', is_active: true,
    pin: null as string | null,
  })
  const [editProfileErr,    setEditProfileErr]    = useState<string | null>(null)
  const [editProfileSaving, setEditProfileSaving] = useState(false)
  const [editProfileSuccess, setEditProfileSuccess] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingSig,   setUploadingSig]   = useState(false)
  const [photoPreview,   setPhotoPreview]   = useState<string | null>(null)
  const [sigPreview,     setSigPreview]     = useState<string | null>(null)
  const [lightbox,       setLightbox]       = useState<string | null>(null)
  const [showPinSet,     setShowPinSet]     = useState(false)
  const [newPin,         setNewPin]         = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('profiles')
      .select(`*, department:departments!profiles_department_id_fkey(name)`)
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

  useEffect(() => {
    supabase.from('sites').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setSites((data as SiteOption[]) ?? []))
  }, [])

  const fetchPendingRequests = useCallback(async () => {
    setPendingLoading(true)
    const { data } = await supabase
      .from('profile_change_requests')
      .select('*, profile:profiles!profile_change_requests_user_id_fkey(full_name, role)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setPendingRequests((data as ChangeRequest[]) ?? [])
    setDismissedIds(new Set())
    setPendingLoading(false)
  }, [])

  useEffect(() => { fetchPendingRequests() }, [fetchPendingRequests])

  const openInviteModal = async () => {
    setFormErr(null)
    setSuccessMsg(null)

    // Auto-generate next TMC-XXX employee ID (sorted desc, limit 1 = efficient)
    const { data: empData } = await supabase
      .from('profiles')
      .select('employee_id')
      .like('employee_id', 'TMC-%')
      .order('employee_id', { ascending: false })
      .limit(1)
    const lastNum = parseInt(
      ((empData?.[0] as { employee_id: string | null } | undefined)?.employee_id ?? 'TMC-008')
        .replace('TMC-', ''),
      10,
    )
    const nextId = 'TMC-' + String((isNaN(lastNum) ? 8 : lastNum) + 1).padStart(3, '0')

    // Fetch departments and prepend synthetic GP entry if not already present
    const { data: deptData } = await supabase
      .from('departments')
      .select('id, name')
      .order('name')
    const fetched = (deptData as DeptOption[]) ?? []
    const hasGP = fetched.some(d => d.name.toLowerCase().includes('general practice'))
    setDepts(hasGP ? fetched : [{ id: 'gp', name: 'General Practice (GP)' }, ...fetched])

    setInviteForm({ full_name: '', email: '', phone: '', role: 'staff', department_id: '', employee_id: nextId, kiosk_id: '' })
    setInviteOpen(true)
  }

  const sendInvite = async () => {
    setFormErr(null)
    if (!inviteForm.full_name.trim()) return setFormErr('Full name is required.')

    setSaving(true)

    // Step 1: Create auth user via signUp — the DB trigger auto-creates the profile
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email:    inviteForm.email.trim() || `kiosk.${inviteForm.employee_id.trim().toLowerCase().replace(/[^a-z0-9]/g, '')}@tiruplatform.com`,
      password: 'TiruAMC2026!' + Math.random().toString(36).slice(2),
      options:  {
        data: {
          full_name: inviteForm.full_name.trim(),
          role:      inviteForm.role,
        },
      },
    })
    console.log('SignUp result:', JSON.stringify(signUpData), 'Error:', signUpError?.message)

    if (signUpError) {
      setSaving(false)
      const msg = signUpError.message.toLowerCase()
      setFormErr(
        msg.includes('rate limit') || msg.includes('email rate')
          ? 'Email sending limit reached. Please wait 1 hour and try again, or contact Supabase support to upgrade email limits.'
          : signUpError.message
      )
      return  // modal stays open, form stays filled
    }

    // Step 2: Update the auto-created profile with remaining fields
    if (signUpData?.user?.id) {
      const gpDept = depts.find((d: DeptOption) => d.name === 'General Practice')
      const deptId = inviteForm.department_id === 'gp'
        ? (gpDept?.id ?? null)
        : (inviteForm.department_id || null)

      // Generate kiosk ID if not provided
      let resolvedKioskId = inviteForm.kiosk_id.trim() || null
      if (!resolvedKioskId) {
        const { data: kioskData } = await supabase
          .from('profiles')
          .select('kiosk_id')
          .like('kiosk_id', 'K%')
          .order('kiosk_id', { ascending: false })
          .limit(1)
        const lastNum = kioskData?.[0]?.kiosk_id
          ? parseInt(kioskData[0].kiosk_id.slice(1))
          : 0
        resolvedKioskId = `K${String(lastNum + 1).padStart(3, '0')}`
      }

      await supabase.from('profiles').update({
        full_name:     inviteForm.full_name.trim(),
        role:          inviteForm.role,
        phone:         inviteForm.phone.trim() || null,
        department_id: deptId,
        employee_id:   inviteForm.employee_id.trim() || null,
        facility_id:   'd917b86c-682c-4f11-b285-0a1cada2b54b',
        kiosk_id:      resolvedKioskId,
      }).eq('id', signUpData.user.id)
    }

    // Step 3: Send password-setup email (only for real email addresses)
    if (inviteForm.email.trim() && !inviteForm.email.includes('@tiruplatform.com')) {
      await supabase.auth.resetPasswordForEmail(inviteForm.email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
    }

    setSaving(false)
    const name = inviteForm.full_name.trim()
    const email = inviteForm.email.trim()
    setInviteOpen(false)
    setInviteForm({ full_name: '', email: '', phone: '', role: 'staff', department_id: '', employee_id: '', kiosk_id: '' })
    setSuccessMsg(`Account created for ${name}. They will receive an email to set their password.`)
    await fetchUsers()
    // Auto-open edit modal for photo/signature upload
    const { data: newUser } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single()
    if (newUser) {
      setTimeout(() => openEditProfile(newUser as Profile), 500)
    }
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

  const openEditProfile = async (u: Profile) => {
    setEditProfileErr(null)
    setEditProfileSuccess(null)
    setEditProfileTarget(u)
    setPhotoPreview(u.avatar_url ?? null)
    if (u.signature_url) {
      const { data: sigUrl } = supabase.storage
        .from('reference-signatures')
        .getPublicUrl(u.signature_url)
      setSigPreview(sigUrl.publicUrl)
    } else {
      setSigPreview(null)
    }
    setShowPinSet(false)
    setNewPin('')
    setEditProfileForm({
      full_name:     u.full_name ?? '',
      email:         u.email ?? '',
      phone:         u.phone ?? '',
      employee_id:   u.employee_id ?? '',
      role:          u.role,
      department_id: u.department_id ?? '',
      site_id:       (u as any).site_id ?? '',
      is_active:     u.is_active,
      pin:           u.pin ?? null,
    })
  }

  const saveEditProfile = async () => {
    if (!editProfileTarget) return
    setEditProfileErr(null)
    if (!editProfileForm.full_name.trim()) return setEditProfileErr('Full name is required.')
    setEditProfileSaving(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name:     editProfileForm.full_name.trim(),
        email:         editProfileForm.email.trim() || null,
        phone:         editProfileForm.phone.trim() || null,
        employee_id:   editProfileForm.employee_id.trim() || null,
        role:          editProfileForm.role,
        department_id: editProfileForm.department_id === 'gp' || !editProfileForm.department_id ? null : editProfileForm.department_id,
        site_id:       editProfileForm.site_id || null,
        is_active:     editProfileForm.is_active,
      })
      .eq('id', editProfileTarget.id)
    setEditProfileSaving(false)
    if (err) { setEditProfileErr(err.message); return }
    setEditProfileSuccess('Profile updated successfully.')
    fetchUsers()
  }

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>, userId: string) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    const ext = file.name.split('.').pop()
    const fileName = `${userId}_avatar.${ext}`
    const { data, error } = await supabase.storage
      .from('staff-avatars')
      .upload(fileName, file, { upsert: true, contentType: file.type })
    if (error) { alert('Photo upload failed: ' + error.message); setUploadingPhoto(false); return }
    const { data: urlData } = supabase.storage.from('staff-avatars').getPublicUrl(data.path)
    await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', userId)
    setPhotoPreview(urlData.publicUrl)
    setUploadingPhoto(false)
  }

  async function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>, userId: string) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingSig(true)
    const ext = file.name.split('.').pop()
    const fileName = `${userId}_ref_sig.${ext}`
    const { data, error } = await supabase.storage
      .from('reference-signatures')
      .upload(fileName, file, { upsert: true, contentType: file.type })
    if (error) { alert('Signature upload failed: ' + error.message); setUploadingSig(false); return }
    await supabase.from('profiles').update({ signature_url: data.path }).eq('id', userId)
    setSigPreview(URL.createObjectURL(file))
    setUploadingSig(false)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
          <UserPlus className="w-5 h-5 text-teal-500" />Staff Accounts
          <span className="text-sm font-normal text-gray-400">({users.length})</span>
          {pendingCount > 0 && (
            <button onClick={() => pendingRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold transition-colors bg-amber-100 hover:bg-amber-200 text-amber-700">
              <Bell className="w-3 h-3" />
              {pendingCount} Pending Request{pendingCount !== 1 ? 's' : ''}
            </button>
          )}
        </h2>
        <button onClick={openInviteModal}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <UserPlus className="w-4 h-4" />Invite Staff
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-3">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-3">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{successMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const isOpen = expanded.has(u.id)
            return (
              <div key={u.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(u.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{u.full_name}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${ROLE_COLOR[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.role.replace('_',' ')}
                      </span>
                      {!u.is_active && (
                        <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-600">Inactive</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      {u.email && !u.email.includes('@tiruplatform.com') && <span>{u.email}</span>}
                      {u.email?.includes('@tiruplatform.com') && <span>Kiosk Staff</span>}
                      {u.department?.name && <span>· {u.department.name}</span>}
                      {u.employee_id && <span>· {u.employee_id}</span>}
                      {u.kiosk_id && <span>· Kiosk: {u.kiosk_id}</span>}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 flex gap-2 flex-wrap">
                    <button onClick={() => { setEditMode({ id: u.id, role: u.role }); setNewRole(u.role) }}
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors">
                      Change Role
                    </button>
                    <button onClick={() => toggleActive(u.id, u.is_active)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${u.is_active ? 'bg-red-50 hover:bg-red-100 text-red-600' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}>
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    {currentRole === 'super_admin' && (
                      <button onClick={() => openEditProfile(u)}
                        className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1.5 rounded-lg transition-colors">
                        Edit Profile
                      </button>
                    )}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Invite Staff Member</h2>
              <button onClick={() => setInviteOpen(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4" />{formErr}
                </div>
              )}
              {[
                { label:'Full Name *',    key:'full_name',   type:'text',  placeholder:'Dr. Abebe Girma' },
                { label:'Phone',          key:'phone',       type:'tel',   placeholder:'+251...' },
                { label:'Employee ID',    key:'employee_id', type:'text',  placeholder:'TMC-002' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={(inviteForm as any)[f.key]}
                    onChange={e => setInviteForm(x => ({ ...x, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Email <span className="normal-case font-normal text-gray-400">(optional for kiosk-only staff)</span>
                </label>
                <input type="text" placeholder="abebe@tmc1.et (optional)"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(x => ({ ...x, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Kiosk ID <span className="normal-case font-normal text-gray-400">(optional — auto-assigned if blank)</span>
                </label>
                <input type="text" value={inviteForm.kiosk_id}
                  onChange={e => setInviteForm(f => ({ ...f, kiosk_id: e.target.value.toUpperCase() }))}
                  placeholder="e.g. K019"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
                <select value={inviteForm.role} onChange={e => setInviteForm(x => ({ ...x, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none capitalize">
                  {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.replace('_',' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department</label>
                <select value={inviteForm.department_id} onChange={e => setInviteForm(x => ({ ...x, department_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— None —</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Change Role</h2>
              <button onClick={() => setEditMode(null)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">New Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none capitalize">
                {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.replace('_',' ')}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEditMode(null)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={updateRole} disabled={updating}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {updating && <Loader2 className="w-4 h-4 animate-spin" />}Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editProfileTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          {lightbox && (
            <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setLightbox(null)}>
              <div className="relative max-w-2xl w-full">
                <img src={lightbox} alt="Full view" className="w-full rounded-2xl shadow-2xl" />
                <button onClick={e => { e.stopPropagation(); setLightbox(null) }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
                  <X className="w-4 h-4" />
                </button>
                <p className="text-center text-white/60 text-xs mt-2">Tap anywhere to close</p>
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Edit Profile — {editProfileTarget.full_name}</h2>
              <button onClick={() => setEditProfileTarget(null)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {editProfileErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertCircle className="w-4 h-4" />{editProfileErr}
                </div>
              )}
              {editProfileSuccess && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">
                  <CheckCircle2 className="w-4 h-4" />{editProfileSuccess}
                </div>
              )}
              {([
                { label: 'Full Name',   key: 'full_name',   type: 'text'  },
                { label: 'Email',       key: 'email',       type: 'email' },
                { label: 'Phone',       key: 'phone',       type: 'tel'   },
                { label: 'Employee ID', key: 'employee_id', type: 'text'  },
              ] as { label: string; key: keyof typeof editProfileForm; type: string }[]).map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                  <input type={f.key === 'email' ? 'text' : f.type}
                    value={f.key === 'email'
                      ? (editProfileForm.email?.includes('@tiruplatform.com') ? '' : (editProfileForm.email ?? ''))
                      : (editProfileForm[f.key] as string)}
                    placeholder={f.key === 'email' ? 'email@example.com (leave blank for kiosk-only staff)' : undefined}
                    onChange={e => setEditProfileForm(x => ({ ...x, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
                <select value={editProfileForm.role}
                  onChange={e => setEditProfileForm(x => ({ ...x, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none capitalize">
                  {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Department</label>
                <select value={editProfileForm.department_id}
                  onChange={e => setEditProfileForm(x => ({ ...x, department_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— None —</option>
                  <option value="gp">General Practice (GP)</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Site</label>
                <select value={editProfileForm.site_id}
                  onChange={e => setEditProfileForm(x => ({ ...x, site_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">— None —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</label>
                <button type="button"
                  onClick={() => setEditProfileForm(x => ({ ...x, is_active: !x.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editProfileForm.is_active ? 'bg-teal-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editProfileForm.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className={`text-sm font-medium ${editProfileForm.is_active ? 'text-green-600' : 'text-red-500'}`}>
                  {editProfileForm.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* ── Security / PIN ── */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Kiosk Security</p>
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Kiosk PIN</p>
                    <p className="text-xs text-gray-400">
                      {editProfileForm.pin ? '● ● ● ●  PIN is set' : 'No PIN set — staff cannot use kiosk'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPinSet(p => !p)}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
                    {editProfileForm.pin ? 'Change PIN' : 'Set PIN'}
                  </button>
                </div>
                {showPinSet && (
                  <div className="space-y-2">
                    <input
                      type="password"
                      maxLength={4}
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                      placeholder="Enter 4-digit PIN"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none tracking-widest text-center text-lg"
                    />
                    <button
                      onClick={async () => {
                        if (newPin.length !== 4) return
                        await supabase.from('profiles').update({ pin: newPin }).eq('id', editProfileTarget!.id)
                        setEditProfileForm((f: any) => ({ ...f, pin: newPin }))
                        setNewPin('')
                        setShowPinSet(false)
                      }}
                      disabled={newPin.length !== 4}
                      className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                      Save PIN
                    </button>
                  </div>
                )}
              </div>

              {/* ── Photo & Signature Upload ── */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Identity Verification Assets</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Profile Photo</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover cursor-pointer" onClick={() => setLightbox(photoPreview)} />
                      ) : (
                        <span className="text-gray-400 text-xs text-center">No photo</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm ${uploadingPhoto ? 'border-gray-200 text-gray-300' : 'border-teal-300 text-teal-600 hover:bg-teal-50'}`}>
                        {uploadingPhoto ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
                        ) : (
                          <><Camera className="w-4 h-4" />Upload Photo</>
                        )}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                          onChange={e => handlePhotoUpload(e, editProfileTarget!.id)}
                          disabled={uploadingPhoto} />
                      </label>
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG or WebP. Max 2MB.</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Reference Signature</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {sigPreview ? (
                        <img src={sigPreview} alt="Signature" className="w-full h-full object-contain p-1 cursor-pointer" onClick={() => setLightbox(sigPreview)} />
                      ) : (
                        <span className="text-gray-400 text-xs text-center">No sig</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm ${uploadingSig ? 'border-gray-200 text-gray-300' : 'border-amber-300 text-amber-600 hover:bg-amber-50'}`}>
                        {uploadingSig ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
                        ) : (
                          <><PenLine className="w-4 h-4" />Upload Signature</>
                        )}
                        <input type="file" accept="image/jpeg,image/png" className="hidden"
                          onChange={e => handleSignatureUpload(e, editProfileTarget!.id)}
                          disabled={uploadingSig} />
                      </label>
                      <p className="text-xs text-gray-400 mt-1">JPG or PNG. Max 1MB.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setEditProfileTarget(null)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Close</button>
              <button onClick={saveEditProfile} disabled={editProfileSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                {editProfileSaving && <Loader2 className="w-4 h-4 animate-spin" />}{editProfileSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Change Requests Panel */}
      {pendingCount > 0 && (
        <div ref={pendingRef} className="mt-6 border-l-4 border-amber-400 bg-amber-50 rounded-r-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200">
            <Bell className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">
              Pending Profile Change Requests
            </h3>
          </div>
          {pendingLoading ? (
            <div className="flex items-center gap-2 text-gray-400 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />Loading...
            </div>
          ) : (
            <div className="divide-y divide-amber-100">
              {pendingRequests.map(req => {
                const isDismissed = dismissedIds.has(req.id)
                const initials = (req.profile?.full_name ?? '?')
                  .split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join('')
                const FIELD_LABEL: Record<string, string> = {
                  full_name: 'Full Name', phone: 'Phone Number', email: 'Email Address',
                }
                const fieldLabel = FIELD_LABEL[req.field_name]
                  ?? req.field_name.charAt(0).toUpperCase() + req.field_name.slice(1)
                return (
                  <div key={req.id}
                    className={`px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4 transition-all duration-300 ${isDismissed ? 'opacity-0 max-h-0 py-0 overflow-hidden' : 'opacity-100'}`}>
                    {/* Initials circle */}
                    <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
                      {initials}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">
                          {req.profile?.full_name ?? '—'}
                        </span>
                        {req.profile?.role && (
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${ROLE_COLOR[req.profile.role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {req.profile.role.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600">
                        <span className="font-semibold">{fieldLabel}:</span>{' '}
                        <span className="line-through text-gray-400">{req.current_value || '—'}</span>
                        <span className="mx-1 text-gray-400">â†'</span>
                        <span className="text-teal-700 font-medium">{req.requested_value}</span>
                      </p>
                      {req.reason && (
                        <p className="text-xs text-gray-400 italic">"{req.reason}"</p>
                      )}
                      <p className="text-xs text-gray-400">
                        Submitted {new Date(req.created_at ?? '').toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </p>
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-2 flex-shrink-0 sm:mt-0.5">
                      <button
                        onClick={async () => {
                          const { data: { user } } = await supabase.auth.getUser()
                          const currentUserId = user?.id ?? null
                          const staffName = req.profile?.full_name ?? 'Staff member'
                          const { error: noticeError } = await supabase.from('notices').insert({
                            author_id: currentUserId,
                            title: 'âœ" Your Profile Update was Approved',
                            body: `Hi ${staffName}, your request to update your ${fieldLabel} has been approved and applied to your profile. The change is now reflected in your account.`,
                            priority: 'info',
                            audience: 'all',
                            audience_type: 'personal',
                            target_user_id: req.user_id,
                            pinned: false,
                          })
                          if (noticeError) console.error('Notice error:', noticeError)
                          await supabase.from('profiles')
                            .update({ [req.field_name]: req.requested_value })
                            .eq('id', req.user_id)
                          await supabase.from('profile_change_requests')
                            .update({ status: 'approved', reviewed_by: currentUserId, reviewed_at: new Date().toISOString() })
                            .eq('id', req.id)
                          setDismissedIds(prev => new Set([...prev, req.id]))
                          setTimeout(() => { fetchPendingRequests(); fetchUsers() }, 350)
                        }}
                        className="flex items-center gap-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg transition-colors font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />Approve
                      </button>
                      <button
                        onClick={() => {
                          setRejectReason('')
                          setRejectModal({ requestId: req.id, userId: req.user_id, fieldName: req.field_name, staffName: req.profile?.full_name ?? 'Staff member' })
                        }}
                        className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors font-medium">
                        <XCircle className="w-3.5 h-3.5" />Reject
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Reject Change Request</h2>
              <button onClick={() => setRejectModal(null)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Reason for rejection (optional)
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Enter reason to share with staff member..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-red-400 outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                onClick={async () => {
                  const { requestId, fieldName, staffName } = rejectModal
                  const FIELD_LABEL: Record<string, string> = {
                    full_name: 'Full Name', phone: 'Phone Number', email: 'Email Address',
                  }
                  const fLabel = FIELD_LABEL[fieldName] ?? fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
                  const { data: { user } } = await supabase.auth.getUser()
                  const currentUserId = user?.id ?? null
                  await supabase.from('profile_change_requests')
                    .update({ status: 'rejected', reviewed_by: currentUserId, reviewed_at: new Date().toISOString() })
                    .eq('id', requestId)
                  const body = rejectReason.trim()
                    ? `Hi ${staffName}, your request to update your ${fLabel} was not approved. Reason: ${rejectReason.trim()}. Please contact HR for more information.`
                    : `Hi ${staffName}, your request to update your ${fLabel} was not approved. Please contact HR or your administrator for more information.`
                  await supabase.from('notices').insert({
                    author_id: currentUserId,
                    title: `Your Profile Update Request — ${fLabel}`,
                    body,
                    priority: 'important',
                    audience: 'all',
                    audience_type: 'personal',
                    target_user_id: rejectModal.userId,
                    pinned: false,
                  })
                  setRejectModal(null)
                  setDismissedIds(prev => new Set([...prev, requestId]))
                  setTimeout(() => { fetchPendingRequests() }, 350)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                <XCircle className="w-4 h-4" />Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// â"€â"€â"€ Departments Section â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
      facility_id: 'd917b86c-682c-4f11-b285-0a1cada2b54b',
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
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
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
          <Loader2 className="w-5 h-5 animate-spin" />Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {depts.map(d => (
            <div key={d.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm text-gray-900">{d.name}</div>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Add Department</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
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

// â"€â"€â"€ QR Codes Section â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <QrCode className="w-5 h-5 text-teal-500" />Entrance QR Codes
          <span className="text-sm font-normal text-gray-400">({qrCodes.length})</span>
        </h2>
      </div>

      <div className="flex gap-2 mb-4">
        <input type="text" value={label} onChange={e => setLabel(e.target.value)}
          placeholder="Label e.g. Main Entrance, Gate B…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
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
          <Loader2 className="w-5 h-5 animate-spin" />Loading...
        </div>
      ) : qrCodes.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No QR codes yet. Generate one above.</p>
      ) : (
        <div className="space-y-2">
          {qrCodes.map(qr => (
            <div key={qr.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">{qr.label}</span>
                  {qr.is_active
                    ? <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">Active</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Inactive</span>
                  }
                </div>
                <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">{qr.id}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => copyId(qr.id)} title="Copy UUID"
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  {copied === qr.id
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <Copy className="w-4 h-4 text-gray-400" />
                  }
                </button>
                <button onClick={() => toggleQR(qr.id, qr.is_active)} title={qr.is_active ? 'Deactivate' : 'Activate'}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <RefreshCw className={`w-4 h-4 ${qr.is_active ? 'text-amber-500' : 'text-green-500'}`} />
                </button>
                <button onClick={() => deleteQR(qr.id)} title="Delete"
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
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

