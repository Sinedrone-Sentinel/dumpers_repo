import { supabase } from '../supabase'
import { readFlightProfile, type ParsedFlightProfile } from './parseProfile'

export interface StoredFlightProfile {
  file_name: string
  profile_name: string
  xml: string
  updated_at: string
}

export async function loadFlightProfile(): Promise<{ profile: ParsedFlightProfile | null; error?: string }> {
  const { data, error } = await supabase
    .from('flight_profiles')
    .select('file_name, profile_name, xml, updated_at')
    .maybeSingle()

  if (error) return { profile: null, error: error.message }
  const row = data as StoredFlightProfile | null
  if (!row?.xml) return { profile: null }

  const read = readFlightProfile(row.xml, row.file_name || 'profile.xml')
  if (!read.ok) return { profile: null, error: 'The profile saved on your account could not be read.' }
  return { profile: read.profile }
}

export async function saveFlightProfile(profile: ParsedFlightProfile, xml: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('save_flight_profile', {
    p_file_name: profile.fileName,
    p_profile_name: profile.profileName,
    p_xml: xml,
  })
  if (error) return { error: error.message }
  return {}
}
