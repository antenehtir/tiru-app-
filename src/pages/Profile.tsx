import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../lib/roles'
import { useAuthStore } from '../store/authStore'
import { User, Lock, CheckCircle2, AlertCircle, Loader2, Info, FileEdit, Shield } from 'lucide-react'

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

  // Kiosk PIN change
  const [currentPin,  setCurrentPin]  = useState('')
  const [newKioskPin, setNewKioskPin] = useState('')
  const [confirmPin,  setConfirmPin]  = useState('')
  const [savingPin,   setSavingPin]   = useState(false)
  const [pinMsg,      setPinMsg]      = useState<{ ok: boolean; text: string } | null>(null)
  const [forgotPinMode,    setForgotPinMode]    = useState(false)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryVerified, setRecoveryVerified] = useState(false)
  const [verifyingPw,      setVerifyingPw]      = useState(false)

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

  const changePin = async () => {
    setPinMsg(null)
    if (currentPin !== profile?.pin) {
      setPinMsg({ ok: false, text: 'Current PIN is incorrect.' }); return
    }
    if (newKioskPin.length !== 4) {
      setPinMsg({ ok: false, text: 'New PIN must be exactly 4 digits.' }); return
    }
    if (newKioskPin !== confirmPin) {
      setPinMsg({ ok: false, text: 'PINs do not match.' }); return
    }
    setSavingPin(true)
    const { error } = await supabase
      .from('profiles')
      .update({ pin: newKioskPin })
      .eq('id', profile!.id)
    setSavingPin(false)
    if (error) { setPinMsg({ ok: false, text: error.message }); return }
    setPinMsg({ ok: true, text: 'Kiosk PIN updated successfully.' })
    setCurrentPin(''); setNewKioskPin(''); setConfirmPin('')
  }

  const verifyPasswordForPinReset = async () => {
    setVerifyingPw(true)
    setPinMsg(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.auth.signInWithPassword({
      email: user?.email ?? profile!.email!,
      password: recoveryPassword,
    })
    setVerifyingPw(false)
    if (error) {
      setPinMsg({ ok: false, text: 'Incorrect password. Please try again.' })
      return
    }
    setRecoveryVerified(true)
    setRecoveryPassword('')
    setNewKioskPin('')
    setConfirmPin('')
  }

  const resetPinWithPassword = async () => {
    setPinMsg(null)
    if (newKioskPin.length !== 4) {
      setPinMsg({ ok: false, text: 'PIN must be exactly 4 digits.' }); return
    }
    if (newKioskPin !== confirmPin) {
      setPinMsg({ ok: false, text: 'PINs do not match.' }); return
    }
    setSavingPin(true)
    const { error } = await supabase
      .from('profiles')
      .update({ pin: newKioskPin })
      .eq('id', profile!.id)
    setSavingPin(false)
    if (error) { setPinMsg({ ok: false, text: error.message }); return }
    setPinMsg({ ok: true, text: 'Kiosk PIN reset successfully.' })
    setForgotPinMode(false)
    setRecoveryVerified(false)
    setNewKioskPin(''); setConfirmPin('')
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
              {roleLabel(profile.role)}
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
          <Field label="Role"         value={roleLabel(profile?.role)} />
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

      {/* ── Request a Change ── */}
      <RequestChangeSection />

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

      {/* ── Kiosk PIN ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Shield className="w-4 h-4 text-teal-500" />
          <h2 className="text-base font-semibold text-gray-800">Kiosk PIN</h2>
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-xs text-gray-500">Your 4-digit PIN is used to verify your identity at the facility kiosk terminal.</p>
          {pinMsg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${
              pinMsg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {pinMsg.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {pinMsg.text}
            </div>
          )}
          {!forgotPinMode ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Current PIN</label>
              <input type="password" maxLength={4} value={currentPin}
                onChange={e => { setCurrentPin(e.target.value.replace(/\D/g,'').slice(0,4)); setPinMsg(null) }}
                placeholder="● ● ● ●"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none text-center tracking-widest text-lg" />
              <button
                onClick={() => { setForgotPinMode(true); setPinMsg(null); setCurrentPin('') }}
                className="text-xs text-teal-600 hover:text-teal-700 mt-1.5 hover:underline">
                Forgot your PIN?
              </button>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">PIN Recovery</p>
              {!recoveryVerified ? (
                <>
                  <p className="text-sm text-amber-700">Enter your account password to verify your identity:</p>
                  <input type="password" value={recoveryPassword}
                    onChange={e => { setRecoveryPassword(e.target.value); setPinMsg(null) }}
                    placeholder="Your login password"
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white" />
                  <div className="flex gap-2">
                    <button onClick={() => { setForgotPinMode(false); setPinMsg(null) }}
                      className="flex-1 border border-gray-200 text-gray-600 font-medium py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={verifyPasswordForPinReset} disabled={verifyingPw || !recoveryPassword}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
                      {verifyingPw && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {verifyingPw ? 'Verifying…' : 'Verify'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-green-700 font-medium">✓ Identity verified — set your new PIN:</p>
                </>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">New PIN</label>
            <input type="password" maxLength={4} value={newKioskPin}
              onChange={e => { setNewKioskPin(e.target.value.replace(/\D/g,'').slice(0,4)); setPinMsg(null) }}
              placeholder="● ● ● ●"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none text-center tracking-widest text-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Confirm New PIN</label>
            <input type="password" maxLength={4} value={confirmPin}
              onChange={e => { setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4)); setPinMsg(null) }}
              placeholder="● ● ● ●"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none text-center tracking-widest text-lg" />
          </div>
          <p className="text-xs text-gray-400">Must be exactly 4 digits. Do not share your PIN with anyone.</p>
          <button
            onClick={forgotPinMode && recoveryVerified ? resetPinWithPassword : changePin}
            disabled={savingPin || (forgotPinMode && !recoveryVerified)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
            {savingPin && <Loader2 className="w-4 h-4 animate-spin" />}
            {savingPin ? 'Updating…' : forgotPinMode && recoveryVerified ? 'Reset Kiosk PIN' : 'Update Kiosk PIN'}
          </button>
        </div>
      </div>

    </div>
  )
}

// ─── Request a Change ─────────────────────────────────────────────────────────

const CHANGEABLE_FIELDS = [
  { key: 'full_name',   label: 'Full Name'    },
  { key: 'phone',       label: 'Phone Number' },
  { key: 'email',       label: 'Email'        },
] as const
type ChangeableField = typeof CHANGEABLE_FIELDS[number]['key']

function RequestChangeSection() {
  const profile = useAuthStore(s => s.profile)

  const [field,          setField]          = useState<ChangeableField>('full_name')
  const [requestedValue, setRequestedValue] = useState('')
  const [reason,         setReason]         = useState('')
  const [saving,         setSaving]         = useState(false)
  const [msg,            setMsg]            = useState<{ ok: boolean; text: string } | null>(null)

  const currentValue = (profile as any)?.[field] ?? ''

  const submit = async () => {
    setMsg(null)
    if (!requestedValue.trim()) return setMsg({ ok: false, text: 'Please enter the requested value.' })

    setSaving(true)

    const { data: existing } = await supabase
      .from('profile_change_requests')
      .select('id')
      .eq('user_id', profile!.id)
      .eq('field_name', field)
      .eq('status', 'pending')
      .limit(1)

    if (existing && existing.length > 0) {
      setSaving(false)
      return setMsg({ ok: false, text: 'You already have a pending request for this field.' })
    }

    const { error: err } = await supabase.from('profile_change_requests').insert({
      user_id:         profile!.id,
      field_name:      field,
      current_value:   currentValue,
      requested_value: requestedValue.trim(),
      reason:          reason.trim() || null,
      status:          'pending',
    })

    setSaving(false)
    if (err) {
      setMsg({ ok: false, text: err.message })
    } else {
      setMsg({ ok: true, text: 'Change request submitted. HR or Admin will review it shortly.' })
      setRequestedValue('')
      setReason('')

      // Notify HR so they can review the pending request (non-blocking)
      const fieldLabel = field === 'full_name' ? 'full name'
        : field === 'phone' ? 'phone number'
        : field === 'email' ? 'email'
        : field
      const { data: hrUsers, error: hrErr } = await supabase
        .from('profiles').select('id').eq('role', 'hr')
      if (hrErr) console.error('HR fetch failed:', hrErr)
      for (const hr of hrUsers ?? []) {
        const { error: hrNoticeErr } = await supabase.from('notices').insert({
          author_id:      profile?.id,
          title:          `Profile Change Request: ${profile?.full_name}`,
          body:           `${profile?.full_name} has requested a change to their ${fieldLabel}. Please review in Admin Panel > Pending Profile Change Requests.`,
          priority:       'info',
          audience:       'individual',
          target_user_id: hr.id,
          pinned:         false,
        })
        if (hrNoticeErr) console.error('HR notice failed:', hrNoticeErr)
      }
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <FileEdit className="w-4 h-4 text-teal-500" />
        <h2 className="text-base font-semibold text-gray-800">Request a Change</h2>
      </div>

      <div className="px-5 py-5 space-y-4">
        {msg && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${
            msg.ok
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50  border-red-200  text-red-700'
          }`}>
            {msg.ok
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle  className="w-4 h-4 flex-shrink-0" />}
            {msg.text}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Field to Change
          </label>
          <select
            value={field}
            onChange={e => { setField(e.target.value as ChangeableField); setMsg(null); setRequestedValue('') }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
          >
            {CHANGEABLE_FIELDS.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Current Value
          </label>
          <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 italic">
            {currentValue || '—'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Requested Value
          </label>
          <input
            type="text"
            value={requestedValue}
            onChange={e => { setRequestedValue(e.target.value); setMsg(null) }}
            placeholder="Enter new value…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Reason
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Optional — explain why the change is needed…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none"
          />
        </div>

        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </div>
  )
}
