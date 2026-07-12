import React, { useState } from 'react'
import { wipeResourceTracker } from '../lib/operations'
import { supabase } from '../lib/supabase'
import AppModal from './layout/AppModal'

export default function DbActionsModal({ onClose }: { onClose: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const [wiping, setWiping] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // RSI Handle verification removal state
  const [rsiHandleToRevoke, setRsiHandleToRevoke] = useState('')
  const [alsoBanUser, setAlsoBanUser] = useState(false)
  const [revoking, setRevoking] = useState(false)

  // Rep reset state
  const [repResetHandle, setRepResetHandle] = useState('')
  const [repResetUserId, setRepResetUserId] = useState<string | null>(null)
  const [repResetUserName, setRepResetUserName] = useState('')
  const [clearArchived, setClearArchived] = useState(false)
  const [searchingUser, setSearchingUser] = useState(false)
  const [resettingRep, setResettingRep] = useState(false)

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

  const handleRevokeVerification = async () => {
    if (!rsiHandleToRevoke.trim()) return

    setRevoking(true)
    setMessage(null)

    try {
      const rpcName = alsoBanUser ? 'remove_rsi_verification_and_ban' : 'remove_rsi_verification'
      const params = alsoBanUser 
        ? { p_handle: rsiHandleToRevoke.trim(), p_reason: 'RSI Handle verification revoked by super-admin' }
        : { p_handle: rsiHandleToRevoke.trim() }

      const { data, error } = await supabase.rpc(rpcName, params)

      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else if (!data?.success) {
        setMessage({ type: 'error', text: data?.error || 'Failed to revoke verification' })
      } else {
        const action = alsoBanUser ? 'revoked and banned' : 'revoked'
        const userName = data.display_name || data.banned_user || rsiHandleToRevoke
        setMessage({ 
          type: 'success', 
          text: `Verification ${action} for ${userName}` 
        })
        setRsiHandleToRevoke('')
        setAlsoBanUser(false)
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error during revocation' })
    }

    setRevoking(false)
  }

  const handleSearchRepUser = async () => {
    if (!repResetHandle.trim()) return

    setSearchingUser(true)
    setMessage(null)
    setRepResetUserId(null)
    setRepResetUserName('')

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, rsi_handle, email')
        .ilike('rsi_handle', repResetHandle.trim())
        .single()

      if (error || !data) {
        setMessage({ type: 'error', text: 'User not found with that RSI Handle' })
      } else {
        setRepResetUserId(data.id)
        setRepResetUserName(data.rsi_handle || data.display_name || data.email || 'Unknown')
      }
    } catch {
      setMessage({ type: 'error', text: 'Error searching for user' })
    }

    setSearchingUser(false)
  }

  const handleResetRep = async (type: 'buyer' | 'fulfiller') => {
    if (!repResetUserId) return

    setResettingRep(true)
    setMessage(null)

    try {
      const rpcName = type === 'buyer' ? 'reset_user_buyer_rep' : 'reset_user_fulfiller_rep'
      const { data, error } = await supabase.rpc(rpcName, {
        p_target_user_id: repResetUserId,
        p_clear_archived: clearArchived,
      })

      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else if (data?.success) {
        const archiveMsg = clearArchived ? ` and ${data.deleted_orders} archived orders` : ''
        setMessage({
          type: 'success',
          text: `Reset ${type} rep for ${repResetUserName}. Deleted ${data.deleted_ratings} ratings${archiveMsg}.`,
        })
        setRepResetHandle('')
        setRepResetUserId(null)
        setRepResetUserName('')
        setClearArchived(false)
      } else {
        setMessage({ type: 'error', text: data?.error || 'Failed to reset reputation' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error resetting reputation' })
    }

    setResettingRep(false)
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

      <div className="space-y-4">
        {/* Game Data Update Process */}
        <div className="p-3 sm:p-4 rounded-xl border border-orange-500/30 bg-orange-950/20 space-y-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium text-sm">Game Data Update Process</h3>
            <p className="text-xs text-slate-400 mt-1">
              Extract and parse data directly from Star Citizen game files when a new patch drops.
              Blueprint catalog ships in <code className="text-violet-400">game-blueprints.json</code>.
            </p>
          </div>

          {/* Step-by-step game data update process */}
          <div className="mt-3 space-y-2">
            {/* Step 1: Extract Game Data */}
            <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg">
              <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-violet-600 text-white text-xs font-bold rounded-full">1</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium">Extract Game Data</p>
                <p className="text-[10px] text-slate-500">StarBreaker: DataForge, localization, shop socpaks, ShopInventories JSON</p>
              </div>
              <code className="shrink-0 px-2 py-1 bg-slate-900 text-violet-400 text-[10px] font-mono rounded select-all">
                .\scripts\extract-game-data.ps1
              </code>
            </div>

            {/* Step 2: Parse Extracted Data */}
            <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg">
              <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-violet-600 text-white text-xs font-bold rounded-full">2</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium">Parse Extracted Data</p>
                <p className="text-[10px] text-slate-500">Generates game-*.json files (blueprints, mining, weapons, lore, etc.)</p>
              </div>
              <code className="shrink-0 px-2 py-1 bg-slate-900 text-violet-400 text-[10px] font-mono rounded select-all">
                node scripts/parse-extracted-data.mjs
              </code>
            </div>

            {/* Step 3: Deploy */}
            <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg">
              <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-violet-600 text-white text-xs font-bold rounded-full">3</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium">Commit &amp; Deploy</p>
                <p className="text-[10px] text-slate-500">Commit game-*.json changes, then build and deploy</p>
              </div>
              <code className="shrink-0 px-2 py-1 bg-slate-900 text-violet-400 text-[10px] font-mono rounded select-all">
                npm run build
              </code>
            </div>

            <p className="text-[10px] text-slate-600 italic pt-1">
              Steps 1–2 run locally in terminal. All game catalogs (blueprints, mining, ordnance, components) are bundled from the parsed game-*.json at build time — no DB sync needed.
            </p>
            <p className="text-[10px] text-amber-400/70 pt-1">
              If Step 2 reports validation issues, game data structure may have changed.
            </p>
          </div>
        </div>

        {/* RSI Handle Verification Revoke */}
        <div className="p-3 sm:p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-3">
          <div>
            <h3 className="text-white font-medium text-sm">Revoke RSI Handle Verification</h3>
            <p className="text-xs text-slate-400 mt-1">
              Remove verification badge from a user's RSI Handle. Optionally ban them at the same time.
            </p>
          </div>
          <input
            type="text"
            value={rsiHandleToRevoke}
            onChange={(e) => setRsiHandleToRevoke(e.target.value)}
            placeholder="Enter RSI Handle to revoke..."
            className="w-full px-3 py-2 bg-slate-800 border border-amber-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 text-sm"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoBanUser}
              onChange={(e) => setAlsoBanUser(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500/20"
            />
            <span className="text-sm text-red-400">Also ban this user</span>
          </label>
          <button
            type="button"
            onClick={() => void handleRevokeVerification()}
            disabled={revoking || !rsiHandleToRevoke.trim()}
            className={`w-full px-4 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              alsoBanUser 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {revoking ? 'Processing...' : alsoBanUser ? 'Revoke & Ban' : 'Revoke Verification'}
          </button>
        </div>

        {/* Rep Reset */}
        <div className="p-3 sm:p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 space-y-3">
          <div>
            <h3 className="text-white font-medium text-sm">Reset User Reputation</h3>
            <p className="text-xs text-slate-400 mt-1">
              Reset a user's buyer or fulfiller reputation. Optionally clear their archived orders.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={repResetHandle}
              onChange={(e) => {
                setRepResetHandle(e.target.value)
                setRepResetUserId(null)
                setRepResetUserName('')
              }}
              placeholder="RSI Handle..."
              className="flex-1 px-3 py-2 bg-slate-800 border border-blue-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 text-sm"
            />
            <button
              onClick={() => void handleSearchRepUser()}
              disabled={searchingUser || !repResetHandle.trim()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {searchingUser ? '...' : 'Find'}
            </button>
          </div>
          {repResetUserId && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-blue-500/20">
              <p className="text-sm text-white mb-2">Found: <strong>{repResetUserName}</strong></p>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={clearArchived}
                  onChange={(e) => setClearArchived(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/20"
                />
                <span className="text-sm text-slate-400">Also clear archived orders/fulfillments</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleResetRep('buyer')}
                  disabled={resettingRep}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reset Buyer Rep
                </button>
                <button
                  onClick={() => void handleResetRep('fulfiller')}
                  disabled={resettingRep}
                  className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reset Fulfiller Rep
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resource Tracker Wipe */}
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
      </div>
    </AppModal>
  )
}
