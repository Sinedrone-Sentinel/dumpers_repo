import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function ProfileSettings({ onClose }: { onClose: () => void }) {
  const { profile, updateRsiHandle } = useAuth()
  const [rsiHandle, setRsiHandle] = useState(profile?.rsi_handle || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    const success = await updateRsiHandle(rsiHandle)

    if (success) {
      setMessage({ type: 'success', text: 'RSI Handle saved!' })
      setTimeout(() => onClose(), 1000)
    } else {
      setMessage({ type: 'error', text: 'Failed to save. Please try again.' })
    }

    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Profile Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              RSI Handle (In-Game Name)
            </label>
            <input
              type="text"
              value={rsiHandle}
              onChange={(e) => setRsiHandle(e.target.value)}
              placeholder="Enter your RSI handle..."
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all"
            />
            <p className="mt-2 text-xs text-slate-500">
              This will be displayed instead of your Google name throughout the app.
            </p>
          </div>

          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'success' 
                ? 'bg-green-900/50 border border-green-500/50 text-green-400'
                : 'bg-red-900/50 border border-red-500/50 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
