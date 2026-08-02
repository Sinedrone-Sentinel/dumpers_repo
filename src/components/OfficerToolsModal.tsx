import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import AppModal from './layout/AppModal'

/**
 * Officer / super-admin tools for RSI verification and reputation resets.
 * Approvals, roles, and member bans live in Admin Panel — not duplicated here.
 */
export default function OfficerToolsModal({
  onClose,
  isSuperAdmin = false,
}: {
  onClose: () => void
  isSuperAdmin?: boolean
}) {
  const [rsiHandleToRevoke, setRsiHandleToRevoke] = useState('')
  const [alsoBanUser, setAlsoBanUser] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [toolMessage, setToolMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [repResetHandle, setRepResetHandle] = useState('')
  const [repResetUserId, setRepResetUserId] = useState<string | null>(null)
  const [repResetUserName, setRepResetUserName] = useState('')
  const [clearArchived, setClearArchived] = useState(false)
  const [searchingUser, setSearchingUser] = useState(false)

  const handleRevokeVerification = async () => {
    if (!rsiHandleToRevoke.trim()) return

    setProcessing(true)
    setToolMessage(null)

    try {
      // Ban+revoke RPC is super-admin only; officers ban from Admin Panel.
      const useBan = isSuperAdmin && alsoBanUser
      const rpcName = useBan ? 'remove_rsi_verification_and_ban' : 'officer_revoke_rsi_verification'
      const { data, error } = await supabase.rpc(rpcName, {
        p_handle: rsiHandleToRevoke.trim(),
        ...(useBan && { p_reason: 'Officer action via Officer Tools' }),
      })

      if (error) throw error

      if (data?.success) {
        const useBan = isSuperAdmin && alsoBanUser
        const action = useBan ? 'revoked and banned' : 'revoked'
        setToolMessage({
          type: 'success',
          text: `RSI Handle verification ${action} for ${data.display_name || data.banned_user || rsiHandleToRevoke}`,
        })
        setRsiHandleToRevoke('')
        setAlsoBanUser(false)
      } else {
        setToolMessage({ type: 'error', text: data?.error || 'Failed to revoke verification' })
      }
    } catch (err) {
      setToolMessage({ type: 'error', text: (err as Error).message })
    }

    setProcessing(false)
  }

  const handleSearchRepUser = async () => {
    if (!repResetHandle.trim()) return

    setSearchingUser(true)
    setToolMessage(null)
    setRepResetUserId(null)
    setRepResetUserName('')

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, rsi_handle, email, role')
        .ilike('rsi_handle', repResetHandle.trim())
        .single()

      if (error || !data) {
        setToolMessage({ type: 'error', text: 'User not found with that RSI Handle' })
      } else if (data.role === 'officer' || data.role === 'super-admin') {
        setToolMessage({ type: 'error', text: 'Cannot reset reputation of officers or admins' })
      } else {
        setRepResetUserId(data.id)
        setRepResetUserName(data.rsi_handle || data.display_name || data.email || 'Unknown')
      }
    } catch (err) {
      setToolMessage({ type: 'error', text: (err as Error).message })
    }

    setSearchingUser(false)
  }

  const handleResetRep = async (type: 'buyer' | 'fulfiller') => {
    if (!repResetUserId) return

    setProcessing(true)
    setToolMessage(null)

    try {
      const rpcName = type === 'buyer' ? 'reset_user_buyer_rep' : 'reset_user_fulfiller_rep'
      const { data, error } = await supabase.rpc(rpcName, {
        p_target_user_id: repResetUserId,
        p_clear_archived: clearArchived,
      })

      if (error) throw error

      if (data?.success) {
        const archiveMsg = clearArchived ? ` and ${data.deleted_orders} archived orders` : ''
        setToolMessage({
          type: 'success',
          text: `Reset ${type} rep for ${repResetUserName}. Deleted ${data.deleted_ratings} ratings${archiveMsg}.`,
        })
        setRepResetHandle('')
        setRepResetUserId(null)
        setRepResetUserName('')
        setClearArchived(false)
      } else {
        setToolMessage({ type: 'error', text: data?.error || 'Failed to reset reputation' })
      }
    } catch (err) {
      setToolMessage({ type: 'error', text: (err as Error).message })
    }

    setProcessing(false)
  }

  return (
    <AppModal
      title="Officer Tools"
      subtitle="RSI verification and reputation. Use Admin Panel for approvals, roles, and bans."
      onClose={onClose}
      size="md"
      zIndex={70}
    >
      <div className="space-y-6">
        {toolMessage && (
          <div
            className={`p-3 rounded-lg text-sm ${
              toolMessage.type === 'success'
                ? 'bg-green-900/40 text-green-300 border border-green-500/30'
                : 'bg-red-900/40 text-red-300 border border-red-500/30'
            }`}
          >
            {toolMessage.text}
          </div>
        )}

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Revoke RSI verification</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Clears the verified handle. To ban an account, use Admin Panel (keeps one place for bans).
            </p>
          </div>
          <input
            type="text"
            value={rsiHandleToRevoke}
            onChange={(e) => setRsiHandleToRevoke(e.target.value)}
            placeholder="RSI Handle…"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
          {isSuperAdmin && (
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoBanUser}
                onChange={(e) => setAlsoBanUser(e.target.checked)}
                className="rounded border-slate-500 bg-slate-800 text-red-500 focus:ring-red-500/40"
              />
              <span className={alsoBanUser ? 'text-red-400' : ''}>Also ban this user</span>
            </label>
          )}
          <button
            type="button"
            onClick={handleRevokeVerification}
            disabled={processing || !rsiHandleToRevoke.trim()}
            className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              isSuperAdmin && alsoBanUser
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            {processing
              ? 'Processing…'
              : isSuperAdmin && alsoBanUser
                ? 'Revoke & Ban'
                : 'Revoke Verification'}
          </button>
        </section>

        <div className="border-t border-slate-700" />

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Reset reputation</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Find a member by RSI Handle, then clear buyer or fulfiller ratings.
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
              placeholder="RSI Handle…"
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
            <button
              type="button"
              onClick={handleSearchRepUser}
              disabled={searchingUser || !repResetHandle.trim()}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {searchingUser ? '…' : 'Find'}
            </button>
          </div>
          {repResetUserId && (
            <div className="p-3 bg-slate-900 rounded-lg border border-slate-600 space-y-3">
              <p className="text-sm text-white">
                Found: <strong>{repResetUserName}</strong>
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearArchived}
                  onChange={(e) => setClearArchived(e.target.checked)}
                  className="rounded border-slate-500 bg-slate-800 text-amber-500 focus:ring-amber-500/40"
                />
                <span>Also clear archived orders</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleResetRep('buyer')}
                  disabled={processing}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reset Buyer Rep
                </button>
                <button
                  type="button"
                  onClick={() => handleResetRep('fulfiller')}
                  disabled={processing}
                  className="flex-1 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reset Fulfiller Rep
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppModal>
  )
}
