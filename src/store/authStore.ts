import { create } from 'zustand'

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
}

interface AuthStore {
  profile: Profile | null
  profileReady: boolean
  setProfile: (profile: Profile | null) => void
  setProfileReady: (ready: boolean) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  profile: null,
  profileReady: false,
  setProfile: (profile) => set({ profile }),
  setProfileReady: (ready) => set({ profileReady: ready }),
}))
