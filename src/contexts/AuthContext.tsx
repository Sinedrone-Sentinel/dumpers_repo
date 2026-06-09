import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase, Profile, getDisplayName, type UserRole } from '../lib/supabase'
import { roleAtLeast } from '../lib/roles'
import {
  buildVisibilityContext,
  canUseFeature,
  type FeatureId,
  type VisibilityContext,
} from '../lib/featureAccess'
import { removeTargetBlueprint } from '../lib/targetList'
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
  updateGhostMode: (enabled: boolean) => Promise<boolean>
  updatePreviewFeatures: (enabled: boolean) => Promise<boolean>
  updateCraftDeductInventory: (enabled: boolean) => Promise<boolean>
  fetchUsersWithBlueprints: () => Promise<UserWithBlueprints[]>
  fetchUserBlueprints: (userId: string) => Promise<Record<string, boolean>>
  displayName: string
  isOfficerOrAbove: boolean
  isSuperAdmin: boolean
  isPending: boolean
  isGhostMode: boolean
  isSociallyHidden: boolean
  canModifyBlueprints: boolean
  showMemberCollections: boolean
  isApproved: boolean
  canAccess: (minRole: UserRole) => boolean
  canAccessPreviewFeatures: boolean
  visibilityContext: VisibilityContext
  canUseFeature: (featureId: FeatureId) => boolean
  dfpDisplayEnabled: boolean
  updateDfpDisplayEnabled: (enabled: boolean) => Promise<boolean>
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
  const [dfpDisplayEnabled, setDfpDisplayEnabled] = useState(true)

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

  const fetchSiteSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('dfp_display_enabled')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching site settings:', error)
      return true
    }

    return data?.dfp_display_enabled ?? true
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

  const profileRef = useRef(profile)
  profileRef.current = profile

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

    const dfpEnabled = await fetchSiteSettings()
    setDfpDisplayEnabled(dfpEnabled)
  }, [checkBanned, handleBannedUser, fetchProfile, migrateLocalStorage, fetchAcquiredBlueprints, fetchSiteSettings])

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
      if (!session?.user) return

      const banned = await checkBanned(session.user.id, session.user.email)
      if (banned) {
        await handleBannedUser()
        return
      }

      const profileData = await fetchProfile(session.user.id)
      if (profileData) setProfile(profileData)
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [checkBanned, handleBannedUser, fetchProfile])

  const userRef = useRef(user)
  userRef.current = user
  const acquiredRef = useRef(acquiredBlueprints)
  acquiredRef.current = acquiredBlueprints

  const signInWithGoogle = useCallback(async () => {
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
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
      throw error
    }
    setIsBanned(false)
  }, [])

  const toggleAcquired = useCallback(async (blueprintId: string) => {
    const activeUser = userRef.current
    const activeProfile = profileRef.current
    if (!activeUser || !activeProfile || activeProfile.role === 'pending') {
      console.warn('Cannot toggle: user not authenticated or pending')
      return
    }

    const isCurrentlyAcquired = acquiredRef.current[blueprintId]

    if (isCurrentlyAcquired) {
      const { error } = await supabase
        .from('acquired_blueprints')
        .delete()
        .eq('user_id', activeUser.id)
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
        .insert({ user_id: activeUser.id, blueprint_id: blueprintId })

      if (!error) {
        setAcquiredBlueprints(prev => ({
          ...prev,
          [blueprintId]: true,
        }))
        await removeTargetBlueprint(activeUser.id, blueprintId)
      }
    }
  }, [])

  const updateRsiHandle = useCallback(async (handle: string): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser) return false

    const trimmedHandle = handle.trim() || null
    const { error } = await supabase
      .from('profiles')
      .update({ rsi_handle: trimmedHandle })
      .eq('id', activeUser.id)

    if (error) {
      console.error('Error updating RSI handle:', error)
      return false
    }

    setProfile(prev => prev ? { ...prev, rsi_handle: trimmedHandle } : null)
    return true
  }, [])

  const updateGhostMode = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser) return false

    const { error } = await supabase
      .from('profiles')
      .update({ ghost_mode: enabled })
      .eq('id', activeUser.id)

    if (error) {
      console.error('Error updating ghost mode:', error)
      return false
    }

    setProfile(prev => prev ? { ...prev, ghost_mode: enabled } : null)
    return true
  }, [])

  const updatePreviewFeatures = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeUser = userRef.current
    const activeProfile = profileRef.current
    if (!activeUser) return false
    if (activeProfile?.role !== 'officer') return false

    const { error } = await supabase
      .from('profiles')
      .update({ preview_features_enabled: enabled })
      .eq('id', activeUser.id)

    if (error) {
      console.error('Error updating preview features:', error)
      return false
    }

    setProfile(prev => prev ? { ...prev, preview_features_enabled: enabled } : null)
    return true
  }, [])

  const updateCraftDeductInventory = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser) return false

    const { error } = await supabase
      .from('profiles')
      .update({ craft_deduct_inventory: enabled })
      .eq('id', activeUser.id)

    if (error) {
      console.error('Error updating craft deduct inventory:', error)
      return false
    }

    setProfile(prev => prev ? { ...prev, craft_deduct_inventory: enabled } : null)
    return true
  }, [])

  const updateDfpDisplayEnabled = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeProfile = profileRef.current
    if (activeProfile?.role !== 'super-admin') return false

    const { error } = await supabase.rpc('update_site_dfp_display', { p_enabled: enabled })

    if (error) {
      console.error('Error updating DFP display setting:', error)
      return false
    }

    setDfpDisplayEnabled(enabled)
    return true
  }, [])

  const fetchUsersWithBlueprints = useCallback(async (): Promise<UserWithBlueprints[]> => {
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

    const profileQuery = supabase
      .from('profiles')
      .select('id, display_name, rsi_handle, role')
      .in('id', userIdsWithBlueprints)
      .neq('role', 'pending')
      .eq('ghost_mode', false)

    const { data: profiles, error: profileError } = await profileQuery

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
  }, [])

  const fetchUserBlueprints = useCallback(async (userId: string): Promise<Record<string, boolean>> => {
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
  }, [])

  const isOfficerOrAbove = profile?.role === 'officer' || profile?.role === 'super-admin'
  const isSuperAdmin = profile?.role === 'super-admin'
  const isPending = profile?.role === 'pending'
  const isGhostMode = profile?.ghost_mode ?? false
  const canModifyBlueprints = !!profile && profile.role !== 'pending'
  const isApproved = canModifyBlueprints
  const visibilityContext = useMemo(
    () =>
      buildVisibilityContext({
        role: profile?.role ?? null,
        ghostMode: profile?.ghost_mode ?? false,
        previewFeaturesEnabled: profile?.preview_features_enabled ?? false,
      }),
    [
      profile?.role,
      profile?.ghost_mode,
      profile?.preview_features_enabled,
    ]
  )
  const showMemberCollections = canUseFeature('member_directory', visibilityContext)
  const isSociallyHidden = visibilityContext.isSociallyHidden
  const canAccess = useCallback(
    (minRole: UserRole) => roleAtLeast(profile?.role, minRole),
    [profile?.role]
  )
  const canAccessPreviewFeatures = visibilityContext.canAccessPreviewFeatures
  const checkFeature = useCallback(
    (featureId: FeatureId) => canUseFeature(featureId, visibilityContext),
    [visibilityContext]
  )
  const displayName = getDisplayName(profile)

  const contextValue = useMemo(
    () => ({
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
      updateGhostMode,
      updatePreviewFeatures,
      updateCraftDeductInventory,
      fetchUsersWithBlueprints,
      fetchUserBlueprints,
      displayName,
      isOfficerOrAbove,
      isSuperAdmin,
      isPending,
      isGhostMode,
      isSociallyHidden,
      canModifyBlueprints,
      showMemberCollections,
      isApproved,
      canAccess,
      canAccessPreviewFeatures,
      visibilityContext,
      canUseFeature: checkFeature,
      dfpDisplayEnabled,
      updateDfpDisplayEnabled,
    }),
    [
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
      updateGhostMode,
      updatePreviewFeatures,
      updateCraftDeductInventory,
      fetchUsersWithBlueprints,
      fetchUserBlueprints,
      displayName,
      isOfficerOrAbove,
      isSuperAdmin,
      isPending,
      isGhostMode,
      isSociallyHidden,
      canModifyBlueprints,
      showMemberCollections,
      isApproved,
      canAccess,
      canAccessPreviewFeatures,
      visibilityContext,
      checkFeature,
      dfpDisplayEnabled,
      updateDfpDisplayEnabled,
    ]
  )

  return (
    <AuthContext.Provider value={contextValue}>
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
