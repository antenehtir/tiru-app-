import { Umbrella } from 'lucide-react'

export default function Leave() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <Umbrella size={22} className="text-teal-700" />
        <h1 className="text-2xl font-bold text-gray-900">Leave</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">Request and approve staff leave.</p>
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-gray-400 text-sm">
        Leave content coming soon.
      </div>
    </div>
  )
}
