import type { CustomOrder } from './operations'

/** Accepted/in-progress orders that should return to the pool instead of being cancelled. */
export function shouldReleaseOrderToPool(
  order: CustomOrder,
  userId: string | undefined
): boolean {
  if (!userId) return false
  if (!['accepted', 'in_progress'].includes(order.status)) return false

  if (order.listing_type === 'wts') {
    return order.requester_id === userId || order.assignee_id === userId
  }

  return order.assignee_id === userId
}

export function releaseOrderButtonLabel(
  order: CustomOrder,
  userId: string | undefined
): string {
  if (!userId || !shouldReleaseOrderToPool(order, userId)) return 'Cancel'

  if (order.source_listing_id) {
    return order.assignee_id === userId ? 'Cancel purchase' : 'Cancel sale'
  }

  if (order.listing_type === 'wts' && order.assignee_id === userId) {
    return 'Release listing'
  }
  if (order.listing_type === 'wts' && order.requester_id === userId) {
    return 'Cancel sale'
  }
  return 'Release order'
}

export function releaseOrderConfirmMessage(order: CustomOrder): string {
  if (order.source_listing_id) {
    return 'Cancel this partial purchase? Selected items will return to the seller\'s listing.'
  }
  if (order.listing_type === 'wts') {
    return 'Release this listing back to the Bazaar? Another member can buy it.'
  }
  return 'Release this order back to the Bazaar? Another member can accept it.'
}
