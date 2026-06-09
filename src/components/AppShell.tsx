import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import {
  LayoutDashboard, CalendarDays, QrCode, CalendarOff,
  Users, ShieldAlert, Bell, Settings, LogOut, MoreHorizontal,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/shifts',     label: 'Shifts',     icon: CalendarDays },
  { to: '/attendance', label: 'Attendance', icon: QrCode },
  { to: '/leave',      label: 'Leave',      icon: CalendarOff },
  { to: '/staff',      label: 'Staff',      icon: Users },
]

const MOBILE_MAIN = NAV_ITEMS

const LEADERSHIP = ['ceo', 'general_manager', 'medical_director', 'hr', 'super_admin']
const CAN_ADMIN  = ['super_admin', 'ceo', 'general_manager']

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
  const isSuperAdmin  = role === 'super_admin'
  const isLeadership  = LEADERSHIP.includes(role)
  const canAdmin      = CAN_ADMIN.includes(role)

  const [drawerOpen,      setDrawerOpen]      = useState(false)
  const [unreadNotices,   setUnreadNotices]   = useState(0)
  const [openIncidents,   setOpenIncidents]   = useState(0)
  const navigate = useNavigate()

  const fetchCounts = useCallback(async () => {
    if (!profile?.id) return

    // Unread notices
    const { data: allNotices } = await supabase
      .from('notices')
      .select('id')
    const { data: readRows } = await supabase
      .from('notice_reads')
      .select('notice_id')
      .eq('user_id', profile.id)
    const readSet = new Set((readRows ?? []).map((r: { notice_id: string }) => r.notice_id))
    setUnreadNotices(((allNotices ?? []) as { id: string }[]).filter(n => !readSet.has(n.id)).length)

    // Submitted incidents (leadership only)
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

  const badgeCount = unreadNotices + openIncidents
  const badgeLabel = badgeCount > 9 ? '9+' : String(badgeCount)

  const closeDrawer = () => setDrawerOpen(false)

  const go = (path: string) => {
    closeDrawer()
    navigate(path)
  }

  const signOut = () => {
    closeDrawer()
    supabase.auth.signOut()
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r border-gray-200">
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="text-xl font-bold text-teal-700">Tiru</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navClass}>
              <Icon size={18} />
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
          </NavLink>
          {isSuperAdmin && (
            <NavLink to="/admin" className={navClass}>
              <Settings size={18} />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200 space-y-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {profile?.full_name ?? '—'}
            </p>
            <p className="text-xs text-gray-500 capitalize">
              {profile?.role?.replace(/_/g, ' ') ?? ''}
            </p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Page content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Bottom tab bar (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-20">
        {MOBILE_MAIN.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                isActive ? 'text-teal-700' : 'text-gray-500'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}

        {/* More button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium text-gray-500 relative"
        >
          <span className="relative">
            <MoreHorizontal size={20} />
            {badgeCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
                {badgeLabel}
              </span>
            )}
          </span>
          More
        </button>
      </nav>

      {/* ── More drawer ── */}
      {drawerOpen && (
        <>
          {/* Overlay */}
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-30"
            onClick={closeDrawer}
          />

          {/* Drawer */}
          <div className="md:hidden fixed bottom-0 inset-x-0 bg-white rounded-t-2xl shadow-2xl z-40 pb-safe">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />

            <div className="px-4 pb-6 space-y-1">
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

              {/* Admin (conditional) */}
              {canAdmin && (
                <button
                  onClick={() => go('/admin')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                >
                  <Settings size={20} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-800">Admin</span>
                </button>
              )}

              {/* Divider */}
              <div className="border-t border-gray-100 my-2" />

              {/* Sign out */}
              <button
                onClick={signOut}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-50 transition-colors text-left"
              >
                <LogOut size={20} className="text-red-500" />
                <span className="text-sm font-medium text-red-500">Sign out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
