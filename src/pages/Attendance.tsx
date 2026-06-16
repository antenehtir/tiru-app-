import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
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

export default function Attendance() {
  const { profile } = useAuth()
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const jsQRRef   = useRef<((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null>(null)

  const [scannerActive, setScannerActive] = useState(false)
  const [scanResult,    setScanResult]    = useState<'success'|'error'|'geofence_warn'|null>(null)
  const [scanMessage,   setScanMessage]   = useState('')
  const [scanning,      setScanning]      = useState(false)
  const [attType,       setAttType]       = useState<AttendanceType>('clock_in')
  const [gpsStatus,     setGpsStatus]     = useState<'idle'|'fetching'|'ok'|'denied'>('idle')
  const [coords,        setCoords]        = useState<{lat:number;lng:number}|null>(null)
  const [insideGeofence,setInsideGeofence]= useState<boolean|null>(null)
  const [online,        setOnline]        = useState(navigator.onLine)
  const [queueCount,    setQueueCount]    = useState(() => loadQueue().length)
  const [recentLogs,    setRecentLogs]    = useState<LogRow[]>([])
  const [logsLoading,   setLogsLoading]   = useState(false)
  const [facilityCoords, setFacilityCoords] = useState({ lat: 9.0054, lng: 38.7636, radius: 150 })
  const [demoMode, setDemoMode] = useState(false)

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

  useEffect(() => {
    if ((window as any).jsQR) { jsQRRef.current = (window as any).jsQR; return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
    script.async = true
    script.onload = () => { jsQRRef.current = (window as any).jsQR }
    document.head.appendChild(script)
  }, [])

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

  useEffect(() => { fetchRecentLogs() }, [fetchRecentLogs])

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
      .select('id, user_id, scanned_at, log_type, attendance_type, within_geofence')
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
    if (!video || !canvas || !jsQRRef.current) { rafRef.current = requestAnimationFrame(tick); return }
    if (video.readyState !== video.HAVE_ENOUGH_DATA) { rafRef.current = requestAnimationFrame(tick); return }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQRRef.current(imageData.data, imageData.width, imageData.height)
    if (code) { stopCamera(); handleQRResult(code.data) }
    else rafRef.current = requestAnimationFrame(tick)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = async () => {
    setScanResult(null); setScanMessage(''); setScanning(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
      setScannerActive(true); captureGPS(); tick()
    } catch {
      setScanResult('error'); setScanMessage('Camera access denied. Please allow camera permission.')
    }
  }

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null; setScannerActive(false)
  }

  useEffect(() => () => stopCamera(), [])

  const handleQRResult = async (qrData: string) => {
    setScanning(true); setScanResult(null)
    let qrCodeId: string | null = null
    if (qrData.match(/^[0-9a-f-]{36}$/i)) {
      const { data: qrRow } = await supabase
        .from('entrance_qr_codes').select('id, is_active').eq('qr_payload', qrData).single()
      if (!qrRow || !qrRow.is_active) {
        setScanning(false); setScanResult('error')
        setScanMessage('QR code not recognised or has been deactivated.'); return
      }
      qrCodeId = qrRow.id
    }
    const log: QueuedLog = {
      id: localId(), user_id: profile!.id, facility_id: FACILITY_ID, qr_code_id: qrCodeId,
      scanned_at: new Date().toISOString(), latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null, within_geofence: insideGeofence,
      attendance_type: attType, notes: null,
    }
    await persistLog(log); setScanning(false)
  }

  const persistLog = async (log: QueuedLog) => {
    const { id: _localId, ...insertPayload } = log
    if (!online) { enqueue(log); setScanResult('success'); setScanMessage('Saved offline â€” will sync when connected.'); return }
    const { error } = await supabase.from('attendance_logs').insert(insertPayload)
    if (error) { enqueue(log); setScanResult('error'); setScanMessage('Could not save â€” queued for retry. ' + error.message) }
    else {
      if (insideGeofence === false) { setScanResult('geofence_warn'); setScanMessage('Attendance recorded âœ“ â€” GPS shows you may be outside the facility.') }
      else { setScanResult('success'); setScanMessage(attType === 'clock_in' ? 'Clocked in successfully!' : 'Clocked out successfully!') }
      fetchRecentLogs()
    }
  }

  const enqueue = (log: QueuedLog) => {
    const q = loadQueue()
    if (!q.find(x => x.id === log.id)) q.push(log)
    saveQueue(q); setQueueCount(q.length)
  }

  const flushQueue = async () => {
    const q = loadQueue(); if (q.length === 0) return
    const remaining: QueuedLog[] = []
    for (const log of q) {
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

      <div className="flex gap-2">
        {(['clock_in','clock_out'] as AttendanceType[]).map(t => (
          <button key={t} onClick={() => setAttType(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${attType === t ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t === 'clock_in' ? '🟢 Clock In' : '🔴 Clock Out'}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50">
        {!scannerActive ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <QrCode className="w-16 h-16 text-gray-300" />
            <p className="text-sm text-gray-400">Camera is off</p>
            <button onClick={startCamera} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors">
              Start Scanner
            </button>
          </div>
        ) : (
          <div className="relative">
            <video ref={videoRef} className="w-full aspect-video object-cover" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-4 border-teal-400 rounded-xl opacity-80" />
            </div>
            {scanning && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            )}
            <button onClick={stopCamera} className="absolute top-3 right-3 bg-black/50 text-white rounded-lg px-3 py-1.5 text-xs hover:bg-black/70">Stop</button>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {scanResult && (
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm
          ${scanResult === 'success'       ? 'bg-green-50 border border-green-200 text-green-800' : ''}
          ${scanResult === 'geofence_warn' ? 'bg-amber-50 border border-amber-200 text-amber-800' : ''}
          ${scanResult === 'error'         ? 'bg-red-50 border border-red-200 text-red-700' : ''}
        `}>
          {scanResult === 'success'       && <CheckCircle2  className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          {scanResult === 'geofence_warn' && <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
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
          {gpsStatus === 'fetching' && 'Fetching GPSâ€¦'}
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
            <Loader2 className="w-4 h-4 animate-spin" />Loadingâ€¦
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
                  {log.within_geofence === null  && <span className="text-gray-300 text-xs">â€”</span>}
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
              {deptLogs.map(log => {
                const type = normalizeLogType(log)
                return (
                  <div key={log.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{log.staff_name}</div>
                        <div className="text-xs text-gray-400">{new Date(log.scanned_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        type === 'in' ? 'bg-green-100 text-green-700' : type === 'out' ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {type === 'in' ? 'In' : type === 'out' ? 'Out' : '—'}
                      </span>
                      {log.within_geofence === true  && <span className="text-green-500 text-xs flex items-center gap-0.5"><MapPin className="w-3 h-3" />On-site</span>}
                      {log.within_geofence === false && <span className="text-amber-500 text-xs flex items-center gap-0.5"><MapPin className="w-3 h-3" />Off-site</span>}
                      <button onClick={() => openEditModal(log)} title="Edit"
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-teal-600 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openRemoveModal(log)} title="Remove"
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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






