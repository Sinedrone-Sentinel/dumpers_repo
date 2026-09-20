import {
  appendToMyListing,
  fetchCustomOrders,
  setListingLineStockDeduct,
  updateListingLine,
  type CreateOrderErrorType,
} from './operations'
import { pricingForResourceLine } from './orderPricing'
import { normalizeQuantityForResource } from './resourceQuantity'
import {
  findMatchingResourceLine,
  findOpenListingForType,
  type StockCardListingType,
} from './stockCardListing'

export type ApplyStockCardListingResult = {
  ok: boolean
  action?: 'set' | 'append'
  error?: string
  errorType?: CreateOrderErrorType
  deductError?: string
}

function listingErrorMessage(
  listingType: StockCardListingType,
  error?: string,
  errorType?: CreateOrderErrorType,
): string {
  if (errorType === 'unrated') {
    return 'Rate your completed trades on My Listings before posting.'
  }
  return error?.trim() || `Could not update your ${listingType.toUpperCase()} listing.`
}

async function loadMatchingLine(
  userId: string,
  listingType: StockCardListingType,
  resourceKey: string,
  minQuality: number,
  unitDfpAuec: number,
) {
  const { data, error } = await fetchCustomOrders({ requesterId: userId })
  if (error) return { error, line: null as ReturnType<typeof findMatchingResourceLine> }
  const listing = findOpenListingForType(data, listingType, userId)
  const line = findMatchingResourceLine(
    listing?.resource_lines,
    resourceKey,
    minQuality,
    unitDfpAuec,
  )
  return { error: undefined as string | undefined, line }
}

/** SET an existing resource+quality line, or append a new line (creates the open listing if needed). */
export async function applyStockCardListing(input: {
  userId: string
  listingType: StockCardListingType
  resourceKey: string
  resourceLabel: string
  minQuality: number
  quantityScu: number
}): Promise<ApplyStockCardListingResult> {
  const quantityScu = normalizeQuantityForResource(input.resourceKey, input.quantityScu)
  if (!(quantityScu > 0)) {
    return { ok: false, error: 'Enter a quantity greater than zero.' }
  }

  const pricing = pricingForResourceLine(
    input.resourceKey,
    input.resourceLabel,
    input.minQuality,
    quantityScu,
  )

  const loaded = await loadMatchingLine(
    input.userId,
    input.listingType,
    input.resourceKey,
    pricing.orderMinQuality,
    pricing.unitDfpAuec,
  )
  if (loaded.error) return { ok: false, error: loaded.error }

  let lineId = loaded.line?.id ?? null
  let action: 'set' | 'append' = loaded.line ? 'set' : 'append'

  if (loaded.line) {
    const updated = await updateListingLine(loaded.line.id, 'resource', quantityScu)
    if (updated.error) return { ok: false, error: updated.error }
  } else {
    const appended = await appendToMyListing({
      listingType: input.listingType,
      blueprints: [],
      resources: [
        {
          resourceKey: input.resourceKey,
          resourceLabel: input.resourceLabel,
          minQuality: pricing.orderMinQuality,
          quantityScu,
          unitDfpAuec: pricing.unitDfpAuec,
          lineDfpAuec: pricing.lineDfpAuec,
          baseUnitDfpAuec: pricing.unitDfpAuec,
        },
      ],
      items: [],
    })
    if (appended.error) {
      return {
        ok: false,
        error: listingErrorMessage(input.listingType, appended.error, appended.errorType),
        errorType: appended.errorType,
      }
    }
    const after = await loadMatchingLine(
      input.userId,
      input.listingType,
      input.resourceKey,
      pricing.orderMinQuality,
      pricing.unitDfpAuec,
    )
    lineId = after.line?.id ?? null
    if (after.error || !lineId) {
      return {
        ok: false,
        error: after.error || 'Listing updated, but the new line could not be found.',
      }
    }
  }

  let deductError: string | undefined
  if (input.listingType === 'wts' && lineId) {
    const deduct = await setListingLineStockDeduct(lineId, 'resource', true)
    if (deduct.error) deductError = deduct.error
  }

  return { ok: true, action, deductError }
}
