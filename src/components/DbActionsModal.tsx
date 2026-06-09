import React, { useState } from 'react'
import { wipeResourceTracker } from '../lib/operations'
import AppModal from './layout/AppModal'

export default function DbActionsModal({ onClose }: { onClose: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const [wiping, setWiping] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleWipe = async () => {
    if (confirmText !== 'WIPE') return

    setWiping(true)
    setMessage(null)

    const result = await wipeResourceTracker()

    setWiping(false)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      return
    }

    setMessage({
      type: 'success',
      text: `Wiped ${result.deletedCount ?? 0} personal stock row(s).`,
    })
    setConfirmText('')
  }

  return (
    <AppModal
      title="DB Actions"
      subtitle="Super-admin database operations"
      onClose={onClose}
      size="sm"
      zIndex={70}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Close
        </button>
      }
    >
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-500/50 text-green-400'
              : 'bg-red-900/50 border border-red-500/50 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="p-3 sm:p-4 rounded-xl border border-red-500/30 bg-red-950/20 space-y-3">
        <div>
          <h3 className="text-white font-medium text-sm">Resource Tracker Wipe</h3>
          <p className="text-sm text-slate-400 mt-1">
            Deletes all rows from personal resource inventory. Site Total will read empty until members
            re-enter stock. This cannot be undone.
          </p>
        </div>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type WIPE to confirm"
          className="w-full px-3 py-2 bg-slate-800 border border-red-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 text-sm"
        />
        <button
          type="button"
          onClick={() => void handleWipe()}
          disabled={wiping || confirmText !== 'WIPE'}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {wiping ? 'Wiping...' : 'Wipe all personal stock'}
        </button>
      </div>
    </AppModal>
  )
}
