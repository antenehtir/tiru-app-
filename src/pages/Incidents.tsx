import { AlertTriangle } from 'lucide-react'

export default function Incidents() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <AlertTriangle size={22} className="text-teal-700" />
        <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">Log and review facility incidents.</p>
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-gray-400 text-sm">
        Incidents content coming soon.
      </div>
    </div>
  )
}
