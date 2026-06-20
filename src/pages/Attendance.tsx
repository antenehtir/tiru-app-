import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../store/authStore'
import jsQR from 'jsqr'
import {
  QrCode, MapPin, CheckCircle2, XCircle, Clock,
  AlertTriangle, Loader2, Wifi, WifiOff, History, Users, Pencil, Trash2, X,
} from 'lucide-react'

const OFFLINE_KEY   = 'tiru_attendance_queue'
const FACILITY_ID   = 'd917b86c-682c-4f11-b285-0a1cada2b54b'
const SITE_ID       = '252a6714-7d37-461f-bad2-826bfc2470b5'

type AttendanceType = 'clock_in' | 'clock_out'

type QueuedLog = {
  id: string
  user_id: string
  facility_id: string
  qr_code_id: string | null
  scanned_at: string
  latitude: number | null
  longitude: number | null
  within_geofence: boolean | null
  attendance_type: AttendanceType
  log_type: 'check_in' | 'check_out'
  status?: 'verified' | 'flagged'
  notes: string | null
}

type LogRow = {
  id: string
  scanned_at: string
  attendance_type: string
  within_geofence: boolean | null
  latitude: number | null
  longitude: number | null
}

type DeptLogRow = {
  id: string
  user_id: string
  staff_name: string
  scanned_at: string
  log_type: string | null
  attendance_type: string | null
  within_geofence: boolean | null
  status?: string | null
}

type ActionMode = {
  mode: 'edit' | 'remove'
  log: DeptLogRow
  step: 'remark' | 'edit_fields'
} | null

function normalizeLogType(log: { log_type?: string | null; attendance_type?: string | null }): 'in' | 'out' | null {
  const t = log.log_type ?? log.attendance_type
  if (t === 'check_in' || t === 'clock_in') return 'in'
  if (t === 'check_out' || t === 'clock_out') return 'out'
  return null
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLam = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dPhi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dLam/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function localId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

function loadQueue(): QueuedLog[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? '[]') } catch { return [] }
}

function saveQueue(q: QueuedLog[]) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(q))
}

function todayRangeUTC() {
  const eatMs = Date.now() + 3 * 60 * 60 * 1000
  const dateStr = new Date(eatMs).toISOString().slice(0, 10)
  return {
    start: new Date(dateStr + 'T00:00:00+03:00').toISOString(),
    end:   new Date(dateStr + 'T23:59:59+03:00').toISOString(),
  }
}

type TodayRecord = { id: string; scanned_at: string }

type DeptDayRow = {
  key: string
  user_id: string
  staff_name: string
  date: string
  checkIn: DeptLogRow | null
  checkOut: DeptLogRow | null
}

