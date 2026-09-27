import { isWholeUnitResource, resourceQuantityUnitLabel } from '../config/resourceTypes'
import {
  formatQuantityForResource,
  fromMilliScu,
  normalizeResourceQuantity,
  toMilliScu,
} from './resourceQuantity'

const SCU_SCALE = 1000

/**
 * Lowest max a WTB may use for this minimum.
 * A whole number of SCU can be bought as full boxes, so the floor is that amount.
 * Any leftover fraction only fits in a 1 SCU box, so the floor is the next whole SCU.
 */
export function wtbScuMaxFloor(minScu: number): number {
  const milli = toMilliScu(minScu)
  if (milli <= 0) return 0
  if (milli % SCU_SCALE === 0) return fromMilliScu(milli)
  return fromMilliScu(Math.ceil(milli / SCU_SCALE) * SCU_SCALE)
}

/** Keep a buyer-chosen max at or above the floor, on the 3-decimal SCU grid. */
export function normalizeWtbScuMax(minScu: number, maxScu: number | null | undefined): number {
  const floor = wtbScuMaxFloor(minScu)
  if (maxScu == null || !Number.isFinite(maxScu)) return floor
  const snapped = normalizeResourceQuantity(maxScu)
  return snapped < floor ? floor : snapped
}

/** Listing label. A WTB range is shown when the buyer will take more than the minimum. */
export function formatListingQuantity(
  resourceKey: string,
  minScu: number,
  maxScu: number | null | undefined,
  listingType: string | null | undefined,
): string {
  const unit = resourceQuantityUnitLabel(resourceKey)
  const minLabel = formatQuantityForResource(resourceKey, minScu)
  if (listingType !== 'wtb' || isWholeUnitResource(resourceKey)) {
    return `${minLabel} ${unit}`
  }
  const hi = normalizeWtbScuMax(minScu, maxScu)
  if (toMilliScu(hi) === toMilliScu(minScu)) return `${minLabel} ${unit}`
  return `${minLabel}–${formatQuantityForResource(resourceKey, hi)} ${unit}`
}

/** Offer the fulfiller typed, forced into [min, max]. */
export function clampWtbScuOffer(offerScu: number, minScu: number, maxScu: number): number {
  const offer = normalizeResourceQuantity(offerScu)
  const min = normalizeResourceQuantity(minScu)
  const max = normalizeWtbScuMax(min, maxScu)
  if (offer < min) return min
  if (offer > max) return max
  return offer
}
