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
  featureId?: FeatureId
  minRole?: UserRole
  /** Ghost Mode users only see items with ghostAllowed !== false */
  ghostAllowed?: boolean
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    id: 'blueprints',
    label: 'Blueprints',
    path: '/',
    featureId: 'blueprints_browse',
    minRole: 'member',
    ghostAllowed: true,
  },
  {
    id: 'targets',
    label: 'Target BP List',
    path: '/targets',
    featureId: 'target_bp_list',
    minRole: 'member',
    ghostAllowed: true,
  },
  {
    id: 'resource-tracker',
    label: 'Resource Tracker',
    path: '/resources',
    featureId: 'resource_tracker',
    minRole: 'member',
    ghostAllowed: false,
  },
  {
    id: 'custom-orders',
    label: 'Custom Orders',
    path: '/orders',
    featureId: 'custom_orders',
    ghostAllowed: false,
  },
  {
    id: 'fulfillment',
    label: 'Fulfillment',
    path: '/fulfillment',
    featureId: 'fulfillment',
    ghostAllowed: false,
  },
]

export function canSeeNavItem(
  item: AppNavItem,
  ctx: VisibilityContext,
  canAccess: (minRole: UserRole) => boolean
): boolean {
  if (!passesGhostNavGate(item.ghostAllowed, ctx)) return false

  if (item.featureId) {
    return canUseFeature(item.featureId, ctx)
  }

  return canAccess(item.minRole ?? 'member')
}

export function getVisibleNavItems(
  ctx: VisibilityContext,
  canAccess: (minRole: UserRole) => boolean
): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => canSeeNavItem(item, ctx, canAccess))
}

export function getNavItemByPath(path: string): AppNavItem | undefined {
  return APP_NAV_ITEMS.find((item) => item.path === path)
}
