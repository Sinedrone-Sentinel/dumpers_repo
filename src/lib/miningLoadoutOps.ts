import { supabase } from './supabase'
import {
  emptyMiningLoadoutStore,
  parseMiningLoadoutStore,
  type MiningLoadoutStore,
} from './miningLoadoutStorage'

/** Signed-in members only — guest preview and anonymous users cannot use loadouts. */
export function canUseMiningLoadouts(
  userId: string | undefined | null,
  isGuestPreview: boolean
): boolean {
  return !!userId && !isGuestPreview
}

export async function fetchMiningLoadoutState(): Promise<MiningLoadoutStore> {
  const { data, error } = await supabase.rpc('get_mining_loadout_state')
  if (error) throw error
  return parseMiningLoadoutStore(data)
}

export async function saveMiningLoadoutState(store: MiningLoadoutStore): Promise<void> {
  const payload = {
    ...store,
    version: store.version,
  }
  const { error } = await supabase.rpc('save_mining_loadout_state', { p_store: payload })
  if (error) throw error
}

export function defaultMiningLoadoutState(): MiningLoadoutStore {
  return emptyMiningLoadoutStore()
}
