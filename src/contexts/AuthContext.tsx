import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase, Profile, getDisplayName } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

export interface UserWithBlueprints {
  id: string
  display_name: string | null
  rsi_handle: string | null
  blueprint_count: number
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  isBanned: boolean
  acquiredBlueprints: Record<string, boolean>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  toggleAcquired: (blueprintId: string) => Promise<void>
  updateRsiHandle: (handle: string) => Promise<boolean>
  fetchUsersWithBlueprints: () => Promise<UserWithBlueprints[]>
  fetchUserBlueprints: (userId: string) => Promise<Record<string, boolean>>
  displayName: string
  isOfficerOrAbove: boolean
  isSuperAdmin: boolean
  canModifyBlueprints: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isBanned, setIsBanned] = useState(false)
  const isBannedRef = useRef(false)
  const [acquiredBlueprints, setAcquiredBlueprints] = useState<Record<string, boolean>>({})

  useEffect(() => {
    isBannedRef.current = isBanned
  }, [isBanned])

  const checkBanned = useCallback(async (userId: string, email?: string | null): Promise<boolean> => {
    const { data: idBan, error: idError } = await supabase
      .from('banned_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (idError) {
      console.error('Error checking ban status:', idError)
      return false
    }

    if (idBan) return true

    if (email) {
      const { data: emailBan, error: emailError } = await supabase
        .from('banned_users')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (emailError) {
        console.error('Error checking ban by email:', emailError)
        return false
      }

      if (emailBan) return true
    }

    return false
  }, [])

  const handleBannedUser = useCallback(async () => {
    setIsBanned(true)
    setProfile(null)
    setAcquiredBlueprints({})
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }, [])

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      return null
    }
    return data as Profile
  }, [])

  const fetchAcquiredBlueprints = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('acquired_blueprints')
      .select('blueprint_id')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching acquired blueprints:', error)
      return {}
    }

    const acquired: Record<string, boolean> = {}
    data?.forEach((item: { blueprint_id: string }) => {
      acquired[item.blueprint_id] = true
    })
    return acquired
  }, [])

  const migrateLocalStorage = useCallback(async (userId: string) => {
    if (typeof localStorage === 'undefined') return

    const localData = localStorage.getItem('acquired_blueprints')
    if (!localData) return

    try {
      const localBlueprints = JSON.parse(localData) as Record<string, boolean>
      const blueprintIds = Object.keys(localBlueprints).filter(id => localBlueprints[id])

      if (blueprintIds.length === 0) return

      const inserts = blueprintIds.map(blueprint_id => ({
        user_id: userId,
        blueprint_id,
      }))

      const { error } = await supabase
        .from('acquired_blueprints')
        .upsert(inserts, { onConflict: 'user_id,blueprint_id' })

      if (!error) {
        localStorage.removeItem('acquired_blueprints')
        console.log(`Migrated ${blueprintIds.length} blueprints to server`)
      }
    } catch (e) {
      console.error('Error migrating local blueprints:', e)
    }
  }, [])

  const loadUserData = useCallback(async (sessionUser: User, isSignIn = false) => {
    const banned = await checkBanned(sessionUser.id, sessionUser.email)
    if (banned) {
      await handleBannedUser()
      return
    }

    setIsBanned(false)
    const profileData = await fetchProfile(sessionUser.id)
    setProfile(profileData)

    if (!profileData) {
      const stillBanned = await checkBanned(sessionUser.id, sessionUser.email)
      if (stillBanned) {
        await handleBannedUser()
        return
      }
    }

    if (isSignIn) {
      await migrateLocalStorage(sessionUser.id)
    }

    const acquired = await fetchAcquiredBlueprints(sessionUser.id)
    setAcquiredBlueprints(acquired)
  }, [checkBanned, handleBannedUser, fetchProfile, migrateLocalStorage, fetchAcquiredBlueprints])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        await loadUserData(session.user, true)
      }

      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        await loadUserData(session.user, event === 'SIGNED_IN')
      } else if (!isBannedRef.current) {
        setProfile(null)
        setAcquiredBlueprints({})
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUserData])

  useEffect(() => {
    const onFocus = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const banned = await checkBanned(session.user.id, session.user.email)
        if (banned) {
          await handleBannedUser()
        }
      }
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [checkBanned, handleBannedUser])

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) {
      console.error('Error signing in:', error)
      throw error
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
      throw error
    }
    setIsBanned(false)
  }

  const toggleAcquired = async (blueprintId: string) => {
    if (!user || !profile || profile.role === 'pending') {
      console.warn('Cannot toggle: user not authenticated or pending')
      return
    }

    const isCurrentlyAcquired = acquiredBlueprints[blueprintId]

    if (isCurrentlyAcquired) {
      const { error } = await supabase
        .from('acquired_blueprints')
        .delete()
        .eq('user_id', user.id)
        .eq('blueprint_id', blueprintId)

      if (!error) {
        setAcquiredBlueprints(prev => {
          const updated = { ...prev }
          delete updated[blueprintId]
          return updated
        })
      }
    } else {
      const { error } = await supabase
        .from('acquired_blueprints')
        .insert({ user_id: user.id, blueprint_id: blueprintId })

      if (!error) {
        setAcquiredBlueprints(prev => ({
          ...prev,
          [blueprintId]: true,
        }))
      }
    }
  }

  const updateRsiHandle = async (handle: string): Promise<boolean> => {
    if (!user) return false

    const trimmedHandle = handle.trim() || null
    const { error } = await supabase
      .from('profiles')
      .update({ rsi_handle: trimmedHandle })
      .eq('id', user.id)

    if (error) {
      console.error('Error updating RSI handle:', error)
      return false
    }

    setProfile(prev => prev ? { ...prev, rsi_handle: trimmedHandle } : null)
    return true
  }

  const fetchUsersWithBlueprints = async (): Promise<UserWithBlueprints[]> => {
    const { data: blueprintCounts, error: countError } = await supabase
      .from('acquired_blueprints')
      .select('user_id')
    
    if (countError) {
      console.error('Error fetching blueprint counts:', countError)
      return []
    }

    const userCounts: Record<string, number> = {}
    blueprintCounts?.forEach(item => {
      userCounts[item.user_id] = (userCounts[item.user_id] || 0) + 1
    })

    const userIdsWithBlueprints = Object.keys(userCounts)
    if (userIdsWithBlueprints.length === 0) return []

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, rsi_handle, role')
      .in('id', userIdsWithBlueprints)
      .neq('role', 'pending')

    if (profileError) {
      console.error('Error fetching profiles:', profileError)
      return []
    }

    return (profiles || []).map(p => ({
      id: p.id,
      display_name: p.display_name,
      rsi_handle: p.rsi_handle,
      blueprint_count: userCounts[p.id] || 0
    })).sort((a, b) => {
      const nameA = a.rsi_handle || a.display_name || ''
      const nameB = b.rsi_handle || b.display_name || ''
      return nameA.localeCompare(nameB)
    })
  }

  const fetchUserBlueprints = async (userId: string): Promise<Record<string, boolean>> => {
    const { data, error } = await supabase
      .from('acquired_blueprints')
      .select('blueprint_id')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching user blueprints:', error)
      return {}
    }

    const acquired: Record<string, boolean> = {}
    data?.forEach((item: { blueprint_id: string }) => {
      acquired[item.blueprint_id] = true
    })
    return acquired
  }

  const isOfficerOrAbove = profile?.role === 'officer' || profile?.role === 'super-admin'
  const isSuperAdmin = profile?.role === 'super-admin'
  const canModifyBlueprints = !!profile && profile.role !== 'pending'
  const displayName = getDisplayName(profile)

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        isBanned,
        acquiredBlueprints,
        signInWithGoogle,
        signOut,
        toggleAcquired,
        updateRsiHandle,
        fetchUsersWithBlueprints,
        fetchUserBlueprints,
        displayName,
        isOfficerOrAbove,
        isSuperAdmin,
        canModifyBlueprints,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
