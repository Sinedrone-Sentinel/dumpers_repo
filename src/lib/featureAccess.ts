import type { UserRole } from './supabase'
import { roleAtLeast } from './roles'

export type FeatureId =
  | 'blueprints_browse'
  | 'wikelo_browse'
  | 'archive_browse'
  | 'blueprints_acquire'
  | 'admin_panel'
  | 'settings'
  | 'resource_tracker'
  | 'smart_hauler'
  | 'custom_orders'
  | 'fulfillment'
  | 'target_bp_list'
  | 'site_total'
  | 'support_tickets'
  | 'support_dashboard'
  | 'site_analytics'
  | 'mining_tracker'
  | 'commodity_lookup'
  | 'shop_cart'
  | 'ship_shop'
  | 'executive_hangar'
  | 'loot_finder'
  | 'partnership'
  | 'contribute'
  | 'contributor_team_admin'
  | 'flight_profile'
  | 'dumper_apps'
  | 'star_map'

export interface VisibilityContext {
  role: UserRole | null
  isGuestPreview: boolean
  isSuperAdmin: boolean
  isOfficerOrAbove: boolean
  isApproved: boolean
  isPending: boolean
}

export interface BuildVisibilityContextInput {
  role?: UserRole | null
  isGuestPreview?: boolean
}

export function buildVisibilityContext(input: BuildVisibilityContextInput): VisibilityContext {
  const role = input.role ?? null
  const isGuestPreview = input.isGuestPreview ?? false
  const isSuperAdmin = role === 'super-admin'
  const isOfficerOrAbove = role === 'officer' || isSuperAdmin
  const isPending = role === 'pending'
  const isApproved = !!role && role !== 'pending'

  return {
    role,
    isGuestPreview,
    isSuperAdmin,
    isOfficerOrAbove,
    isApproved,
    isPending,
  }
}

export function canUseFeature(featureId: FeatureId, ctx: VisibilityContext): boolean {
  if (ctx.isGuestPreview) {
    return (
      featureId === 'blueprints_browse' ||
      featureId === 'wikelo_browse' ||
      featureId === 'archive_browse' ||
      featureId === 'blueprints_acquire' ||
      featureId === 'mining_tracker' ||
      featureId === 'target_bp_list' ||
      featureId === 'resource_tracker' ||
      featureId === 'fulfillment' ||
      featureId === 'commodity_lookup' ||
      featureId === 'shop_cart' ||
      featureId === 'ship_shop' ||
      featureId === 'executive_hangar' ||
      featureId === 'loot_finder' ||
      featureId === 'dumper_apps' ||
      featureId === 'star_map'
    )
  }

  switch (featureId) {
    case 'blueprints_browse':
      return !!ctx.role

    case 'wikelo_browse':
      return !!ctx.role

    case 'archive_browse':
      return !!ctx.role

    case 'blueprints_acquire':
      return ctx.isApproved

    case 'admin_panel':
      return ctx.isOfficerOrAbove

    case 'settings':
      return !!ctx.role && ctx.role !== 'pending'

    case 'resource_tracker':
      return ctx.isApproved

    case 'smart_hauler':
      return ctx.isApproved

    case 'custom_orders':
      return ctx.isApproved

    case 'fulfillment':
      return ctx.isApproved

    case 'target_bp_list':
      return ctx.isApproved

    case 'site_total':
      return ctx.isOfficerOrAbove

    case 'support_tickets':
      return ctx.isApproved

    case 'support_dashboard':
      return ctx.isOfficerOrAbove

    case 'site_analytics':
      return ctx.isSuperAdmin

    case 'mining_tracker':
      return !!ctx.role

    case 'commodity_lookup':
      return !!ctx.role

    case 'shop_cart':
      return true

    case 'ship_shop':
      return true

    case 'executive_hangar':
      return true

    case 'loot_finder':
      return true

    case 'partnership':
      return ctx.isApproved

    case 'contribute':
      return ctx.isApproved

    case 'contributor_team_admin':
      return ctx.isSuperAdmin

    case 'flight_profile':
      return ctx.isApproved

    case 'dumper_apps':
      // Page open to any signed-in role; BP Dumper tab still requires approval in UI.
      return !!ctx.role

    case 'star_map':
      return true

    default:
      return false
  }
}

export function roleMeetsMin(role: UserRole | null | undefined, minRole: UserRole): boolean {
  return roleAtLeast(role, minRole)
}
