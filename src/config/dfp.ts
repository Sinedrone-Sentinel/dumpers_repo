import {
  isSalvageResource,
  isGasResource,
  isHalogenResource,
  isFuelResource,
  isContrabandResource,
  isTradeGoodResource,
  SALVAGE_ORDER_MIN_QUALITY,
  EXTRA_CATALOG_RESOURCE_KEYS,
} from './extraResources'
import { isHarvestResource, isWikeloItemResource } from './resourceTypes'

/** Public DFP UX constants only — formula lives in dfp-engine-private → public/dfp-engine.js */
export const DFP_VERSION = '1.7.4-wikelo-blueprint-premiums'

/** Q0 (purchased) = exactly Q500 in orders. Mined ores use game band thresholds (Band 1, 2, …). */
export const STOCK_QUALITY_TIERS: readonly number[] = [
  0,
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 100),
]

export const ORDER_QUALITY_TIERS = STOCK_QUALITY_TIERS
export const DEFAULT_STOCK_QUALITY = 500
/** Order sentinel — ammo listings do not pick a quality tier. */
export const AMMO_ORDER_MIN_QUALITY = 0
/** Material quality sent to engine for ammo crafts (Band 1 / game minQuality 1). */
export const AMMO_CRAFT_MATERIAL_QUALITY = 1

/** Trade commodities without quality tiers (always Q0). */
export function isNoQualityResource(resourceKey: string): boolean {
  return (
    isSalvageResource(resourceKey) ||
    isHarvestResource(resourceKey) ||
    isGasResource(resourceKey) ||
    isHalogenResource(resourceKey) ||
    isFuelResource(resourceKey) ||
    isContrabandResource(resourceKey) ||
    isTradeGoodResource(resourceKey) ||
    isWikeloItemResource(resourceKey) ||
    EXTRA_CATALOG_RESOURCE_KEYS.has(resourceKey)
  )
}

export function stockQualityTiersForResource(
  resourceKey: string,
  _label?: string
): readonly number[] {
  if (isNoQualityResource(resourceKey)) {
    return [SALVAGE_ORDER_MIN_QUALITY]
  }
  return STOCK_QUALITY_TIERS
}

export function orderMinQualityForResource(
  resourceKey: string,
  _label: string,
  selectedQuality: number
): number {
  if (isNoQualityResource(resourceKey)) {
    return SALVAGE_ORDER_MIN_QUALITY
  }
  return selectedQuality
}
