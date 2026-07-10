import catalogData from '../data/mining-preferred-builds.json'
import type { MiningLaserSlotConfig } from './miningLaserStats'
import type { MiningVesselId } from './miningVessels'

export type PreferredBuildKind = 'general' | 'job' | 'crew'
export type PreferredBuildAudience = 'solo' | 'crew' | 'both'
export type PreferredDepositType = 'surface' | 'asteroid'

export interface MiningPreferredBuild {
  id: string
  displayName: string
  creator: string
  jobDesignation: string
  vesselId: MiningVesselId
  kind: PreferredBuildKind
  audience: PreferredBuildAudience
  description: string
  lasers: MiningLaserSlotConfig[]
  intendedDepositType?: PreferredDepositType
  intendedOres?: string[]
  variationOf?: string
  recognitionNotes?: string
}

const catalog = catalogData as { version: number; builds: MiningPreferredBuild[] }

export const MINING_PREFERRED_BUILDS: MiningPreferredBuild[] = catalog.builds

export function listPreferredBuildsForVessel(vesselId: MiningVesselId): MiningPreferredBuild[] {
  return MINING_PREFERRED_BUILDS.filter((build) => build.vesselId === vesselId)
}

export function getPreferredBuildById(id: string): MiningPreferredBuild | undefined {
  return MINING_PREFERRED_BUILDS.find((build) => build.id === id)
}

export function preferredBuildLaserSlots(build: MiningPreferredBuild): MiningLaserSlotConfig[] {
  return build.lasers.map((slot) => ({
    ...slot,
    mode: slot.mode === 'custom' ? 'custom' : 'stock',
    slotQualities: slot.slotQualities ? { ...slot.slotQualities } : undefined,
    modules: slot.modules ? [...slot.modules] : undefined,
  }))
}
