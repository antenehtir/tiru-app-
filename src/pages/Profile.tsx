import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { User, Lock, CheckCircle2, AlertCircle, Loader2, Info } from 'lucide-react'

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

// ─── Read-only field ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
        {value || <span className="text-gray-400 italic">—</span>}
      </p>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const profile = useAuthStore(s => s.profile)

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

  // Password change
  const [currentPw, setCurrentPw] = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw,  setSavingPw]  = useState(false)
  const [pwMsg,     setPwMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const changePassword = async () => {
    setPwMsg(null)
    if (!currentPw)          return setPwMsg({ ok: false, text: 'Please enter your current password.' })
    if (newPw.length < 8)    return setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' })
    if (newPw !== confirmPw) return setPwMsg({ ok: false, text: 'Passwords do not match.' })

    setSavingPw(true)

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    profile?.email ?? '',
      password: currentPw,
    })
    if (signInErr) {
      setSavingPw(false)
      setPwMsg({ ok: false, text: 'Current password is incorrect.' })
      return
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (updateErr) {
      setPwMsg({ ok: false, text: updateErr.message })
    } else {
      setPwMsg({ ok: true, text: 'Password updated successfully.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    }
  }

  // Avatar initials
  const initials = (profile?.full_name ?? '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('')

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center
                        text-white text-xl font-bold flex-shrink-0 select-none">
          {initials || <User className="w-7 h-7" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <User className="w-4 h-4 text-teal-500" />
          <h2 className="text-base font-semibold text-gray-800">My Profile</h2>
        </div>

        <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name"    value={profile?.full_name   ?? ''} />
          <Field label="Email"        value={profile?.email       ?? ''} />
          <Field label="Employee ID"  value={profile?.employee_id ?? ''} />
          <Field label="Department"   value={deptName} />
          <Field label="Role"         value={profile?.role?.replace(/_/g, ' ') ?? ''} />
          <Field label="Phone Number" value={profile?.phone ?? ''} />
        </div>

        {/* HR note */}
        <div className="mx-5 mb-5 flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-500">
            To update your personal information, please contact HR or your system administrator.
          </p>
        </div>
      </div>

      {/* ── Change Password ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Lock className="w-4 h-4 text-teal-500" />
          <h2 className="text-base font-semibold text-gray-800">Change Password</h2>
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

          {([
            { label: 'Current Password',    value: currentPw, set: setCurrentPw },
            { label: 'New Password',         value: newPw,     set: setNewPw     },
            { label: 'Confirm New Password', value: confirmPw, set: setConfirmPw },
          ] as const).map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {label}
              </label>
              <input
                type="password"
                value={value}
                onChange={e => { set(e.target.value); setPwMsg(null) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                           bg-white focus:ring-2 focus:ring-teal-500 outline-none"
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
