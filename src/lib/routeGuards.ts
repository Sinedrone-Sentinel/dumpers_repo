import { redirect } from '@tanstack/react-router'
import type { UserRole } from './supabase'
import { roleAtLeast } from './roles'

export interface RouterAuthContext {
  loading: boolean
  profile: { role: UserRole } | null
  canAccess: (minRole: UserRole) => boolean
  canAccessPreviewFeatures: boolean
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

export function requirePreviewAccess() {
  return ({ context }: { context: { auth: RouterAuthContext } }) => {
    if (context.auth.loading) return

    if (!context.auth.canAccessPreviewFeatures) {
      throw redirect({ to: '/' })
    }
  }
}
