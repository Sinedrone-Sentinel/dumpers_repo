import type { MiningVesselId } from './miningVessels'
import {
  buildDefaultLaserSlots,
  type MiningLaserSlotConfig,
} from './miningLaserStats'
import { normalizeModuleSelection } from './miningModules'
import { getMiningVessel, vesselCustomLoadoutLabel, vesselDefaultLoadoutLabel } from './miningVessels'

export const MINING_LOADOUT_STORAGE_VERSION = 1

export type CustomLoadoutSlotIndex = 1 | 2 | 3

export type LoadoutKey = 'default' | `custom-${CustomLoadoutSlotIndex}`

export interface MiningLoadout {
  key: LoadoutKey
  label: string
  lasers: MiningLaserSlotConfig[]
}

export interface MiningLoadoutStore {
  version: number
  vessels: Partial<Record<MiningVesselId, VesselLoadoutState>>
}

export interface VesselLoadoutState {
  /** Which custom slots the user has created (1–3) */
  customSlots: CustomLoadoutSlotIndex[]
  /** Saved laser configs per loadout key */
  loadouts: Partial<Record<LoadoutKey, MiningLaserSlotConfig[]>>
}

export function emptyMiningLoadoutStore(): MiningLoadoutStore {
  return { version: MINING_LOADOUT_STORAGE_VERSION, vessels: {} }
}

export function parseMiningLoadoutStore(raw: unknown): MiningLoadoutStore {
  if (!raw || typeof raw !== 'object') {
    return emptyMiningLoadoutStore()
  }

  const parsed = raw as Partial<MiningLoadoutStore>
  const vessels: Partial<Record<MiningVesselId, VesselLoadoutState>> = {}

  if (parsed.vessels && typeof parsed.vessels === 'object') {
    for (const id of ['prospector', 'mole', 'golem', 'roc', 'roc-ds'] as MiningVesselId[]) {
      if (parsed.vessels[id]) {
        vessels[id] = normalizeVesselState(id, parsed.vessels[id])
      }
    }
  }

  return {
    version: MINING_LOADOUT_STORAGE_VERSION,
    vessels,
  }
}

function defaultVesselState(vesselId: MiningVesselId): VesselLoadoutState {
  const vessel = getMiningVessel(vesselId)
  if (!vessel) return { customSlots: [], loadouts: {} }

  const defaultLasers = buildDefaultLaserSlots(vessel.defaultLaserName, vessel.laserSlotCount)
  return {
    customSlots: [],
    loadouts: { default: defaultLasers },
  }
}

function normalizeLaserSlot(raw: unknown): MiningLaserSlotConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const slot = raw as Partial<MiningLaserSlotConfig>
  if (typeof slot.laserName !== 'string' || !slot.laserName) return null
  const mode = slot.mode === 'custom' ? 'custom' : 'stock'
  const qualities =
    slot.slotQualities && typeof slot.slotQualities === 'object'
      ? Object.fromEntries(
          Object.entries(slot.slotQualities).filter(
            ([k, v]) => /^\d+$/.test(k) && typeof v === 'number' && Number.isFinite(v)
          )
        )
      : undefined
  const modules = Array.isArray(slot.modules)
    ? normalizeModuleSelection(slot.laserName, slot.modules)
    : undefined
  return {
    laserName: slot.laserName,
    mode,
    slotQualities: qualities,
    customLabel: typeof slot.customLabel === 'string' ? slot.customLabel : undefined,
    modules,
  }
}

function normalizeVesselState(
  vesselId: MiningVesselId,
  raw: unknown
): VesselLoadoutState {
  const fallback = defaultVesselState(vesselId)
  if (!raw || typeof raw !== 'object') return fallback

  const parsed = raw as Partial<VesselLoadoutState>
  const customSlots = Array.isArray(parsed.customSlots)
    ? parsed.customSlots.filter((n): n is CustomLoadoutSlotIndex => n === 1 || n === 2 || n === 3)
    : []

  const loadouts: Partial<Record<LoadoutKey, MiningLaserSlotConfig[]>> = {}
  if (parsed.loadouts && typeof parsed.loadouts === 'object') {
    for (const [key, lasers] of Object.entries(parsed.loadouts)) {
      if (key !== 'default' && !/^custom-[123]$/.test(key)) continue
      if (!Array.isArray(lasers)) continue
      const normalized = lasers
        .map(normalizeLaserSlot)
        .filter((s): s is MiningLaserSlotConfig => s !== null)
      if (normalized.length) loadouts[key as LoadoutKey] = normalized
    }
  }

  if (!loadouts.default) {
    loadouts.default = fallback.loadouts.default
  }

  return { customSlots, loadouts }
}

export function getVesselLoadoutState(
  store: MiningLoadoutStore,
  vesselId: MiningVesselId
): VesselLoadoutState {
  return store.vessels[vesselId] ?? defaultVesselState(vesselId)
}

