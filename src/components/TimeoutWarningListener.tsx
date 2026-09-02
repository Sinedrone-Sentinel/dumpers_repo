import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  acknowledgeTimeoutWarning,
  fetchPendingTimeoutWarning,
  type TimeoutWarning,
} from '../lib/orderTimeoutWarning'
import TimeoutWarningModal from './TimeoutWarningModal'

export default function TimeoutWarningListener() {
  const { user, isApproved } = useAuth()
  const [warning, setWarning] = useState<TimeoutWarning | null>(null)

  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId || !isApproved) {
      setWarning(null)
      return
    }

    let cancelled = false
    void fetchPendingTimeoutWarning().then((next) => {
      if (!cancelled) setWarning(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId, isApproved])

  const onAcknowledge = useCallback(async () => {
    const result = await acknowledgeTimeoutWarning()
    if (!result.success) {
      throw new Error(result.error || 'acknowledge failed')
    }
    setWarning(null)
  }, [])

  if (!warning) return null

  return <TimeoutWarningModal warning={warning} onAcknowledge={onAcknowledge} />
}
