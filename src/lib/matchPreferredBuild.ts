import {
  areLaserSlotsEqual,
  cloneLaserSlots,
  type MiningLaserSlotConfig,
} from './miningLoadoutStorage'
import {
  getPreferredBuildById,
  listPreferredBuildsForVessel,
  type MiningPreferredBuild,
} from './miningPreferredBuilds'
import type { MiningVesselId } from './miningVessels'

export interface PreferredBuildMatch {
  build: MiningPreferredBuild
  exact: boolean
}

/** Match saved or draft laser slots against the premade catalog. */
export function matchPreferredBuild(
  vesselId: MiningVesselId,
  lasers: MiningLaserSlotConfig[]
): PreferredBuildMatch | null {
  const candidates = listPreferredBuildsForVessel(vesselId)
  for (const build of candidates) {
    if (areLaserSlotsEqual(lasers, build.lasers)) {
      return { build, exact: true }
    }
  }
  return null
}

export function applyPreferredBuildToDraft(
  buildId: string
): MiningLaserSlotConfig[] | null {
  const build = getPreferredBuildById(buildId)
  if (!build) return null
  return cloneLaserSlots(build.lasers)
}
