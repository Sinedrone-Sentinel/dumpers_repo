import { useCallback, useMemo, useRef, useState } from 'react'
import { useAsyncEffect } from './useAsyncEffect'
import { useBlueprintData } from '../routes/blueprints'
import { buildResourceLabelMap } from '../lib/blueprintResources'
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
  /** Super-admin only: import blueprint_resources from Blueprints.json */
  enableCatalogSync?: boolean
  includeInactive?: boolean
  withInventory?: boolean
  inventoryContext?: InventoryContext | null
}

export function useResourceCatalog(options: UseResourceCatalogOptions = {}) {
  const {
    enableCatalogSync = false,
    includeInactive = false,
    withInventory = false,
    inventoryContext = null,
  } = options
  const { data: blueprints } = useBlueprintData()

  const inventoryScope = inventoryContext?.scope
  const inventoryUserId = inventoryContext?.userId
  const inventoryOrgId = inventoryContext?.orgId ?? null

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
      orgId: inventoryOrgId,
    }
  }, [withInventory, inventoryUserId, inventoryScope, inventoryOrgId])

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
      const catalogResult = await fetchResourceCatalog({ includeInactive })
      if (catalogResult.error) setError(catalogResult.error)
      setCatalog(catalogResult.data)

      if (ctx.scope === 'personal') {
        const cardsResult = await fetchPersonalInventoryCards(ctx, { includeInactive })
        if (cardsResult.error && !catalogResult.error) setError(cardsResult.error)
        setPersonalLineKeys(cardsResult.lineKeys)
        setCatalogWithInventory(
          cardsResult.data.map((card) => ({
            resource_key: card.resource_key,
            label: card.label,
            is_active: card.is_active,
            synced_at: '',
            quantity: card.quantity,
            quality: card.quality,
          }))
        )
      } else {
        setPersonalLineKeys([])
        const { data, error: fetchError } = await fetchResourceCatalogWithInventory(ctx, {
          includeInactive,
        })
        if (fetchError && !catalogResult.error) setError(fetchError)
        setCatalogWithInventory(data)
      }
    } else {
      const { data, error: fetchError } = await fetchResourceCatalog({ includeInactive })
      if (fetchError) setError(fetchError)
      setCatalog(data)
      setCatalogWithInventory([])
      setPersonalLineKeys([])
    }

    setLoading(false)
  }, [buildInventoryContext, withInventory, includeInactive])

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
  }, [blueprints, enableCatalogSync, inventoryScope, inventoryUserId, inventoryOrgId, withInventory, includeInactive])

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
