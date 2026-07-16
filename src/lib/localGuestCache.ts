/** Browser-local persistence for guest preview (no Supabase). */

import { missionKey } from './missions'
import { normalizeGuestBlueprintId, normalizeGuestResourceKey, validateGuestMiningEntry } from './guestCatalog'

export const GUEST_CACHE_VERSION = 2
export const GUEST_CACHE_VERSION_KEY = 'dumpers_guest_cache_version'

export const GUEST_ACQUIRED_STORAGE_KEY = 'acquired_blueprints'

export const MINING_TRACKER_STORAGE_KEY = 'dumpers_mining_tracker'

export type DepositType = 'surface' | 'asteroid'
export type ProfileMode = 'overall' | 'location'

export interface MiningTrackerEntry {
  id: string
  oreName: string
  depositType: DepositType
  rarity: string
  addedAt: number
  profileMode: ProfileMode
  locationName?: string
}

export interface MiningTrackerAddOptions {
  depositType: DepositType
  profileMode?: ProfileMode
  locationName?: string
}

export const GUEST_TARGET_LIST_STORAGE_KEY = 'dumpers_guest_target_list'
export const GUEST_MISSION_PREFS_STORAGE_KEY = 'dumpers_guest_mission_prefs'

export interface GuestMissionPrefEntry {
  mission_key: string
  mission_label: string
  included: boolean
}

export interface GuestTargetListData {
  targetIds: Record<string, boolean>
  missionPrefs: Record<string, boolean>
}

export const GUEST_RESOURCES_STORAGE_KEY = 'dumpers_guest_resources'
export const GUEST_GROUP_BLUEPRINT_VARIANTS_KEY = 'dumpers_guest_group_blueprint_variants'

export interface GuestResourceEntry {
  resource_key: string
  quantity: number
  quality: number
  note?: string | null
}

const MAX_RESOURCE_QUANTITY = 100000
const MIN_QUALITY = 0
const MAX_QUALITY = 1000
const MAX_MIGRATION_BATCH = 1000

const LEGACY_BLUEPRINT_KEY = /[\\/]|bp_craft_|\.json/i

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function hasLegacyBlueprintKeys(map: Record<string, boolean>): boolean {
  return Object.keys(map).some((key) => LEGACY_BLUEPRINT_KEY.test(key))
}

function isLegacyMissionPrefsRaw(raw: string | null): boolean {
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return !parsed.every(
        (row) =>
          row &&
          typeof row === 'object' &&
          typeof (row as GuestMissionPrefEntry).mission_key === 'string' &&
          typeof (row as GuestMissionPrefEntry).mission_label === 'string' &&
          typeof (row as GuestMissionPrefEntry).included === 'boolean'
      )
    }
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).every((v) => typeof v === 'boolean')
    }
    return true
  } catch {
    return true
  }
}

function detectLegacyGuestCache(): boolean {
  if (typeof localStorage === 'undefined') return false

  const version = parseInt(localStorage.getItem(GUEST_CACHE_VERSION_KEY) ?? '', 10)
  if (!Number.isFinite(version) || version < GUEST_CACHE_VERSION) return true

  const acquired = safeParse<Record<string, boolean>>(
    localStorage.getItem(GUEST_ACQUIRED_STORAGE_KEY),
    {}
  )
  if (hasLegacyBlueprintKeys(acquired)) return true

  const targets = safeParse<Record<string, boolean>>(
    localStorage.getItem(GUEST_TARGET_LIST_STORAGE_KEY),
    {}
  )
  if (hasLegacyBlueprintKeys(targets)) return true

  if (isLegacyMissionPrefsRaw(localStorage.getItem(GUEST_MISSION_PREFS_STORAGE_KEY))) return true

  return false
}

export function stampGuestCacheVersion(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GUEST_CACHE_VERSION_KEY, String(GUEST_CACHE_VERSION))
}

export function clearAllGuestLocalData(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(GUEST_ACQUIRED_STORAGE_KEY)
  localStorage.removeItem(GUEST_TARGET_LIST_STORAGE_KEY)
  localStorage.removeItem(GUEST_MISSION_PREFS_STORAGE_KEY)
  localStorage.removeItem(GUEST_RESOURCES_STORAGE_KEY)
  localStorage.removeItem(GUEST_GROUP_BLUEPRINT_VARIANTS_KEY)
  localStorage.removeItem(MINING_TRACKER_STORAGE_KEY)
  localStorage.removeItem('dumpers_mining_tracker_multiplier')
  localStorage.removeItem(GUEST_CACHE_VERSION_KEY)
}

