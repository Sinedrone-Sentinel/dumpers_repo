import { useEffect, useState } from 'react'
import { isAppOutOfDate } from '../lib/appVersion'

/**
 * Detects when a newer site build is deployed than the one this tab loaded.
 * Checks on mount and when the tab becomes visible again — never on a background
 * timer, so idle tabs do not keep poking the network or flashing UI.
 */
export function useAppUpdateAvailable(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    if (updateAvailable) return

    let cancelled = false

    const check = async () => {
      const stale = await isAppOutOfDate()
      if (!cancelled && stale) setUpdateAvailable(true)
    }

    void check()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [updateAvailable])

  return updateAvailable
}
