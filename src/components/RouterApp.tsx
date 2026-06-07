import React from 'react'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { RouteErrorPage, RouteNotFoundPage } from './RouteErrorPage'
import { routeTree } from '../routes/root'
import { useAuth } from '../contexts/AuthContext'
import { roleAtLeast } from '../lib/roles'
import { buildVisibilityContext } from '../lib/featureAccess'
import type { UserRole } from '../lib/supabase'

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: RouteNotFoundPage,
  defaultErrorComponent: RouteErrorPage,
  context: {
    auth: {
      loading: true,
      profile: null,
      canAccess: () => false,
      canAccessPreviewFeatures: false,
      visibilityContext: buildVisibilityContext({}),
      canUseFeature: () => false,
    },
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function RouterApp() {
  const {
    loading,
    profile,
    canAccessPreviewFeatures,
    visibilityContext,
    canUseFeature,
  } = useAuth()

  const canAccess = (minRole: UserRole) => roleAtLeast(profile?.role, minRole)

  return (
    <RouterProvider
      router={router}
      context={{
        auth: {
          loading,
          profile,
          canAccess,
          canAccessPreviewFeatures,
          visibilityContext,
          canUseFeature,
        },
      }}
    />
  )
}
