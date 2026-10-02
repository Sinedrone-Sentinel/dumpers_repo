import { isWholeUnitResource } from '../config/resourceTypes'
import { hasEnough, type OwnedStockIndex } from './craftFromStock'
import { fromMilliScu, toMilliScu } from './resourceQuantity'
import type { WishlistItem, WishlistQualityTotal } from './bpWishlist'

export function addWishlistAmount(resourceKey: string, current: number, extra: number): number {
  if (isWholeUnitResource(resourceKey)) return Math.trunc(current) + Math.trunc(extra)
  return fromMilliScu(toMilliScu(current) + toMilliScu(extra))
}

/** One-craft need per resource+quality on a single recipe (chips share a color). */
export function oneCraftDemand(
  item: Pick<WishlistItem, 'materials'>
): Map<string, { resourceKey: string; quality: number; amount: number }> {
  const map = new Map<string, { resourceKey: string; quality: number; amount: number }>()
  for (const material of item.materials) {
    const key = `${material.resourceKey}::${material.quality}`
    const existing = map.get(key)
    if (existing) {
      existing.amount = addWishlistAmount(material.resourceKey, existing.amount, material.scu)
    } else {
      map.set(key, { resourceKey: material.resourceKey, quality: material.quality, amount: material.scu })
    }
  }
  return map
}

export function stockAtQuality(owned: OwnedStockIndex, resourceKey: string, quality: number): number {
  return owned.get(resourceKey)?.byQuality.get(quality) ?? 0
}

export function demandCovered(
  owned: OwnedStockIndex,
  resourceKey: string,
  quality: number,
  amount: number
): boolean {
  return hasEnough(resourceKey, amount, stockAtQuality(owned, resourceKey, quality))
}

export function recipeReadyForOneCraft(item: Pick<WishlistItem, 'materials'>, owned: OwnedStockIndex): boolean {
  if (item.materials.length === 0) return true
  for (const demand of oneCraftDemand(item).values()) {
    if (!demandCovered(owned, demand.resourceKey, demand.quality, demand.amount)) return false
  }
  return true
}

/** Overview rows My Resources cannot cover for the whole list. */
export function missingOverviewRows<T extends Pick<WishlistQualityTotal, 'resourceKey' | 'quality' | 'amount'>>(
  overview: T[],
  owned: OwnedStockIndex
): T[] {
  return overview.filter((row) => !demandCovered(owned, row.resourceKey, row.quality, row.amount))
}

/** Recipe materials My Resources cannot cover for one craft. */
export function missingRecipeMaterials(
  item: Pick<WishlistItem, 'materials'>,
  owned: OwnedStockIndex
): WishlistItem['materials'] {
  const demand = oneCraftDemand(item)
  return item.materials.filter((material) => {
    const need = demand.get(`${material.resourceKey}::${material.quality}`)
    return need ? !demandCovered(owned, material.resourceKey, material.quality, need.amount) : false
  })
}
