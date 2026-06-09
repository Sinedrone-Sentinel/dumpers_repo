import type { UserRole } from './supabase'
import { roleAtLeast } from './roles'

export type FeatureId =
  | 'blueprints_browse'
  | 'blueprints_acquire'
  | 'member_directory'
  | 'admin_panel'
  | 'settings'
  | 'resource_tracker'
  | 'custom_orders'
  | 'fulfillment'
  | 'target_bp_list'
  | 'site_total'

export interface VisibilityContext {
  role: UserRole | null
  ghostMode: boolean
  isSuperAdmin: boolean
  isOfficerOrAbove: boolean
  isApproved: boolean
  isPending: boolean
  /** Pending or ghost — hidden from member directory / social surfaces */
  isSociallyHidden: boolean
}

export interface BuildVisibilityContextInput {
  role?: UserRole | null
  ghostMode?: boolean
}

export function buildVisibilityContext(input: BuildVisibilityContextInput): VisibilityContext {
  const role = input.role ?? null
  const ghostMode = input.ghostMode ?? false
  const isSuperAdmin = role === 'super-admin'
  const isOfficerOrAbove = role === 'officer' || isSuperAdmin
  const isPending = role === 'pending'
  const isApproved = !!role && role !== 'pending'

  return {
    role,
    ghostMode,
    isSuperAdmin,
    isOfficerOrAbove,
    isApproved,
    isPending,
    isSociallyHidden: isPending || ghostMode,
  }
}

export function canUseFeature(featureId: FeatureId, ctx: VisibilityContext): boolean {
  switch (featureId) {
    case 'blueprints_browse':
      return !!ctx.role

    case 'blueprints_acquire':
      return ctx.isApproved

    case 'member_directory':
      return ctx.isApproved && !ctx.ghostMode

    case 'admin_panel':
      return ctx.isOfficerOrAbove && !ctx.ghostMode

    case 'settings':
      return !!ctx.role && ctx.role !== 'pending'

    case 'resource_tracker':
      return ctx.isApproved && !ctx.ghostMode

    case 'custom_orders':
      return ctx.isApproved && !ctx.ghostMode

    case 'fulfillment':
      return ctx.isApproved && !ctx.ghostMode

    case 'target_bp_list':
      return ctx.isApproved

    case 'site_total':
      return ctx.isApproved && !ctx.ghostMode

    default:
      return false
  }
}

/** Ghost users skip nav items unless ghostAllowed is true (default true). */
export function passesGhostNavGate(
  ghostAllowed: boolean | undefined,
  ctx: VisibilityContext
): boolean {
  if (!ctx.ghostMode) return true
  return ghostAllowed !== false
}

export function roleMeetsMin(role: UserRole | null | undefined, minRole: UserRole): boolean {
  return roleAtLeast(role, minRole)
}
