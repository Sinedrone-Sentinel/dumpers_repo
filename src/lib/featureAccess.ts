import type { UserRole } from './supabase'
import { roleAtLeast } from './roles'

export type FeatureId =
  | 'blueprints_browse'
  | 'archive_browse'
  | 'blueprints_acquire'
  | 'admin_panel'
  | 'settings'
  | 'resource_tracker'
  | 'custom_orders'
  | 'fulfillment'
  | 'target_bp_list'
  | 'site_total'
  | 'support_tickets'
  | 'support_dashboard'
  | 'site_analytics'
  | 'mining_tracker'

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
      featureId === 'archive_browse' ||
      featureId === 'blueprints_acquire' ||
      featureId === 'mining_tracker' ||
      featureId === 'target_bp_list' ||
      featureId === 'resource_tracker' ||
      featureId === 'fulfillment'
    )
  }

  switch (featureId) {
    case 'blueprints_browse':
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

    default:
      return false
  }
}

export function roleMeetsMin(role: UserRole | null | undefined, minRole: UserRole): boolean {
  return roleAtLeast(role, minRole)
}
