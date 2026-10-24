import React from 'react'
import { listingTypeLabel, orderListingType, type ListingType } from '../lib/listingType'
import type { CustomOrder } from '../lib/operations'
import SiteTooltip from './SiteTooltip'

const STYLES: Record<ListingType, string> = {
  wtb: 'bg-amber-950/60 text-amber-200 border-amber-500/40',
  wts: 'bg-cyan-950/60 text-cyan-200 border-cyan-500/40',
}

export default function ListingTypeBadge({
  order,
  listingType,
  className = '',
}: {
  order?: CustomOrder
  listingType?: ListingType
  className?: string
}) {
  const type = listingType ?? (order ? orderListingType(order) : 'wtb')
  return (
    <SiteTooltip content={type === 'wts' ? 'Want to Sell' : 'Want to Buy'}><span
      className={`inline-flex shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${STYLES[type]} ${className}`}
    >
      {listingTypeLabel(type)}
    </span></SiteTooltip>
  )
}
