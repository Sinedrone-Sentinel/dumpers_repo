import type { LoadoutKey } from './miningLoadoutStorage'
import type { MiningVesselId } from './miningVessels'

const STORAGE_KEY = 'dumpers_repo_mining_tracker_ui_v1'

export interface MiningTrackerUiState {
  vesselId: MiningVesselId
  loadoutKey: LoadoutKey
  /** Mole only — true = solo (one head), false = crew turrets. Persisted for calculator + Smart Cracker. */
  moleSoloMining: boolean
  /** Crew head plan size — 2 = two-person crew (2X CHP), 3 = full crew (3X+ CHP). */
  chpCrewSize: 2 | 3
}

const DEFAULT_STATE: MiningTrackerUiState = {
  vesselId: 'prospector',
  loadoutKey: 'default',
  moleSoloMining: true,
  chpCrewSize: 3,
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
    moleSoloMining:
      typeof parsed.moleSoloMining === 'boolean' ? parsed.moleSoloMining : DEFAULT_STATE.moleSoloMining,
    chpCrewSize: parsed.chpCrewSize === 2 || parsed.chpCrewSize === 3 ? parsed.chpCrewSize : DEFAULT_STATE.chpCrewSize,
  }
}

export function writeMiningTrackerUiState(update: Partial<MiningTrackerUiState>): void {
  if (typeof localStorage === 'undefined') return

  const current = readMiningTrackerUiState()
  const next: MiningTrackerUiState = {
    vesselId: update.vesselId ?? current.vesselId,
    loadoutKey: update.loadoutKey ?? current.loadoutKey,
    moleSoloMining: update.moleSoloMining ?? current.moleSoloMining,
    chpCrewSize: update.chpCrewSize ?? current.chpCrewSize,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}
