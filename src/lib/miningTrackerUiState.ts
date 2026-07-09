import type { LoadoutKey } from './miningLoadoutStorage'
import type { MiningVesselId } from './miningVessels'

const STORAGE_KEY = 'dumpers_repo_mining_tracker_ui_v1'

export interface MiningTrackerUiState {
  vesselId: MiningVesselId
  loadoutKey: LoadoutKey
}

const DEFAULT_STATE: MiningTrackerUiState = {
  vesselId: 'prospector',
  loadoutKey: 'default',
}

const VESSEL_IDS: MiningVesselId[] = ['prospector', 'mole', 'golem', 'roc', 'roc-ds']

function isLoadoutKey(value: unknown): value is LoadoutKey {
  return value === 'default' || value === 'custom-1' || value === 'custom-2' || value === 'custom-3'
}

function isVesselId(value: unknown): value is MiningVesselId {
  return typeof value === 'string' && VESSEL_IDS.includes(value as MiningVesselId)
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readMiningTrackerUiState(): MiningTrackerUiState {
  if (typeof localStorage === 'undefined') return DEFAULT_STATE

  const parsed = safeParse<Partial<MiningTrackerUiState>>(
    localStorage.getItem(STORAGE_KEY),
    DEFAULT_STATE
  )

  return {
    vesselId: isVesselId(parsed.vesselId) ? parsed.vesselId : DEFAULT_STATE.vesselId,
    loadoutKey: isLoadoutKey(parsed.loadoutKey) ? parsed.loadoutKey : DEFAULT_STATE.loadoutKey,
  }
}

export function writeMiningTrackerUiState(update: Partial<MiningTrackerUiState>): void {
  if (typeof localStorage === 'undefined') return

  const current = readMiningTrackerUiState()
  const next: MiningTrackerUiState = {
    vesselId: update.vesselId ?? current.vesselId,
    loadoutKey: update.loadoutKey ?? current.loadoutKey,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}
