import { useEffect, useState } from 'react'
import { APP_UPDATE_POLL_MS, isAppOutOfDate } from '../lib/appVersion'

/**
 * Detects when a newer site build is deployed than the one this tab loaded.
 * Checks on mount, when the tab becomes visible again, and on a slow poll
 * so long-lived sessions still see the update banner.
 */
export function useAppUpdateAvailable(pollMs = APP_UPDATE_POLL_MS): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (updateAvailable) return

    let cancelled = false

    const check = async () => {
      const stale = await isAppOutOfDate()
      if (!cancelled && stale) setUpdateAvailable(true)
    }

    void check()

    const intervalId = window.setInterval(() => {
      void check()
    }, pollMs)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pollMs, updateAvailable])

  return updateAvailable
}
