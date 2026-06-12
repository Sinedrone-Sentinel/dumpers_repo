/** Browser-local persistence for guest preview (no Supabase). */

export const GUEST_ACQUIRED_STORAGE_KEY = 'acquired_blueprints'

export const MINING_TRACKER_STORAGE_KEY = 'dumpers_mining_tracker'

export interface MiningTrackerEntry {
  id: string
  oreName: string
  rarity: string
  addedAt: number
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readGuestAcquiredBlueprints(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {}
  return safeParse<Record<string, boolean>>(
    localStorage.getItem(GUEST_ACQUIRED_STORAGE_KEY),
    {}
  )
}

export function writeGuestAcquiredBlueprints(acquired: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GUEST_ACQUIRED_STORAGE_KEY, JSON.stringify(acquired))
}

export function readMiningTrackerEntries(): MiningTrackerEntry[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<MiningTrackerEntry[]>(localStorage.getItem(MINING_TRACKER_STORAGE_KEY), [])
}

export function writeMiningTrackerEntries(entries: MiningTrackerEntry[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MINING_TRACKER_STORAGE_KEY, JSON.stringify(entries))
}

export function clearMiningTrackerEntries(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(MINING_TRACKER_STORAGE_KEY)
}

export function miningTrackerEntryId(oreName: string): string {
  return oreName
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest Target BP List (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export const GUEST_TARGET_LIST_STORAGE_KEY = 'dumpers_guest_target_list'
export const GUEST_MISSION_PREFS_STORAGE_KEY = 'dumpers_guest_mission_prefs'

export interface GuestTargetListData {
  targetIds: Record<string, boolean>
  missionPrefs: Record<string, boolean>
}

export function readGuestTargetList(): GuestTargetListData {
  if (typeof localStorage === 'undefined') {
    return { targetIds: {}, missionPrefs: {} }
  }
  const targetIds = safeParse<Record<string, boolean>>(
    localStorage.getItem(GUEST_TARGET_LIST_STORAGE_KEY),
    {}
  )
  const missionPrefs = safeParse<Record<string, boolean>>(
    localStorage.getItem(GUEST_MISSION_PREFS_STORAGE_KEY),
    {}
  )
  return { targetIds, missionPrefs }
}

export function writeGuestTargetIds(targetIds: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GUEST_TARGET_LIST_STORAGE_KEY, JSON.stringify(targetIds))
}

export function writeGuestMissionPrefs(missionPrefs: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GUEST_MISSION_PREFS_STORAGE_KEY, JSON.stringify(missionPrefs))
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest Resource Inventory (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export const GUEST_RESOURCES_STORAGE_KEY = 'dumpers_guest_resources'

export interface GuestResourceEntry {
  resource_key: string
  quantity: number
  quality: number
}

export function readGuestResources(): GuestResourceEntry[] {
  if (typeof localStorage === 'undefined') return []
  return safeParse<GuestResourceEntry[]>(
    localStorage.getItem(GUEST_RESOURCES_STORAGE_KEY),
    []
  )
}

export function writeGuestResources(entries: GuestResourceEntry[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GUEST_RESOURCES_STORAGE_KEY, JSON.stringify(entries))
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear functions for migration cleanup
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers for migration sanitization
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BLUEPRINT_ID_LENGTH = 500
const MAX_RESOURCE_KEY_LENGTH = 200
const MAX_RESOURCE_QUANTITY = 100000
const MIN_QUALITY = 500
const MAX_QUALITY = 1000
const MAX_MIGRATION_BATCH = 1000

export function sanitizeBlueprintId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  if (id.length === 0 || id.length > MAX_BLUEPRINT_ID_LENGTH) return null
  return id
}

export function sanitizeResourceEntry(entry: unknown): GuestResourceEntry | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  
  if (typeof e.resource_key !== 'string') return null
  if (e.resource_key.length === 0 || e.resource_key.length > MAX_RESOURCE_KEY_LENGTH) return null
  
  const quantity = Number(e.quantity)
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > MAX_RESOURCE_QUANTITY) return null
  
  const quality = Number(e.quality)
  if (!Number.isFinite(quality) || quality < MIN_QUALITY || quality > MAX_QUALITY) return null
  
  return {
    resource_key: e.resource_key,
    quantity: Math.floor(quantity),
    quality: Math.floor(quality),
  }
}

export function sanitizeMigrationBatch<T>(items: T[]): T[] {
  return items.slice(0, MAX_MIGRATION_BATCH)
}
