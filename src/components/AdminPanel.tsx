import React, { useEffect, useState } from 'react'
import { supabase, Profile, UserRole, getDisplayName } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type TabType = 'pending' | 'members' | 'officers'

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const { profile: currentUser, isOfficerOrAbove, isSuperAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
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

  const tabs: { id: TabType; label: string }[] = [
    { id: 'pending', label: 'Pending' },
    { id: 'members', label: 'Members' },
    { id: 'officers', label: 'Officers' },
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
              {!loading && (
                <span className="ml-2 px-2 py-0.5 bg-slate-700 rounded-full text-xs">
                  {activeTab === tab.id ? users.length : ''}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-t-2 border-red-500 rounded-full animate-spin mx-auto"></div>
              <p className="text-slate-400 mt-2">Loading users...</p>
            </div>
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
                        <>
                          <button
                            onClick={() => updateUserRole(user.id, 'member')}
                            disabled={actionLoading === user.id}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                          >
                            {actionLoading === user.id ? '...' : 'Approve'}
                          </button>
                        </>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
