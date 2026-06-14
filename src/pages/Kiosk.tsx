import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  LogIn, LogOut, AlertTriangle, Bell, ArrowLeft,
  CheckCircle2, XCircle, Loader2, Shield
} from 'lucide-react'

type KioskScreen = 'idle' | 'identify' | 'pin' | 'success' | 'error' | 'incident' | 'notices'
type Action = 'checkin' | 'checkout' | 'incident' | 'notices'

type StaffProfile = {
  id: string
  full_name: string
  role: string
  employee_id: string
  department: { name: string } | null
  pin: string | null
}

const FACILITY_ID = 'd917b86c-682c-4f11-b285-0a1cada2b54b'


export default function Kiosk() {
  const [screen, setScreen]         = useState<KioskScreen>('idle')
  const [action, setAction]         = useState<Action | null>(null)
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin]               = useState('')
  const [staff, setStaff]           = useState<StaffProfile | null>(null)
  const [loading, setLoading]       = useState(false)
  const [errorMsg, setErrorMsg]     = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [time, setTime]             = useState(new Date())
  const [notices, setNotices]       = useState<{id:string; title:string; body:string; priority:string; created_at:string}[]>([])

  // Incident form
  const [incidentCategory, setIncidentCategory] = useState('patient_safety')
  const [incidentSeverity, setIncidentSeverity] = useState('low')
  const [incidentDesc, setIncidentDesc]         = useState('')
  const [incidentLocation, setIncidentLocation] = useState('')

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-return to idle after success/error
  useEffect(() => {
    if (screen === 'success' || screen === 'error') {
      const t = setTimeout(() => resetKiosk(), 4000)
      return () => clearTimeout(t)
    }
  }, [screen])

  function resetKiosk() {
    setScreen('idle')
    setAction(null)
    setEmployeeId('')
    setPin('')
    setStaff(null)
    setErrorMsg('')
    setSuccessMsg('')
    setIncidentCategory('patient_safety')
    setIncidentSeverity('low')
    setIncidentDesc('')
    setIncidentLocation('')
  }

  function startAction(a: Action) {
    setAction(a)
    if (a === 'notices') {
      fetchNotices()
      setScreen('notices')
    } else {
      setScreen('identify')
    }
  }

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('id, title, body, priority, created_at')
      .in('audience', ['all', 'clinical'])
      .order('created_at', { ascending: false })
      .limit(10)
    setNotices((data as any[]) ?? [])
  }

  async function lookupStaff() {
    if (!employeeId.trim()) return
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, employee_id, pin, department:departments(name)')
      .eq('kiosk_id', employeeId.trim().toUpperCase())
      .eq('facility_id', FACILITY_ID)
      .eq('is_active', true)
      .single()
    setLoading(false)
    if (error || !data) {
      setErrorMsg('Kiosk ID not found. Please try again or contact reception.')
      setScreen('error')
      return
    }
    setStaff(data as unknown as StaffProfile)
    if (!data.pin) {
      setErrorMsg('No PIN set for this account. Please contact HR to set your PIN.')
      setScreen('error')
      return
    }
    setScreen('pin')
  }

  async function verifyPin() {
    if (pin.length !== 4) return
    if (pin !== staff?.pin) {
      setErrorMsg('Incorrect PIN. Please try again.')
      setScreen('error')
      return
    }
    if (action === 'checkin' || action === 'checkout') {
      await logAttendance()
    } else if (action === 'incident') {
      setScreen('incident')
    }
  }

  async function logAttendance() {
    setLoading(true)
    // Try to get GPS silently
    let lat: number | null = null
    let lng: number | null = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {}

    const type = action === 'checkin' ? 'clock_in' : 'clock_out'
    const { error } = await supabase.from('attendance_logs').insert({
      user_id:     staff!.id,
      facility_id: FACILITY_ID,
      type,
      latitude:    lat,
      longitude:   lng,
      method:      'kiosk',
      logged_at:   new Date().toISOString(),
    })
    setLoading(false)
    if (error) {
      setErrorMsg('Failed to record attendance. Please try again.')
      setScreen('error')
      return
    }
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    setSuccessMsg(`${action === 'checkin' ? 'Clocked In' : 'Clocked Out'} at ${timeStr}`)
    setScreen('success')
  }

  async function submitIncident() {
    if (!incidentDesc.trim()) return
    setLoading(true)
    const { error } = await supabase.from('incident_reports').insert({
      reporter_id:  staff!.id,
      facility_id:  FACILITY_ID,
      category:     incidentCategory,
      severity:     incidentSeverity,
      description:  incidentDesc.trim(),
      location:     incidentLocation.trim() || null,
      occurred_at:  new Date().toISOString(),
      status:       'submitted',
      anonymous:    false,
    })
    setLoading(false)
    if (error) {
      setErrorMsg('Failed to submit report. Please try again.')
      setScreen('error')
      return
    }
    setSuccessMsg('Incident report submitted successfully.')
    setScreen('success')
  }

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const priorityColor = (p: string) => p === 'urgent' ? 'text-red-600 bg-red-50 border-red-200' : p === 'important' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-blue-600 bg-blue-50 border-blue-200'

  // ── IDLE SCREEN ──────────────────────────────────────────────────────────
  if (screen === 'idle') return (
    <div className="min-h-screen bg-gradient-to-br from-teal-700 to-teal-900 flex flex-col items-center justify-center p-8 select-none">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/20 mb-4">
          <span className="text-white text-4xl font-bold">T</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-1">Tiru</h1>
        <p className="text-teal-200 text-lg">Facility Intelligence Terminal</p>
        <p className="text-white/60 text-2xl font-mono mt-4">
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <p className="text-teal-300 text-sm mt-1">
          {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
        <button onClick={() => startAction('checkin')}
          className="flex flex-col items-center gap-3 bg-white rounded-3xl p-8 shadow-2xl hover:bg-teal-50 active:scale-95 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center">
            <LogIn className="w-8 h-8 text-teal-600" />
          </div>
          <span className="text-xl font-bold text-gray-800">Clock In</span>
        </button>

        <button onClick={() => startAction('checkout')}
          className="flex flex-col items-center gap-3 bg-white rounded-3xl p-8 shadow-2xl hover:bg-teal-50 active:scale-95 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center">
            <LogOut className="w-8 h-8 text-orange-500" />
          </div>
          <span className="text-xl font-bold text-gray-800">Clock Out</span>
        </button>

        <button onClick={() => startAction('incident')}
          className="flex flex-col items-center gap-3 bg-white rounded-3xl p-8 shadow-2xl hover:bg-red-50 active:scale-95 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <span className="text-xl font-bold text-gray-800">Report</span>
        </button>

        <button onClick={() => startAction('notices')}
          className="flex flex-col items-center gap-3 bg-white rounded-3xl p-8 shadow-2xl hover:bg-blue-50 active:scale-95 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
            <Bell className="w-8 h-8 text-blue-500" />
          </div>
          <span className="text-xl font-bold text-gray-800">Notices</span>
        </button>
      </div>

      <p className="text-teal-300/60 text-xs mt-12">Kiosk Terminal · {FACILITY_ID.slice(0,8)}…</p>
    </div>
  )

  // ── IDENTIFY SCREEN ──────────────────────────────────────────────────────
  if (screen === 'identify') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <button onClick={resetKiosk} className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-gray-600">
        <ArrowLeft className="w-5 h-5" />Back
      </button>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Enter Kiosk ID</h2>
          <p className="text-gray-500 text-sm mt-1">e.g. K001 — assigned by HR</p>
        </div>
        <input
          type="text"
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && lookupStaff()}
          placeholder="K001"
          autoFocus
          className="w-full text-center text-3xl font-mono font-bold border-2 border-gray-200 rounded-2xl px-4 py-5 focus:ring-2 focus:ring-teal-500 outline-none tracking-widest mb-6"
        />
        <button onClick={lookupStaff} disabled={loading || !employeeId.trim()}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {loading ? 'Looking up…' : 'Continue'}
        </button>
      </div>
    </div>
  )

  // ── PIN SCREEN ───────────────────────────────────────────────────────────
  if (screen === 'pin') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <button onClick={resetKiosk} className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-gray-600">
        <ArrowLeft className="w-5 h-5" />Back
      </button>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center mx-auto mb-3 text-white text-2xl font-bold">
            {initials(staff?.full_name ?? '')}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{staff?.full_name}</h2>
          <p className="text-gray-500 text-sm">{staff?.role?.replace(/_/g, ' ')} · {staff?.employee_id}</p>
        </div>
        <p className="text-center text-gray-600 font-medium mb-4">Enter your 4-digit PIN</p>
        <div className="flex justify-center gap-4 mb-8">
          {[0,1,2,3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${pin.length > i ? 'bg-teal-600 border-teal-600' : 'border-gray-300'}`} />
          ))}
        </div>
        {/* PIN Pad */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <button key={i} disabled={k === ''}
              onClick={() => {
                if (k === '⌫') { setPin(p => p.slice(0,-1)); return }
                if (k === '') return
                const next = pin + k
                if (next.length <= 4) {
                  setPin(next)
                  if (next.length === 4) setTimeout(() => verifyPin(), 100)
                }
              }}
              className={`h-16 rounded-2xl text-2xl font-bold transition-all active:scale-95 ${
                k === '' ? 'invisible' :
                k === '⌫' ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' :
                'bg-white border-2 border-gray-200 text-gray-800 hover:bg-teal-50 hover:border-teal-300 shadow-sm'
              }`}>
              {k}
            </button>
          ))}
        </div>
        {loading && (
          <div className="flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        )}
      </div>
    </div>
  )

  // ── SUCCESS SCREEN ───────────────────────────────────────────────────────
  if (screen === 'success') return (
    <div className="min-h-screen bg-teal-600 flex flex-col items-center justify-center p-8 text-white">
      <CheckCircle2 className="w-24 h-24 mb-6 animate-bounce" />
      <h2 className="text-3xl font-bold mb-2">{staff?.full_name}</h2>
      <p className="text-teal-100 text-xl mb-4">{successMsg}</p>
      <p className="text-teal-200 text-sm">Returning to home screen…</p>
    </div>
  )

  // ── ERROR SCREEN ─────────────────────────────────────────────────────────
  if (screen === 'error') return (
    <div className="min-h-screen bg-red-500 flex flex-col items-center justify-center p-8 text-white">
      <XCircle className="w-24 h-24 mb-6" />
      <h2 className="text-3xl font-bold mb-2">Oops!</h2>
      <p className="text-red-100 text-xl text-center mb-4">{errorMsg}</p>
      <p className="text-red-200 text-sm">Returning to home screen…</p>
      <button onClick={resetKiosk} className="mt-6 px-6 py-3 bg-white/20 rounded-2xl font-medium hover:bg-white/30 transition-colors">
        Go Back Now
      </button>
    </div>
  )

  // ── INCIDENT SCREEN ──────────────────────────────────────────────────────
  if (screen === 'incident') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start p-8 pt-16">
      <button onClick={resetKiosk} className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-gray-600">
        <ArrowLeft className="w-5 h-5" />Cancel
      </button>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Report Incident</h2>
          <p className="text-gray-500 text-sm mt-1">Reporting as {staff?.full_name}</p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Category</label>
              <select value={incidentCategory} onChange={e => setIncidentCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white">
                <option value="patient_safety">Patient Safety</option>
                <option value="medication_error">Medication Error</option>
                <option value="equipment_failure">Equipment Failure</option>
                <option value="staff_conduct">Staff Conduct</option>
                <option value="security">Security</option>
                <option value="facility">Facility</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Severity</label>
              <select value={incidentSeverity} onChange={e => setIncidentSeverity(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Location</label>
            <input type="text" value={incidentLocation} onChange={e => setIncidentLocation(e.target.value)}
              placeholder="e.g. Ward 3, Reception, ICU..."
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description *</label>
            <textarea rows={5} value={incidentDesc} onChange={e => setIncidentDesc(e.target.value)}
              placeholder="Describe what happened..."
              className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
          </div>
          <button onClick={submitIncident} disabled={loading || !incidentDesc.trim()}
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-lg transition-colors flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {loading ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── NOTICES SCREEN ───────────────────────────────────────────────────────
  if (screen === 'notices') return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-8 pt-16">
      <button onClick={resetKiosk} className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-gray-600">
        <ArrowLeft className="w-5 h-5" />Back
      </button>
      <div className="w-full max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
            <Bell className="w-7 h-7 text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Facility Notices</h2>
          <p className="text-gray-500 text-sm mt-1">Latest announcements for all staff</p>
        </div>
        {notices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No notices at this time.</div>
        ) : (
          <div className="space-y-3">
            {notices.map(n => (
              <div key={n.id} className={`rounded-2xl border p-4 ${priorityColor(n.priority)}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{n.title}</span>
                  <span className="text-xs opacity-60">{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm opacity-80">{n.body}</p>
              </div>
            ))}
          </div>
        )}
        <button onClick={resetKiosk} className="w-full mt-8 bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 rounded-2xl text-lg transition-colors">
          Done
        </button>
      </div>
    </div>
  )

  return null
}
