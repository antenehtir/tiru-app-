import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const profile = useAuthStore(state => state.profile)
  const session = useAuthStore(state => state.session)
  const loading = useAuthStore(state => state.loading)
  return { profile, session, loading }
}

export default useAuth
