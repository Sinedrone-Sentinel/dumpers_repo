import { redirect } from '@tanstack/react-router'
import type { UserRole } from './supabase'
import { roleAtLeast } from './roles'
import { type FeatureId, type VisibilityContext } from './featureAccess'
import { isDedicatedStarMapWindow } from './starMapHighlight'

export interface RouterAuthContext {
  loading: boolean
  profile: { role: UserRole } | null
  canAccess: (minRole: UserRole) => boolean
  visibilityContext: VisibilityContext
  canUseFeature: (featureId: FeatureId) => boolean
}

export function requireMinRole(minRole: UserRole) {
  return ({ context }: { context: { auth: RouterAuthContext } }) => {
    if (context.auth.loading) return

    const role = context.auth.profile?.role
    if (!roleAtLeast(role, minRole)) {
      throw redirect({ to: '/' })
    }
  }
}

export function requireSuperAdmin() {
  return ({ context }: { context: { auth: RouterAuthContext } }) => {
    if (context.auth.loading) return

    if (context.auth.profile?.role !== 'super-admin') {
      throw redirect({ to: '/' })
    }
  }
}

export function requireFeature(featureId: FeatureId) {
  return ({ context }: { context: { auth: RouterAuthContext } }) => {
    if (context.auth.loading) return

    if (!context.auth.canUseFeature(featureId)) {
      if (context.auth.visibilityContext.isGuestPreview) {
        throw redirect({
          to: '/guest-locked',
          search: { feature: featureId },
        })
      }
      throw redirect({ to: '/' })
    }
  }
}

/**
 * Star Map in the named View Map tab stays on the map. Sending that tab to
 * `/` or the guest lock would show the rest of the site. The page itself
 * stays blank when the feature is off.
 */
export function requireStarMapFeature() {
  return ({ context }: { context: { auth: RouterAuthContext } }) => {
    if (context.auth.loading) return
    if (context.auth.canUseFeature('star_map')) return
    if (isDedicatedStarMapWindow()) return
    if (context.auth.visibilityContext.isGuestPreview) {
      throw redirect({
        to: '/guest-locked',
        search: { feature: 'star_map' },
      })
    }
    throw redirect({ to: '/' })
  }
}
