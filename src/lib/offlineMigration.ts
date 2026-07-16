import { supabase } from './supabase'
import { missionKey } from './missions'
import { normalizeGuestBlueprintId } from './guestCatalog'
import { fetchResourceCatalog } from './operations'
import { normalizeStockNoteKey } from './inventoryStock'
import {
  clearAllGuestLocalData,
  ensureGuestCacheSchema,
  readGuestAcquiredBlueprints,
  readGuestMissionPrefEntries,
  readGuestResources,
  readGuestTargetList,
  readMiningTrackerEntries,
  sanitizeMigrationBatch,
  sanitizeResourceEntry,
  type GuestMissionPrefEntry,
} from './localGuestCache'

export interface MigrationSectionResult {
  migrated: number
  skipped: number
}

export interface OfflineMigrationResult {
  ran: boolean
  acquired: MigrationSectionResult
  targets: MigrationSectionResult
  missionPrefs: MigrationSectionResult
  resources: MigrationSectionResult
  mining: MigrationSectionResult
}

const EMPTY_SECTION: MigrationSectionResult = { migrated: 0, skipped: 0 }

async function shouldRunFirstSignInMigration(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_welcome_modal_status')
  if (error) {
    console.error('[offline-migration] welcome status check failed:', error)
    return false
  }
  const status = data as { has_seen?: boolean; always_show?: boolean } | null
  if (!status) return false
  if (status.has_seen) return false
  if (status.always_show) return false
  return true
}

async function migrateAcquiredBlueprints(userId: string): Promise<MigrationSectionResult> {
  const local = readGuestAcquiredBlueprints()
  const ids = Object.keys(local).filter((id) => local[id])
  let migrated = 0
  let skipped = 0

  const validIds: string[] = []
  for (const id of ids) {
    const normalized = normalizeGuestBlueprintId(id)
    if (normalized) validIds.push(normalized)
    else skipped++
  }

  const batch = sanitizeMigrationBatch(validIds)
  skipped += validIds.length - batch.length

  if (batch.length === 0) return { migrated, skipped }

  const inserts = batch.map((blueprint_id) => ({ user_id: userId, blueprint_id }))
  const { error } = await supabase
    .from('acquired_blueprints')
    .upsert(inserts, { onConflict: 'user_id,blueprint_id', ignoreDuplicates: true })

  if (error) {
    console.error('[offline-migration] acquired blueprints failed:', error)
    return { migrated, skipped: skipped + batch.length }
  }

  migrated = batch.length
  return { migrated, skipped }
}

async function migrateTargetBlueprints(userId: string): Promise<MigrationSectionResult> {
  const { targetIds } = readGuestTargetList()
  const ids = Object.keys(targetIds).filter((id) => targetIds[id])
  let migrated = 0
  let skipped = 0

  const validIds: string[] = []
  for (const id of ids) {
    const normalized = normalizeGuestBlueprintId(id)
    if (normalized) validIds.push(normalized)
    else skipped++
  }

  const batch = sanitizeMigrationBatch(validIds)
  skipped += validIds.length - batch.length

  if (batch.length === 0) return { migrated, skipped }

  const inserts = batch.map((blueprint_id) => ({ user_id: userId, blueprint_id }))
  const { error } = await supabase
    .from('target_list_blueprints')
    .upsert(inserts, { onConflict: 'user_id,blueprint_id', ignoreDuplicates: true })

  if (error) {
    console.error('[offline-migration] target list failed:', error)
    return { migrated, skipped: skipped + batch.length }
  }

  migrated = batch.length
  return { migrated, skipped }
}

