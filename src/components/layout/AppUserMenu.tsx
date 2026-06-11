import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useClickOutside } from '../../hooks/useClickOutside'
import type { Profile } from '../../lib/supabase'
import { supabase } from '../../lib/supabase'
import RsiVerifiedBadge from '../RsiVerifiedBadge'

interface AppUserMenuProps {
  displayName: string
  profile: Profile | null
  isPending: boolean
  isGhostMode: boolean
  isOfficerOrAbove: boolean
  isSuperAdmin: boolean
  showSettingsButton: boolean
  showDbActionsButton: boolean
  showAdminPanelButton: boolean
  onOpenSettings: () => void
  onOpenDbActions: () => void
  onOpenAdmin: () => void
  onOpenSupport: () => void
  onSignOut: () => void
}

export default function AppUserMenu({
  displayName,
  profile,
  isPending,
  isGhostMode,
  isOfficerOrAbove,
  isSuperAdmin,
  showSettingsButton,
  showDbActionsButton,
  showAdminPanelButton,
  onOpenSettings,
  onOpenDbActions,
  onOpenAdmin,
  onOpenSupport,
  onSignOut,
}: AppUserMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const routerLocation = useRouterState({ select: (s) => s.location })
  const [showOfficerTools, setShowOfficerTools] = useState(false)
  const [rsiHandleToRevoke, setRsiHandleToRevoke] = useState('')
  const [alsoBanUser, setAlsoBanUser] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [toolMessage, setToolMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [repResetHandle, setRepResetHandle] = useState('')
  const [repResetUserId, setRepResetUserId] = useState<string | null>(null)
  const [repResetUserName, setRepResetUserName] = useState('')
  const [clearArchived, setClearArchived] = useState(false)
  const [searchingUser, setSearchingUser] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
    setShowOfficerTools(false)
    setToolMessage(null)
    setRepResetHandle('')
    setRepResetUserId(null)
    setRepResetUserName('')
    setClearArchived(false)
  }, [])

  useClickOutside(containerRef, open, close)

  useEffect(() => {
    close()
  }, [routerLocation.pathname, routerLocation.searchStr, close])

  const handleRevokeVerification = async () => {
    if (!rsiHandleToRevoke.trim()) return
    
    setProcessing(true)
    setToolMessage(null)
    
    try {
      const rpcName = alsoBanUser ? 'remove_rsi_verification_and_ban' : 'officer_revoke_rsi_verification'
      const { data, error } = await supabase.rpc(rpcName, {
        p_handle: rsiHandleToRevoke.trim(),
        ...(alsoBanUser && { p_reason: 'Officer action via support tools' }),
      })
      
      if (error) throw error
      
      if (data?.success) {
        const action = alsoBanUser ? 'revoked and banned' : 'revoked'
        setToolMessage({ type: 'success', text: `RSI Handle verification ${action} for ${data.display_name || rsiHandleToRevoke}` })
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

  if (isPending) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-950/80 border border-amber-500/50 rounded-lg">
          <div className="w-6 h-6 rounded-full bg-amber-600/30 border border-amber-500/50 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-amber-300 text-xs font-semibold uppercase tracking-wide">Pending</span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    )
  }

  const triggerClass = isGhostMode
    ? 'bg-purple-950/80 border-purple-500/60 hover:bg-purple-900/80'
    : 'bg-slate-800/90 border-slate-600 hover:bg-slate-700'

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1 backdrop-blur border rounded-lg transition-colors shadow-md ${triggerClass}`}
      >
        {isGhostMode ? (
          <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          </div>
        ) : profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={displayName} className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs">
            {displayName[0]?.toUpperCase()}
          </div>
        )}
        <span
          className={`text-xs hidden sm:inline max-w-[100px] truncate ${
            isGhostMode ? 'text-purple-300 font-semibold uppercase tracking-wide' : 'text-white'
          }`}
        >
          {isGhostMode ? 'Ghost' : displayName}
        </span>
        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
          <div
            className={`absolute right-0 top-full mt-2 w-56 bg-slate-800 rounded-xl shadow-xl z-[60] max-h-[min(70dvh,24rem)] overflow-y-auto overscroll-contain ${
              isGhostMode ? 'border border-purple-500/30' : 'border border-slate-700'
            }`}
          >
            <div className="p-3 border-b border-slate-700">
              <p className="text-white font-medium truncate flex items-center gap-1.5">
                <span>{displayName}</span>
                {profile?.rsi_handle_verified && <RsiVerifiedBadge size="sm" />}
              </p>
              {isGhostMode ? (
                <p className="text-purple-300/80 text-xs mt-1">Hidden from member lists. Personal tracking only.</p>
              ) : (
                <>
                  {profile?.rsi_handle && (
                    <p className="text-slate-500 text-xs truncate">({profile.display_name})</p>
                  )}
                  <p className="text-slate-400 text-sm truncate">{profile?.email}</p>
                  <p className="text-xs mt-1">
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        profile?.role === 'super-admin'
                          ? 'bg-purple-900/50 text-purple-400'
                          : profile?.role === 'officer'
                            ? 'bg-blue-900/50 text-blue-400'
                            : 'bg-green-900/50 text-green-400'
                      }`}
                    >
                      {profile?.role === 'super-admin'
                        ? 'Super Admin'
                        : profile?.role === 'officer'
                          ? 'Officer'
                          : 'Member'}
                    </span>
                  </p>
                </>
              )}
            </div>

            {showSettingsButton && (
              <button
                type="button"
                onClick={() => {
                  close()
                  onOpenSettings()
                }}
                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Settings
              </button>
            )}

            {showDbActionsButton && (
              <button
                type="button"
                onClick={() => {
                  close()
                  onOpenDbActions()
                }}
                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 transition-colors"
              >
                DB Actions
              </button>
            )}

            {showAdminPanelButton && (
              <button
                type="button"
                onClick={() => {
                  close()
                  onOpenAdmin()
                }}
                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Admin Panel
              </button>
            )}

            {/* Support Dashboard for all officers and super-admins */}
            {isOfficerOrAbove && (
              <>
                <div className="border-t border-slate-700 my-1" />
                <Link
                  to="/support-dashboard"
                  onClick={close}
                  className="block w-full px-4 py-2 text-left text-blue-400 hover:bg-slate-700 transition-colors"
                >
                  Support Dashboard
                </Link>
              </>
            )}

            {/* Officer Tools (not for super-admins - they have DB Actions) */}
            {isOfficerOrAbove && !isSuperAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setShowOfficerTools(!showOfficerTools)}
                  className="w-full px-4 py-2 text-left text-amber-400 hover:bg-slate-700 transition-colors flex items-center justify-between"
                >
                  <span>Officer Tools</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${showOfficerTools ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showOfficerTools && (
                  <div className="px-4 py-3 bg-slate-900/50 border-t border-slate-700 space-y-4">
                    {toolMessage && (
                      <div
                        className={`p-2 rounded text-xs ${
                          toolMessage.type === 'success'
                            ? 'bg-green-900/50 text-green-400 border border-green-500/30'
                            : 'bg-red-900/50 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {toolMessage.text}
                      </div>
                    )}

                    {/* RSI Revoke Section */}
                    <div className="space-y-2">
                      <label className="block text-xs text-slate-400 font-medium">Revoke RSI Handle</label>
                      <input
                        type="text"
                        value={rsiHandleToRevoke}
                        onChange={(e) => setRsiHandleToRevoke(e.target.value)}
                        placeholder="Enter RSI Handle..."
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={alsoBanUser}
                          onChange={(e) => setAlsoBanUser(e.target.checked)}
                          className="rounded border-slate-500 bg-slate-800 text-red-500 focus:ring-red-500/40"
                        />
                        <span className={alsoBanUser ? 'text-red-400' : ''}>Also ban this user</span>
                      </label>
                      <button
                        onClick={handleRevokeVerification}
                        disabled={processing || !rsiHandleToRevoke.trim()}
                        className={`w-full px-3 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-50 ${
                          alsoBanUser
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-amber-600 hover:bg-amber-700 text-white'
                        }`}
                      >
                        {processing ? 'Processing...' : alsoBanUser ? 'Revoke & Ban' : 'Revoke Verification'}
                      </button>
                    </div>

                    {/* Rep Reset Section */}
                    <div className="pt-3 border-t border-slate-700 space-y-2">
                      <label className="block text-xs text-slate-400 font-medium">Reset User Reputation</label>
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
                          className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                        />
                        <button
                          onClick={handleSearchRepUser}
                          disabled={searchingUser || !repResetHandle.trim()}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded disabled:opacity-50"
                        >
                          {searchingUser ? '...' : 'Find'}
                        </button>
                      </div>
                      {repResetUserId && (
                        <div className="p-2 bg-slate-800 rounded border border-slate-600">
                          <p className="text-sm text-white">Found: <strong>{repResetUserName}</strong></p>
                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer mt-2">
                            <input
                              type="checkbox"
                              checked={clearArchived}
                              onChange={(e) => setClearArchived(e.target.checked)}
                              className="rounded border-slate-500 bg-slate-800 text-amber-500 focus:ring-amber-500/40"
                            />
                            <span>Also clear archived orders</span>
                          </label>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleResetRep('buyer')}
                              disabled={processing}
                              className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded disabled:opacity-50"
                            >
                              Reset Buyer Rep
                            </button>
                            <button
                              onClick={() => handleResetRep('fulfiller')}
                              disabled={processing}
                              className="flex-1 px-2 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded disabled:opacity-50"
                            >
                              Reset Fulfiller Rep
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="border-t border-slate-700 my-1" />

            {/* Support for members and officers (not super-admins) */}
            {!isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  close()
                  onOpenSupport()
                }}
                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Support
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                close()
                onSignOut()
              }}
              className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
      )}
    </div>
  )
}
