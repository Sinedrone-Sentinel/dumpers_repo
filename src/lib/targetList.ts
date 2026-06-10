import { supabase } from './supabase'
import { missionKey } from './missions'

export interface TargetListRow {
  id: string
  blueprint_id: string
  added_at: string
}

export interface MissionPrefRow {
  mission_key: string
  mission_label: string
  included: boolean
}

export async function fetchTargetBlueprintIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('target_list_blueprints')
    .select('blueprint_id')
    .eq('user_id', userId)

  if (error) throw error
  return (data ?? []).map((row) => row.blueprint_id)
}

export async function addTargetBlueprint(
  userId: string,
  blueprintId: string
): Promise<{ error?: string }> {
  const { error } = await supabase.from('target_list_blueprints').insert({
    user_id: userId,
    blueprint_id: blueprintId,
  })

  if (error) {
    if (error.code === '23505') return {}
    return { error: error.message }
  }
  return {}
}

export async function removeTargetBlueprint(
  userId: string,
  blueprintId: string,
  relatedMissionKeys?: string[]
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('target_list_blueprints')
    .delete()
    .eq('user_id', userId)
    .eq('blueprint_id', blueprintId)

  if (error) return { error: error.message }

  // Also remove any related mission prefs
  if (relatedMissionKeys && relatedMissionKeys.length > 0) {
    await supabase
      .from('target_list_mission_prefs')
      .delete()
      .eq('user_id', userId)
      .in('mission_key', relatedMissionKeys)
  }

  return {}
}

export async function removeMissionPrefsByKeys(
  userId: string,
  missionKeys: string[]
): Promise<{ error?: string }> {
  if (missionKeys.length === 0) return {}

  const { error } = await supabase
    .from('target_list_mission_prefs')
    .delete()
    .eq('user_id', userId)
    .in('mission_key', missionKeys)

  if (error) return { error: error.message }
  return {}
}

export async function fetchMissionPrefs(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('target_list_mission_prefs')
    .select('mission_key, included')
    .eq('user_id', userId)

  if (error) throw error

  const prefs: Record<string, boolean> = {}
  for (const row of data ?? []) {
    prefs[row.mission_key] = row.included
  }
  return prefs
}

export async function setMissionIncluded(
  userId: string,
  missionLabel: string,
  included: boolean
): Promise<{ error?: string }> {
  const key = missionKey(missionLabel)
  const { error } = await supabase.from('target_list_mission_prefs').upsert(
    {
      user_id: userId,
      mission_key: key,
      mission_label: missionLabel,
      included,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,mission_key' }
  )

  if (error) return { error: error.message }
  return {}
}
