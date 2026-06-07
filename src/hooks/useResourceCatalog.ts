import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlueprintData } from '../routes/blueprints'
import { buildResourceLabelMap } from '../lib/blueprintResources'
import {
  fetchResourceCatalog,
  fetchResourceCatalogWithInventory,
  syncBlueprintResourceCatalog,
  type BlueprintResourceRow,
  type InventoryContext,
  type ResourceCatalogEntry,
  type ResourceCatalogSyncResult,
} from '../lib/operations'

interface UseResourceCatalogOptions {
  syncOnLoad?: boolean
  includeInactive?: boolean
  withInventory?: boolean
  inventoryContext?: InventoryContext | null
}

export function useResourceCatalog(options: UseResourceCatalogOptions = {}) {
  const {
    syncOnLoad = true,
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

    setLoading(true)
    setError(null)

    if (withInventory && ctx) {
      const { data, error: fetchError } = await fetchResourceCatalogWithInventory(ctx, {
        includeInactive,
      })
      if (fetchError) setError(fetchError)
      setCatalogWithInventory(data)
      setCatalog(data.map(({ quantity: _q, ...resource }) => resource))
    } else {
      const { data, error: fetchError } = await fetchResourceCatalog({ includeInactive })
      if (fetchError) setError(fetchError)
      setCatalog(data)
      setCatalogWithInventory([])
    }

    setLoading(false)
  }, [buildInventoryContext, withInventory, includeInactive])

  const refresh = useCallback(async () => {
    if (!blueprints) return

    if (syncOnLoad) {
      setError(null)
      const syncResponse = await syncBlueprintResourceCatalog(blueprints)
      if (syncResponse.error) {
        setError(syncResponse.error)
        return
      }
      setSyncResult(syncResponse.result ?? null)
      hasSyncedRef.current = true
    }

    await loadCatalog()
  }, [blueprints, syncOnLoad, loadCatalog])

  useEffect(() => {
    if (!blueprints) return

    let cancelled = false

    void (async () => {
      if (syncOnLoad && !hasSyncedRef.current) {
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
    })()

    return () => {
      cancelled = true
    }
  }, [blueprints, syncOnLoad, loadCatalog])

  return {
    catalog,
    catalogWithInventory,
    labelMap,
    syncResult,
    loading,
    error,
    refresh,
  }
}
