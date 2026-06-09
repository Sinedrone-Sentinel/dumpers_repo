import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type UserRole = 'pending' | 'member' | 'officer' | 'super-admin'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  rsi_handle: string | null
  role: UserRole
  created_at: string
  approved_at: string | null
  approved_by: string | null
  ghost_mode: boolean
  craft_deduct_inventory: boolean
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
