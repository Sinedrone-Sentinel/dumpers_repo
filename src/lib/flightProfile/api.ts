import { supabase } from '../supabase'
import { setupFromStored, type Setup } from './catalog'
import { readFlightProfile, type ParsedFlightProfile } from './parseProfile'

export interface StoredFlightProfile {
  file_name: string | null
  profile_name: string | null
  xml: string | null
  layout: unknown
  updated_at: string
}

export async function loadFlightProfile(): Promise<{
  profile: ParsedFlightProfile | null
  setup: Setup
  error?: string
}> {
  const { data, error } = await supabase
    .from('flight_profiles')
    .select('file_name, profile_name, xml, layout, updated_at')
    .maybeSingle()

  if (error) return { profile: null, setup: setupFromStored(null), error: error.message }
  const row = data as StoredFlightProfile | null
  const setup = setupFromStored(row?.layout)
  if (!row?.xml) return { profile: null, setup }

  const read = readFlightProfile(row.xml, row.file_name || 'profile.xml')
  if (!read.ok) return { profile: null, setup, error: 'The profile saved on your account could not be read.' }
  return { profile: read.profile, setup }
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

export async function saveFlightLayout(setup: Setup): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('save_flight_profile_layout', {
    p_layout: setup,
  })
  if (error) return { error: error.message }
  return {}
}
