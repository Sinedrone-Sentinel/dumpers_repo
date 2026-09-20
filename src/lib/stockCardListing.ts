export type StockCardListingType = 'wtb' | 'wts'

export type StockCardListingLine = {
  id: string
  resource_key: string
  min_quality: number
  unit_dfp_auec?: number
}

export type StockCardListingOrder = {
  requester_id: string
  listing_type?: StockCardListingType
  status: string
  source_listing_id?: string | null
  resource_lines?: StockCardListingLine[] | null
}

function isOpenRootListing(order: StockCardListingOrder): boolean {
  return order.status === 'pending' && !order.source_listing_id
}

function listingTypeOf(order: StockCardListingOrder): StockCardListingType {
  return order.listing_type === 'wts' ? 'wts' : 'wtb'
}

/** Open WTS or WTB listing owned by this member (one per type). */
export function findOpenListingForType(
  orders: StockCardListingOrder[],
  listingType: StockCardListingType,
  userId: string,
): StockCardListingOrder | null {
  return (
    orders.find(
      (order) =>
        order.requester_id === userId &&
        isOpenRootListing(order) &&
        listingTypeOf(order) === listingType,
    ) ?? null
  )
}

/**
 * Match a commodity line by resource + quality.
 * If several lines exist (rare DFP split), prefer the current unit DFP, else the first match.
 */
export function findMatchingResourceLine(
  lines: StockCardListingLine[] | null | undefined,
  resourceKey: string,
  minQuality: number,
  preferredUnitDfp?: number,
): StockCardListingLine | null {
  const matches = (lines ?? []).filter(
    (line) => line.resource_key === resourceKey && Number(line.min_quality) === Number(minQuality),
  )
  if (matches.length === 0) return null
  if (preferredUnitDfp != null) {
    const preferred = Math.round(preferredUnitDfp)
    const dfpHit = matches.find((line) => Math.round(Number(line.unit_dfp_auec ?? 0)) === preferred)
    if (dfpHit) return dfpHit
  }
  return matches[0]
}

export function stockCardListingAction(hasMatchingLine: boolean): 'set' | 'append' {
  return hasMatchingLine ? 'set' : 'append'
}
