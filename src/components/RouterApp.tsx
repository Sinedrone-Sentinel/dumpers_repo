import React from 'react'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from '../routes/root'
import { useAuth } from '../contexts/AuthContext'
import { roleAtLeast } from '../lib/roles'
import type { UserRole } from '../lib/supabase'

const router = createRouter({
  routeTree,
  context: {
    auth: {
      loading: true,
      profile: null,
      canAccess: () => false,
      canAccessPreviewFeatures: false,
    },
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function RouterApp() {
  const { loading, profile, canAccessPreviewFeatures } = useAuth()

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
        },
      }}
    />
  )
}
