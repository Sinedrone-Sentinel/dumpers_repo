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
}

export function getDisplayName(profile: Profile | null): string {
  if (!profile) return 'Unknown'
  return profile.rsi_handle || profile.display_name || profile.email || 'Unknown'
}

export interface AcquiredBlueprint {
  id: number
  user_id: string
  blueprint_id: string
  acquired_at: string
}