/** Wipe legacy offline data and stamp v2. Returns true if a wipe occurred. */
export function ensureGuestCacheSchema(): boolean {
  if (typeof localStorage === 'undefined') return false
  if (!detectLegacyGuestCache()) return false

  clearAllGuestLocalData()
  stampGuestCacheVersion()
  console.info('[guest-cache] Legacy offline data cleared; schema v2 applied')
  return true
}

function normalizeBlueprintMap(source: Record<string, boolean>): Record<string, boolean> {
  const normalized: Record<string, boolean> = {}
  for (const [id, val] of Object.entries(source)) {
    if (!val) continue
    const key = normalizeGuestBlueprintId(id)
    if (key) normalized[key] = true
  }
  return normalized
}

export function readGuestAcquiredBlueprints(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {}
  return normalizeBlueprintMap(
    safeParse<Record<string, boolean>>(localStorage.getItem(GUEST_ACQUIRED_STORAGE_KEY), {})
  )
}

export function writeGuestAcquiredBlueprints(acquired: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GUEST_ACQUIRED_STORAGE_KEY, JSON.stringify(normalizeBlueprintMap(acquired)))
  stampGuestCacheVersion()
}

function normalizeMiningTrackerEntry(raw: Partial<MiningTrackerEntry>): MiningTrackerEntry | null {
  const checked = validateGuestMiningEntry(raw.oreName ?? '', raw.rarity ?? '')
  if (!checked) return null

  const depositType: DepositType = raw.depositType === 'asteroid' ? 'asteroid' : 'surface'
  const profileMode: ProfileMode = raw.profileMode === 'location' ? 'location' : 'overall'

  return {
    id: miningTrackerEntryId(checked.oreName, depositType),
    oreName: checked.oreName,
    depositType,
    rarity: checked.rarity,
    addedAt: typeof raw.addedAt === 'number' ? raw.addedAt : Date.now(),
    profileMode,
    locationName: profileMode === 'location' ? raw.locationName : undefined,
  }
}

export function readMiningTrackerEntries(): MiningTrackerEntry[] {
  if (typeof localStorage === 'undefined') return []
  const entries = safeParse<Partial<MiningTrackerEntry>[]>(
    localStorage.getItem(MINING_TRACKER_STORAGE_KEY),
    []
  )
  return entries
    .map((entry) => normalizeMiningTrackerEntry(entry))
    .filter((entry): entry is MiningTrackerEntry => entry !== null)
}

export function writeMiningTrackerEntries(entries: MiningTrackerEntry[]): void {
  if (typeof localStorage === 'undefined') return
  const valid = entries
    .map((entry) => normalizeMiningTrackerEntry(entry))
    .filter((entry): entry is MiningTrackerEntry => entry !== null)
  localStorage.setItem(MINING_TRACKER_STORAGE_KEY, JSON.stringify(valid))
  stampGuestCacheVersion()
}

export function clearMiningTrackerEntries(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(MINING_TRACKER_STORAGE_KEY)
}

export function miningTrackerEntryId(oreName: string, depositType: DepositType = 'surface'): string {
  return `${oreName}:${depositType}`
}

export function guestMissionPrefsToMap(entries: GuestMissionPrefEntry[]): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  for (const entry of entries) {
    if (entry.included) map[entry.mission_key] = true
  }
  return map
}

export function readGuestMissionPrefEntries(): GuestMissionPrefEntry[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<GuestMissionPrefEntry[]>(
    localStorage.getItem(GUEST_MISSION_PREFS_STORAGE_KEY),
    []
  ).filter(
    (entry) =>
      typeof entry.mission_key === 'string' &&
      typeof entry.mission_label === 'string' &&
      typeof entry.included === 'boolean' &&
      entry.mission_key === missionKey(entry.mission_label)
  )
}

export function writeGuestMissionPrefEntries(entries: GuestMissionPrefEntry[]): void {
  if (typeof localStorage === 'undefined') return
  const valid = entries.filter(
    (entry) =>
      entry.included &&
      typeof entry.mission_key === 'string' &&
      typeof entry.mission_label === 'string' &&
      entry.mission_key === missionKey(entry.mission_label)
  )
  localStorage.setItem(GUEST_MISSION_PREFS_STORAGE_KEY, JSON.stringify(valid))
  stampGuestCacheVersion()
}

