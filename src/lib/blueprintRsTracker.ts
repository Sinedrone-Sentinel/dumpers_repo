import type { MiningData } from '../hooks/useArchiveData'
import type { BlueprintWithSlots } from './blueprintResources'
import { slugifyResourceName } from './blueprintResources'
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

/** Unique RS-trackable ores referenced by a blueprint's resource slots. */
export function extractBlueprintTrackableOres(
  blueprint: BlueprintWithSlots,
  miningCatalog: MiningData[]
): BlueprintTrackableOre[] {
  const byKey = new Map<string, BlueprintTrackableOre>()

  for (const slot of blueprint.slots ?? []) {
    for (const option of slot.options ?? []) {
      if (option.type && option.type !== 'resource') continue

      const label =
        option.resourceName || option.entityName || option.displayName || option.itemName
      if (!label) continue

      const oreName = normalizeMiningOreName(label)
      if (!isRsTrackerOre(oreName)) continue

      const resourceKey = slugifyResourceName(label)
      if (!resourceKey || byKey.has(resourceKey)) continue

      const depositType = pickRsTrackerDepositType(getDepositTypes(oreName))
      if (!depositType) continue

      const catalogRow = findOreByName(miningCatalog, oreName)
      byKey.set(resourceKey, {
        oreName,
        label,
        rarity: catalogRow?.rarity ?? 'common',
        depositType,
      })
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
