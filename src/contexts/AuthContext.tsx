import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase, Profile, getDisplayName, type UserRole } from '../lib/supabase'
import { roleAtLeast } from '../lib/roles'
import {
  buildVisibilityContext,
  canUseFeature,
  type FeatureId,
  type VisibilityContext,
} from '../lib/featureAccess'
import { readGuestPreviewSession, writeGuestPreviewSession } from '../lib/guestPreview'
import {
  GUEST_ACQUIRED_STORAGE_KEY,
  clearGuestAcquiredBlueprints,
  clearGuestMissionPrefs,
  clearGuestResources,
  clearGuestTargetList,
  clearMiningTrackerEntries,
  readGuestAcquiredBlueprints,
  readGuestResources,
  readGuestTargetList,
  readMiningTrackerEntries,
  sanitizeBlueprintId,
  sanitizeMigrationBatch,
  sanitizeResourceEntry,
  writeGuestAcquiredBlueprints,
} from '../lib/localGuestCache'
import { removeTargetBlueprint } from '../lib/targetList'
import type { User, Session } from '@supabase/supabase-js'

export interface UserWithBlueprints {
  id: string
  display_name: string | null
  rsi_handle: string | null
  rsi_handle_verified: boolean
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
  updateCraftDeductInventory: (enabled: boolean) => Promise<boolean>
  fetchUsersWithBlueprints: () => Promise<UserWithBlueprints[]>
  fetchUserBlueprints: (userId: string) => Promise<Record<string, boolean>>
  refreshProfile: () => Promise<void>
  displayName: string
  isOfficerOrAbove: boolean
  isSuperAdmin: boolean
  isPending: boolean
  isGuestPreview: boolean
  isGhostMode: boolean
  isSociallyHidden: boolean
  enterGuestPreview: () => void
  exitGuestPreview: () => void
  canModifyBlueprints: boolean
  showMemberCollections: boolean
  isApproved: boolean
  canAccess: (minRole: UserRole) => boolean
  visibilityContext: VisibilityContext
  canUseFeature: (featureId: FeatureId) => boolean
  dfpDisplayEnabled: boolean
  updateDfpDisplayEnabled: (enabled: boolean) => Promise<boolean>
  autoApproveEnabled: boolean
  updateAutoApprove: (enabled: boolean) => Promise<boolean>
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
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false)
  const [isGuestPreview, setIsGuestPreview] = useState(() => readGuestPreviewSession())

  const enterGuestPreview = useCallback(() => {
    writeGuestPreviewSession(true)
    setIsGuestPreview(true)
    // Load guest acquired blueprints from localStorage
    setAcquiredBlueprints(readGuestAcquiredBlueprints())
  }, [])

  const exitGuestPreview = useCallback(() => {
    writeGuestPreviewSession(false)
    setIsGuestPreview(false)
  }, [])

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

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return
    const profileData = await fetchProfile(user.id)
    if (profileData) setProfile(profileData)
  }, [user?.id, fetchProfile])

  const fetchSiteSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('dfp_display_enabled, auto_approve_enabled')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching site settings:', error)
      return { dfpDisplayEnabled: true, autoApproveEnabled: false }
    }

    return {
      dfpDisplayEnabled: data?.dfp_display_enabled ?? true,
      autoApproveEnabled: data?.auto_approve_enabled ?? false,
    }
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

    // 1. Migrate acquired blueprints
    const localBpData = localStorage.getItem(GUEST_ACQUIRED_STORAGE_KEY)
    if (localBpData) {
      try {
        const localBlueprints = JSON.parse(localBpData) as Record<string, boolean>
        const blueprintIds = Object.keys(localBlueprints)
          .filter(id => localBlueprints[id])
          .map(id => sanitizeBlueprintId(id))
          .filter((id): id is string => id !== null)

        if (blueprintIds.length > 0) {
          const inserts = sanitizeMigrationBatch(blueprintIds).map(blueprint_id => ({
            user_id: userId,
            blueprint_id,
          }))

          const { error } = await supabase
            .from('acquired_blueprints')
            .upsert(inserts, { onConflict: 'user_id,blueprint_id' })

          if (!error) {
            clearGuestAcquiredBlueprints()
            console.log(`Migrated ${inserts.length} acquired blueprints to server`)
          }
        }
      } catch (e) {
        console.error('Error migrating acquired blueprints:', e)
      }
    }

    // 2. Migrate target list
    const { targetIds, missionPrefs } = readGuestTargetList()
    const targetBpIds = Object.keys(targetIds)
      .filter(id => targetIds[id])
      .map(id => sanitizeBlueprintId(id))
      .filter((id): id is string => id !== null)

    if (targetBpIds.length > 0) {
      try {
        const inserts = sanitizeMigrationBatch(targetBpIds).map(blueprint_id => ({
          user_id: userId,
          blueprint_id,
        }))

        const { error } = await supabase
          .from('target_blueprints')
          .upsert(inserts, { onConflict: 'user_id,blueprint_id' })

        if (!error) {
          clearGuestTargetList()
          console.log(`Migrated ${inserts.length} target blueprints to server`)
        }
      } catch (e) {
        console.error('Error migrating target list:', e)
      }
    }

    // 3. Migrate mission prefs
    const missionKeys = Object.keys(missionPrefs).filter(k => missionPrefs[k])
    if (missionKeys.length > 0) {
      try {
        const inserts = sanitizeMigrationBatch(missionKeys).map(mission_key => ({
          user_id: userId,
          mission_key,
          included: true,
        }))

        const { error } = await supabase
          .from('mission_checklist_prefs')
          .upsert(inserts, { onConflict: 'user_id,mission_key' })

        if (!error) {
          clearGuestMissionPrefs()
          console.log(`Migrated ${inserts.length} mission prefs to server`)
        }
      } catch (e) {
        console.error('Error migrating mission prefs:', e)
      }
    }

    // 4. Migrate resources
    const guestResources = readGuestResources()
    const validResources = guestResources
      .map(r => sanitizeResourceEntry(r))
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (validResources.length > 0) {
      try {
        const inserts = sanitizeMigrationBatch(validResources).map(r => ({
          user_id: userId,
          resource_key: r.resource_key,
          quality: r.quality,
          quantity: r.quantity,
        }))

        const { error } = await supabase
          .from('resource_inventory')
          .upsert(inserts, { onConflict: 'user_id,resource_key,quality' })

        if (!error) {
          clearGuestResources()
          console.log(`Migrated ${inserts.length} resource entries to server`)
        }
      } catch (e) {
        console.error('Error migrating resources:', e)
      }
    }

    // 5. Migrate mining tracker
    const guestMiningEntries = readMiningTrackerEntries()
    if (guestMiningEntries.length > 0) {
      try {
        const validEntries = guestMiningEntries.filter(e => 
          typeof e.oreName === 'string' && e.oreName.length > 0 && e.oreName.length < 100 &&
          typeof e.rarity === 'string' && e.rarity.length > 0 && e.rarity.length < 50
        )

        if (validEntries.length > 0) {
          const { data, error } = await supabase.rpc('import_mining_tracker_entries', {
            p_entries: validEntries,
          })

          if (!error && data?.success) {
            clearMiningTrackerEntries()
            console.log(`Migrated ${data.imported} mining tracker entries to server`)
          }
        }
      } catch (e) {
        console.error('Error migrating mining tracker:', e)
      }
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

    const siteSettings = await fetchSiteSettings()
    setDfpDisplayEnabled(siteSettings.dfpDisplayEnabled)
    setAutoApproveEnabled(siteSettings.autoApproveEnabled)
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
    writeGuestPreviewSession(false)
    setIsGuestPreview(false)

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
    const isGuestMode = !activeUser && readGuestPreviewSession()

    // Guest mode: localStorage only
    if (isGuestMode) {
      const current = acquiredRef.current
      const isCurrentlyAcquired = current[blueprintId]
      const updated = { ...current }

      if (isCurrentlyAcquired) {
        delete updated[blueprintId]
      } else {
        updated[blueprintId] = true
      }

      writeGuestAcquiredBlueprints(updated)
      setAcquiredBlueprints(updated)
      return
    }

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

  const updateAutoApprove = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeProfile = profileRef.current
    if (activeProfile?.role !== 'super-admin') return false

    const { error } = await supabase.rpc('update_site_auto_approve', { p_enabled: enabled })

    if (error) {
      console.error('Error updating auto-approve setting:', error)
      return false
    }

    setAutoApproveEnabled(enabled)
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
      .select('id, display_name, rsi_handle, rsi_handle_verified, role')
      .in('id', userIdsWithBlueprints)
      .neq('role', 'pending')
      .eq('ghost_mode', false)

    const { data: profiles, error: profileError } = await profileQuery

    if (profileError) {
      console.error('Error fetching profiles:', profileError)
      return []
    }

    const activeProfile = profileRef.current
    const isOfficerOrAbove =
      activeProfile?.role === 'officer' || activeProfile?.role === 'super-admin'

    return (profiles || [])
      .filter((p) => !(isOfficerOrAbove && p.id === activeProfile?.id))
      .map((p) => ({
        id: p.id,
        display_name: p.display_name,
        rsi_handle: p.rsi_handle,
        rsi_handle_verified: p.rsi_handle_verified ?? false,
        blueprint_count: userCounts[p.id] || 0,
      }))
      .sort((a, b) => {
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
  const guestPreviewActive = !user && isGuestPreview
  const canModifyBlueprints = guestPreviewActive || (!!profile && profile.role !== 'pending')
  const isApproved = !!profile && profile.role !== 'pending'
  const visibilityContext = useMemo(
    () =>
      buildVisibilityContext({
        role: profile?.role ?? null,
        ghostMode: profile?.ghost_mode ?? false,
        isGuestPreview: guestPreviewActive,
      }),
    [
      profile?.role,
      profile?.ghost_mode,
      guestPreviewActive,
    ]
  )

  useEffect(() => {
    if (user) {
      writeGuestPreviewSession(false)
      setIsGuestPreview(false)
    }
  }, [user])
  const showMemberCollections = canUseFeature('member_directory', visibilityContext)
  const isSociallyHidden = visibilityContext.isSociallyHidden
  const canAccess = useCallback(
    (minRole: UserRole) => roleAtLeast(profile?.role, minRole),
    [profile?.role]
  )
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
      updateCraftDeductInventory,
      fetchUsersWithBlueprints,
      fetchUserBlueprints,
      refreshProfile,
      displayName,
      isOfficerOrAbove,
      isSuperAdmin,
      isPending,
      isGuestPreview: guestPreviewActive,
      isGhostMode,
      isSociallyHidden,
      enterGuestPreview,
      exitGuestPreview,
      canModifyBlueprints,
      showMemberCollections,
      isApproved,
      canAccess,
      visibilityContext,
      canUseFeature: checkFeature,
      dfpDisplayEnabled,
      updateDfpDisplayEnabled,
      autoApproveEnabled,
      updateAutoApprove,
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
      updateCraftDeductInventory,
      fetchUsersWithBlueprints,
      fetchUserBlueprints,
      refreshProfile,
      displayName,
      isOfficerOrAbove,
      isSuperAdmin,
      isPending,
      guestPreviewActive,
      isGhostMode,
      isSociallyHidden,
      enterGuestPreview,
      exitGuestPreview,
      canModifyBlueprints,
      showMemberCollections,
      isApproved,
      canAccess,
      visibilityContext,
      checkFeature,
      dfpDisplayEnabled,
      updateDfpDisplayEnabled,
      autoApproveEnabled,
      updateAutoApprove,
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
