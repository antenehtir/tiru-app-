import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LayoutDashboard, CalendarDays, QrCode, CalendarOff,
  Users, ShieldAlert, Bell, AlertTriangle, Settings, LogOut, MoreHorizontal,
  User, ClipboardList, Activity, CheckCheck, Loader2, Plus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../lib/roles'
import { useAuthStore } from '../store/authStore'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard, pulse: false },
  { to: '/shifts',     label: 'Shifts',     icon: CalendarDays,    pulse: false },
  { to: '/onduty',     label: 'On Duty',    icon: Activity,        pulse: true  },
  { to: '/attendance', label: 'Attendance', icon: QrCode,          pulse: false },
  { to: '/leave',      label: 'Leave',      icon: CalendarOff,     pulse: false },
  { to: '/staff',      label: 'Staff',      icon: Users,           pulse: false },
]

const LEADERSHIP    = ['ceo', 'general_manager', 'medical_director', 'hr', 'super_admin']
const CAN_ADMIN     = ['super_admin', 'ceo', 'general_manager']
const CAN_FLAGS     = ['super_admin', 'ceo', 'general_manager', 'medical_director']
const CAN_AUDIT     = ['super_admin', 'ceo', 'hr', 'medical_director', 'general_manager']
const CAN_BROADCAST = ['super_admin','ceo','general_manager','medical_director','hr','department_head','coordinator']

