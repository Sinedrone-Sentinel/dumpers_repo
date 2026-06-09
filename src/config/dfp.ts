import { isSalvageResource, SALVAGE_ORDER_MIN_QUALITY } from './extraResources'

/** Public DFP UX constants only — formula lives in canonical dfp-engine.js */
export const DFP_VERSION = '1.1.0-type-modifiers'

/** Q0 = store-bought; Q100–Q1000 = mined/refined in 100-point steps. */
export const STOCK_QUALITY_TIERS: readonly number[] = [
  0,
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * 100),
]

export const ORDER_QUALITY_TIERS = STOCK_QUALITY_TIERS
export const DEFAULT_STOCK_QUALITY = 500
export const AMMO_ORDER_MIN_QUALITY = 0

export function stockQualityTiersForResource(
  resourceKey: string,
  _label?: string
): readonly number[] {
  if (isSalvageResource(resourceKey)) return [SALVAGE_ORDER_MIN_QUALITY]
  return STOCK_QUALITY_TIERS
}

export function orderMinQualityForResource(
  resourceKey: string,
  _label: string,
  selectedQuality: number
): number {
  if (isSalvageResource(resourceKey)) return SALVAGE_ORDER_MIN_QUALITY
  return selectedQuality
}
