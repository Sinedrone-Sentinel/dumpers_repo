import { supabase } from './supabase'
import { formatDfpAuec } from './dfp'
import { listingTypeLabel } from './listingType'

export type MarketplaceAdAction = 'not_interested' | 'dont_show_again' | 'ooh_gimme'

export interface MarketplaceAdCandidate {
  order_id: string
  requester_id: string
  listing_type: 'wts' | 'wtb'
  title: string
  total_dfp_auec: number
  requester_rsi_handle: string | null
  first_line_label: string | null
  extra_line_count: number
  listing_activity_at: string
}

export interface MarketplacePurchaseFeedRow {
  id: string
  listing_type: 'wts' | 'wtb'
  buyer_rsi_handle: string
  seller_rsi_handle: string
  has_crafted_lines: boolean
  has_delivered_lines: boolean
  order_id: string | null
  created_at: string
}

export function buildPurchaseToastMessage(row: MarketplacePurchaseFeedRow): string {
  const { buyer_rsi_handle: buyer, seller_rsi_handle: seller } = row
  const crafted = row.has_crafted_lines
  const delivered = row.has_delivered_lines

  if (row.listing_type === 'wts') {
    if (crafted && delivered) return `${buyer} bought a lot of crap from ${seller}`
    if (crafted) return `${buyer} bought some custom crap from ${seller}`
    return `${buyer} bought some crap from ${seller}`
  }

  if (crafted && delivered) return `${seller} crafted and delivered some crap to ${buyer}`
  if (crafted) return `${seller} crafted some crap to ${buyer}`
  return `${seller} delivered some crap to ${buyer}`
}

export function buildAdSummaryLine(candidate: MarketplaceAdCandidate): string {
  const parts: string[] = []
  if (candidate.first_line_label) parts.push(candidate.first_line_label)
  if (candidate.extra_line_count > 0) {
    parts.push(
      `Plus ${candidate.extra_line_count} other item${candidate.extra_line_count === 1 ? '' : 's'}`
    )
  }
  return parts.join(' · ')
}

export function formatAdPrice(totalDfp: number): string {
  return formatDfpAuec(totalDfp)
}

export function adListingBadge(type: 'wts' | 'wtb'): string {
  return listingTypeLabel(type)
}

export async function fetchMarketplaceAdCandidates(limit = 50): Promise<{
  data: MarketplaceAdCandidate[]
  error?: string
}> {
  const { data, error } = await supabase.rpc('get_marketplace_ad_candidates', { p_limit: limit })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as MarketplaceAdCandidate[] }
}

export async function isMarketplaceAdValid(orderId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_marketplace_ad_valid', { p_order_id: orderId })
  if (error) return false
  return Boolean(data)
}

export async function recordMarketplaceAdAction(
  orderId: string,
  action: MarketplaceAdAction
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('record_marketplace_ad_action', {
    p_order_id: orderId,
    p_action: action,
  })
  if (error) return { error: error.message }
  return {}
}

export function fulfillmentHighlightPath(orderId: string): string {
  return `/fulfillment?highlight=${encodeURIComponent(orderId)}`
}
