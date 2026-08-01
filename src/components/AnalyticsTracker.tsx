import { useEffect, useRef } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { initAnalytics, trackAnalyticsRoute, updateAnalyticsContext } from '../lib/analytics'

export default function AnalyticsTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { user, isGuestPreview, isSuperAdmin } = useAuth()
  const authRef = useRef({ user, isGuestPreview, isSuperAdmin })

  authRef.current = { user, isGuestPreview, isSuperAdmin }

  useEffect(() => {
    return initAnalytics(() => ({
      isGuest: authRef.current.isGuestPreview && !authRef.current.user,
      isSuperAdmin: authRef.current.isSuperAdmin,
    }))
  }, [])

  useEffect(() => {
    updateAnalyticsContext({
      isGuest: isGuestPreview && !user,
      isSuperAdmin,
    })
  }, [isGuestPreview, user, isSuperAdmin])

  useEffect(() => {
    trackAnalyticsRoute(pathname)
  }, [pathname])

  return null
}
