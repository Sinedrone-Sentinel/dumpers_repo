import React, { useState, useEffect } from 'react'
import { wipeResourceTracker } from '../lib/operations'
import { supabase } from '../lib/supabase'
import AppModal from './layout/AppModal'

interface StarstringsSyncStatus {
  last_synced_at: string | null
  source_version: string | null
  sync_status: string
  sync_error: string | null
  mining_count: number
  components_count: number
  ordnance_count: number
  blueprint_pools_count: number
}

interface BlueprintsSyncStatus {
  last_synced_at: string | null
  source_version: string | null
  sync_status: string
  sync_error: string | null
  blueprint_count: number
}

export default function DbActionsModal({ onClose }: { onClose: () => void }) {
  const [confirmText, setConfirmText] = useState('')
  const [wiping, setWiping] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  
  // Blueprints sync state
  const [bpSyncStatus, setBpSyncStatus] = useState<BlueprintsSyncStatus | null>(null)
  const [bpSyncing, setBpSyncing] = useState(false)

  // StarStrings sync state
  const [syncStatus, setSyncStatus] = useState<StarstringsSyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)

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

  // Fetch sync statuses on mount
  useEffect(() => {
    const fetchSyncStatuses = async () => {
      // Blueprints sync status
      const { data: bpData, error: bpError } = await supabase.rpc('get_blueprints_sync_status')
      if (!bpError && bpData && bpData.length > 0) {
        setBpSyncStatus(bpData[0])
      }

      // StarStrings sync status
      const { data, error } = await supabase.rpc('get_starstrings_sync_status')
      if (!error && data && data.length > 0) {
        setSyncStatus(data[0])
      }
    }
    fetchSyncStatuses()
  }, [])

  const handleBlueprintsSync = async () => {
    setBpSyncing(true)
    setMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMessage({ type: 'error', text: 'Not authenticated' })
        setBpSyncing(false)
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-blueprints`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setMessage({ type: 'error', text: result.error || 'Blueprint sync failed' })
      } else {
        setMessage({ 
          type: 'success', 
          text: `Synced ${result.count} blueprints (v${result.version})` 
        })
        
        // Refresh sync status
        const { data } = await supabase.rpc('get_blueprints_sync_status')
        if (data && data.length > 0) {
          setBpSyncStatus(data[0])
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error during blueprint sync' })
    }

    setBpSyncing(false)
  }

  const handleStarstringsSync = async () => {
    setSyncing(true)
    setMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMessage({ type: 'error', text: 'Not authenticated' })
        setSyncing(false)
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-starstrings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setMessage({ type: 'error', text: result.error || 'Sync failed' })
      } else {
        setMessage({ 
          type: 'success', 
          text: `Synced: ${result.counts.mining} ores, ${result.counts.components} components, ${result.counts.ordnance} ordnance, ${result.counts.blueprintPools} BP pools` 
        })
        
        // Refresh sync status
        const { data } = await supabase.rpc('get_starstrings_sync_status')
        if (data && data.length > 0) {
          setSyncStatus(data[0])
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error during sync' })
    }

    setSyncing(false)
  }

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
        {/* Blueprints Sync */}
        <div className="p-3 sm:p-4 rounded-xl border border-orange-500/30 bg-orange-950/20 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium text-sm">Sync Blueprints Data</h3>
              <p className="text-xs text-slate-400 mt-1">
                Fetch latest blueprint catalog from sccrafter.com including crafting recipes and mission rewards.
              </p>
              {bpSyncStatus && (
                <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                  {bpSyncStatus.last_synced_at && (
                    <p>Last synced: {new Date(bpSyncStatus.last_synced_at).toLocaleString()}</p>
                  )}
                  {bpSyncStatus.source_version && (
                    <p>Version: {bpSyncStatus.source_version}</p>
                  )}
                  <p className="text-slate-600">
                    {bpSyncStatus.blueprint_count} blueprints
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleBlueprintsSync}
              disabled={bpSyncing}
              className="shrink-0 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bpSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* StarStrings Sync */}
        <div className="p-3 sm:p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium text-sm">Sync StarStrings Data</h3>
              <p className="text-xs text-slate-400 mt-1">
                Fetch latest mining, component, ordnance, and blueprint data from MrKraken's StarStrings GitHub repo.
              </p>
              {syncStatus && (
                <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                  {syncStatus.last_synced_at && (
                    <p>Last synced: {new Date(syncStatus.last_synced_at).toLocaleString()}</p>
                  )}
                  {syncStatus.source_version && (
                    <p>Version: {syncStatus.source_version}</p>
                  )}
                  <p className="text-slate-600">
                    {syncStatus.mining_count} ores · {syncStatus.components_count} components · {syncStatus.ordnance_count} ordnance · {syncStatus.blueprint_pools_count} BP pools
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={handleStarstringsSync}
              disabled={syncing}
              className="shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
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
