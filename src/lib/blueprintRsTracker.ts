import type { MiningData } from '../hooks/useArchiveData'
import type { BlueprintWithSlots } from './blueprintResources'
import {
  craftMaterialLabel,
  craftMaterialOptionsForSlot,
  craftMaterialResourceKey,
} from './blueprintResources'
import { findOreByName } from './miningDataHelpers'
import { getDepositTypes } from './miningClusterProfiles'
import { isRsTrackerOre, normalizeMiningOreName } from './miningOreCanonical'
import type { DepositType } from './localGuestCache'

export interface BlueprintTrackableOre {
  oreName: string
  label: string
  rarity: string
  depositType: DepositType
}

/** Prefer asteroid RS card; fall back to surface when asteroid data is absent. */
export function pickRsTrackerDepositType(depositTypes: DepositType[]): DepositType | null {
  if (depositTypes.includes('asteroid')) return 'asteroid'
  if (depositTypes.includes('surface')) return 'surface'
  return null
}

/** RS Tracker entry for one resource, or null when it is not a ship-mined RS ore. */
export function trackableOreForResource(
  label: string,
  miningCatalog: MiningData[]
): BlueprintTrackableOre | null {
  const oreName = normalizeMiningOreName(label)
  if (!isRsTrackerOre(oreName)) return null

  const depositType = pickRsTrackerDepositType(getDepositTypes(oreName))
  if (!depositType) return null

  const catalogRow = findOreByName(miningCatalog, oreName)
  return {
    oreName,
    label,
    rarity: catalogRow?.rarity ?? 'common',
    depositType,
  }
}

/** Unique RS-trackable ores referenced by a blueprint's resource slots. */
export function extractBlueprintTrackableOres(
  blueprint: BlueprintWithSlots,
  miningCatalog: MiningData[]
): BlueprintTrackableOre[] {
  const byKey = new Map<string, BlueprintTrackableOre>()

  for (const slot of blueprint.slots ?? []) {
    for (const option of craftMaterialOptionsForSlot(slot)) {
      const label = craftMaterialLabel(option)
      if (!label) continue

      const resourceKey = craftMaterialResourceKey(option)
      if (!resourceKey || byKey.has(resourceKey)) continue

      const ore = trackableOreForResource(label, miningCatalog)
      if (ore) byKey.set(resourceKey, ore)
    }
  }

  return [...byKey.values()].sort((a, b) => a.oreName.localeCompare(b.oreName))
}

export function blueprintHasRsTrackableOres(
  blueprint: BlueprintWithSlots,
  miningCatalog: MiningData[]
): boolean {
  return extractBlueprintTrackableOres(blueprint, miningCatalog).length > 0
}

export type AddBlueprintOresToRsTrackerResult = {
  added: Array<{ oreName: string; depositType: DepositType }>
  skipped: Array<{ oreName: string; depositType: DepositType }>
}
