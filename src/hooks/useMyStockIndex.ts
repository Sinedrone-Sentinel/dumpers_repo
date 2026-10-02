import { useEffect, useState } from 'react'
import { useAsyncEffect } from './useAsyncEffect'
import { fetchInventory } from '../lib/operations'
import { buildOwnedStockIndex, type OwnedStockIndex } from '../lib/craftFromStock'
import { PERSONAL_RESOURCES_WIPED_EVENT } from '../lib/userDataEvents'

/**
 * Signed-in member's My Resources stock, indexed by resource and quality.
 * Loads only while `enabled` (e.g. a blueprint modal is open); null otherwise.
 */
export function useMyStockIndex(userId: string | null | undefined, enabled: boolean) {
  const [index, setIndex] = useState<OwnedStockIndex | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const onWiped = () => setReloadKey((k) => k + 1)
    window.addEventListener(PERSONAL_RESOURCES_WIPED_EVENT, onWiped)
    return () => window.removeEventListener(PERSONAL_RESOURCES_WIPED_EVENT, onWiped)
  }, [])

  useAsyncEffect(
    async ({ cancelled }) => {
      if (!userId || !enabled) {
        setIndex(null)
        return
      }
      const { data, error } = await fetchInventory({ scope: 'personal', userId })
      if (cancelled) return
      setIndex(error ? null : buildOwnedStockIndex(data))
    },
    [userId, enabled, reloadKey]
  )

  return index
}
