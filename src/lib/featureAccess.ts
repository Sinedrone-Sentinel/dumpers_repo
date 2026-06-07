import type { UserRole } from './supabase'
import { roleAtLeast } from './roles'

export type OrgRole = 'owner' | 'admin' | 'officer' | 'member'

export type FeatureId =
  | 'blueprints_browse'
  | 'blueprints_acquire'
  | 'member_directory'
  | 'admin_panel'
  | 'settings'
  | 'preview_features'
  | 'resource_tracker'
  | 'custom_orders'
  | 'fulfillment'
  | 'target_bp_list'
  | 'org_resources'
  | 'org_orders'
  | 'fulfillment_provider'

export interface VisibilityContext {
  role: UserRole | null
  ghostMode: boolean
  previewFeaturesEnabled: boolean
  orgOnlyMode: boolean
  fulfillmentEnabled: boolean
  orgId: string | null
  orgRole: OrgRole | null
  orgVerified: boolean
  orgResourcesPublic: boolean
  isSuperAdmin: boolean
  isOfficerOrAbove: boolean
  isApproved: boolean
  isPending: boolean
  /** Pending or ghost — hidden from member directory / social surfaces */
  isSociallyHidden: boolean
  canAccessPreviewFeatures: boolean
}

export interface BuildVisibilityContextInput {
  role?: UserRole | null
  ghostMode?: boolean
  previewFeaturesEnabled?: boolean
  orgOnlyMode?: boolean
  fulfillmentEnabled?: boolean
  orgId?: string | null
  orgRole?: OrgRole | null
  orgVerified?: boolean
  orgResourcesPublic?: boolean
}

export function buildVisibilityContext(input: BuildVisibilityContextInput): VisibilityContext {
  const role = input.role ?? null
  const ghostMode = input.ghostMode ?? false
  const previewFeaturesEnabled = input.previewFeaturesEnabled ?? false
  const isSuperAdmin = role === 'super-admin'
  const isOfficerOrAbove = role === 'officer' || isSuperAdmin
  const isPending = role === 'pending'
  const isApproved = !!role && role !== 'pending'
  const canAccessPreviewFeatures =
    isSuperAdmin || (role === 'officer' && previewFeaturesEnabled)

  return {
    role,
    ghostMode,
    previewFeaturesEnabled,
    orgOnlyMode: input.orgOnlyMode ?? false,
    fulfillmentEnabled: input.fulfillmentEnabled ?? false,
    orgId: input.orgId ?? null,
    orgRole: input.orgRole ?? null,
    orgVerified: input.orgVerified ?? false,
    orgResourcesPublic: input.orgResourcesPublic ?? false,
    isSuperAdmin,
    isOfficerOrAbove,
    isApproved,
    isPending,
    isSociallyHidden: isPending || ghostMode,
    canAccessPreviewFeatures,
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

    case 'preview_features':
      return ctx.canAccessPreviewFeatures && !ctx.ghostMode

    case 'resource_tracker':
      return ctx.canAccessPreviewFeatures && !ctx.ghostMode

    case 'custom_orders':
      return ctx.canAccessPreviewFeatures && !ctx.ghostMode

    case 'fulfillment':
      return ctx.canAccessPreviewFeatures && !ctx.ghostMode

    case 'target_bp_list':
      return ctx.isApproved

    case 'org_resources':
      return ctx.isApproved && !ctx.ghostMode && !!ctx.orgId && ctx.orgVerified

    case 'org_orders':
      return ctx.isApproved && !ctx.ghostMode && !!ctx.orgId

    case 'fulfillment_provider':
      return (
        ctx.isApproved &&
        !ctx.ghostMode &&
        (ctx.fulfillmentEnabled || ctx.isOfficerOrAbove)
      )

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

export function canManageOrgMembers(ctx: VisibilityContext): boolean {
  return ctx.orgRole === 'owner' || ctx.orgRole === 'admin'
}

export function canTransferOrgOwnership(ctx: VisibilityContext): boolean {
  return ctx.orgRole === 'owner' || ctx.isSuperAdmin
}

export function canVerifyOrgMates(ctx: VisibilityContext): boolean {
  return (
    ctx.orgRole === 'owner' ||
    ctx.orgRole === 'admin' ||
    ctx.orgRole === 'officer'
  )
}

export function canManageOrgPrivacy(ctx: VisibilityContext): boolean {
  return ctx.orgRole === 'owner' || ctx.orgRole === 'admin' || ctx.isSuperAdmin
}

export function canManageOrgInventory(ctx: VisibilityContext): boolean {
  return (
    ctx.isOfficerOrAbove ||
    ctx.orgRole === 'owner' ||
    ctx.orgRole === 'admin' ||
    ctx.orgRole === 'officer'
  )
}

export function roleMeetsMin(role: UserRole | null | undefined, minRole: UserRole): boolean {
  return roleAtLeast(role, minRole)
}