type PanelNotice = {
  id: string
  title: string
  body: string
  audience: string
  created_at: string
  is_read: boolean
  target_user_id: string | null
  department_ids: string[] | null
  department_id: string | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function audienceLabel(audience: string): string {
  if (audience === 'individual') return 'Personal'
  if (audience === 'all') return 'All Staff'
  if (audience === 'clinical') return 'Clinical'
  if (audience === 'administrative') return 'Admin'
  if (audience === 'department') return 'Department'
  return audience
}

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-teal-50 text-teal-700'
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  }`
}

export default function AppShell() {
  const profile  = useAuthStore((s) => s.profile)
  const role     = profile?.role ?? ''
  const isLeadership  = LEADERSHIP.includes(role)
  const canAdmin      = CAN_ADMIN.includes(role)
  const canFlags      = CAN_FLAGS.includes(role)
  const canAudit      = CAN_AUDIT.includes(role)
  const canBroadcast  = CAN_BROADCAST.includes(role)

  const location = useLocation()
  const navigate = useNavigate()

  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [unreadNotices,  setUnreadNotices]  = useState(0)
  const [openIncidents,  setOpenIncidents]  = useState(0)
  const [signOutConfirm, setSignOutConfirm] = useState(false)
  const [bellOpen,       setBellOpen]       = useState(false)
  const [panelNotices,   setPanelNotices]   = useState<PanelNotice[]>([])
  const [panelLoading,   setPanelLoading]   = useState(false)
  const [facilityName,   setFacilityName]   = useState('')
  const bellRef = useRef<HTMLDivElement>(null)

  // ── Fetch facility name (centered in the top bar) ───────────────────────────
  useEffect(() => {
    supabase
      .from('facilities')
      .select('name')
      .eq('id', 'd917b86c-682c-4f11-b285-0a1cada2b54b')
      .single()
      .then(({ data, error }) => {
        if (error || !data?.name) return // empty center zone on failure/null
        setFacilityName(data.name)
      })
  }, [])

  // ── Fetch badge counts ────────────────────────────────────────────────────
  const fetchCounts = useCallback(async () => {
    if (!profile?.id) return

    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, target_user_id, audience, department_ids, department_id')

    const { data: readData } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('user_id', profile.id)

    const readSet = new Set((readData ?? []).map((r: any) => r.notice_id))
    const userDeptId = profile.department_id ?? null
    const userRole = profile.role ?? ''

    const visibleNotices = ((noticeData as any[]) ?? []).filter(n => {
      if (['super_admin', 'medical_director'].includes(userRole)) return true
      if (n.audience === 'individual') return n.target_user_id === profile.id
      if (n.audience === 'department') {
        const ids = n.department_ids ?? (n.department_id ? [n.department_id] : [])
        if (ids.length === 0) return false
        return userDeptId ? ids.includes(userDeptId) : false
      }
      if (n.audience === 'clinical') {
        return ['physician','nurse','pharmacist','department_head'].includes(userRole)
      }
      if (n.audience === 'administrative') {
        return ['hr','coordinator','general_manager','ceo'].includes(userRole)
      }
      if (n.audience === 'all') return true
      return false
    })

    setUnreadNotices(visibleNotices.filter(n => !readSet.has(n.id)).length)

    if (isLeadership) {
      const { count } = await supabase
        .from('incident_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted')
      setOpenIncidents(count ?? 0)
    } else {
      setOpenIncidents(0)
    }
  }, [profile?.id, isLeadership])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 60000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  // ── GPS pre-warm ────────────────────────────────────────────────────────────
  // Once authenticated, request location permission immediately and keep a fresh
  // cached position so the geofence check on Clock In is instant.
  useEffect(() => {
    if (!profile?.id || !navigator.geolocation) return

    const setPos = useAuthStore.getState().setLastKnownPosition

    // Warm up GPS + trigger the permission prompt right after login
    navigator.geolocation.getCurrentPosition(
      (pos) => setPos(pos),
      () => {}, // silent fail
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    )

    // Keep the cached position fresh in the background
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPos(pos),
      (error) => { console.log('GPS watch error:', error) },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [profile?.id])

  const badgeCount  = unreadNotices + openIncidents
  const badgeLabel  = badgeCount > 9 ? '9+' : String(badgeCount)

  const closeDrawer = () => setDrawerOpen(false)
  const go = (path: string) => { closeDrawer(); navigate(path) }
  const confirmSignOut = () => { closeDrawer(); setSignOutConfirm(true) }
  const doSignOut = () => { setSignOutConfirm(false); supabase.auth.signOut() }

  // ── Bell panel ────────────────────────────────────────────────────────────
  const openBell = useCallback(async () => {
    setBellOpen(true)
    setPanelLoading(true)

    const { data: noticeData } = await supabase
      .from('notices')
      .select('id, title, body, audience, department_ids, department_id, target_user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    const { data: readData } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('user_id', profile!.id)

    const readSet = new Set((readData ?? []).map((r: any) => r.notice_id))
    const userDeptId = profile?.department_id ?? null
    const userRole = profile?.role ?? ''

    const visible = ((noticeData as any[]) ?? []).filter((n: any) => {
      if (['super_admin', 'medical_director'].includes(userRole)) return true
      if (n.audience === 'individual') return n.target_user_id === profile!.id
      if (n.audience === 'department') {
        const ids = n.department_ids ?? (n.department_id ? [n.department_id] : [])
        if (ids.length === 0) return false
        return userDeptId ? ids.includes(userDeptId) : false
      }
      if (n.audience === 'clinical') {
        return ['physician','nurse','pharmacist','department_head'].includes(userRole)
      }
      if (n.audience === 'administrative') {
        return ['hr','coordinator','general_manager','ceo'].includes(userRole)
      }
      if (n.audience === 'all') return true
      return false
    })

    const withRead: PanelNotice[] = visible.map((n: any) => ({ ...n, is_read: readSet.has(n.id) }))
    setPanelNotices(withRead)
    setPanelLoading(false)
  }, [profile?.id, profile?.department_id, profile?.role])

  const markAllRead = useCallback(async () => {
    const unread = panelNotices.filter(n => !n.is_read)
    if (unread.length === 0) return
    await supabase.from('notice_reads').upsert(
      unread.map(n => ({ notice_id: n.id, user_id: profile!.id })),
      { onConflict: 'notice_id,user_id', ignoreDuplicates: true }
    )
    setPanelNotices(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadNotices(0)
  }, [panelNotices, profile?.id])

  const toggleBell = () => { if (bellOpen) { setBellOpen(false) } else { openBell() } }

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setBellOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const initials = (profile?.full_name ?? '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map((w: string) => w[0].toUpperCase()).join('')

  return (
    <div className="flex h-screen bg-gray-50">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r border-gray-200">
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="text-xl font-bold text-teal-700">Tiru</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, pulse }) => (
            <NavLink key={to} to={to} className={navClass}>
              <span className="relative">
                <Icon size={18} />
                {pulse && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500">
                    <span className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          ))}
          <NavLink to="/incidents" className={navClass}>
            <ShieldAlert size={18} />
            Incidents
          </NavLink>
          <NavLink to="/notices" className={navClass}>
            <Bell size={18} />
            Notices
            {unreadNotices > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                {unreadNotices > 9 ? '9+' : unreadNotices}
              </span>
            )}
          </NavLink>
          {canFlags && (
            <NavLink to="/flags" className={navClass}>
              <AlertTriangle size={18} />
              Flags
            </NavLink>
          )}
          {canAudit && (
            <NavLink to="/audit" className={navClass}>
              <ClipboardList size={18} />
              Audit Log
            </NavLink>
          )}
          {canAdmin && (
            <NavLink to="/admin" className={navClass}>
              <Settings size={18} />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200 space-y-3">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2.5 w-full min-w-0 group text-left"
          >
            <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center
                            text-white text-xs font-bold flex-shrink-0 select-none
                            group-hover:bg-teal-700 transition-colors">
              {initials || <User size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-teal-700 transition-colors">
                {profile?.full_name ?? '—'}
              </p>
              <p className="text-xs text-gray-500 capitalize truncate">
                {roleLabel(profile?.role)}
              </p>
            </div>
          </button>
          <button
            onClick={() => setSignOutConfirm(true)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Page content ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* ── Top header bar ── */}
        <header
          className="relative shrink-0 z-20 bg-white border-b border-gray-100"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center h-14 px-4">
          {/* LEFT zone — Tiru wordmark (mobile only; desktop shows it in the sidebar) */}
          {/* Fixed width matches the RIGHT bell zone so CENTER stays truly centered */}
          <div className="w-10 flex-shrink-0 flex items-center">
            <span className="text-lg font-bold text-teal-700 md:hidden">Tiru</span>
          </div>

          {/* CENTER zone — facility name in a pill, truncated, never wraps */}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            {facilityName && (
              <div className="flex items-center justify-center w-full min-w-0 overflow-hidden px-2">
                <span
                  className="truncate text-[13px] md:text-[14px] font-bold text-center border border-slate-300 rounded-full px-3 py-0.5 max-w-full"
                  style={{ color: '#1E293B', letterSpacing: '0.01em' }}
                >
                  {facilityName}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT zone — Bell button + dropdown */}
          <div className="relative w-10 flex-shrink-0 flex items-center justify-end" ref={bellRef}>
            <button
              onClick={toggleBell}
              className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={22} className="text-gray-600" />
              {unreadNotices > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
                  {unreadNotices > 9 ? '9+' : unreadNotices}
                </span>
              )}
            </button>

            {/* Dropdown panel */}
            {bellOpen && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-100">
                  <span className="font-semibold text-gray-900 text-sm mr-auto">Notifications</span>
                  {canBroadcast && (
                    <button
                      onClick={() => { navigate('/notices'); setBellOpen(false) }}
                      className="flex items-center gap-0.5 text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium px-2 py-1 rounded-lg transition-colors"
                    >
                      <Plus size={11} />New
                    </button>
                  )}
                  <button
                    onClick={markAllRead}
                    className="text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 transition-colors"
                  >
                    <CheckCheck size={13} />Mark all read
                  </button>
                </div>

                <div className="overflow-y-auto max-h-96">
                  {panelLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : panelNotices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                      <Bell size={28} className="mb-2 opacity-40" />
                      <span className="text-sm">No notifications yet</span>
                    </div>
                  ) : (
                    panelNotices.slice(0, 10).map(notice => (
                      <button
                        key={notice.id}
                        onClick={() => {
                          if (!notice.is_read) {
                            supabase.from('notice_reads').upsert(
                              { notice_id: notice.id, user_id: profile!.id },
                              { onConflict: 'notice_id,user_id', ignoreDuplicates: true }
                            )
                            setPanelNotices(prev => prev.map(n => n.id === notice.id ? { ...n, is_read: true } : n))
                            setUnreadNotices(prev => Math.max(0, prev - 1))
                          }
                          navigate('/notices')
                          setBellOpen(false)
                        }}
                        className={`w-full flex items-start gap-3 px-4 py-3 transition-colors border-b border-gray-50 last:border-0 text-left border-l-4 ${
                          notice.is_read
                            ? 'bg-white border-l-transparent hover:bg-gray-50'
                            : 'bg-teal-50 border-l-teal-500 hover:bg-teal-100'
                        }`}
                      >
                        <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full block"
                          style={{ background: notice.is_read ? 'transparent' : '#14b8a6' }} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${notice.is_read ? 'font-normal text-gray-500' : 'font-bold text-gray-900'}`}>
                            {notice.title}
                          </p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{notice.body}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-gray-400">{timeAgo(notice.created_at)}</span>
                            <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full font-medium">
                              {audienceLabel(notice.audience)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="border-t border-gray-100 px-4 py-3">
                  <button
                    onClick={() => { navigate('/notices'); setBellOpen(false) }}
                    className="text-sm text-teal-600 hover:text-teal-800 font-medium w-full text-center transition-colors"
                  >
                    View all notifications &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 20px))' }}
        >
          <Outlet />
        </main>
      </div>

      {/* ── Bottom tab bar (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 rounded-t-2xl shadow-lg overflow-visible"
        style={{
          background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>

        <div className="flex items-end">
          {/* Left: Dashboard, Shifts */}
          {[
            { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { to: '/shifts',    label: 'Shifts',    icon: CalendarDays },
          ].map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to
            return (
              <NavLink key={to} to={to}
                className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-1 text-[10px] font-semibold transition-all ${
                  isActive ? 'text-white' : 'text-teal-100/70 hover:text-white'
                }`}>
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-white/20 shadow-lg' : ''}`}>
                  <Icon size={18} />
                </div>
                <span className="tracking-wide">{label}</span>
              </NavLink>
            )
          })}

          {/* Center: Attendance FAB */}
          <NavLink to="/attendance" className="flex-1 flex flex-col items-center justify-end pb-1 gap-0.5">
            <div className="relative -mt-5">
              <div className="absolute -inset-0.5 rounded-full bg-white" />
              <div className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-teal-900/30 transition-colors ${
                location.pathname === '/attendance' ? 'bg-teal-700' : 'bg-teal-600'
              }`}>
                <QrCode size={28} className="text-white" />
              </div>
            </div>
            <span className={`text-[10px] font-semibold tracking-wide ${
              location.pathname === '/attendance' ? 'text-white' : 'text-teal-100'
            }`}>Attendance</span>
          </NavLink>

          {/* Right: Leave */}
          {[
            { to: '/leave', label: 'Leave', icon: CalendarOff },
          ].map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to
            return (
              <NavLink key={to} to={to}
                className={`flex-1 flex flex-col items-center justify-center py-1.5 gap-1 text-[10px] font-semibold transition-all ${
                  isActive ? 'text-white' : 'text-teal-100/70 hover:text-white'
                }`}>
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-white/20 shadow-lg' : ''}`}>
                  <Icon size={18} />
                </div>
                <span className="tracking-wide">{label}</span>
              </NavLink>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-1.5 gap-1 text-[10px] font-semibold text-teal-100/70 hover:text-white transition-all relative"
          >
            <div className="p-1.5 rounded-xl relative">
              <MoreHorizontal size={18} />
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {badgeLabel}
                </span>
              )}
            </div>
            <span className="tracking-wide">More</span>
          </button>
        </div>
      </nav>

      {/* ── More drawer ── */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-30"
            onClick={closeDrawer}
          />
          <div className="md:hidden fixed bottom-0 inset-x-0 bg-white rounded-t-2xl shadow-2xl z-40 pb-safe">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />

            <div className="px-4 pb-6 space-y-1">
              {/* My Profile */}
              <button
                onClick={() => go('/profile')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center
                                text-white text-xs font-bold flex-shrink-0 select-none">
                  {initials || <User size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {profile?.full_name ?? 'My Profile'}
                  </p>
                  <p className="text-xs text-gray-400 capitalize truncate">
                    {roleLabel(profile?.role)}
                  </p>
                </div>
              </button>

              {/* On Duty */}
              <button
                onClick={() => go('/onduty')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <span className="relative">
                  <Activity size={20} className="text-green-600" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500">
                    <span className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
                  </span>
                </span>
                <span className="flex-1 text-sm font-medium text-gray-800">On Duty</span>
              </button>

              {/* Staff */}
              <button
                onClick={() => go('/staff')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <Users size={20} className="text-gray-600" />
                <span className="flex-1 text-sm font-medium text-gray-800">Staff Directory</span>
              </button>

              {/* Incidents */}
              <button
                onClick={() => go('/incidents')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <ShieldAlert size={20} className="text-gray-600" />
                <span className="flex-1 text-sm font-medium text-gray-800">Incidents</span>
                {isLeadership && openIncidents > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                )}
              </button>

              {/* Notices */}
              <button
                onClick={() => go('/notices')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <Bell size={20} className="text-gray-600" />
                <span className="flex-1 text-sm font-medium text-gray-800">Notices</span>
                {unreadNotices > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                    {unreadNotices > 9 ? '9+' : unreadNotices}
                  </span>
                )}
              </button>

              {/* Flags (leadership) */}
              {canFlags && (
                <button
                  onClick={() => go('/flags')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <AlertTriangle size={20} className="text-red-500" />
                  <span className="text-sm font-medium text-gray-800">Flags &amp; Alerts</span>
                </button>
              )}

              {/* Audit Log */}
              {canAudit && (
                <button
                  onClick={() => go('/audit')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <ClipboardList size={20} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-800">Audit Log</span>
                </button>
              )}

              {/* Admin */}
              {canAdmin && (
                <button
                  onClick={() => go('/admin')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <Settings size={20} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-800">Admin</span>
                </button>
              )}

              <div className="border-t border-gray-100 my-2" />

              {/* Sign out */}
              <button
                onClick={confirmSignOut}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 transition-colors text-left"
              >
                <LogOut size={20} className="text-red-500" />
                <span className="text-sm font-medium text-red-500">Sign out</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Sign-out confirmation dialog ── */}
      {signOutConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setSignOutConfirm(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 pointer-events-auto">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign Out?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to sign out of Tiru?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setSignOutConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={doSignOut}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
