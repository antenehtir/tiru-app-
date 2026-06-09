import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import Shifts from './pages/Shifts'
import Attendance from './pages/Attendance'
import Leave from './pages/Leave'
import Staff from './pages/Staff'
import Incidents from './pages/Incidents'
import Notices from './pages/Notices'
import Flags from './pages/Flags'
import Admin from './pages/Admin'
import Profile from './pages/Profile'

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-8 h-8 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
  </div>
)

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession(session)
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        console.log('Profile result:', profile, 'Error:', error)
        if (profile) useAuthStore.getState().setProfile(profile)
      }
      setAppReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN') {
          setSession(session)
          if (session) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            if (profile) useAuthStore.getState().setProfile(profile)
          }
        }
        if (event === 'SIGNED_OUT') {
          setSession(null)
          useAuthStore.getState().setProfile(null)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  if (!appReady) return <Spinner />
  if (!session) return <Login />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/shifts"     element={<Shifts />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/leave"      element={<Leave />} />
          <Route path="/staff"      element={<Staff />} />
          <Route path="/incidents"  element={<Incidents />} />
          <Route path="/notices"    element={<Notices />} />
          <Route path="/flags"      element={<Flags />} />
          <Route path="/admin"      element={<Admin />} />
          <Route path="/profile"    element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
