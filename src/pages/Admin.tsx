import { Settings } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function Admin() {
  const profile = useAuthStore((s) => s.profile)

  if (profile && profile.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <Settings size={22} className="text-teal-700" />
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">System configuration and user management.</p>
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-gray-400 text-sm">
        Admin content coming soon.
      </div>
    </div>
  )
}
