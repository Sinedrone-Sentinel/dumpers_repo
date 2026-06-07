import React, { useEffect, useState } from 'react'
import { supabase, Profile, UserRole, BannedUser, banUser, getDisplayName } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type TabType = 'pending' | 'members' | 'officers' | 'banned'

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const { profile: currentUser, isOfficerOrAbove, isSuperAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [users, setUsers] = useState<Profile[]>([])
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [banTarget, setBanTarget] = useState<Profile | null>(null)
  const [banReason, setBanReason] = useState('')

  useEffect(() => {
    if (activeTab === 'banned') {
      fetchBannedUsers()
    } else {
      fetchUsers()
    }
  }, [activeTab])

  const fetchUsers = async () => {
    setLoading(true)
    let query = supabase.from('profiles').select('*')

    if (activeTab === 'pending') {
      query = query.eq('role', 'pending')
    } else if (activeTab === 'members') {
      query = query.eq('role', 'member')
    } else if (activeTab === 'officers') {
      query = query.in('role', ['officer', 'super-admin'])
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching users:', error)
    } else {
      setUsers(data || [])
    }
    setLoading(false)
  }

  const fetchBannedUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('banned_users')
      .select('*')
      .order('banned_at', { ascending: false })

    if (error) {
      console.error('Error fetching banned users:', error)
    } else {
      setBannedUsers(data || [])
    }
    setLoading(false)
  }

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    if (!currentUser) return

    setActionLoading(userId)

    const updateData: Partial<Profile> = { role: newRole }

    if (newRole === 'member' || newRole === 'officer') {
      updateData.approved_at = new Date().toISOString()
      updateData.approved_by = currentUser.id
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)

    if (error) {
      console.error('Error updating role:', error)
      alert('Failed to update user role')
    } else {
      fetchUsers()
    }

    setActionLoading(null)
  }

  const handleBan = async () => {
    if (!banTarget) return

    setActionLoading(banTarget.id)
    const result = await banUser(banTarget.id, banReason.trim() || undefined)

    if (!result.success) {
      alert(result.error || 'Failed to ban user')
    } else {
      setBanTarget(null)
      setBanReason('')
      fetchUsers()
    }

    setActionLoading(null)
  }

  const canPromoteToOfficer = (targetUser: Profile) => {
    if (isSuperAdmin) return true
    if (isOfficerOrAbove && targetUser.role === 'member') return true
    return false
  }

  const canDemote = (targetUser: Profile) => {
    if (!isSuperAdmin) return false
    if (targetUser.id === currentUser?.id) return false
    return targetUser.role === 'officer'
  }

  const canBan = (targetUser: Profile) => {
    if (!isOfficerOrAbove) return false
    if (targetUser.id === currentUser?.id) return false
    if (targetUser.role === 'super-admin') return false
    return activeTab === 'members' || activeTab === 'officers'
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'pending', label: 'Pending' },
    { id: 'members', label: 'Members' },
    { id: 'officers', label: 'Officers' },
    { id: 'banned', label: 'Banned' },
  ]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Admin Panel</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-slate-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-t-2 border-red-500 rounded-full animate-spin mx-auto"></div>
              <p className="text-slate-400 mt-2">Loading...</p>
            </div>
          ) : activeTab === 'banned' ? (
            bannedUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No banned users
              </div>
            ) : (
              <div className="space-y-3">
                {bannedUsers.map(banned => (
                  <div
                    key={banned.id}
                    className="bg-slate-800/50 rounded-xl p-4 border border-slate-700"
                  >
                    <div className="flex items-center gap-4">
                      {banned.avatar_url ? (
                        <img
                          src={banned.avatar_url}
                          alt={banned.display_name || 'User'}
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                          {(banned.display_name || banned.email || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">
                          {banned.rsi_handle || banned.display_name || banned.email || 'Unknown'}
                        </p>
                        <p className="text-slate-400 text-sm truncate">{banned.email}</p>
                        <p className="text-slate-500 text-xs">
                          Banned {new Date(banned.banned_at).toLocaleString()}
                        </p>
                        {banned.reason && (
                          <p className="text-slate-500 text-xs mt-1">Reason: {banned.reason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              No users in this category
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(user => (
                <div
                  key={user.id}
                  className="bg-slate-800/50 rounded-xl p-4 border border-slate-700"
                >
                  <div className="flex items-center gap-4">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.display_name || 'User'}
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                        {(user.display_name || user.email || '?')[0].toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {getDisplayName(user)}
                        {user.id === currentUser?.id && (
                          <span className="ml-2 text-xs text-slate-500">(you)</span>
                        )}
                      </p>
                      {user.rsi_handle && (
                        <p className="text-slate-500 text-xs truncate">Google: {user.display_name}</p>
                      )}
                      <p className="text-slate-400 text-sm truncate">{user.email}</p>
                      <p className="text-slate-500 text-xs">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                        {user.role === 'super-admin' && (
                          <span className="ml-2 px-1.5 py-0.5 bg-purple-900/50 text-purple-400 rounded text-xs">
                            Super Admin
                          </span>
                        )}
                        {user.role === 'officer' && (
                          <span className="ml-2 px-1.5 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">
                            Officer
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {activeTab === 'pending' && (
                        <button
                          onClick={() => updateUserRole(user.id, 'member')}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {actionLoading === user.id ? '...' : 'Approve'}
                        </button>
                      )}

                      {activeTab === 'members' && canPromoteToOfficer(user) && (
                        <button
                          onClick={() => updateUserRole(user.id, 'officer')}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {actionLoading === user.id ? '...' : 'Make Officer'}
                        </button>
                      )}

                      {activeTab === 'officers' && canDemote(user) && (
                        <button
                          onClick={() => updateUserRole(user.id, 'member')}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {actionLoading === user.id ? '...' : 'Demote'}
                        </button>
                      )}

                      {canBan(user) && (
                        <button
                          onClick={() => setBanTarget(user)}
                          disabled={actionLoading === user.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          Ban
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {banTarget && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Ban User</h3>
            <p className="text-slate-400 text-sm mb-4">
              Permanently remove <span className="text-white">{getDisplayName(banTarget)}</span>'s blueprint data and block sign-in. This cannot be undone from the app.
            </p>
            <label className="block text-slate-400 text-sm mb-1">Reason (optional)</label>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for ban..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setBanTarget(null)
                  setBanReason('')
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBan}
                disabled={actionLoading === banTarget.id}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === banTarget.id ? 'Banning...' : 'Confirm Ban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
