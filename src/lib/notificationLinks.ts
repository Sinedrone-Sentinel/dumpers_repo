import type { UserNotification } from './operations'
import type { OrderListTab } from './orderArchive'

export interface NotificationActionLink {
  to: string
  label: string
}

const ORDER_TYPES = new Set([
  'order_new',
  'order_accepted',
  'order_accepted_price',
  'order_in_progress',
  'order_ready',
  'order_completed',
  'order_abandoned',
  'order_timeout',
  'order_noshow',
  'order_dispute',
  'order_cancelled',
  'order_fulfilled',
])

function ordersPath(tab: OrderListTab = 'active'): string {
  return tab === 'active' ? '/orders' : `/orders?tab=${tab}`
}

function listingTypeFromPayload(payload: Record<string, unknown>): 'wts' | 'wtb' | undefined {
  const value = payload.listing_type
  return value === 'wts' || value === 'wtb' ? value : undefined
}

function explicitLink(payload: Record<string, unknown>): NotificationActionLink | null {
  const to = payload.link_to
  if (typeof to !== 'string' || !to.startsWith('/')) return null

  const label = typeof payload.link_label === 'string' ? payload.link_label : 'Open'
  return { to, label }
}

export function getNotificationActionLink(
  notification: UserNotification
): NotificationActionLink | null {
  const { type, title, payload } = notification

  const explicit = explicitLink(payload)
  if (explicit) return explicit

  if (!ORDER_TYPES.has(type)) return null

  const listingType = listingTypeFromPayload(payload)

  switch (type) {
    case 'order_new':
      return { to: '/bazaar', label: 'Browse the Bazaar' }

    case 'order_accepted':
      if (listingType === 'wts' || title === 'Partial sale' || title === 'Listing accepted') {
        return { to: '/bazaar', label: 'View sale' }
      }
      return { to: ordersPath('active'), label: 'View order' }

    case 'order_accepted_price':
      return { to: '/bazaar', label: 'Open the Bazaar' }

    case 'order_in_progress':
      return { to: ordersPath('active'), label: 'View order' }

    case 'order_ready':
      return { to: ordersPath('active'), label: 'Confirm pickup' }

    case 'order_completed':
      return { to: ordersPath('completed'), label: 'Archive & rate' }

    case 'order_abandoned':
      if (listingType === 'wts' && !payload.source_listing_id) {
        return { to: '/bazaar', label: 'View in the Bazaar' }
      }
      return { to: ordersPath('active'), label: 'View order' }

    case 'order_timeout':
    case 'order_noshow':
    case 'order_dispute':
    case 'order_cancelled':
    case 'order_fulfilled':
      return { to: ordersPath('active'), label: 'View order' }

    default:
      return null
  }
}
