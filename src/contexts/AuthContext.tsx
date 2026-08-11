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
import { normalizeGuestBlueprintId } from '../lib/guestCatalog'
import {
  ensureGuestCacheSchema,
  readGuestAcquiredBlueprints,
  readGuestGroupBlueprintVariants,
  writeGuestAcquiredBlueprints,
  writeGuestGroupBlueprintVariants,
} from '../lib/localGuestCache'
import {
  applyDefaultAcquiredState,
  isDefaultBlueprint,
  DEFAULT_BLUEPRINT_IDS,
} from '../lib/defaultBlueprints'
import { fetchOrgLogoStatus, resolveOrgLogoUrl } from '../lib/orgLogo'
import { removeTargetBlueprint } from '../lib/targetList'
import { maybeMigrateOfflineData } from '../lib/offlineMigration'
import { ensureDfpEngine } from '../lib/dfpEngine'
import {
  buildBootstrapSteps,
  patchBootstrapStep,
  type BootstrapStep,
} from '../lib/bootstrapSteps'
import type { User, Session, UserIdentity } from '@supabase/supabase-js'
import type { OAuthProviderId } from '../lib/authProviders'
import {
  getDiscordOAuthOptions,
  markDiscordAppAuthorized,
  userHasDiscordIdentity,
} from '../lib/discordOAuth'

const AUTH_BOOTSTRAP_TIMEOUT_MS = 12_000
const BOOTSTRAP_FAILSAFE_MS = 45_000
/** Extra wait when localStorage has a Supabase token but getSession is still null. */
const SESSION_RESTORE_WAIT_MS = 2_500

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    )
    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        window.clearTimeout(timer)
        reject(err)
      })
  })
}

/** True when a persisted Supabase auth payload exists (session may still be hydrating). */
function peekStoredSupabaseAuth(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('sb-') || !key.includes('auth-token')) continue
      const raw = localStorage.getItem(key)
      if (raw && raw !== 'null' && raw.length > 20) return true
    }
  } catch {
    // private mode / blocked storage
  }
  return false
}

function waitWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: T) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(fallback), ms)
    void promise.then(finish, () => finish(fallback))
  })
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  bootstrapSteps: BootstrapStep[]
  isBanned: boolean
  acquiredBlueprints: Record<string, boolean>
  signInWithGoogle: () => Promise<void>
  signInWithDiscord: () => Promise<void>
  getLinkedIdentities: () => Promise<UserIdentity[]>
  linkWithGoogle: () => Promise<void>
  linkWithDiscord: () => Promise<void>
  unlinkProvider: (identity: UserIdentity) => Promise<void>
  signOut: () => Promise<void>
  toggleAcquired: (blueprintId: string) => Promise<void>
  updateRsiHandle: (handle: string) => Promise<boolean>
  updateCraftDeductInventory: (enabled: boolean) => Promise<boolean>
  updateGroupBlueprintVariants: (enabled: boolean) => Promise<boolean>
  groupBlueprintVariants: boolean
  refreshProfile: () => Promise<void>
  refreshAcquiredBlueprints: () => Promise<void>
  displayName: string
  isOfficerOrAbove: boolean
  isSuperAdmin: boolean
  isPending: boolean
  isGuestPreview: boolean
  enterGuestPreview: () => void
  exitGuestPreview: () => void
  canModifyBlueprints: boolean
  isApproved: boolean
  canAccess: (minRole: UserRole) => boolean
  visibilityContext: VisibilityContext
  canUseFeature: (featureId: FeatureId) => boolean
  dfpDisplayEnabled: boolean
  updateDfpDisplayEnabled: (enabled: boolean) => Promise<boolean>
  autoApproveEnabled: boolean
  updateAutoApprove: (enabled: boolean) => Promise<boolean>
  marketplaceWtsAdsSiteEnabled: boolean
  marketplaceWtbAdsSiteEnabled: boolean
  marketplacePurchaseToastsSiteEnabled: boolean
  updateMarketplaceWtsAdsSite: (enabled: boolean) => Promise<boolean>
  updateMarketplaceWtbAdsSite: (enabled: boolean) => Promise<boolean>
  updateMarketplacePurchaseToastsSite: (enabled: boolean) => Promise<boolean>
  marketplaceWtsAdsEnabled: boolean
  marketplaceWtbAdsEnabled: boolean
  marketplacePurchaseToastsEnabled: boolean
  updateMarketplaceWtsAds: (enabled: boolean) => Promise<boolean>
  updateMarketplaceWtbAds: (enabled: boolean) => Promise<boolean>
  updateMarketplacePurchaseToasts: (enabled: boolean) => Promise<boolean>
  orgLogoUrl: string
  orgLogoUpdatedAt: string | null
  orgLogoConfigured: boolean
  refreshOrgLogo: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootstrapSteps, setBootstrapSteps] = useState<BootstrapStep[]>(() => buildBootstrapSteps(false))
  const initialBootstrapDone = useRef(false)
  const [isBanned, setIsBanned] = useState(false)
  const isBannedRef = useRef(false)
  const [acquiredBlueprints, setAcquiredBlueprints] = useState<Record<string, boolean>>({})
  const [dfpDisplayEnabled, setDfpDisplayEnabled] = useState(true)
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false)
  const [marketplaceWtsAdsSiteEnabled, setMarketplaceWtsAdsSiteEnabled] = useState(false)
  const [marketplaceWtbAdsSiteEnabled, setMarketplaceWtbAdsSiteEnabled] = useState(false)
  const [marketplacePurchaseToastsSiteEnabled, setMarketplacePurchaseToastsSiteEnabled] =
    useState(false)
  const [orgLogoUpdatedAt, setOrgLogoUpdatedAt] = useState<string | null>(null)
  const [orgLogoConfigured, setOrgLogoConfigured] = useState(false)
  const [isGuestPreview, setIsGuestPreview] = useState(() => readGuestPreviewSession())
  const [guestGroupBlueprintVariants, setGuestGroupBlueprintVariants] = useState(
    () => readGuestGroupBlueprintVariants()
  )

  const enterGuestPreview = useCallback(() => {
    writeGuestPreviewSession(true)
    setIsGuestPreview(true)
    ensureGuestCacheSchema()
    const acquired = applyDefaultAcquiredState(readGuestAcquiredBlueprints())
    writeGuestAcquiredBlueprints(acquired)
    setAcquiredBlueprints(acquired)
  }, [])

  const exitGuestPreview = useCallback(() => {
    writeGuestPreviewSession(false)
    setIsGuestPreview(false)
  }, [])

  useEffect(() => {
    if (user?.id || !isGuestPreview) return
    ensureGuestCacheSchema()
    const acquired = applyDefaultAcquiredState(readGuestAcquiredBlueprints())
    writeGuestAcquiredBlueprints(acquired)
    setAcquiredBlueprints(acquired)
  }, [user?.id, isGuestPreview])

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

  const refreshOrgLogo = useCallback(async () => {
    const status = await fetchOrgLogoStatus()
    setOrgLogoConfigured(status.configured)
    setOrgLogoUpdatedAt(status.updatedAt)
  }, [])

  useEffect(() => {
    void refreshOrgLogo()
  }, [refreshOrgLogo])

  const orgLogoUrl = useMemo(
    () => resolveOrgLogoUrl(orgLogoUpdatedAt),
    [orgLogoUpdatedAt]
  )

  const fetchSiteSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select(
        'dfp_display_enabled, auto_approve_enabled, marketplace_wts_ads_site_enabled, marketplace_wtb_ads_site_enabled, marketplace_purchase_toasts_site_enabled'
      )
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching site settings:', error)
      return {
        dfpDisplayEnabled: true,
        autoApproveEnabled: false,
        marketplaceWtsAdsSiteEnabled: false,
        marketplaceWtbAdsSiteEnabled: false,
        marketplacePurchaseToastsSiteEnabled: false,
      }
    }

    return {
      dfpDisplayEnabled: data?.dfp_display_enabled ?? true,
      autoApproveEnabled: data?.auto_approve_enabled ?? false,
      marketplaceWtsAdsSiteEnabled: data?.marketplace_wts_ads_site_enabled ?? false,
      marketplaceWtbAdsSiteEnabled: data?.marketplace_wtb_ads_site_enabled ?? false,
      marketplacePurchaseToastsSiteEnabled:
        data?.marketplace_purchase_toasts_site_enabled ?? false,
    }
  }, [])

  const fetchAcquiredBlueprints = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('acquired_blueprints')
      .select('blueprint_id')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching acquired blueprints:', error)
      return applyDefaultAcquiredState({})
    }

    const acquired: Record<string, boolean> = {}
    data?.forEach((item: { blueprint_id: string }) => {
      acquired[item.blueprint_id] = true
    })

    const missingDefaults = DEFAULT_BLUEPRINT_IDS.filter((id) => !acquired[id])
    if (missingDefaults.length > 0) {
      const { error: insertError } = await supabase.from('acquired_blueprints').insert(
        missingDefaults.map((blueprint_id) => ({ user_id: userId, blueprint_id }))
      )
      if (insertError && insertError.code !== '23505') {
        console.error('Error seeding default blueprints:', insertError)
      }
    }

    return applyDefaultAcquiredState(acquired)
  }, [])

  const refreshAcquiredBlueprints = useCallback(async () => {
    if (!user?.id) return
    const acquired = await fetchAcquiredBlueprints(user.id)
    setAcquiredBlueprints(acquired)
  }, [user?.id, fetchAcquiredBlueprints])

  // Site-wide: BP Dumper (and other tabs) can insert/delete while the member
  // is on any page — not only Live Tracker.
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`acquired-blueprints-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'acquired_blueprints',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshAcquiredBlueprints()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, refreshAcquiredBlueprints])

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
      await maybeMigrateOfflineData(sessionUser.id)
    }

    const acquired = await fetchAcquiredBlueprints(sessionUser.id)
    setAcquiredBlueprints(acquired)

    const siteSettings = await fetchSiteSettings()
    setDfpDisplayEnabled(siteSettings.dfpDisplayEnabled)
    setAutoApproveEnabled(siteSettings.autoApproveEnabled)
    setMarketplaceWtsAdsSiteEnabled(siteSettings.marketplaceWtsAdsSiteEnabled)
    setMarketplaceWtbAdsSiteEnabled(siteSettings.marketplaceWtbAdsSiteEnabled)
    setMarketplacePurchaseToastsSiteEnabled(siteSettings.marketplacePurchaseToastsSiteEnabled)
  }, [checkBanned, handleBannedUser, fetchProfile, fetchAcquiredBlueprints, fetchSiteSettings])

  const setStep = useCallback((id: string, patch: Partial<Pick<BootstrapStep, 'status' | 'progress'>>) => {
    setBootstrapSteps((prev) => patchBootstrapStep(prev, id, patch))
  }, [])

  const loadUserDataWithProgress = useCallback(
    async (sessionUser: User, isSignIn = false) => {
      setStep('clearance', { status: 'active', progress: 20 })
      const banned = await checkBanned(sessionUser.id, sessionUser.email)
      if (banned) {
        setStep('clearance', { status: 'error', progress: 100 })
        await handleBannedUser()
        return false
      }
      setStep('clearance', { status: 'done', progress: 100 })

      setStep('profile', { status: 'active', progress: 25 })
      const profileData = await fetchProfile(sessionUser.id)
      setIsBanned(false)
      setProfile(profileData)

      if (!profileData) {
        const stillBanned = await checkBanned(sessionUser.id, sessionUser.email)
        if (stillBanned) {
          setStep('profile', { status: 'error', progress: 100 })
          await handleBannedUser()
          return false
        }
      }
      setStep('profile', { status: 'done', progress: 100 })

      if (isSignIn) {
        await maybeMigrateOfflineData(sessionUser.id)
      }

      setStep('blueprints', { status: 'active', progress: 30 })
      const acquired = await fetchAcquiredBlueprints(sessionUser.id)
      setAcquiredBlueprints(acquired)
      setStep('blueprints', { status: 'done', progress: 100 })

      setStep('settings', { status: 'active', progress: 40 })
      const siteSettings = await fetchSiteSettings()
      setDfpDisplayEnabled(siteSettings.dfpDisplayEnabled)
      setAutoApproveEnabled(siteSettings.autoApproveEnabled)
      setMarketplaceWtsAdsSiteEnabled(siteSettings.marketplaceWtsAdsSiteEnabled)
      setMarketplaceWtbAdsSiteEnabled(siteSettings.marketplaceWtbAdsSiteEnabled)
      setMarketplacePurchaseToastsSiteEnabled(siteSettings.marketplacePurchaseToastsSiteEnabled)
      setStep('settings', { status: 'done', progress: 100 })

      return true
    },
    [
      checkBanned,
      handleBannedUser,
      fetchProfile,
      fetchAcquiredBlueprints,
      fetchSiteSettings,
      setStep,
    ]
  )

  useEffect(() => {
    let cancelled = false
    /** Latest session seen during bootstrap (listener may win the race vs getSession). */
    let bootstrapSession: Session | null = null
    let resolveInitialSession: ((session: Session | null) => void) | null = null
    const initialSessionPromise = new Promise<Session | null>((resolve) => {
      resolveInitialSession = resolve
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      // Capture auth while splash is up — getSession can race hydration and return null
      // even though a persisted token (and INITIAL_SESSION) still exist.
      if (!initialBootstrapDone.current) {
        if (nextSession?.user) bootstrapSession = nextSession
        if (event === 'INITIAL_SESSION' && resolveInitialSession) {
          resolveInitialSession(nextSession)
          resolveInitialSession = null
        }
        return
      }

      setSession(nextSession)

      // Token refresh only renews JWTs — keep the same user object identity so
      // effects keyed on `user` do not re-fire (Layout was flashing the bootstrap
      // splash on every refresh by re-running the welcome check).
      if (event === 'TOKEN_REFRESHED') {
        setUser((prev) => {
          const next = nextSession?.user ?? null
          if (prev?.id && next?.id && prev.id === next.id) return prev
          return next
        })
        return
      }

      setUser(nextSession?.user ?? null)

      if (nextSession?.user) {
        await loadUserData(nextSession.user, event === 'SIGNED_IN')
      } else if (!isBannedRef.current) {
        setProfile(null)
        setAcquiredBlueprints({})
      }
    })

    const bootstrapAuth = async () => {
      setLoading(true)
      setBootstrapSteps(buildBootstrapSteps(false))

      try {
        const hash = window.location.hash
        const isOAuthCallback = hash.includes('access_token')

        setStep('session', { status: 'active', progress: 15 })
        const { data: { session: getSessionResult }, error } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          'auth.getSession'
        )

        let session = getSessionResult ?? null
        if (bootstrapSession?.user) session = bootstrapSession

        // Prefer INITIAL_SESSION when getSession is empty but storage still has a token
        // (refresh / Strict Mode remount races).
        if (!session?.user) {
          const waitMs = peekStoredSupabaseAuth() || isOAuthCallback
            ? SESSION_RESTORE_WAIT_MS
            : 150
          const fromEvent = await waitWithTimeout(initialSessionPromise, waitMs, null)
          if (fromEvent?.user) session = fromEvent
          else if (bootstrapSession?.user) session = bootstrapSession
        } else if (resolveInitialSession) {
          // Unblock the promise so it cannot hang if INITIAL_SESSION is late/missing.
          resolveInitialSession(session)
          resolveInitialSession = null
        }

        if (isOAuthCallback && session && !error) {
          window.history.replaceState(null, '', window.location.pathname)
          if (userHasDiscordIdentity(session.user.identities)) {
            markDiscordAppAuthorized()
          }
        }

        if (cancelled) return

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user && userHasDiscordIdentity(session.user.identities)) {
          markDiscordAppAuthorized()
        }

        const stepsAfterSession = buildBootstrapSteps(!!session?.user).map((step) =>
          step.id === 'session' ? { ...step, status: 'done' as const, progress: 100 } : step
        )
        setBootstrapSteps(stepsAfterSession)

        if (session?.user) {
          const ok = await loadUserDataWithProgress(session.user, isOAuthCallback)
          if (!ok || cancelled) return
        }

        setBootstrapSteps((prev) => patchBootstrapStep(prev, 'dfp', { status: 'active', progress: 20 }))
        await ensureDfpEngine()
        if (cancelled) return

        // Late restore while DFP was loading — adopt before dropping the splash.
        if (!session?.user && bootstrapSession?.user) {
          session = bootstrapSession
          setSession(session)
          setUser(session.user)
          const ok = await loadUserDataWithProgress(session.user, isOAuthCallback)
          if (!ok || cancelled) return
        }

        setBootstrapSteps((prev) => patchBootstrapStep(prev, 'dfp', { status: 'done', progress: 100 }))
      } catch (err) {
        console.error('Auth bootstrap failed:', err)
        setBootstrapSteps((prev) =>
          prev.map((step) =>
            step.status === 'active'
              ? { ...step, status: 'error', progress: 100 }
              : step.status === 'pending'
                ? { ...step, status: 'skipped' }
                : step
          )
        )
      } finally {
        if (!cancelled) {
          initialBootstrapDone.current = true
          setLoading(false)
        }
      }
    }

    void bootstrapAuth()

    return () => {
      cancelled = true
      if (resolveInitialSession) {
        resolveInitialSession(null)
        resolveInitialSession = null
      }
      subscription.unsubscribe()
    }
  }, [loadUserData, loadUserDataWithProgress, setStep])

  useEffect(() => {
    if (!loading) return
    const id = window.setTimeout(() => {
      console.warn('Bootstrap failsafe: completing with partial data')
      setBootstrapSteps((prev) =>
        prev.map((step) =>
          step.status === 'active'
            ? { ...step, status: 'error', progress: 100 }
            : step.status === 'pending'
              ? { ...step, status: 'skipped' }
              : step
        )
      )
      initialBootstrapDone.current = true
      setLoading(false)
    }, BOOTSTRAP_FAILSAFE_MS)
    return () => window.clearTimeout(id)
  }, [loading])

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

  const signInWithOAuthProvider = useCallback(
    async (provider: OAuthProviderId) => {
      writeGuestPreviewSession(false)
      setIsGuestPreview(false)

      const { buildOAuthRedirectTo } = await import('../lib/friendInvite')
      const redirectTo = buildOAuthRedirectTo(window.location.origin)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          ...(provider === 'discord' ? getDiscordOAuthOptions() : {}),
        },
      })
      if (error) {
        console.error(`Error signing in with ${provider}:`, error)
        throw error
      }
    },
    []
  )

  const signInWithGoogle = useCallback(
    () => signInWithOAuthProvider('google'),
    [signInWithOAuthProvider]
  )

  const signInWithDiscord = useCallback(
    () => signInWithOAuthProvider('discord'),
    [signInWithOAuthProvider]
  )

  const getLinkedIdentities = useCallback(async (): Promise<UserIdentity[]> => {
    const { data, error } = await supabase.auth.getUserIdentities()
    if (error) {
      console.error('Error fetching linked identities:', error)
      throw error
    }
    return data?.identities ?? []
  }, [])

  const linkWithOAuthProvider = useCallback(
    async (provider: OAuthProviderId) => {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: window.location.origin,
          ...(provider === 'discord' ? getDiscordOAuthOptions() : {}),
        },
      })
      if (error) {
        console.error(`Error linking ${provider}:`, error)
        throw error
      }
    },
    []
  )

  const linkWithGoogle = useCallback(
    () => linkWithOAuthProvider('google'),
    [linkWithOAuthProvider]
  )

  const linkWithDiscord = useCallback(
    () => linkWithOAuthProvider('discord'),
    [linkWithOAuthProvider]
  )

  const unlinkProvider = useCallback(async (identity: UserIdentity) => {
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) {
      console.error('Error unlinking identity:', error)
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
    if (isDefaultBlueprint(blueprintId)) {
      return
    }

    const activeUser = userRef.current
    const activeProfile = profileRef.current
    const isGuestMode = !activeUser && readGuestPreviewSession()

    // Guest mode: localStorage only
    if (isGuestMode) {
      const normalizedId = normalizeGuestBlueprintId(blueprintId)
      if (!normalizedId) {
        console.warn('Cannot toggle acquired: unknown blueprint id', blueprintId)
        return
      }

      const current = acquiredRef.current
      const isCurrentlyAcquired = current[normalizedId]
      const updated = { ...current }

      if (isCurrentlyAcquired) {
        delete updated[normalizedId]
      } else {
        updated[normalizedId] = true
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
      } else {
        console.error('Error removing acquired blueprint:', error)
      }
    } else {
      const { error } = await supabase
        .from('acquired_blueprints')
        .insert({ user_id: activeUser.id, blueprint_id: blueprintId })

      // 23505 = already acquired (e.g. BP Dumper wrote it while local state was stale)
      if (!error || error.code === '23505') {
        setAcquiredBlueprints(prev => ({
          ...prev,
          [blueprintId]: true,
        }))
        if (!error) {
          await removeTargetBlueprint(activeUser.id, blueprintId)
        }
      } else {
        console.error('Error acquiring blueprint:', error)
      }
    }
  }, [])

  /** RSI handles are verified-only — clients cannot set a handle string directly. */
  const updateRsiHandle = useCallback(async (handle: string): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser) return false

    const trimmedHandle = handle.trim()
    if (trimmedHandle) {
      console.error('RSI handle can only be set via bio verification')
      return false
    }

    const { data, error } = await supabase.rpc('clear_my_rsi_handle')
    if (error || !(data as { success?: boolean } | null)?.success) {
      console.error('Error clearing RSI handle:', error)
      return false
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            rsi_handle: null,
            rsi_handle_verified: false,
            rsi_handle_verified_at: null,
          }
        : null,
    )
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

  const updateGroupBlueprintVariants = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser) {
      if (isGuestPreview) {
        writeGuestGroupBlueprintVariants(enabled)
        setGuestGroupBlueprintVariants(enabled)
        return true
      }
      return false
    }

    const { error } = await supabase
      .from('profiles')
      .update({ group_blueprint_variants: enabled })
      .eq('id', activeUser.id)

    if (error) {
      console.error('Error updating group blueprint variants setting:', error)
      return false
    }

    setProfile(prev => prev ? { ...prev, group_blueprint_variants: enabled } : null)
    return true
  }, [isGuestPreview])

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

  const updateMarketplaceWtsAdsSite = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (profileRef.current?.role !== 'super-admin') return false
    const { error } = await supabase.rpc('update_site_marketplace_wts_ads', { p_enabled: enabled })
    if (error) {
      console.error('Error updating WTS marketplace ads site setting:', error)
      return false
    }
    setMarketplaceWtsAdsSiteEnabled(enabled)
    return true
  }, [])

  const updateMarketplaceWtbAdsSite = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (profileRef.current?.role !== 'super-admin') return false
    const { error } = await supabase.rpc('update_site_marketplace_wtb_ads', { p_enabled: enabled })
    if (error) {
      console.error('Error updating WTB marketplace ads site setting:', error)
      return false
    }
    setMarketplaceWtbAdsSiteEnabled(enabled)
    return true
  }, [])

  const updateMarketplacePurchaseToastsSite = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (profileRef.current?.role !== 'super-admin') return false
    const { error } = await supabase.rpc('update_site_marketplace_purchase_toasts', {
      p_enabled: enabled,
    })
    if (error) {
      console.error('Error updating purchase toasts site setting:', error)
      return false
    }
    setMarketplacePurchaseToastsSiteEnabled(enabled)
    return true
  }, [])

  const updateMarketplaceWtsAds = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser || !marketplaceWtsAdsSiteEnabled) return false
    const { error } = await supabase
      .from('profiles')
      .update({ marketplace_wts_ads_enabled: enabled })
      .eq('id', activeUser.id)
    if (error) {
      console.error('Error updating WTS ads preference:', error)
      return false
    }
    setProfile((prev) => (prev ? { ...prev, marketplace_wts_ads_enabled: enabled } : null))
    return true
  }, [marketplaceWtsAdsSiteEnabled])

  const updateMarketplaceWtbAds = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser || !marketplaceWtbAdsSiteEnabled) return false
    const { error } = await supabase
      .from('profiles')
      .update({ marketplace_wtb_ads_enabled: enabled })
      .eq('id', activeUser.id)
    if (error) {
      console.error('Error updating WTB ads preference:', error)
      return false
    }
    setProfile((prev) => (prev ? { ...prev, marketplace_wtb_ads_enabled: enabled } : null))
    return true
  }, [marketplaceWtbAdsSiteEnabled])

  const updateMarketplacePurchaseToasts = useCallback(async (enabled: boolean): Promise<boolean> => {
    const activeUser = userRef.current
    if (!activeUser || !marketplacePurchaseToastsSiteEnabled) return false
    const { error } = await supabase
      .from('profiles')
      .update({ marketplace_purchase_toasts_enabled: enabled })
      .eq('id', activeUser.id)
    if (error) {
      console.error('Error updating purchase toasts preference:', error)
      return false
    }
    setProfile((prev) => (prev ? { ...prev, marketplace_purchase_toasts_enabled: enabled } : null))
    return true
  }, [marketplacePurchaseToastsSiteEnabled])

  const marketplaceWtsAdsEnabled = profile?.marketplace_wts_ads_enabled ?? true
  const marketplaceWtbAdsEnabled = profile?.marketplace_wtb_ads_enabled ?? true
  const marketplacePurchaseToastsEnabled = profile?.marketplace_purchase_toasts_enabled ?? true

  const isOfficerOrAbove = profile?.role === 'officer' || profile?.role === 'super-admin'
  const isSuperAdmin = profile?.role === 'super-admin'
  const isPending = profile?.role === 'pending'
  const guestPreviewActive = !user && isGuestPreview
  const groupBlueprintVariants =
    profile?.group_blueprint_variants ?? (guestPreviewActive ? guestGroupBlueprintVariants : false)
  const canModifyBlueprints = guestPreviewActive || (!!profile && profile.role !== 'pending')
  const isApproved = !!profile && profile.role !== 'pending'
  const visibilityContext = useMemo(
    () =>
      buildVisibilityContext({
        role: profile?.role ?? null,
        isGuestPreview: guestPreviewActive,
      }),
    [profile?.role, guestPreviewActive]
  )

  useEffect(() => {
    if (user?.id) {
      writeGuestPreviewSession(false)
      setIsGuestPreview(false)
    }
  }, [user?.id])
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
      bootstrapSteps,
      isBanned,
      acquiredBlueprints,
      signInWithGoogle,
      signInWithDiscord,
      getLinkedIdentities,
      linkWithGoogle,
      linkWithDiscord,
      unlinkProvider,
      signOut,
      toggleAcquired,
      updateRsiHandle,
      updateCraftDeductInventory,
      updateGroupBlueprintVariants,
      groupBlueprintVariants,
      refreshProfile,
      refreshAcquiredBlueprints,
      displayName,
      isOfficerOrAbove,
      isSuperAdmin,
      isPending,
      isGuestPreview: guestPreviewActive,
      enterGuestPreview,
      exitGuestPreview,
      canModifyBlueprints,
      isApproved,
      canAccess,
      visibilityContext,
      canUseFeature: checkFeature,
      dfpDisplayEnabled,
      updateDfpDisplayEnabled,
      autoApproveEnabled,
      updateAutoApprove,
      marketplaceWtsAdsSiteEnabled,
      marketplaceWtbAdsSiteEnabled,
      marketplacePurchaseToastsSiteEnabled,
      updateMarketplaceWtsAdsSite,
      updateMarketplaceWtbAdsSite,
      updateMarketplacePurchaseToastsSite,
      marketplaceWtsAdsEnabled,
      marketplaceWtbAdsEnabled,
      marketplacePurchaseToastsEnabled,
      updateMarketplaceWtsAds,
      updateMarketplaceWtbAds,
      updateMarketplacePurchaseToasts,
      orgLogoUrl,
      orgLogoUpdatedAt,
      orgLogoConfigured,
      refreshOrgLogo,
    }),
    [
      user,
      profile,
      session,
      loading,
      bootstrapSteps,
      isBanned,
      acquiredBlueprints,
      signInWithGoogle,
      signInWithDiscord,
      getLinkedIdentities,
      linkWithGoogle,
      linkWithDiscord,
      unlinkProvider,
      signOut,
      toggleAcquired,
      updateRsiHandle,
      updateCraftDeductInventory,
      updateGroupBlueprintVariants,
      groupBlueprintVariants,
      refreshProfile,
      refreshAcquiredBlueprints,
      displayName,
      isOfficerOrAbove,
      isSuperAdmin,
      isPending,
      guestPreviewActive,
      enterGuestPreview,
      exitGuestPreview,
      canModifyBlueprints,
      isApproved,
      canAccess,
      visibilityContext,
      checkFeature,
      dfpDisplayEnabled,
      updateDfpDisplayEnabled,
      autoApproveEnabled,
      updateAutoApprove,
      marketplaceWtsAdsSiteEnabled,
      marketplaceWtbAdsSiteEnabled,
      marketplacePurchaseToastsSiteEnabled,
      updateMarketplaceWtsAdsSite,
      updateMarketplaceWtbAdsSite,
      updateMarketplacePurchaseToastsSite,
      marketplaceWtsAdsEnabled,
      marketplaceWtbAdsEnabled,
      marketplacePurchaseToastsEnabled,
      updateMarketplaceWtsAds,
      updateMarketplaceWtbAds,
      updateMarketplacePurchaseToasts,
      orgLogoUrl,
      orgLogoUpdatedAt,
      orgLogoConfigured,
      refreshOrgLogo,
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
