import type { MiningLaser } from '../data'
import { gameMining } from '../data'

export type MiningVesselId = 'prospector' | 'mole' | 'golem' | 'roc' | 'roc-ds'

export interface MiningVessel {
  id: MiningVesselId
  displayName: string
  /** Number of mining laser hardpoints */
  laserSlotCount: number
  /** Size class for each laser slot (S0–S2) */
  laserSize: number
  /** Stock laser `name` from game-mining.json installed on each slot in the default loadout */
  defaultLaserName: string
  /** Single fixed mining head (Golem Pitman); no swapping to other size-class heads */
  isBespoke?: boolean
  isGroundVehicle?: boolean
}

export const MINING_VESSELS: MiningVessel[] = [
  {
    id: 'prospector',
    displayName: 'Prospector',
    laserSlotCount: 1,
    laserSize: 1,
    defaultLaserName: 'Mining_Laser_GRIN_Arbor_S1',
  },
  {
    id: 'mole',
    displayName: 'Mole',
    laserSlotCount: 3,
    laserSize: 2,
    defaultLaserName: 'Mining_Laser_GRIN_Arbor_S2',
  },
  {
    id: 'golem',
    displayName: 'Golem',
    laserSlotCount: 1,
    laserSize: 1,
    defaultLaserName: 'Mining_Laser_DRAK_Golem_S1',
    isBespoke: true,
  },
  {
    id: 'roc',
    displayName: 'ROC',
    laserSlotCount: 1,
    laserSize: 0,
    defaultLaserName: 'Mining_Laser_GRIN_Arbor_S0',
    isGroundVehicle: true,
  },
  {
    id: 'roc-ds',
    displayName: 'ROC-DS',
    laserSlotCount: 1,
    laserSize: 0,
    defaultLaserName: 'Mining_Laser_SHIN_Hofstede_S0',
    isGroundVehicle: true,
  },
]

export function getMiningVessel(id: MiningVesselId): MiningVessel | undefined {
  return MINING_VESSELS.find((v) => v.id === id)
}

export function isBespokeVessel(vesselId: MiningVesselId): boolean {
  return getMiningVessel(vesselId)?.isBespoke === true
}

/** Lasers valid for a vessel. Bespoke ships accept only their dedicated head. */
export function listMiningLasersForVessel(vessel: MiningVessel): MiningLaser[] {
  if (vessel.isBespoke) {
    const laser = getMiningLaserByName(vessel.defaultLaserName)
    return laser ? [laser] : []
  }
  return listMiningLasersForSize(vessel.laserSize)
}

/** Production mining lasers for a size class (excludes test / duplicate defs). */
export function listMiningLasersForSize(size: number): MiningLaser[] {
  const seen = new Set<string>()
  return gameMining.miningLasers
    .filter((laser) => {
      if (laser.size !== size) return false
      if (/_Test_|Template/i.test(laser.name)) return false
      const key = laser.displayName.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function getMiningLaserByName(name: string): MiningLaser | undefined {
  return gameMining.miningLasers.find((laser) => laser.name === name)
}

export function vesselDefaultLoadoutLabel(vesselId: MiningVesselId): string {
  const vessel = getMiningVessel(vesselId)
  return vessel ? `${vessel.displayName} Default` : 'Default'
}

export function vesselCustomLoadoutLabel(vesselId: MiningVesselId, slotIndex: 1 | 2 | 3): string {
  const vessel = getMiningVessel(vesselId)
  return vessel ? `${vessel.displayName} ${slotIndex}` : `Loadout ${slotIndex}`
}
