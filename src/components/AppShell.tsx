import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, UserCheck, Umbrella,
  Users, AlertTriangle, Bell, Settings, LogOut,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/shifts',     label: 'Shifts',     icon: CalendarDays },
  { to: '/attendance', label: 'Attendance', icon: UserCheck },
  { to: '/leave',      label: 'Leave',      icon: Umbrella },
  { to: '/staff',      label: 'Staff',      icon: Users },
  { to: '/incidents',  label: 'Incidents',  icon: AlertTriangle },
  { to: '/notices',    label: 'Notices',    icon: Bell },
]

const MOBILE_ITEMS = NAV_ITEMS.slice(0, 5)

function navClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-teal-50 text-teal-700'
      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  }`
}

export default function AppShell() {
  const profile = useAuthStore((s) => s.profile)
  const isSuperAdmin = profile?.role === 'super_admin'

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
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-10">
        {MOBILE_ITEMS.map(({ to, label, icon: Icon }) => (
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
      </nav>
    </div>
  )
}
