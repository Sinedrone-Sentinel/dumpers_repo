import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchUserNotifications } from '../lib/operations'
import {
  SERVICE_REQUEST_ACCEPTED_EVENT,
  SERVICE_REQUEST_ACCEPTED_TYPE,
  dispatchServiceRequestAccepted,
  hasSeenServiceRequestAccepted,
  markSeenServiceRequestAccepted,
  parseServiceRequestAcceptedPayload,
  type ServiceRequestAcceptedDetail,
} from '../lib/serviceRequestAccepted'
import ServiceRequestAcceptedModal from './ServiceRequestAcceptedModal'

const POLL_MS = 15_000

/**
 * Auto-opens the accept modal when a service_request_accepted notification arrives
 * (payload must include org_name + pricing_label). Also listens for manual open events.
 */
export default function ServiceRequestAcceptedListener() {
  const { user, isApproved } = useAuth()
  const [detail, setDetail] = useState<ServiceRequestAcceptedDetail | null>(null)

  const open = useCallback((next: ServiceRequestAcceptedDetail) => {
    setDetail(next)
    if (next.notificationId) markSeenServiceRequestAccepted(next.notificationId)
  }, [])

  useEffect(() => {
    const onEvent = (event: Event) => {
      const custom = event as CustomEvent<ServiceRequestAcceptedDetail>
      if (custom.detail?.orgName && custom.detail?.pricingLabel) {
        open(custom.detail)
      }
    }
    window.addEventListener(SERVICE_REQUEST_ACCEPTED_EVENT, onEvent)
    return () => window.removeEventListener(SERVICE_REQUEST_ACCEPTED_EVENT, onEvent)
  }, [open])

  useEffect(() => {
    if (!user || !isApproved) return

    let cancelled = false

    const scan = async () => {
      if (document.visibilityState !== 'visible') return
      const result = await fetchUserNotifications()
      if (cancelled || result.error) return
      const candidates = result.data
        .filter((n) => n.type === SERVICE_REQUEST_ACCEPTED_TYPE)
        .filter((n) => !hasSeenServiceRequestAccepted(n.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))

      for (const n of candidates) {
        const parsed = parseServiceRequestAcceptedPayload(n.payload)
        if (!parsed) continue
        dispatchServiceRequestAccepted({ ...parsed, notificationId: n.id })
        break
      }
    }

    void scan()
    const timer = window.setInterval(() => void scan(), POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void scan()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [user, isApproved])

  if (!detail) return null

  return (
    <ServiceRequestAcceptedModal
      detail={detail}
      onClose={() => setDetail(null)}
    />
  )
}
