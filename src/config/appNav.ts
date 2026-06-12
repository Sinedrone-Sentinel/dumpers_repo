import type { UserRole } from '../lib/supabase'
import {
  canUseFeature,
  passesGhostNavGate,
  type FeatureId,
  type VisibilityContext,
} from '../lib/featureAccess'

export interface AppNavItem {
  id: string
  label: string
  path: string
  icon?: string
  featureId?: FeatureId
  minRole?: UserRole
  /** Ghost Mode users only see items with ghostAllowed !== false */
  ghostAllowed?: boolean
  /** Nested child items (for expandable menus) */
  children?: AppNavItem[]
}

export interface NavGroup {
  id: string
  label: string
  items: AppNavItem[]
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    id: 'blueprints',
    label: 'Blueprints',
    path: '/',
    icon: 'blueprints',
    featureId: 'blueprints_browse',
    minRole: 'member',
    ghostAllowed: true,
  },
  {
    id: 'targets',
    label: 'Mission Tracker',
    path: '/targets',
    icon: 'target',
    featureId: 'target_bp_list',
    minRole: 'member',
    ghostAllowed: true,
  },
  {
    id: 'resource-tracker',
    label: 'Resource Tracker',
    path: '/resources',
    icon: 'resources',
    featureId: 'resource_tracker',
    minRole: 'member',
    ghostAllowed: true,
  },
  {
    id: 'mining-tracker',
    label: 'Mining Tracker',
    path: '/mining-tracker',
    icon: 'mining',
    featureId: 'mining_tracker',
    minRole: 'member',
    ghostAllowed: true,
  },
  {
    id: 'shops',
    label: 'Shops',
    path: '/shops',
    icon: 'shop',
    featureId: 'shops_browse',
    minRole: 'member',
    ghostAllowed: true,
  },
  {
    id: 'custom-orders',
    label: 'Custom Orders',
    path: '/orders',
    icon: 'orders',
    featureId: 'custom_orders',
    ghostAllowed: false,
  },
  {
    id: 'fulfillment',
    label: 'Fulfillment',
    path: '/fulfillment',
    icon: 'fulfillment',
    featureId: 'fulfillment',
    ghostAllowed: false,
  },
  {
    id: 'archive',
    label: 'Info Archive',
    path: '/archive',
    icon: 'archive',
    featureId: 'archive_browse',
    ghostAllowed: true,
    children: [
      { id: 'archive-welcome', label: 'Overview', path: '/archive', icon: 'home' },
      { id: 'archive-mining', label: 'Mining Guide', path: '/archive?section=mining', icon: 'mining' },
      { id: 'archive-components', label: 'Components', path: '/archive?section=components', icon: 'components' },
      { id: 'archive-ordnance', label: 'Ordnance', path: '/archive?section=ordnance', icon: 'ordnance' },
      { id: 'archive-factions', label: 'Factions', path: '/archive?section=factions', icon: 'factions' },
      { id: 'archive-general', label: 'General Info', path: '/archive?section=general', icon: 'info' },
    ],
  },
]

/** Navigation group definitions for sidebar */
export const NAV_GROUPS: { id: string; label: string; itemIds: string[] }[] = [
  {
    id: 'core',
    label: 'Core',
    itemIds: ['blueprints', 'targets', 'resource-tracker', 'mining-tracker'],
  },
  {
    id: 'tools',
    label: 'Tools',
    itemIds: ['shops', 'custom-orders', 'fulfillment'],
  },
  {
    id: 'reference',
    label: 'Reference',
    itemIds: ['archive'],
  },
]

export function canSeeNavItem(
  item: AppNavItem,
  ctx: VisibilityContext,
  canAccess: (minRole: UserRole) => boolean
): boolean {
  // Guests see the full menu — locked items show a preview page when clicked
  if (ctx.isGuestPreview) return true

  if (!passesGhostNavGate(item.ghostAllowed, ctx)) return false

  if (item.featureId) {
    return canUseFeature(item.featureId, ctx)
  }

  return canAccess(item.minRole ?? 'member')
}

export function isNavItemLocked(
  item: AppNavItem,
  ctx: VisibilityContext,
  canAccess: (minRole: UserRole) => boolean
): boolean {
  if (!ctx.isGuestPreview) return false

  if (item.featureId) {
    return !canUseFeature(item.featureId, ctx)
  }

  return !canAccess(item.minRole ?? 'member')
}

export function getVisibleNavItems(
  ctx: VisibilityContext,
  canAccess: (minRole: UserRole) => boolean
): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => canSeeNavItem(item, ctx, canAccess))
}

/** Get grouped navigation items for sidebar display */
export function getVisibleNavGroups(
  ctx: VisibilityContext,
  canAccess: (minRole: UserRole) => boolean
): NavGroup[] {
  const visibleItems = getVisibleNavItems(ctx, canAccess)
  const visibleIds = new Set(visibleItems.map((i) => i.id))

  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.itemIds
      .filter((id) => visibleIds.has(id))
      .map((id) => visibleItems.find((i) => i.id === id)!)
      .filter(Boolean),
  })).filter((g) => g.items.length > 0)
}

export function getNavItemByPath(path: string): AppNavItem | undefined {
  return APP_NAV_ITEMS.find((item) => item.path === path)
}