async function migrateMissionPrefs(userId: string): Promise<MigrationSectionResult> {
  const entries = readGuestMissionPrefEntries().filter((entry) => entry.included)
  let migrated = 0
  let skipped = 0

  const valid: GuestMissionPrefEntry[] = []
  for (const entry of entries) {
    if (entry.mission_key !== missionKey(entry.mission_label)) {
      skipped++
      continue
    }
    valid.push(entry)
  }

  const batch = sanitizeMigrationBatch(valid)
  skipped += valid.length - batch.length

  if (batch.length === 0) return { migrated, skipped }

  const inserts = batch.map((entry) => ({
    user_id: userId,
    mission_key: entry.mission_key,
    mission_label: entry.mission_label,
    included: true,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('target_list_mission_prefs')
    .upsert(inserts, { onConflict: 'user_id,mission_key', ignoreDuplicates: true })

  if (error) {
    console.error('[offline-migration] mission prefs failed:', error)
    return { migrated, skipped: skipped + batch.length }
  }

  migrated = batch.length
  return { migrated, skipped }
}

async function migrateResources(userId: string): Promise<MigrationSectionResult> {
  const catalogResult = await fetchResourceCatalog()
  const dbKeys = new Set(catalogResult.data.map((row) => row.resource_key))

  const guestResources = readGuestResources()
  let migrated = 0
  let skipped = 0

  const valid = guestResources
    .map((entry) => sanitizeResourceEntry(entry))
    .filter((entry): entry is NonNullable<typeof entry> => {
      if (!entry) {
        skipped++
        return false
      }
      if (!dbKeys.has(entry.resource_key)) {
        skipped++
        return false
      }
      return true
    })

  const batch = sanitizeMigrationBatch(valid)
  skipped += valid.length - batch.length

  if (batch.length === 0) return { migrated, skipped }

  const inserts = batch.map((row) => {
    const note = row.note ?? null
    return {
      user_id: userId,
      resource_key: row.resource_key,
      quality: row.quality,
      quantity: row.quantity,
      note,
      note_key: normalizeStockNoteKey(note),
    }
  })

  const { error } = await supabase
    .from('personal_resource_inventory')
    .upsert(inserts, {
      onConflict: 'user_id,resource_key,quality,note_key',
      ignoreDuplicates: true,
    })

  if (error) {
    console.error('[offline-migration] resources failed:', error)
    return { migrated, skipped: skipped + batch.length }
  }

  migrated = batch.length
  return { migrated, skipped }
}

async function migrateMiningTracker(): Promise<MigrationSectionResult> {
  const guestMiningEntries = readMiningTrackerEntries()
  let skipped = 0

  if (guestMiningEntries.length === 0) return { migrated: 0, skipped }

  const batch = sanitizeMigrationBatch(guestMiningEntries)
  skipped += guestMiningEntries.length - batch.length

  const { data, error } = await supabase.rpc('import_mining_tracker_entries', {
    p_entries: batch,
  })

  if (error || !data?.success) {
    console.error('[offline-migration] mining tracker failed:', error)
    return { migrated: 0, skipped: skipped + batch.length }
  }

  return { migrated: Number(data.imported ?? 0), skipped }
}

export async function maybeMigrateOfflineData(userId: string): Promise<OfflineMigrationResult> {
  const empty: OfflineMigrationResult = {
    ran: false,
    acquired: EMPTY_SECTION,
    targets: EMPTY_SECTION,
    missionPrefs: EMPTY_SECTION,
    resources: EMPTY_SECTION,
    mining: EMPTY_SECTION,
  }

  const shouldRun = await shouldRunFirstSignInMigration()
  if (!shouldRun) return empty

  ensureGuestCacheSchema()

  const acquired = await migrateAcquiredBlueprints(userId)
  const targets = await migrateTargetBlueprints(userId)
  const missionPrefs = await migrateMissionPrefs(userId)
  const resources = await migrateResources(userId)
  const mining = await migrateMiningTracker()

  clearAllGuestLocalData()

  const result: OfflineMigrationResult = {
    ran: true,
    acquired,
    targets,
    missionPrefs,
    resources,
    mining,
  }

  console.info('[offline-migration] first sign-in migration complete', result)
  return result
}
