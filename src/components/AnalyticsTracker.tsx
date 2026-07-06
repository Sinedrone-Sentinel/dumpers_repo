import { useEffect, useRef } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { initAnalytics, trackAnalyticsRoute, updateAnalyticsContext } from '../lib/analytics'

export default function AnalyticsTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { user, isGuestPreview } = useAuth()
  const authRef = useRef({ user, isGuestPreview })

  authRef.current = { user, isGuestPreview }

  useEffect(() => {
    return initAnalytics(() => ({
      isGuest: authRef.current.isGuestPreview && !authRef.current.user,
    }))
  }, [])

  useEffect(() => {
    updateAnalyticsContext({
      isGuest: isGuestPreview && !user,
    })
  }, [isGuestPreview, user])

  useEffect(() => {
    trackAnalyticsRoute(pathname)
  }, [pathname])

  return null
}