export function upsertGuestMissionPref(
  entries: GuestMissionPrefEntry[],
  missionLabel: string,
  included: boolean
): GuestMissionPrefEntry[] {
  const key = missionKey(missionLabel)
  return upsertGuestMissionPrefByKey(entries, key, missionLabel, included)
}

export function upsertGuestMissionPrefByKey(
  entries: GuestMissionPrefEntry[],
  key: string,
  missionLabel: string,
  included: boolean
): GuestMissionPrefEntry[] {
  const without = entries.filter((entry) => entry.mission_key !== key)
  if (!included) return without
  return [...without, { mission_key: key, mission_label: missionLabel, included: true }]
}

export function removeGuestMissionPrefKeys(
  entries: GuestMissionPrefEntry[],
  keysToRemove: string[]
): GuestMissionPrefEntry[] {
  const remove = new Set(keysToRemove)
  return entries.filter((entry) => !remove.has(entry.mission_key))
}

export function readGuestTargetList(): GuestTargetListData {
  if (typeof localStorage === 'undefined') {
    return { targetIds: {}, missionPrefs: {} }
  }
  const targetIds = normalizeBlueprintMap(
    safeParse<Record<string, boolean>>(localStorage.getItem(GUEST_TARGET_LIST_STORAGE_KEY), {})
  )
  const missionPrefEntries = readGuestMissionPrefEntries()
  return {
    targetIds,
    missionPrefs: guestMissionPrefsToMap(missionPrefEntries),
  }
}

export function writeGuestTargetIds(targetIds: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GUEST_TARGET_LIST_STORAGE_KEY, JSON.stringify(normalizeBlueprintMap(targetIds)))
  stampGuestCacheVersion()
}

export function readGuestResources(): GuestResourceEntry[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<GuestResourceEntry[]>(localStorage.getItem(GUEST_RESOURCES_STORAGE_KEY), [])
    .map((entry) => sanitizeResourceEntry(entry))
    .filter((entry): entry is GuestResourceEntry => entry !== null)
}

export function writeGuestResources(entries: GuestResourceEntry[]): void {
  if (typeof localStorage === 'undefined') return
  const valid = entries
    .map((entry) => sanitizeResourceEntry(entry))
    .filter((entry): entry is GuestResourceEntry => entry !== null)
  localStorage.setItem(GUEST_RESOURCES_STORAGE_KEY, JSON.stringify(valid))
  stampGuestCacheVersion()
}

export function clearGuestAcquiredBlueprints(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(GUEST_ACQUIRED_STORAGE_KEY)
}

export function clearGuestTargetList(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(GUEST_TARGET_LIST_STORAGE_KEY)
}

export function clearGuestMissionPrefs(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(GUEST_MISSION_PREFS_STORAGE_KEY)
}

export function clearGuestResources(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(GUEST_RESOURCES_STORAGE_KEY)
}

export function sanitizeResourceEntry(entry: unknown): GuestResourceEntry | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>

  const rawKey = typeof e.resource_key === 'string' ? e.resource_key : null
  if (!rawKey) return null
  const resource_key = normalizeGuestResourceKey(rawKey)
  if (!resource_key) return null

  const quantity = Number(e.quantity)
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > MAX_RESOURCE_QUANTITY) return null

  const quality = Number(e.quality)
  if (!Number.isFinite(quality) || quality < MIN_QUALITY || quality > MAX_QUALITY) return null

  let note: string | null = null
  if (typeof e.note === 'string') {
    const trimmed = e.note.trim().slice(0, 64)
    note = trimmed === '' ? null : trimmed
  }

  return {
    resource_key,
    quantity: Math.floor(quantity),
    quality: Math.floor(quality),
    note,
  }
}

export function sanitizeMigrationBatch<T>(items: T[]): T[] {
  return items.slice(0, MAX_MIGRATION_BATCH)
}

/** @deprecated Use normalizeGuestBlueprintId from guestCatalog */
export function sanitizeBlueprintId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  return normalizeGuestBlueprintId(id)
}

export function readGuestGroupBlueprintVariants(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(GUEST_GROUP_BLUEPRINT_VARIANTS_KEY) === '1'
}

export function writeGuestGroupBlueprintVariants(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  if (enabled) {
    localStorage.setItem(GUEST_GROUP_BLUEPRINT_VARIANTS_KEY, '1')
  } else {
    localStorage.removeItem(GUEST_GROUP_BLUEPRINT_VARIANTS_KEY)
  }
}
