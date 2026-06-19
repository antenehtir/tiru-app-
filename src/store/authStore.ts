import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  facility_id: string | null
  department_id: string | null
  phone: string | null
  employee_id: string | null
  is_active: boolean | null
  pin: string | null
  created_at: string | null
}

interface AuthStore {
  profile: Profile | null
  session: Session | null
  loading: boolean
  profileReady: boolean
  lastKnownPosition: GeolocationPosition | null
  setProfile: (profile: Profile | null) => void
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  setProfileReady: (ready: boolean) => void
  setLastKnownPosition: (pos: GeolocationPosition) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  profile: null,
  session: null,
  loading: true,
  profileReady: false,
  lastKnownPosition: null,
  setProfile: (profile) => set({ profile }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),
  setProfileReady: (ready) => set({ profileReady: ready }),
  setLastKnownPosition: (pos) => set({ lastKnownPosition: pos }),
}))
