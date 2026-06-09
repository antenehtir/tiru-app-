import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { User, Lock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

// ─── Role badge colour ────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label, value, editable = false,
  type = 'text', onChange,
}: {
  label: string
  value: string
  editable?: boolean
  type?: string
  onChange?: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {editable ? (
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                     bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
        />
      ) : (
        <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50
                      rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
          {value || <span className="text-gray-400 italic">—</span>}
        </p>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const profile = useAuthStore(s => s.profile)
  const setProfile = useAuthStore(s => s.setProfile)

  // Department name lookup
  const [deptName, setDeptName] = useState<string>('')
  useEffect(() => {
    if (!profile?.department_id) return
    supabase
      .from('departments')
      .select('name')
      .eq('id', profile.department_id)
      .single()
      .then(({ data }) => { if (data?.name) setDeptName(data.name) })
  }, [profile?.department_id])

  // Phone edit
  const [phone, setPhone]           = useState(profile?.phone ?? '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneMsg, setPhoneMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  // Password change
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [savingPw,   setSavingPw]   = useState(false)
  const [pwMsg,      setPwMsg]      = useState<{ ok: boolean; text: string } | null>(null)

  const savePhone = async () => {
    setSavingPhone(true)
    setPhoneMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ phone: phone.trim() || null })
      .eq('id', profile!.id)
    setSavingPhone(false)
    if (error) {
      setPhoneMsg({ ok: false, text: error.message })
    } else {
      setProfile({ ...profile!, phone: phone.trim() || null })
      setPhoneMsg({ ok: true, text: 'Phone number updated.' })
    }
  }

  const changePassword = async () => {
    setPwMsg(null)
    if (newPw.length < 8)       return setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' })
    if (newPw !== confirmPw)     return setPwMsg({ ok: false, text: 'Passwords do not match.' })
    if (!currentPw)              return setPwMsg({ ok: false, text: 'Please enter your current password.' })

    setSavingPw(true)

    // Re-authenticate with current password first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    profile?.email ?? '',
      password: currentPw,
    })
    if (signInErr) {
      setSavingPw(false)
      setPwMsg({ ok: false, text: 'Current password is incorrect.' })
      return
    }

    // Update to new password
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (updateErr) {
      setPwMsg({ ok: false, text: updateErr.message })
    } else {
      setPwMsg({ ok: true, text: 'Password updated successfully.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    }
  }

  // Initials for avatar
  const initials = (profile?.full_name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center
                        text-white text-xl font-bold flex-shrink-0 select-none">
          {initials || <User className="w-7 h-7" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {profile?.full_name ?? 'My Profile'}
          </h1>
          {profile?.role && (
            <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-semibold capitalize
                              ${ROLE_COLOR[profile.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {profile.role.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      {/* ── My Profile ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <User className="w-4 h-4 text-teal-500" />
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">My Profile</h2>
        </div>

        <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name"   value={profile?.full_name   ?? ''} />
          <Field label="Email"       value={profile?.email       ?? ''} />
          <Field label="Employee ID" value={profile?.employee_id ?? ''} />
          <Field label="Department"  value={deptName} />

          {/* Phone — editable */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Phone Number
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setPhoneMsg(null) }}
                placeholder="+251…"
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                           bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
              />
              <button
                onClick={savePhone}
                disabled={savingPhone}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-teal-600
                           hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors"
              >
                {savingPhone && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
            {phoneMsg && (
              <p className={`flex items-center gap-1.5 text-xs mt-2 ${phoneMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {phoneMsg.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <AlertCircle  className="w-3.5 h-3.5" />}
                {phoneMsg.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Change Password ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <Lock className="w-4 h-4 text-teal-500" />
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Change Password</h2>
        </div>

        <div className="px-5 py-5 space-y-4">
          {pwMsg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${
              pwMsg.ok
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50  border-red-200  text-red-700'
            }`}>
              {pwMsg.ok
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                : <AlertCircle  className="w-4 h-4 flex-shrink-0" />}
              {pwMsg.text}
            </div>
          )}

          {[
            { label: 'Current Password',     value: currentPw, set: setCurrentPw },
            { label: 'New Password',          value: newPw,     set: setNewPw     },
            { label: 'Confirm New Password',  value: confirmPw, set: setConfirmPw },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {label}
              </label>
              <input
                type="password"
                value={value}
                onChange={e => { set(e.target.value); setPwMsg(null) }}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                           bg-white dark:bg-gray-800 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          ))}

          <p className="text-xs text-gray-400">Minimum 8 characters.</p>

          <button
            onClick={changePassword}
            disabled={savingPw}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600
                       hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors"
          >
            {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
            {savingPw ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>

    </div>
  )
}
