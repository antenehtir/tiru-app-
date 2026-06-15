import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  LogIn, LogOut, AlertTriangle, Bell, ArrowLeft,
  CheckCircle2, XCircle, Loader2, Shield
} from 'lucide-react'

type KioskScreen = 'idle' | 'identify' | 'pin' | 'dashboard' | 'signature' | 'camera' | 'success' | 'error' | 'incident' | 'notices'
type Action = 'checkin' | 'checkout' | 'incident' | 'notices'

type StaffProfile = {
  id: string
  full_name: string
  role: string
  employee_id: string
  department: { id: string; name: string } | null
  pin: string | null
}

const FACILITY_ID = 'd917b86c-682c-4f11-b285-0a1cada2b54b'

export default function Kiosk() {
  const [screen, setScreen]         = useState<KioskScreen>('idle')
  const [action, setAction]         = useState<Action | null>(null)
  const [numInput, setNumInput]     = useState('')
  const [sitePrefix, setSitePrefix] = useState('TMC')
  const [pin, setPin]               = useState('')
  const [staff, setStaff]           = useState<StaffProfile | null>(null)
  const [loading, setLoading]       = useState(false)
  const [errorMsg, setErrorMsg]     = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [time, setTime]             = useState(new Date())
  const [notices, setNotices]       = useState<{id:string; title:string; body:string; priority:string; created_at:string}[]>([])
  const [kioskReady, setKioskReady] = useState(false)

  // Incident form
  const [incidentCategory, setIncidentCategory] = useState('patient_safety')
  const [incidentSeverity, setIncidentSeverity] = useState('low')
  const [incidentDesc, setIncidentDesc]         = useState('')
  const [incidentLocation, setIncidentLocation] = useState('')

  // Signature + camera
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [countdown, setCountdown]         = useState(3)
  const [cameraActive, setCameraActive]   = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [todayShift, setTodayShift]   = useState<{starts_at:string; ends_at:string; specialty:string|null} | null>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const videoRef     = useRef<HTMLVideoElement>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const isDrawing    = useRef(false)

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-return after success/error
  useEffect(() => {
    if (screen === 'success') {
      const t = setTimeout(async () => {
        if (staff) {
          await fetchDashboardData(staff)
          setScreen('dashboard')
          setSignatureData(null)
          setPin('')
        } else {
          resetKiosk()
        }
      }, 3000)
      return () => clearTimeout(t)
    }
    if (screen === 'error') {
      const t = setTimeout(() => {
        if (staff) {
          setScreen('dashboard')
          setPin('')
        } else {
          resetKiosk()
        }
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [screen, staff])

  // Sign in as kiosk account silently on mount
  useEffect(() => {
    supabase.auth.signInWithPassword({
      email: 'kiosk@tmc1.et',
      password: 'Kiosk1234!'
    }).then(async ({ error }) => {
      if (error) { console.error('Kiosk auth failed:', error.message); return }
      // Fetch site prefix
      const { data: siteData } = await supabase
        .from('sites')
        .select('prefix')
        .eq('id', '252a6714-7d37-461f-bad2-826bfc2470b5')
        .single()
      if (siteData?.prefix) setSitePrefix(siteData.prefix)
      setKioskReady(true)
    })
  }, [])

  function resetKiosk() {
    setScreen('idle')
    setAction(null)
    setNumInput('')
    setPin('')
    setStaff(null)
    setErrorMsg('')
    setSuccessMsg('')
    setIncidentCategory('patient_safety')
    setIncidentSeverity('low')
    setIncidentDesc('')
    setIncidentLocation('')
    setSignatureData(null)
    setCountdown(3)
    setCameraActive(false)
    setUnreadCount(0)
    setTodayShift(null)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  async function lookupAndVerify(idInput: string, pinInput: string) {
    if (!idInput || pinInput.length !== 4) return
    if (!kioskReady) {
      setErrorMsg('Terminal is initializing. Please wait and try again.')
      setScreen('error')
      return
    }
    setLoading(true)
    const fullId = `${sitePrefix}-${idInput.padStart(3, '0')}`
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, employee_id, pin, department:departments!profiles_department_id_fkey(id, name)')
      .eq('employee_id', fullId)
      .eq('is_active', true)
      .maybeSingle()
    setLoading(false)
    if (error || !data) {
      setErrorMsg(`Staff ID "${fullId}" not found. Please try again.`)
      setScreen('error')
      return
    }
    if (!data.pin) {
      setErrorMsg('No PIN set. Please contact HR.')
      setScreen('error')
      return
    }
    if (pinInput !== data.pin) {
      setErrorMsg('Incorrect PIN. Please try again.')
      setScreen('error')
      return
    }
    setStaff(data as unknown as StaffProfile)
    await fetchDashboardData(data as unknown as StaffProfile)
    setScreen('dashboard')
  }

  function startAction(a: Action) {
    setAction(a)
    if (screen === 'dashboard') {
      // Already logged in — go directly to action
      if (a === 'notices') {
        fetchNotices(staff!)
        setScreen('notices')
      } else if (a === 'checkin' || a === 'checkout') {
        setScreen('signature')
      } else if (a === 'incident') {
        setScreen('incident')
      }
    } else {
      setScreen('identify')
    }
  }

  async function fetchNotices(staffProfile: StaffProfile) {
    const deptId = staffProfile.department
      ? (staffProfile.department as any).id ?? null
      : null

    const { data } = await supabase
      .from('notices')
      .select('id, title, body, priority, created_at, audience, audience_type, target_user_id, department_ids')
      .order('created_at', { ascending: false })
      .limit(20)

    const filtered = ((data as any[]) ?? []).filter((n: any) => {
      // Never show personal notices on kiosk
      if (n.audience_type === 'personal') return false
      if (n.audience === 'all') return true
      if (n.audience === 'department') {
        const ids: string[] = n.department_ids ?? []
        return deptId ? ids.includes(deptId) : false
      }
      const clinicalRoles = ['physician','nurse','medical_director','department_head','coordinator']
      if (n.audience === 'clinical') return clinicalRoles.includes(staffProfile.role)
      if (n.audience === 'administrative') return ['hr','coordinator','general_manager','ceo','super_admin'].includes(staffProfile.role)
      return false
    })
    setNotices(filtered)
  }

  async function fetchDashboardData(staffProfile: StaffProfile) {
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
    const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999)

    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, audience_type, target_user_id, audience, department_ids, department_id')

    const { data: readData } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('user_id', staffProfile.id)

    const readSet = new Set((readData ?? []).map((r: any) => r.notice_id))
    const deptId = staffProfile.department ? (staffProfile.department as any).id : null

    const visible = ((noticeData as any[]) ?? []).filter((n: any) => {
      if (n.audience_type === 'personal') return n.target_user_id === staffProfile.id
      if (n.target_user_id) return false
      if (n.audience === 'department') {
        const ids = n.department_ids ?? (n.department_id ? [n.department_id] : [])
        return deptId ? ids.includes(deptId) : false
      }
      if (n.audience === 'clinical') {
        return ['physician','nurse','medical_director','department_head','coordinator'].includes(staffProfile.role)
      }
      if (n.audience === 'administrative') {
        return ['hr','coordinator','general_manager','ceo','super_admin'].includes(staffProfile.role)
      }
      return true
    })
    setUnreadCount(visible.filter((n: any) => !readSet.has(n.id)).length)

    const { data: shiftData } = await supabase
      .from('shifts')
      .select('starts_at, ends_at, specialty')
      .eq('user_id', staffProfile.id)
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString())
      .order('starts_at')
      .limit(1)
      .maybeSingle()
    setTodayShift(shiftData as any)
  }


  async function verifyPin(enteredPin?: string) {
    const pinToCheck = enteredPin ?? pin
    if (pinToCheck.length !== 4) return
    if (pinToCheck !== staff?.pin) {
      setErrorMsg('Incorrect PIN. Please try again.')
      setScreen('error')
      return
    }
    await fetchDashboardData(staff!)
    setScreen('dashboard')
  }

  // ── Signature pad helpers ────────────────────────────────────────────────
  function getPos(canvas: HTMLCanvasElement, e: React.Touch | React.MouseEvent) {
    const rect = canvas.getBoundingClientRect()
    const clientX = 'clientX' in e ? e.clientX : (e as React.Touch).clientX
    const clientY = 'clientY' in e ? e.clientY : (e as React.Touch).clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    isDrawing.current = true
    const pos = 'touches' in e ? getPos(canvas, e.touches[0]) : getPos(canvas, e as React.MouseEvent)
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
    e.preventDefault()
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pos = 'touches' in e ? getPos(canvas, e.touches[0]) : getPos(canvas, e as React.MouseEvent)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1D9E75'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.stroke()
    e.preventDefault()
  }

  function stopDraw() { isDrawing.current = false }

  function clearSignature() {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureData(null)
  }

  // ── Camera helpers ───────────────────────────────────────────────────────
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }, audio: false
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraActive(true)
      let count = 3
      setCountdown(count)
      const timer = setInterval(() => {
        count--
        setCountdown(count)
        if (count === 0) {
          clearInterval(timer)
          capturePhoto()
        }
      }, 1000)
    } catch {
      // Camera not available — skip camera step
      await logAttendance()
    }
  }

  function capturePhoto() {
    const video = videoRef.current; if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const data = canvas.toDataURL('image/jpeg', 0.8)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    logAttendance(data)
  }

  async function logAttendance(photoData?: string) {
    setLoading(true)
    let lat: number | null = null
    let lng: number | null = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch {}

    // Upload signature
    let signatureStorageUrl: string | null = null
    if (signatureData) {
      const blob = await (await fetch(signatureData)).blob()
      const fileName = `${staff!.id}_${Date.now()}_sig.png`
      const { data: sigData } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob, { contentType: 'image/png' })
      if (sigData) signatureStorageUrl = sigData.path
    }

    // Upload photo capture
    let captureStorageUrl: string | null = null
    if (photoData) {
      const blob = await (await fetch(photoData)).blob()
      const fileName = `${staff!.id}_${Date.now()}_cap.jpg`
      const { data: capData } = await supabase.storage
        .from('attendance-captures')
        .upload(fileName, blob, { contentType: 'image/jpeg' })
      if (capData) captureStorageUrl = capData.path
    }

    const log_type = action === 'checkin' ? 'check_in' : 'check_out'
    const { error } = await supabase.from('attendance_logs').insert({
      user_id:          staff!.id,
      facility_id:      FACILITY_ID,
      log_type,
      scanned_at:       new Date().toISOString(),
      gps_lat:          lat,
      gps_lng:          lng,
      latitude:         lat,
      longitude:        lng,
      within_geofence:  false,
      status:           'pending_sync',
      signature_url:    signatureStorageUrl,
      capture_url:      captureStorageUrl,
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

      <div className="w-full max-w-sm">
        <button
          onClick={() => setScreen('identify')}
          className="w-full flex flex-col items-center gap-4 bg-white/15 hover:bg-white/25 border-2 border-white/30 rounded-3xl p-8 transition-all active:scale-95">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">Tap to Sign In</p>
            <p className="text-teal-200 text-sm mt-1">Enter your staff ID and PIN</p>
          </div>
        </button>
      </div>

      <p className="text-teal-300/60 text-xs mt-12">
        {kioskReady ? `Kiosk Terminal · ${FACILITY_ID.slice(0,8)}…` : 'Initializing terminal…'}
      </p>
    </div>
  )

  // ── IDENTIFY SCREEN ──────────────────────────────────────────────────────
  if (screen === 'identify') return (
    <div className="min-h-screen bg-gradient-to-br from-teal-700 to-teal-900 flex flex-col items-center justify-center p-6 select-none">
      <button onClick={resetKiosk} className="absolute top-6 left-6 flex items-center gap-2 text-teal-200 hover:text-white transition-colors">
        <ArrowLeft className="w-5 h-5" />Back
      </button>
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Staff Sign In</h2>
          <p className="text-teal-200 text-sm mt-1">Enter your ID and PIN</p>
        </div>

        {/* ID Display */}
        <div className="bg-white/10 rounded-2xl px-6 py-4 mb-3 text-center border-2 border-white/20">
          <p className="text-xs text-teal-300 mb-1 uppercase tracking-wider">Staff ID</p>
          <p className="text-4xl font-mono font-bold text-white tracking-widest">
            {sitePrefix}-<span className={numInput ? 'text-teal-300' : 'text-white/30'}>
              {numInput ? numInput.padStart(3, '0') : '___'}
            </span>
          </p>
        </div>

        {numInput.length > 0 && pin.length === 0 && (
          <p className="text-center text-teal-200 text-xs mb-1 animate-pulse">
            ↓ Now enter your PIN
          </p>
        )}

        {/* PIN dots */}
        <div className="bg-white/10 rounded-2xl px-6 py-4 mb-6 text-center border-2 border-white/20">
          <p className="text-xs text-teal-300 mb-2 uppercase tracking-wider">PIN</p>
          <div className="flex justify-center gap-4">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                pin.length > i ? 'bg-white border-white' : 'border-white/40'
              }`} />
            ))}
          </div>
        </div>

        {/* Combined numpad */}
        <div className="mb-3">
          <div className="flex rounded-xl overflow-hidden border border-white/20 mb-4">
            <button
              onClick={() => { setNumInput(''); setPin('') }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                pin.length === 0 ? 'bg-white text-teal-700' : 'text-white/60 hover:text-white'
              }`}>
              Staff ID
            </button>
            <button
              onClick={() => {}}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                pin.length > 0 || numInput.length > 0 ? 'bg-white/20 text-white' : 'text-white/60'
              }`}>
              PIN
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
              <button key={i}
                disabled={k === ''}
                onPointerDown={e => {
                  e.preventDefault()
                  if (k === '⌫') {
                    if (pin.length > 0) setPin(p => p.slice(0,-1))
                    else setNumInput(p => p.slice(0,-1))
                    return
                  }
                  if (k === '') return
                  if (numInput.length < 3) {
                    setNumInput(p => p + k)
                  } else {
                    const newPin = pin + k
                    if (newPin.length <= 4) {
                      setPin(newPin)
                      if (newPin.length === 4) {
                        setTimeout(() => lookupAndVerify(numInput, newPin), 100)
                      }
                    }
                  }
                }}
                className={`h-16 rounded-2xl text-2xl font-bold transition-all active:scale-95 ${
                  k === '' ? 'invisible' :
                  k === '⌫' ? 'bg-white/10 text-white hover:bg-white/20' :
                  'bg-white/15 text-white hover:bg-white/25 border border-white/20'
                }`}>
                {k}
              </button>
            ))}
          </div>
        </div>

        {(numInput.length > 0 || pin.length > 0) && (
          <button
            onPointerDown={e => { e.preventDefault(); setNumInput(''); setPin('') }}
            className="w-full text-teal-200 hover:text-white text-sm font-medium py-2 transition-colors mb-2">
            ✕ Clear and start over
          </button>
        )}

        <button onClick={() => lookupAndVerify(numInput, pin)}
          disabled={loading || numInput.length === 0 || pin.length !== 4}
          className="w-full bg-white text-teal-700 font-bold py-4 rounded-2xl text-lg transition-all disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95">
          {loading && <Loader2 className="w-5 h-5 animate-spin text-teal-600" />}
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  )

  // ── DASHBOARD SCREEN ─────────────────────────────────────────────────────
  if (screen === 'dashboard') return (
    <div className="min-h-screen bg-gradient-to-br from-teal-700 to-teal-900 flex flex-col p-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-teal-200 text-sm">
            {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-bold text-white mt-0.5">
            Good {time.getHours() < 12 ? 'morning' : time.getHours() < 17 ? 'afternoon' : 'evening'},{' '}
            {staff?.full_name.split(' ')[1] ?? staff?.full_name}!
          </h1>
          <p className="text-teal-200 text-sm capitalize mt-0.5">
            {staff?.role?.replace(/_/g,' ')} · {(staff?.department as any)?.name ?? 'No department'}
          </p>
        </div>
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold text-white">
          {(staff?.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
        </div>
      </div>

      {/* Today's shift */}
      {todayShift ? (
        <div className="bg-white/10 rounded-2xl p-4 mb-6">
          <p className="text-teal-200 text-xs uppercase tracking-wider mb-1">Today's Shift</p>
          <p className="text-white font-semibold">
            {new Date(todayShift.starts_at).toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit'})}
            {' – '}
            {new Date(todayShift.ends_at).toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit'})}
            {todayShift.specialty ? ` · ${todayShift.specialty}` : ''}
          </p>
        </div>
      ) : (
        <div className="bg-white/10 rounded-2xl p-4 mb-6">
          <p className="text-teal-200 text-xs">No shift scheduled today</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        <button onClick={() => startAction('checkin')}
          className="flex flex-col items-center justify-center gap-3 bg-white rounded-3xl p-6 shadow-lg hover:bg-teal-50 active:scale-95 transition-all">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center">
            <LogIn className="w-7 h-7 text-teal-600" />
          </div>
          <span className="text-lg font-bold text-gray-800">Clock In</span>
        </button>

        <button onClick={() => startAction('checkout')}
          className="flex flex-col items-center justify-center gap-3 bg-white rounded-3xl p-6 shadow-lg hover:bg-orange-50 active:scale-95 transition-all">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
            <LogOut className="w-7 h-7 text-orange-500" />
          </div>
          <span className="text-lg font-bold text-gray-800">Clock Out</span>
        </button>

        <button onClick={() => startAction('incident')}
          className="flex flex-col items-center justify-center gap-3 bg-white rounded-3xl p-6 shadow-lg hover:bg-red-50 active:scale-95 transition-all">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <span className="text-lg font-bold text-gray-800">Report</span>
        </button>

        <button onClick={() => startAction('notices')}
          className="relative flex flex-col items-center justify-center gap-3 bg-white rounded-3xl p-6 shadow-lg hover:bg-blue-50 active:scale-95 transition-all">
          {unreadCount > 0 && (
            <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
            <Bell className="w-7 h-7 text-blue-500" />
          </div>
          <span className="text-lg font-bold text-gray-800">Notices</span>
        </button>
      </div>

      {/* Sign out */}
      <button onClick={resetKiosk}
        className="mt-6 flex items-center justify-center gap-2 text-teal-200 hover:text-white transition-colors py-3">
        <LogOut className="w-4 h-4" />
        <span className="text-sm font-medium">Sign Out</span>
      </button>
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
                  if (next.length === 4) setTimeout(() => verifyPin(next), 100)
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

  // ── SIGNATURE SCREEN ─────────────────────────────────────────────────────
  if (screen === 'signature') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <button onClick={resetKiosk} className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-gray-600">
        <ArrowLeft className="w-5 h-5" />Cancel
      </button>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Sign to Confirm</h2>
          <p className="text-gray-500 text-sm mt-1">{staff?.full_name} — please sign below</p>
        </div>
        <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden mb-4 touch-none">
          <canvas
            ref={canvasRef}
            width={600}
            height={250}
            className="w-full touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        </div>
        <p className="text-center text-xs text-gray-400 mb-4">Sign with your finger or stylus</p>
        <div className="flex gap-3">
          <button onClick={clearSignature}
            className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium py-3 rounded-2xl transition-colors">
            Clear
          </button>
          <button
            onClick={async () => {
              const canvas = canvasRef.current
              if (!canvas) return
              setSignatureData(canvas.toDataURL('image/png'))
              await logAttendance()
            }}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-2xl transition-colors">
            Confirm & Continue
          </button>
        </div>
      </div>
    </div>
  )

  // ── CAMERA SCREEN ────────────────────────────────────────────────────────
  if (screen === 'camera') return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Identity Verification</h2>
        <p className="text-gray-400 text-sm mb-6">Please look at the camera</p>
        <div className="relative rounded-3xl overflow-hidden bg-black mb-6 aspect-video">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full border-4 border-teal-400 flex items-center justify-center">
                <span className="text-6xl font-bold text-white">{countdown}</span>
              </div>
            </div>
          )}
        </div>
        {!cameraActive && (
          <button onClick={startCamera}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 rounded-2xl text-lg transition-colors">
            Start Camera
          </button>
        )}
        <button onClick={() => logAttendance()}
          className="w-full mt-3 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 font-medium py-3 rounded-2xl transition-colors text-sm">
          Skip (camera unavailable)
        </button>
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
      <button onClick={() => staff ? setScreen('dashboard') : resetKiosk()} className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-gray-600">
        <ArrowLeft className="w-5 h-5" />Back
      </button>
      <div className="w-full max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
            <Bell className="w-7 h-7 text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Facility Notices</h2>
          <p className="text-gray-500 text-sm mt-1">
            Showing notices for {staff?.full_name ?? 'you'}
          </p>
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
        <button onClick={() => staff ? setScreen('dashboard') : resetKiosk()} className="w-full mt-8 bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 rounded-2xl text-lg transition-colors">
          Done
        </button>
      </div>
    </div>
  )

  return null
}
