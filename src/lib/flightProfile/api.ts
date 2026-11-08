import { supabase } from '../supabase'
import {
  externalPressesFromStored,
  externalsEmpty,
  externalsFromStored,
  pressesFromStored,
  setupFromStored,
  type ExternalSetup,
  type PressSetup,
  type Setup,
  type SlotPress,
} from './catalog'
import { readFlightProfile, type ParsedFlightProfile } from './parseProfile'

export interface StoredFlightProfile {
  file_name: string | null
  profile_name: string | null
  xml: string | null
  layout: unknown
  button_presses: unknown
  updated_at: string
}

export type ExternalPresses = Record<'externalLeft' | 'externalRight', [SlotPress | null, SlotPress | null]>

export async function loadListedGear(): Promise<Set<string> | null> {
  const { data, error } = await supabase.from('flight_gear').select('id').eq('listed', true)
  if (error || !data) return null
  return new Set(data.map((row) => String((row as { id: string }).id)))
}

export async function loadFlightProfile(): Promise<{
  profile: ParsedFlightProfile | null
  setup: Setup
  presses: PressSetup
  externals: ExternalSetup
  externalPresses: ExternalPresses
  error?: string
}> {
  const empty = {
    profile: null,
    setup: setupFromStored(null),
    presses: pressesFromStored(null),
    externals: externalsFromStored(null),
    externalPresses: externalPressesFromStored(null),
  }
  const { data, error } = await supabase
    .from('flight_profiles')
    .select('file_name, profile_name, xml, layout, button_presses, updated_at')
    .maybeSingle()

  if (error) return { ...empty, error: error.message }
  const row = data as StoredFlightProfile | null
  const setup = setupFromStored(row?.layout)
  const presses = pressesFromStored(row?.button_presses)
  const externals = externalsFromStored(row?.layout)
  const externalPresses = externalPressesFromStored(row?.button_presses)
  if (!row?.xml) return { profile: null, setup, presses, externals, externalPresses }

  const read = readFlightProfile(row.xml, row.file_name || 'profile.xml')
  if (!read.ok) {
    return { profile: null, setup, presses, externals, externalPresses, error: 'The profile saved on your account could not be read.' }
  }
  return { profile: read.profile, setup, presses, externals, externalPresses }
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

export async function saveFlightLayout(setup: Setup, externals: ExternalSetup): Promise<{ error?: string }> {
  const payload = externalsEmpty(externals) ? setup : { ...setup, ...externals }
  const { error } = await supabase.rpc('save_flight_profile_layout', {
    p_layout: payload,
  })
  if (error) return { error: error.message }
  return {}
}

export async function saveFlightPresses(
  presses: PressSetup,
  externalPresses: ExternalPresses
): Promise<{ error?: string }> {
  const include =
    externalPresses.externalLeft.some(Boolean) || externalPresses.externalRight.some(Boolean)
  const payload = include ? { ...presses, ...externalPresses } : presses
  const { error } = await supabase.rpc('save_flight_button_presses', {
    p_presses: payload,
  })
  if (error) return { error: error.message }
  return {}
}
