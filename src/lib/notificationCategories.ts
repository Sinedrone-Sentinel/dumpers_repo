import type { UserNotification } from './operations'

export type NotificationCategoryId =
  | 'bp-dumper-success'
  | 'bp-dumper-failed'
  | 'wtb-orders'
  | 'wts-listings'
  | 'support'
  | 'mining'
  | 'ratings'
  | 'questionnaires'
  | 'services'
  | 'friends'
  | 'other'

export interface NotificationCategoryDefinition {
  id: NotificationCategoryId
  label: string
}

export const NOTIFICATION_CATEGORIES: NotificationCategoryDefinition[] = [
  { id: 'bp-dumper-success', label: 'BP Dumper — Success' },
  { id: 'bp-dumper-failed', label: 'BP Dumper — Failed' },
  { id: 'wtb-orders', label: 'WTB & Craft Orders' },
  { id: 'wts-listings', label: 'WTS Listings' },
  { id: 'support', label: 'Support' },
  { id: 'mining', label: 'Mining Ledgers' },
  { id: 'ratings', label: 'Ratings' },
  { id: 'questionnaires', label: 'Questionnaires' },
  { id: 'services', label: 'Partner Services' },
  { id: 'friends', label: 'Friends' },
  { id: 'other', label: 'Other' },
]

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

const WTS_ORDER_TITLES = new Set(['Listing accepted', 'Partial sale', 'Purchase started'])

function listingTypeFromPayload(payload: Record<string, unknown>): 'wts' | 'wtb' | null {
  const value = payload.listing_type
  if (value === 'wts') return 'wts'
  if (value === 'wtb') return 'wtb'
  return null
}

function isWtsOrderNotification(notification: UserNotification): boolean {
  const { payload, title } = notification
  if (listingTypeFromPayload(payload) === 'wts') return true
  if (payload.source_listing_id != null) return true
  return WTS_ORDER_TITLES.has(title)
}

export function getNotificationCategoryId(notification: UserNotification): NotificationCategoryId {
  const { type } = notification

  if (type === 'log_watcher_blueprint_acquired') return 'bp-dumper-success'
  if (type === 'log_watcher_ambiguous_blueprint') return 'bp-dumper-failed'
  if (type.startsWith('support_ticket')) return 'support'
  if (type.startsWith('mining_ledger')) return 'mining'
  if (type.startsWith('rating_')) return 'ratings'
  if (type === 'questionnaire_available') return 'questionnaires'
  if (type === 'service_request_accepted' || type.startsWith('service_request_')) return 'services'
  if (type === 'friend_request' || type === 'friend_accepted' || type === 'friend_declined') {
    return 'friends'
  }

  if (ORDER_TYPES.has(type)) {
    return isWtsOrderNotification(notification) ? 'wts-listings' : 'wtb-orders'
  }

  return 'other'
}

export function groupNotificationsByCategory(
  notifications: UserNotification[]
): Record<NotificationCategoryId, UserNotification[]> {
  const groups = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => [category.id, [] as UserNotification[]])
  ) as Record<NotificationCategoryId, UserNotification[]>

  for (const notification of notifications) {
    groups[getNotificationCategoryId(notification)].push(notification)
  }

  return groups
}

const CATEGORY_ID_SET = new Set<string>(NOTIFICATION_CATEGORIES.map((category) => category.id))

export function isNotificationCategoryId(value: string): value is NotificationCategoryId {
  return CATEGORY_ID_SET.has(value)
}

export const NOTIFICATION_INBOX_COLLAPSED_KEY = 'notification-inbox-collapsed'

export function loadNotificationInboxCollapsed(): Set<NotificationCategoryId> | null {
  if (typeof localStorage === 'undefined') return null

  try {
    const raw = localStorage.getItem(NOTIFICATION_INBOX_COLLAPSED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return new Set(parsed.filter((value): value is NotificationCategoryId => isNotificationCategoryId(String(value))))
  } catch {
    return null
  }
}

export function saveNotificationInboxCollapsed(collapsed: Set<NotificationCategoryId>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(NOTIFICATION_INBOX_COLLAPSED_KEY, JSON.stringify([...collapsed]))
}

export function defaultCollapsedCategories(
  grouped: Record<NotificationCategoryId, UserNotification[]>
): Set<NotificationCategoryId> {
  return new Set(
    NOTIFICATION_CATEGORIES.filter((category) => grouped[category.id].length === 0).map(
      (category) => category.id
    )
  )
}
