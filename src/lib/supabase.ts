import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

const PKCE_VERIFIER_COOKIE = 'dr-pkce-verifier'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const parts = `; ${document.cookie}`.split(`; ${name}=`)
  if (parts.length < 2) return null
  const raw = parts.pop()?.split(';').shift()
  return raw ? decodeURIComponent(raw) : null
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** localStorage plus a short-lived cookie so iOS Safari can finish PKCE after Discord hops tabs. */
function createAuthStorage() {
  const memory = new Map<string, string>()
  const isVerifierKey = (key: string) => key.includes('code-verifier')

  return {
    getItem: (key: string) => {
      try {
        const fromLs = localStorage.getItem(key)
        if (fromLs) return fromLs
      } catch {
        /* private mode */
      }
      if (isVerifierKey(key)) {
        const fromCookie = readCookie(PKCE_VERIFIER_COOKIE)
        if (fromCookie) return fromCookie
      }
      return memory.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      memory.set(key, value)
      try {
        localStorage.setItem(key, value)
      } catch {
        /* private mode */
      }
      if (isVerifierKey(key)) writeCookie(PKCE_VERIFIER_COOKIE, value, 600)
    },
    removeItem: (key: string) => {
      memory.delete(key)
      try {
        localStorage.removeItem(key)
      } catch {
        /* private mode */
      }
      if (isVerifierKey(key)) writeCookie(PKCE_VERIFIER_COOKIE, '', 0)
    },
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    storage: createAuthStorage(),
  },
})

export type UserRole = 'pending' | 'member' | 'officer' | 'super-admin'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  rsi_handle: string | null
  rsi_handle_verified: boolean
  rsi_handle_verified_at: string | null
  role: UserRole
  created_at: string
  approved_at: string | null
  approved_by: string | null
  craft_deduct_inventory: boolean
  group_blueprint_variants: boolean
  marketplace_wts_ads_enabled: boolean
  marketplace_wtb_ads_enabled: boolean
  marketplace_purchase_toasts_enabled: boolean
}

export function getDisplayName(profile: Profile | null): string {
  if (!profile) return 'Unknown'
  return profile.rsi_handle || profile.display_name || profile.email || 'Unknown'
}

export function displayNameFromFields(
  fields?: { rsi_handle: string | null; display_name: string | null; email: string | null } | null
): string {
  if (!fields) return 'Unknown'
  return fields.rsi_handle || fields.display_name || fields.email || 'Unknown'
}

export interface AcquiredBlueprint {
  id: number
  user_id: string
  blueprint_id: string
  acquired_at: string
}

export interface BannedUser {
  id: string
  email: string | null
  display_name: string | null
  rsi_handle: string | null
  avatar_url: string | null
  banned_at: string
  banned_by: string | null
  reason: string | null
}

export async function adminSetUserRole(
  userId: string,
  role: Exclude<UserRole, 'super-admin'>
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  const result = data as { success?: boolean; error?: string } | null
  if (result && result.success === false) {
    return { success: false, error: result.error || 'Failed to update role' }
  }

  return { success: true }
}

export async function banUser(
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('ban-user', {
    body: { userId, reason: reason ?? null },
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (data?.error) {
    return { success: false, error: data.error }
  }

  return { success: true }
}

export async function unbanUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('unban-user', {
    body: { userId },
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (data?.error) {
    return { success: false, error: data.error }
  }

  return { success: true }
}

export async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('delete-account')

  if (error) {
    return { success: false, error: error.message }
  }

  if (data?.error) {
    return { success: false, error: data.error }
  }

  return { success: true }
}
