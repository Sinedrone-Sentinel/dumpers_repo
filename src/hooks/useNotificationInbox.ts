import { useCallback, useEffect, useState } from 'react'
import { ensurePendingFriendNotifications } from '../lib/friends'
import { fetchUserNotifications, type UserNotification } from '../lib/operations'
import { syncQuestionnaireNotificationsForMe } from '../lib/questionnaires'
import { useAsyncEffect } from './useAsyncEffect'

const POLL_MS = 30_000

export const NOTIFICATIONS_CHANGED_EVENT = 'dumpers:notifications-changed'

export function notifyNotificationsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT))
}

function notificationIdsKey(rows: UserNotification[]): string {
  return rows
    .map((n) => n.id)
    .sort()
    .join(',')
}

export function useNotificationInbox(disabled: boolean) {
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [tabVisible, setTabVisible] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'visible'
  )

  useEffect(() => {
    const onVisibilityChange = () => {
      setTabVisible(document.visibilityState === 'visible')
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const applyNotifications = useCallback((next: UserNotification[]) => {
    setNotifications((prev) => {
      if (notificationIdsKey(prev) === notificationIdsKey(next)) return prev
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    // Keep questionnaire bell items accurate (drop stale; add for late joiners).
    await syncQuestionnaireNotificationsForMe()
    // Recreate Notify rows for pending friendships cleared without cancel.
    await ensurePendingFriendNotifications()
    const result = await fetchUserNotifications()
    if (!result.error) applyNotifications(result.data)
  }, [applyNotifications])

  useAsyncEffect(async (controls) => {
    if (disabled || !tabVisible) return

    await syncQuestionnaireNotificationsForMe()
    if (controls.cancelled) return
    await ensurePendingFriendNotifications()
    if (controls.cancelled) return

    const result = await fetchUserNotifications()
    if (controls.cancelled || result.error) return
    applyNotifications(result.data)
  }, [disabled, tabVisible, applyNotifications])

  useEffect(() => {
    if (disabled || !tabVisible) return

    const timer = window.setInterval(() => {
      void refresh()
    }, POLL_MS)

    return () => window.clearInterval(timer)
  }, [disabled, tabVisible, refresh])

  useEffect(() => {
    const onChanged = () => {
      void refresh()
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
  }, [refresh])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const removeOne = useCallback((notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
  }, [])

  return {
    notifications,
    unreadCount: notifications.length,
    refresh,
    clearAll,
    removeOne,
  }
}