function pairDeptLogs(logs: DeptLogRow[]): DeptDayRow[] {
  const map = new Map<string, DeptDayRow>()
  for (const log of logs) {
    const dateStr = new Date(log.scanned_at).toLocaleDateString('en-CA')
    const key = log.user_id + '_' + dateStr
    if (!map.has(key)) {
      map.set(key, { key, user_id: log.user_id, staff_name: log.staff_name, date: dateStr, checkIn: null, checkOut: null })
    }
    const row = map.get(key)!
    const t = normalizeLogType(log)
    if (t === 'in' && !row.checkIn) row.checkIn = log
    if (t === 'out' && !row.checkOut) row.checkOut = log
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
}

export default function Attendance() {
  const { profile } = useAuth()
  const lastKnownPosition = useAuthStore((s) => s.lastKnownPosition)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  const [scannerActive, setScannerActive] = useState(false)
  const [scanResult,    setScanResult]    = useState<'success'|'error'|'geofence_warn'|'warn'|null>(null)
  const [scanMessage,   setScanMessage]   = useState('')
  const [cameraError,   setCameraError]   = useState<string | null>(null)
  const [scanning,      setScanning]      = useState(false)
  const [attType,       setAttType]       = useState<AttendanceType>('clock_in')
  const attTypeRef = useRef<AttendanceType>('clock_in')
  useEffect(() => { attTypeRef.current = attType }, [attType])
  const [todayCheckIn,  setTodayCheckIn]  = useState<TodayRecord | null>(null)
  const [todayCheckOut, setTodayCheckOut] = useState<TodayRecord | null>(null)
  const [todayLoaded,   setTodayLoaded]   = useState(false)
  const [earlyClockOutModal, setEarlyClockOutModal] = useState<{ shiftEndsAt: string; pendingLog: QueuedLog } | null>(null)
  const [gpsStatus,     setGpsStatus]     = useState<'idle'|'fetching'|'ok'|'denied'>('idle')
  const [coords,        setCoords]        = useState<{lat:number;lng:number}|null>(null)
  const [insideGeofence,setInsideGeofence]= useState<boolean|null>(null)
  const [online,        setOnline]        = useState(navigator.onLine)
  const [queueCount,    setQueueCount]    = useState(() => loadQueue().length)
  const [recentLogs,    setRecentLogs]    = useState<LogRow[]>([])
  const [logsLoading,   setLogsLoading]   = useState(false)
  const [facilityCoords, setFacilityCoords] = useState({ lat: 9.0054, lng: 38.7636, radius: 150 })
  const [demoMode, setDemoMode] = useState(false)
  const [checkingLocation, setCheckingLocation] = useState(false)
  const [qrDetected,      setQrDetected]      = useState(false)
  const [detectedCorners, setDetectedCorners] = useState<any>(null)

  useEffect(() => {
    supabase
      .from('sites')
      .select('latitude, longitude, geofence_m')
      .eq('id', SITE_ID)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return
        setFacilityCoords({
          lat:    data.latitude    ?? 9.0054,
          lng:    data.longitude   ?? 38.7636,
          radius: data.geofence_m  ?? 150,
        })
      })
    supabase
      .from('facilities')
      .select('demo_mode')
      .eq('id', FACILITY_ID)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return
        setDemoMode(!!data.demo_mode)
        console.log('demoMode value:', !!data.demo_mode)
      })
  }, [])

  const isDeptHead = profile?.role === 'department_head'
  const [deptLogs,        setDeptLogs]        = useState<DeptLogRow[]>([])
  const [deptLogsLoading, setDeptLogsLoading]  = useState(false)
  const [actionMode,      setActionMode]       = useState<ActionMode>(null)
  const [remark,          setRemark]            = useState('')
  const [editLogType,     setEditLogType]       = useState<'check_in' | 'check_out'>('check_in')
  const [editScannedAt,   setEditScannedAt]     = useState('')
  const [actionSaving,    setActionSaving]      = useState(false)
  const [actionErr,       setActionErr]         = useState<string | null>(null)

  useEffect(() => {
    const up = () => setOnline(true); const down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  useEffect(() => { if (online) flushQueue() }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecentLogs = useCallback(async () => {
    if (!profile?.id) return
    setLogsLoading(true)
    const { data } = await supabase
      .from('attendance_logs')
      .select('id, scanned_at, attendance_type, within_geofence, latitude, longitude')
      .eq('user_id', profile.id)
      .order('scanned_at', { ascending: false })
      .limit(10)
    setRecentLogs((data as LogRow[]) ?? [])
    setLogsLoading(false)
  }, [profile?.id])

  const fetchTodayStatus = useCallback(async () => {
    if (!profile?.id) return
    const { start, end } = todayRangeUTC()
    const { data } = await supabase
      .from('attendance_logs')
      .select('id, scanned_at, log_type')
      .eq('user_id', profile.id)
      .eq('facility_id', FACILITY_ID)
      .gte('scanned_at', start)
      .lte('scanned_at', end)
      .order('scanned_at', { ascending: true })
    const records = (data as any[]) ?? []
    const ci: TodayRecord | null = records.find(r => r.log_type === 'check_in') ?? null
    const co: TodayRecord | null = records.find(r => r.log_type === 'check_out') ?? null
    setTodayCheckIn(ci)
    setTodayCheckOut(co)
    setTodayLoaded(true)
    if (ci && !co) setAttType('clock_out')
    const hasCheckedIn = ci !== null
    const hasCheckedOut = co !== null
    const checkInTime = ci ? new Date(ci.scanned_at).toLocaleTimeString() : null
    const checkOutTime = co ? new Date(co.scanned_at).toLocaleTimeString() : null
    console.log('todayStatus:', { hasCheckedIn, hasCheckedOut, checkInTime, checkOutTime })
  }, [profile?.id])

  useEffect(() => { fetchRecentLogs(); fetchTodayStatus() }, [fetchRecentLogs, fetchTodayStatus])

  const fetchDeptAttendance = useCallback(async () => {
    if (!isDeptHead || !profile?.department_id) return
    setDeptLogsLoading(true)
    const { data: deptStaff } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('department_id', profile.department_id)
    const staffMap = new Map((deptStaff ?? []).map((s: any) => [s.id, s.full_name as string]))
    const staffIds = Array.from(staffMap.keys())
    if (staffIds.length === 0) { setDeptLogs([]); setDeptLogsLoading(false); return }
    const { data } = await supabase
      .from('attendance_logs')
      .select('id, user_id, scanned_at, log_type, attendance_type, within_geofence, status')
      .in('user_id', staffIds)
      .order('scanned_at', { ascending: false })
      .limit(50)
    const enriched: DeptLogRow[] = ((data as any[]) ?? []).map(d => ({
      ...d,
      staff_name: staffMap.get(d.user_id) ?? 'Unknown',
    }))
    setDeptLogs(enriched)
    setDeptLogsLoading(false)
  }, [isDeptHead, profile?.department_id])

  useEffect(() => { fetchDeptAttendance() }, [fetchDeptAttendance])

  const openEditModal = (log: DeptLogRow) => {
    setActionMode({ mode: 'edit', log, step: 'remark' })
    setRemark('')
    setActionErr(null)
    setEditLogType(normalizeLogType(log) === 'out' ? 'check_out' : 'check_in')
    setEditScannedAt(toDatetimeLocalValue(log.scanned_at))
  }

  const openRemoveModal = (log: DeptLogRow) => {
    setActionMode({ mode: 'remove', log, step: 'remark' })
    setRemark('')
    setActionErr(null)
  }

  const closeActionModal = () => {
    setActionMode(null)
    setRemark('')
    setActionErr(null)
  }

  const insertAuditLog = async (action: 'attendance_edit' | 'attendance_removal', log: DeptLogRow) => {
    if (!profile?.id) { console.error('Audit log insert skipped: profile not available'); return }
    const { error: auditError } = await supabase.from('audit_log').insert({
      facility_id: FACILITY_ID,
      actor_id: profile.id,
      actor_name: profile.full_name,
      action,
      target_user_id: log.user_id,
      target_name: log.staff_name,
      details: remark.trim(),
      created_at: new Date().toISOString(),
    })
    if (auditError) console.error('Audit log insert failed:', auditError)
  }

  const confirmRemove = async () => {
    if (!actionMode) return
    setActionSaving(true)
    setActionErr(null)
    const { error } = await supabase.from('attendance_logs').delete().eq('id', actionMode.log.id)
    if (error) { setActionErr(error.message); setActionSaving(false); return }
    await insertAuditLog('attendance_removal', actionMode.log)
    setActionSaving(false)
    closeActionModal()
    fetchDeptAttendance()
  }

  const proceedFromRemark = () => {
    if (!actionMode || remark.trim().length < 10) return
    if (actionMode.mode === 'edit') {
      setActionMode({ ...actionMode, step: 'edit_fields' })
    } else {
      confirmRemove()
    }
  }

  const confirmEdit = async () => {
    if (!actionMode) return
    setActionSaving(true)
    setActionErr(null)
    const { error } = await supabase
      .from('attendance_logs')
      .update({ log_type: editLogType, scanned_at: new Date(editScannedAt).toISOString() })
      .eq('id', actionMode.log.id)
    if (error) { setActionErr(error.message); setActionSaving(false); return }
    await insertAuditLog('attendance_edit', actionMode.log)
    setActionSaving(false)
    closeActionModal()
    fetchDeptAttendance()
  }

  const captureGPS = useCallback((): Promise<{lat:number;lng:number}|null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (demoMode) setInsideGeofence(true)
        resolve(null)
        return
      }
      setGpsStatus('fetching')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude; const lng = pos.coords.longitude
          setCoords({ lat, lng })
          if (demoMode) {
            setInsideGeofence(true)
          } else {
            const dist = haversineM(lat, lng, facilityCoords.lat, facilityCoords.lng)
            setInsideGeofence(dist <= facilityCoords.radius)
          }
          setGpsStatus('ok')
          resolve({ lat, lng })
        },
        () => { setGpsStatus('denied'); if (demoMode) setInsideGeofence(true); resolve(null) },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      )
    })
  }, [facilityCoords, demoMode])

  const tick = useCallback(() => {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas) { rafRef.current = requestAnimationFrame(tick); return }
    if (video.readyState !== video.HAVE_ENOUGH_DATA) { rafRef.current = requestAnimationFrame(tick); return }
    if (video.videoWidth === 0 || video.videoHeight === 0) { rafRef.current = requestAnimationFrame(tick); return }
    console.log('scanning frame...')
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height)
    console.log('jsQR result:', code)
    if (code) {
      // Visual lock-on: highlight the detected QR, hold steady, then validate.
      setQrDetected(true)
      setDetectedCorners(code.location)
      setTimeout(() => { stopCamera(); handleQRResult(code.data) }, 500)
      return // halt the scan loop while we lock on
    }
    setQrDetected(false)
    setDetectedCorners(null)
    rafRef.current = requestAnimationFrame(tick)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  type GeofenceResult = { ok: boolean; msg: string }

  const checkGeofencePreScan = (): Promise<GeofenceResult> => {
    return new Promise((resolve) => {
      // If demo mode is on, allow scanning
      if (demoMode) {
        console.log('demoMode:', demoMode)
        resolve({ ok: true, msg: '' })
        return
      }

      // Use a fresh cached position from the background GPS watch if we have one —
      // skips the getCurrentPosition wait entirely for an instant check.
      const cachedPos = useAuthStore.getState().lastKnownPosition
      const cacheAge  = cachedPos ? Date.now() - cachedPos.timestamp : Infinity
      if (cachedPos && cacheAge < 60000) {
        const distance = haversineM(
          cachedPos.coords.latitude, cachedPos.coords.longitude,
          facilityCoords.lat, facilityCoords.lng,
        )
        console.log('Using cached position — distance:', distance, 'age(ms):', cacheAge)
        if (distance > facilityCoords.radius) {
          resolve({ ok: false, msg: `You must be within ${facilityCoords.radius}m of the facility to clock in. You are currently ${Math.round(distance)}m away.` })
          return
        }
        resolve({ ok: true, msg: '' })
        return
      }

      // If no geolocation, cannot check — block
      if (!navigator.geolocation) {
        console.log('No geolocation available')
        resolve({ ok: false, msg: 'Geolocation not available. Cannot verify you are within the facility.' })
        return
      }

      // Get GPS and check geofence distance
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude; const lng = pos.coords.longitude
          const distance = haversineM(lat, lng, facilityCoords.lat, facilityCoords.lng)
          console.log('facilityCoords:', facilityCoords)
          console.log('distance:', distance)
          console.log('demoMode:', demoMode)

          if (distance > facilityCoords.radius) {
            console.log('Geofence blocked: outside facility radius')
            resolve({ ok: false, msg: `You must be within ${facilityCoords.radius}m of the facility to clock in. You are currently ${Math.round(distance)}m away.` })
            return
          }

          // Inside geofence, allow
          resolve({ ok: true, msg: '' })
        },
        () => {
          console.log('Geolocation denied')
          resolve({ ok: false, msg: 'GPS permission denied. Cannot verify you are within the facility.' })
        },
        // Faster response: cached position up to 30s old, normal accuracy, 6s timeout
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 30000 }
      )
    })
  }

  const startCamera = async () => {
    setScanResult(null); setScanMessage(''); setScanning(false); setCameraError(null)
    setQrDetected(false); setDetectedCorners(null)

    // Instant feedback while GPS resolves
    setCheckingLocation(true)

    // Check geofence BEFORE opening camera
    const { ok, msg } = await checkGeofencePreScan()
    setCheckingLocation(false)
    if (!ok) {
      setScanResult('warn')
      setScanMessage(msg)
      return // STOP — do not open camera
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) }
      setScannerActive(true); captureGPS(); tick()
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.')
      } else if (name === 'NotFoundError') {
        setCameraError('No camera found on this device.')
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setCameraError(`Camera error: ${message}`)
      }
    }
  }

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null; setScannerActive(false)
    setQrDetected(false); setDetectedCorners(null)
  }

  useEffect(() => () => stopCamera(), [])

  const handleQRResult = async (qrData: string) => {
    console.log('scanned value:', qrData)
    setScanning(true); setScanResult(null)

    // ── Dynamic token path: validate + atomically claim via server-side RPC ──
    // The RPC checks expiry against the server clock and marks the token used in a
    // single atomic step, so there is no client-clock trust and no check-then-claim
    // race. reason 'invalid' means it is not a live token — fall through to the
    // legacy static entrance_qr_codes check so small sites without a live screen
    // keep working unchanged.
    let qrCodeId: string
    const { data: claim, error: claimErr } = await supabase.rpc('validate_and_claim_qr_token', {
      p_token:   qrData,
      p_user_id: profile!.id,
    })
    const claimRow = (Array.isArray(claim) ? claim[0] : claim) as
      { success: boolean; reason: string | null; entrance_id: string | null } | null

    if (!claimErr && claimRow?.success) {
      // Token validated AND claimed server-side — proceed (no client used_at update).
      qrCodeId = claimRow.entrance_id as string
    } else if (claimRow?.reason === 'expired') {
      setScanning(false); setScanResult('error')
      setScanMessage('This code has expired. Please scan the current code on screen.')
      return
    } else if (claimRow?.reason === 'used') {
      setScanning(false); setScanResult('error')
      setScanMessage('This code has already been used. Please scan the current code on screen.')
      return
    } else {
      // reason 'invalid' (not a live token) or RPC unavailable — try the static
      // entrance QR fallback exactly as before.
      if (claimErr) console.error('QR validate RPC error:', claimErr.message)
      const { data: qrRows } = await supabase
        .from('entrance_qr_codes')
        .select('id, qr_payload, is_active')
        .eq('qr_payload', qrData)
        .eq('is_active', true)
        .limit(1)
      if (!qrRows || qrRows.length === 0) {
        setScanning(false); setScanResult('error')
        setScanMessage('Invalid QR code. Please rescan the current code on screen.')
        return
      }
      qrCodeId = (qrRows[0] as any).id
    }
    // Shift check — fetch ends_at for early clock-out detection
    let shiftEndsAt: string | null = null
    try {
      const { start: sStart, end: sEnd } = todayRangeUTC()
      const { data: shiftRows } = await supabase
        .from('shifts')
        .select('id, ends_at')
        .eq('user_id', profile!.id)
        .eq('facility_id', FACILITY_ID)
        .gte('starts_at', sStart)
        .lte('starts_at', sEnd)
        .limit(1)
      const shiftRow = (shiftRows ?? [])[0] ?? null
      if (!shiftRow) {
        setScanning(false)
        setScanResult('geofence_warn')
        setScanMessage('No shift scheduled for you today. Contact your department head if this is an error.')
        return
      }
      shiftEndsAt = (shiftRow as any).ends_at ?? null
    } catch { /* allow scan if shifts table unreachable */ }

    // Duplicate prevention — tab-aware
    // Read from ref to avoid stale closure: tick() has [] deps so it captures the
    // initial handleQRResult; ref always holds the current attType value.
    const currentAttType = attTypeRef.current
    const logType: 'check_in' | 'check_out' = currentAttType === 'clock_in' ? 'check_in' : 'check_out'
    const { start: dupStart, end: dupEnd } = todayRangeUTC()
    console.log('handleQRResult - attType:', currentAttType, 'log_type will be:', logType)

    if (currentAttType === 'clock_in') {
      const { data: existingIn } = await supabase
        .from('attendance_logs')
        .select('id, scanned_at')
        .eq('user_id', profile!.id)
        .eq('facility_id', FACILITY_ID)
        .eq('log_type', 'check_in')
        .gte('scanned_at', dupStart)
        .lte('scanned_at', dupEnd)
        .maybeSingle()
      console.log('duplicate check (clock_in) - existingIn:', existingIn)
      if (existingIn) {
        const time = new Date((existingIn as TodayRecord).scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        setScanning(false)
        setScanResult('warn')
        setScanMessage(`You have already clocked in today at ${time}. Use Clock Out to end your shift.`)
        return
      }
    } else {
      const { data: existingOut } = await supabase
        .from('attendance_logs')
        .select('id, scanned_at')
        .eq('user_id', profile!.id)
        .eq('facility_id', FACILITY_ID)
        .eq('log_type', 'check_out')
        .gte('scanned_at', dupStart)
        .lte('scanned_at', dupEnd)
        .maybeSingle()
      console.log('duplicate check (clock_out) - existingOut:', existingOut)
      if (existingOut) {
        const time = new Date((existingOut as TodayRecord).scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        setScanning(false)
        setScanResult('warn')
        setScanMessage(`You have already clocked out today at ${time}.`)
        return
      }
      const { data: existingIn } = await supabase
        .from('attendance_logs')
        .select('id, scanned_at')
        .eq('user_id', profile!.id)
        .eq('facility_id', FACILITY_ID)
        .eq('log_type', 'check_in')
        .gte('scanned_at', dupStart)
        .lte('scanned_at', dupEnd)
        .maybeSingle()
      console.log('duplicate check (clock_out) - existingIn:', existingIn)
      if (!existingIn) {
        setScanning(false)
        setScanResult('warn')
        setScanMessage("You haven't clocked in yet today. Please clock in first.")
        return
      }
    }

    const log: QueuedLog = {
      id: localId(), user_id: profile!.id, facility_id: FACILITY_ID, qr_code_id: qrCodeId,
      scanned_at: new Date().toISOString(), latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null, within_geofence: insideGeofence,
      attendance_type: currentAttType,
      log_type: logType,
      notes: null,
    }

    // Early clock-out check
    if (currentAttType === 'clock_out' && shiftEndsAt && new Date() < new Date(shiftEndsAt)) {
      setEarlyClockOutModal({ shiftEndsAt, pendingLog: { ...log, status: 'flagged' } })
      setScanning(false)
      return
    }

    await persistLog(log)
    setScanning(false)
  }

  const persistLog = async (log: QueuedLog) => {
    const { id: _localId, ...insertPayload } = log
    if (!online) { enqueue(log); setScanResult('success'); setScanMessage('Saved offline — will sync when connected.'); return }
    const { error } = await supabase.from('attendance_logs').insert(insertPayload)
    if (error) { enqueue(log); setScanResult('error'); setScanMessage('Could not save — queued for retry. ' + error.message) }
    else {
      // Dynamic token already claimed atomically by validate_and_claim_qr_token RPC;
      // no client-side used_at update needed here (static QR has no token).
      if (insideGeofence === false) { setScanResult('geofence_warn'); setScanMessage('Attendance recorded ✓ — GPS shows you may be outside the facility.') }
      else { setScanResult('success'); setScanMessage(log.log_type === 'check_in' ? 'Clocked in successfully! ✓' : 'Clocked out successfully! ✓') }
      fetchRecentLogs()
      fetchTodayStatus()
    }
  }

  const enqueue = (log: QueuedLog) => {
    const q = loadQueue()
    if (!q.find(x => x.id === log.id)) q.push(log)
    saveQueue(q); setQueueCount(q.length)
  }

  const flushQueue = async () => {
    const q = loadQueue(); if (q.length === 0) return
    const valid = q.filter(l => !!l.log_type)
    const invalid = q.filter(l => !l.log_type)
    if (invalid.length > 0) {
      console.warn(`Dropping ${invalid.length} queued log(s) with missing log_type`)
    }
    const remaining: QueuedLog[] = []
    for (const log of valid) {
      const { id: _localId, ...payload } = log
      const { error } = await supabase.from('attendance_logs').insert(payload)
      if (error) remaining.push(log)
    }
    saveQueue(remaining); setQueueCount(remaining.length)
    if (remaining.length < q.length) fetchRecentLogs()
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <QrCode className="w-6 h-6 text-teal-500" />Attendance
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Scan entrance QR code to record attendance</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {online
            ? <span className="flex items-center gap-1 text-green-600"><Wifi className="w-4 h-4" />Online</span>
            : <span className="flex items-center gap-1 text-orange-500"><WifiOff className="w-4 h-4" />Offline</span>
          }
          {queueCount > 0 && (
            <span className="bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-medium">{queueCount} queued</span>
          )}
        </div>
      </div>

      {demoMode && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium rounded-xl px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Demo Mode Active — Geofence check disabled
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          {(['clock_in','clock_out'] as AttendanceType[]).map(t => {
            const isClockIn  = t === 'clock_in'
            const isDisabled = todayLoaded && (
              isClockIn
                ? !!todayCheckIn
                : !!(todayCheckIn && todayCheckOut)
            )
            const isActive = attType === t
            return (
              <button key={t}
                onClick={() => !isDisabled && setAttType(t)}
                disabled={isDisabled}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isDisabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                    : isActive
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                {isClockIn ? '🟢 Clock In' : '🔴 Clock Out'}
              </button>
            )
          })}
        </div>
        {todayLoaded && todayCheckIn && todayCheckOut && (
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg py-2 px-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />
            Shift complete for today ✓
          </div>
        )}
        {todayLoaded && todayCheckIn && !todayCheckOut && (
          <div className="text-xs text-gray-400 text-center">
            Clocked in at {new Date(todayCheckIn.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* ── Live location indicator (uses pre-warmed cached GPS) ── */}
      {!demoMode && (() => {
        if (!lastKnownPosition) {
          return (
            <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 bg-gray-100 text-gray-400">
              <MapPin className="w-3.5 h-3.5" />Acquiring location…
            </div>
          )
        }
        const dist = Math.round(haversineM(
          lastKnownPosition.coords.latitude, lastKnownPosition.coords.longitude,
          facilityCoords.lat, facilityCoords.lng,
        ))
        const inside = dist <= facilityCoords.radius
        return (
          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
            inside ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          }`}>
            <MapPin className="w-3.5 h-3.5" />
            {inside ? `Inside facility (${dist}m)` : `${dist}m from facility`}
          </div>
        )
      })()}

      <div className="relative rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 h-[320px]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${scannerActive ? 'block' : 'hidden'}`}
        />

        {!scannerActive && (
          cameraError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
              <XCircle className="w-12 h-12 text-red-400" />
              <p className="text-sm text-red-600 font-medium">{cameraError}</p>
              <button
                onClick={startCamera}
                disabled={checkingLocation}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-70 disabled:cursor-wait text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center gap-2">
                {checkingLocation ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Checking location…</>
                ) : (
                  'Retry Camera'
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <QrCode className="w-16 h-16 text-gray-300" />
              <p className="text-sm text-gray-400">Camera is off</p>
              <button
                onClick={startCamera}
                disabled={checkingLocation}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-70 disabled:cursor-wait text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center gap-2">
                {checkingLocation ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Checking location…</>
                ) : (
                  'Start Scanner'
                )}
              </button>
              {checkingLocation && (
                <p className="text-xs text-teal-600 animate-pulse">Checking your location…</p>
              )}
            </div>
          )
        )}

        {scannerActive && (
          <>
            {/* Real-time lock-on highlight over the actual detected QR */}
            {detectedCorners && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${canvasRef.current?.width || 1} ${canvasRef.current?.height || 1}`}
                preserveAspectRatio="xMidYMid slice"
              >
                <polygon
                  points={`${detectedCorners.topLeftCorner.x},${detectedCorners.topLeftCorner.y} ${detectedCorners.topRightCorner.x},${detectedCorners.topRightCorner.y} ${detectedCorners.bottomRightCorner.x},${detectedCorners.bottomRightCorner.y} ${detectedCorners.bottomLeftCorner.x},${detectedCorners.bottomLeftCorner.y}`}
                  fill="rgba(34,197,94,0.15)"
                  stroke="#22c55e"
                  strokeWidth={6}
                  strokeLinejoin="round"
                />
              </svg>
            )}

            {/* Targeting brackets — teal while searching, green when locked on */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-48 h-48">
                <div className={`absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 rounded-tl-sm transition-colors ${qrDetected ? 'border-green-400' : 'border-teal-400'}`} />
                <div className={`absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 rounded-tr-sm transition-colors ${qrDetected ? 'border-green-400' : 'border-teal-400'}`} />
                <div className={`absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 rounded-bl-sm transition-colors ${qrDetected ? 'border-green-400' : 'border-teal-400'}`} />
                <div className={`absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 rounded-br-sm transition-colors ${qrDetected ? 'border-green-400' : 'border-teal-400'}`} />

                {/* Moving scan line (hidden once locked on) */}
                {!qrDetected && (
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="w-full h-0.5 bg-teal-400 opacity-70 animate-[scan_2s_linear_infinite]" />
                  </div>
                )}

                {/* Detection status */}
                {qrDetected && (
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-green-500 text-xs font-medium whitespace-nowrap animate-pulse">
                    QR detected — hold steady
                  </div>
                )}
              </div>
            </div>

            {scanning && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            )}
            <button onClick={stopCamera} className="absolute top-3 right-3 bg-black/50 text-white rounded-lg px-3 py-1.5 text-xs hover:bg-black/70">Stop</button>
          </>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {scanResult && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm
          ${scanResult === 'success'       ? 'bg-green-50 border border-green-200 text-green-800' : ''}
          ${scanResult === 'geofence_warn' ? 'bg-amber-50 border border-amber-200 text-amber-800' : ''}
          ${scanResult === 'warn'          ? 'bg-amber-50 border border-amber-200 text-amber-800' : ''}
          ${scanResult === 'error'         ? 'bg-red-50 border border-red-200 text-red-700' : ''}
        `}>
          {scanResult === 'success'       && <CheckCircle2  className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          {scanResult === 'geofence_warn' && <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          {scanResult === 'warn'          && <Clock         className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          {scanResult === 'error'         && <XCircle       className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <span>{scanMessage}</span>
        </div>
      )}

      {gpsStatus !== 'idle' && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2
          ${gpsStatus === 'ok' ? (insideGeofence ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700') : ''}
          ${gpsStatus === 'fetching' ? 'bg-gray-100 text-gray-500' : ''}
          ${gpsStatus === 'denied'   ? 'bg-gray-100 text-gray-400' : ''}
        `}>
          <MapPin className="w-3.5 h-3.5" />
          {gpsStatus === 'fetching' && 'Fetching GPS…'}
          {gpsStatus === 'denied'   && 'GPS unavailable (advisory only)'}
          {gpsStatus === 'ok' && insideGeofence  && `GPS: inside facility (${Math.round(haversineM(coords!.lat, coords!.lng, facilityCoords.lat, facilityCoords.lng))} m)`}
          {gpsStatus === 'ok' && !insideGeofence && `GPS: ${Math.round(haversineM(coords!.lat, coords!.lng, facilityCoords.lat, facilityCoords.lng))} m from facility`}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <History className="w-4 h-4" />My Recent Attendance
        </h2>
        {logsLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />Loading…
          </div>
        ) : recentLogs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No attendance records yet.</p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <div>
                    <div className="text-sm font-medium text-gray-800 capitalize">
                      {log.attendance_type?.replace('_',' ')}
                    </div>
                    <div className="text-xs text-gray-400">{new Date(log.scanned_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {log.within_geofence === true  && <span className="text-green-500 text-xs flex items-center gap-0.5"><MapPin className="w-3 h-3" />In</span>}
                  {log.within_geofence === false && <span className="text-amber-500 text-xs flex items-center gap-0.5"><MapPin className="w-3 h-3" />Out</span>}
                  {log.within_geofence === null  && <span className="text-gray-300 text-xs">{'—'}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isDeptHead && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />Department Attendance
          </h2>
          {deptLogsLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" />Loading…
            </div>
          ) : deptLogs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No department attendance records yet.</p>
          ) : (
            <div className="space-y-2">
              {pairDeptLogs(deptLogs).map(row => (
                <div key={row.key} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800">{row.staff_name}</span>
                    <span className="text-xs text-gray-400">{new Date(row.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {row.checkIn ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          In {new Date(row.checkIn.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={() => openEditModal(row.checkIn!)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => openRemoveModal(row.checkIn!)} title="Remove" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Not clocked in</span>
                    )}
                    <span className="text-gray-300 text-xs">|</span>
                    {row.checkOut ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          Out {new Date(row.checkOut.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          {row.checkOut.status === 'flagged' && <span className="ml-1 text-orange-600">(early)</span>}
                        </span>
                        <button onClick={() => openEditModal(row.checkOut!)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-teal-600"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => openRemoveModal(row.checkOut!)} title="Remove" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 italic">Not yet clocked out</span>
                    )}
                    {row.checkIn?.within_geofence === true && <span className="text-green-500 text-xs flex items-center gap-0.5 ml-auto"><MapPin className="w-3 h-3" />On-site</span>}
                    {row.checkIn?.within_geofence === false && <span className="text-amber-500 text-xs flex items-center gap-0.5 ml-auto"><MapPin className="w-3 h-3" />Off-site</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {earlyClockOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Early Clock Out</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Your shift ends at {new Date(earlyClockOutModal.shiftEndsAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.
                  Are you sure you want to clock out early?
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4">
              <button
                onClick={() => setEarlyClockOutModal(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => {
                  const log = earlyClockOutModal.pendingLog
                  setEarlyClockOutModal(null)
                  await persistLog(log)
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors">
                Clock Out Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {actionMode.mode === 'edit' ? 'Edit Attendance Record' : 'Remove Attendance Record'}
              </h2>
              <button onClick={closeActionModal} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {actionErr && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />{actionErr}
                </div>
              )}
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                <p className="font-medium text-gray-800">{actionMode.log.staff_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">Original: {new Date(actionMode.log.scanned_at).toLocaleString()}</p>
              </div>

              {actionMode.step === 'remark' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Reason for change *</label>
                  <textarea rows={3} value={remark} onChange={e => setRemark(e.target.value)}
                    placeholder="Describe why this attendance record is being modified..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
                  <p className="text-xs text-gray-400 mt-1">{remark.trim().length}/10 characters minimum</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
                    <select value={editLogType} onChange={e => setEditLogType(e.target.value as 'check_in' | 'check_out')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none">
                      <option value="check_in">Check In</option>
                      <option value="check_out">Check Out</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date &amp; Time</label>
                    <input type="datetime-local" value={editScannedAt} onChange={e => setEditScannedAt(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 outline-none" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeActionModal} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
              {actionMode.step === 'remark' ? (
                <button onClick={proceedFromRemark} disabled={remark.trim().length < 10 || actionSaving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                  {actionSaving && <Loader2 className="w-4 h-4 animate-spin" />}Confirm
                </button>
              ) : (
                <button onClick={confirmEdit} disabled={actionSaving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                  {actionSaving && <Loader2 className="w-4 h-4 animate-spin" />}Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}






