import type { UserNotification } from './operations'
import type { OrderListTab } from './orderArchive'

export interface NotificationActionLink {
  to: string
  label: string
  search?: Record<string, string | undefined>
  /** Apply Blueprints search via one-shot focus (not a sticky ?q= URL). */
  blueprintFocus?: string
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

function blueprintSearchFromPayload(payload: Record<string, unknown>): string | undefined {
  for (const key of ['blueprintName', 'displayName'] as const) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function blueprintHomeLink(
  label: string,
  payload: Record<string, unknown>
): NotificationActionLink {
  const focus = blueprintSearchFromPayload(payload)
  return focus ? { to: '/', label, blueprintFocus: focus } : { to: '/', label }
}

/** Blueprints live at `/`; rewrite legacy `/blueprints` deep links. */
function normalizeAppPath(to: string, payload: Record<string, unknown>): NotificationActionLink {
  if (to === '/blueprints' || to.startsWith('/blueprints?')) {
    return blueprintHomeLink('Open', payload)
  }
  if (to === '/' || to.startsWith('/?')) {
    const focus = blueprintSearchFromPayload(payload)
    if (focus) return { to: '/', label: 'Open', blueprintFocus: focus }
  }
  return { to, label: 'Open' }
}

function explicitLink(payload: Record<string, unknown>): NotificationActionLink | null {
  const raw = payload.link_to
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null

  const label = typeof payload.link_label === 'string' ? payload.link_label : 'Open'
  const normalized = normalizeAppPath(raw, payload)
  return { ...normalized, label }
}

function blueprintDumperLink(
  notification: UserNotification
): NotificationActionLink | null {
  const { type, payload } = notification
  if (type === 'log_watcher_blueprint_acquired') {
    return blueprintHomeLink('View Blueprints', payload)
  }
  if (type === 'log_watcher_ambiguous_blueprint') {
    return blueprintHomeLink('Mark on Blueprints', payload)
  }
  return null
}

export function getNotificationActionLink(
  notification: UserNotification
): NotificationActionLink | null {
  const { type, title, payload } = notification

  const explicit = explicitLink(payload)
  if (explicit) return explicit

  const dumperLink = blueprintDumperLink(notification)
  if (dumperLink) return dumperLink

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