export function listLoadoutsForVessel(
  store: MiningLoadoutStore,
  vesselId: MiningVesselId
): MiningLoadout[] {
  const vessel = getMiningVessel(vesselId)
  const state = getVesselLoadoutState(store, vesselId)
  if (!vessel) return []

  const result: MiningLoadout[] = [
    {
      key: 'default',
      label: vesselDefaultLoadoutLabel(vesselId),
      lasers: state.loadouts.default ?? buildDefaultLaserSlots(vessel.defaultLaserName, vessel.laserSlotCount),
    },
  ]

  for (const slot of [...state.customSlots].sort((a, b) => a - b)) {
    const key: LoadoutKey = `custom-${slot}`
    const lasers =
      state.loadouts[key] ??
      state.loadouts.default ??
      buildDefaultLaserSlots(vessel.defaultLaserName, vessel.laserSlotCount)
    result.push({
      key,
      label: vesselCustomLoadoutLabel(vesselId, slot),
      lasers: lasers.map((l) => ({ ...l })),
    })
  }

  return result
}

/** New custom slots clone the factory Default loadout (stock head + modules). */
export function cloneDefaultLasersForCustomLoadout(
  _vesselId: MiningVesselId,
  defaultLasers: MiningLaserSlotConfig[]
): MiningLaserSlotConfig[] {
  return defaultLasers.map((l) => ({
    ...l,
    slotQualities: l.slotQualities ? { ...l.slotQualities } : undefined,
    modules: l.modules ? [...l.modules] : undefined,
  }))
}

export function createCustomLoadoutSlot(
  store: MiningLoadoutStore,
  vesselId: MiningVesselId
): { store: MiningLoadoutStore; created: CustomLoadoutSlotIndex | null } {
  const state = getVesselLoadoutState(store, vesselId)
  const next = ([1, 2, 3] as CustomLoadoutSlotIndex[]).find((n) => !state.customSlots.includes(n))
  if (!next) return { store, created: null }

  const vessel = getMiningVessel(vesselId)
  const baseLasers =
    state.loadouts.default ??
    (vessel
      ? buildDefaultLaserSlots(vessel.defaultLaserName, vessel.laserSlotCount)
      : [])

  const key: LoadoutKey = `custom-${next}`
  const updatedState: VesselLoadoutState = {
    customSlots: [...state.customSlots, next].sort((a, b) => a - b),
    loadouts: {
      ...state.loadouts,
      [key]: cloneDefaultLasersForCustomLoadout(vesselId, baseLasers),
    },
  }

  return {
    store: {
      ...store,
      vessels: { ...store.vessels, [vesselId]: updatedState },
    },
    created: next,
  }
}

export function deleteCustomLoadoutSlot(
  store: MiningLoadoutStore,
  vesselId: MiningVesselId,
  slot: CustomLoadoutSlotIndex
): MiningLoadoutStore {
  const state = getVesselLoadoutState(store, vesselId)
  const key: LoadoutKey = `custom-${slot}`
  const { [key]: _removed, ...restLoadouts } = state.loadouts
  const fallback = defaultVesselState(vesselId)

  return {
    ...store,
    vessels: {
      ...store.vessels,
      [vesselId]: {
        customSlots: state.customSlots.filter((n) => n !== slot),
        loadouts: {
          ...restLoadouts,
          default: restLoadouts.default ?? fallback.loadouts.default,
        },
      },
    },
  }
}

export function updateLoadoutLasers(
  store: MiningLoadoutStore,
  vesselId: MiningVesselId,
  loadoutKey: LoadoutKey,
  lasers: MiningLaserSlotConfig[]
): MiningLoadoutStore {
  if (loadoutKey === 'default') return store

  const vessel = getMiningVessel(vesselId)
  const normalizedLasers =
    vessel?.isBespoke
      ? lasers.map((slot) => ({
          ...slot,
          laserName: vessel.defaultLaserName,
        }))
      : lasers

  const state = getVesselLoadoutState(store, vesselId)
  return {
    ...store,
    vessels: {
      ...store.vessels,
      [vesselId]: {
        ...state,
        loadouts: { ...state.loadouts, [loadoutKey]: normalizedLasers },
      },
    },
  }
}

export function canCreateMoreLoadouts(store: MiningLoadoutStore, vesselId: MiningVesselId): boolean {
  return getVesselLoadoutState(store, vesselId).customSlots.length < 3
}

export function isCustomLoadoutKey(key: LoadoutKey): key is `custom-${CustomLoadoutSlotIndex}` {
  return key !== 'default'
}

/** Default loadouts are always kept — only custom slots (1–3) may be removed. */
export function canDeleteLoadout(loadoutKey: LoadoutKey): boolean {
  return loadoutKey !== 'default'
}
