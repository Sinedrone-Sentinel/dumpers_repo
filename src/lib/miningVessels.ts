import type { MiningLaser } from '../data'
import { gameMining } from '../data'
import miningVesselCatalog from '../data/game-mining-vessels.json'

export type MiningVesselId = string

export interface MiningVessel {
  id: MiningVesselId
  displayName: string
  /** Number of mining laser hardpoints */
  laserSlotCount: number
  /** Size class for each laser slot (S0–S2) */
  laserSize: number
  /** Stock laser `name` from game-mining.json installed on each slot in the default loadout */
  defaultLaserName: string
  /**
   * This hull has heads built for it. The picker lists only those heads.
   * Shared heads, and other ships' bespoke heads, stay off the list.
   */
  isBespoke?: boolean
  isGroundVehicle?: boolean
}

interface BespokeLaser {
  name: string
  vesselId: string
  displayName: string
}

const BESPOKE_LASERS = miningVesselCatalog.bespokeLasers as BespokeLaser[]
const bespokeByName = new Map(BESPOKE_LASERS.map((row) => [row.name, row]))
const bespokeNames = new Set(BESPOKE_LASERS.map((row) => row.name))

export const MINING_VESSELS: MiningVessel[] = miningVesselCatalog.vessels as MiningVessel[]

export function getMiningVessel(id: MiningVesselId): MiningVessel | undefined {
  return MINING_VESSELS.find((v) => v.id === id)
}

export function isBespokeVessel(vesselId: MiningVesselId): boolean {
  return getMiningVessel(vesselId)?.isBespoke === true
}

function withBespokeName(laser: MiningLaser): MiningLaser {
  const bespoke = bespokeByName.get(laser.name)
  if (!bespoke || bespoke.displayName === laser.displayName) return laser
  return { ...laser, displayName: bespoke.displayName }
}

/** Lasers valid for a vessel. Bespoke ships accept only heads built for that hull. */
export function listMiningLasersForVessel(vessel: MiningVessel): MiningLaser[] {
  if (vessel.isBespoke) {
    return BESPOKE_LASERS.filter((row) => row.vesselId === vessel.id)
      .map((row) => {
        const laser = getMiningLaserByName(row.name)
        return laser ? withBespokeName(laser) : undefined
      })
      .filter((laser): laser is MiningLaser => laser != null)
  }
  return listMiningLasersForSize(vessel.laserSize).filter((laser) => !bespokeNames.has(laser.name))
}

/**
 * Dev/test and non-hardpoint laser defs that must never appear in pickers.
 * `Mining_Laser_TEST` / `_TEST_Best` share the "Impact II Mining Laser" display
 * name with the real THCN head but carry test stats (2,000 MW, 0.1% min throttle)
 * — if they leak through, the duplicate-name dedupe drops the REAL Impact II.
 * `Mining_Laser_MPUV_Arm` is the Argo utility arm, not an equippable head.
 */
const EXCLUDED_LASER_NAME = /_test(_|$)|template|_mpuv_/i

export function isProductionMiningLaser(laser: MiningLaser): boolean {
  return !EXCLUDED_LASER_NAME.test(laser.name)
}

/** Production mining lasers for a size class (excludes test / duplicate defs and bespoke heads). */
export function listMiningLasersForSize(size: number): MiningLaser[] {
  const seen = new Set<string>()
  return gameMining.miningLasers
    .filter((laser) => {
      if (laser.size !== size) return false
      if (!isProductionMiningLaser(laser)) return false
      if (bespokeNames.has(laser.name)) return false
      const key = withBespokeName(laser).displayName.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(withBespokeName)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function getMiningLaserByName(name: string): MiningLaser | undefined {
  const laser = gameMining.miningLasers.find((row) => row.name === name)
  return laser ? withBespokeName(laser) : undefined
}

const lasersByBlueprintKey = new Map<string, MiningLaser>()
const lasersByDisplayName = new Map<string, MiningLaser>()
for (const laser of gameMining.miningLasers) {
  const shown = withBespokeName(laser)
  const key = laser.name.replace(/^Mining_Laser_/i, 'mining_laser_').toLowerCase()
  if (!lasersByBlueprintKey.has(key)) lasersByBlueprintKey.set(key, shown)
  if (!lasersByDisplayName.has(shown.displayName)) lasersByDisplayName.set(shown.displayName, shown)
}

/** Craft blueprint → parsed mining head, by internal name or display name. */
export function getMiningLaserForBlueprint(blueprint: {
  blueprintName?: string
  internalName?: string
}): MiningLaser | undefined {
  const key = blueprint.internalName?.toLowerCase()
  if (key && lasersByBlueprintKey.has(key)) return lasersByBlueprintKey.get(key)
  if (blueprint.blueprintName) return lasersByDisplayName.get(blueprint.blueprintName)
  return undefined
}

export function vesselDefaultLoadoutLabel(vesselId: MiningVesselId): string {
  const vessel = getMiningVessel(vesselId)
  return vessel ? `${vessel.displayName} Default` : 'Default'
}

export function vesselCustomLoadoutLabel(vesselId: MiningVesselId, slotIndex: 1 | 2 | 3): string {
  const vessel = getMiningVessel(vesselId)
  return vessel ? `${vessel.displayName} ${slotIndex}` : `Loadout ${slotIndex}`
}
