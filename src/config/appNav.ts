import type { UserRole } from '../lib/supabase'

export type NavBadge = 'preview'

export interface AppNavItem {
  id: string
  label: string
  path: string
  minRole?: UserRole
  access?: 'preview'
  badge?: NavBadge
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  { id: 'blueprints', label: 'Blueprints', path: '/', minRole: 'member' },
  {
    id: 'resource-tracker',
    label: 'Resource Tracker',
    path: '/resources',
    access: 'preview',
    badge: 'preview',
  },
  {
    id: 'custom-orders',
    label: 'Custom Orders',
    path: '/orders',
    access: 'preview',
    badge: 'preview',
  },
  {
    id: 'fulfillment',
    label: 'Fulfillment',
    path: '/fulfillment',
    access: 'preview',
    badge: 'preview',
  },
]

export function canSeeNavItem(
  item: AppNavItem,
  canAccess: (minRole: UserRole) => boolean,
  canAccessPreviewFeatures: boolean
): boolean {
  if (item.access === 'preview') return canAccessPreviewFeatures
  return canAccess(item.minRole ?? 'member')
}

export function getVisibleNavItems(
  canAccess: (minRole: UserRole) => boolean,
  canAccessPreviewFeatures: boolean
): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) =>
    canSeeNavItem(item, canAccess, canAccessPreviewFeatures)
  )
}

export function getNavItemByPath(path: string): AppNavItem | undefined {
  return APP_NAV_ITEMS.find((item) => item.path === path)
}
