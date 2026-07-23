import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncEffect } from './useAsyncEffect'
import { useBlueprintData } from '../routes/blueprints'
import { buildResourceLabelMap } from '../lib/blueprintResources'
import { PERSONAL_RESOURCES_WIPED_EVENT } from '../lib/userDataEvents'
import {
  fetchPersonalInventoryCards,
  fetchResourceCatalog,
  fetchResourceCatalogWithInventory,
  syncBlueprintResourceCatalog,
  type BlueprintResourceRow,
  type InventoryContext,
  type ResourceCatalogEntry,
  type ResourceCatalogSyncResult,
} from '../lib/operations'

interface UseResourceCatalogOptions {
  /** Super-admin only: sync blueprint_resources from game data */
  enableCatalogSync?: boolean
  withInventory?: boolean
  inventoryContext?: InventoryContext | null
}

export function useResourceCatalog(options: UseResourceCatalogOptions = {}) {
  const {
    enableCatalogSync = false,
    withInventory = false,
    inventoryContext = null,
  } = options
  const { data: blueprints } = useBlueprintData()

  const inventoryScope = inventoryContext?.scope
  const inventoryUserId = inventoryContext?.userId

  const [catalog, setCatalog] = useState<BlueprintResourceRow[]>([])
  const [catalogWithInventory, setCatalogWithInventory] = useState<ResourceCatalogEntry[]>([])
  const [personalLineKeys, setPersonalLineKeys] = useState<string[]>([])
  const [syncResult, setSyncResult] = useState<ResourceCatalogSyncResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hasSyncedRef = useRef(false)

  const labelMap = useMemo(() => buildResourceLabelMap(catalog), [catalog])

  const buildInventoryContext = useCallback((): InventoryContext | null => {
    if (!withInventory || !inventoryUserId || !inventoryScope) return null
    return {
      scope: inventoryScope,
      userId: inventoryUserId,
    }
  }, [withInventory, inventoryUserId, inventoryScope])

  const loadCatalog = useCallback(async () => {
    const ctx = buildInventoryContext()

    if (withInventory && !ctx) {
      setLoading(false)
      return
    }

    const isInitialLoad = catalog.length === 0 && catalogWithInventory.length === 0
    if (isInitialLoad) setLoading(true)
    setError(null)

    if (withInventory && ctx) {
      const catalogResult = await fetchResourceCatalog()
      if (catalogResult.error) setError(catalogResult.error)
      setCatalog(catalogResult.data)

      if (ctx.scope === 'personal') {
        const cardsResult = await fetchPersonalInventoryCards(ctx)
        if (cardsResult.error && !catalogResult.error) setError(cardsResult.error)
        setPersonalLineKeys(cardsResult.lineKeys)
        setCatalogWithInventory(
          cardsResult.data.map((card) => ({
            resource_key: card.resource_key,
            label: card.label,
            synced_at: '',
            quantity: card.quantity,
            quality: card.quality,
            note: card.note,
          }))
        )
      } else {
        setPersonalLineKeys([])
        const { data, error: fetchError } = await fetchResourceCatalogWithInventory(ctx)
        if (fetchError && !catalogResult.error) setError(fetchError)
        setCatalogWithInventory(data)
      }
    } else {
      const { data, error: fetchError } = await fetchResourceCatalog()
      if (fetchError) setError(fetchError)
      setCatalog(data)
      setCatalogWithInventory([])
      setPersonalLineKeys([])
    }

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog lengths used for loading state only
  }, [buildInventoryContext, withInventory])

  const refresh = useCallback(async () => {
    await loadCatalog()
  }, [loadCatalog])

  const syncFromBlueprints = useCallback(async () => {
    if (!blueprints || !enableCatalogSync) return

    setError(null)
    const syncResponse = await syncBlueprintResourceCatalog(blueprints)
    if (syncResponse.error) {
      setError(syncResponse.error)
      return
    }
    setSyncResult(syncResponse.result ?? null)
    hasSyncedRef.current = true
    await loadCatalog()
  }, [blueprints, enableCatalogSync, loadCatalog])

  useAsyncEffect(async ({ cancelled }) => {
    if (enableCatalogSync && !blueprints) return

    if (enableCatalogSync && !hasSyncedRef.current) {
      const syncResponse = await syncBlueprintResourceCatalog(blueprints)
      if (cancelled) return
      if (syncResponse.error) {
        setError(syncResponse.error)
        setLoading(false)
        return
      }
      setSyncResult(syncResponse.result ?? null)
      hasSyncedRef.current = true
    }

    if (cancelled) return
    await loadCatalog()
  }, [blueprints, enableCatalogSync, inventoryScope, inventoryUserId, withInventory])

  useEffect(() => {
    const onWiped = () => {
      void loadCatalog()
    }
    window.addEventListener(PERSONAL_RESOURCES_WIPED_EVENT, onWiped)
    return () => window.removeEventListener(PERSONAL_RESOURCES_WIPED_EVENT, onWiped)
  }, [loadCatalog])

  return {
    catalog,
    catalogWithInventory,
    personalLineKeys,
    labelMap,
    syncResult,
    loading,
    error,
    refresh,
    syncFromBlueprints,
  }
}
