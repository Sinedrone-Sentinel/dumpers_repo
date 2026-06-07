import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBlueprintData } from '../routes/blueprints'
import { buildResourceLabelMap } from '../lib/blueprintResources'
import {
  fetchResourceCatalog,
  fetchResourceCatalogWithInventory,
  syncBlueprintResourceCatalog,
  type BlueprintResourceRow,
  type ResourceCatalogEntry,
  type ResourceCatalogSyncResult,
} from '../lib/operations'

interface UseResourceCatalogOptions {
  syncOnLoad?: boolean
  includeInactive?: boolean
  withInventory?: boolean
}

export function useResourceCatalog(options: UseResourceCatalogOptions = {}) {
  const { syncOnLoad = true, includeInactive = false, withInventory = false } = options
  const { data: blueprints } = useBlueprintData()

  const [catalog, setCatalog] = useState<BlueprintResourceRow[]>([])
  const [catalogWithInventory, setCatalogWithInventory] = useState<ResourceCatalogEntry[]>([])
  const [syncResult, setSyncResult] = useState<ResourceCatalogSyncResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const labelMap = useMemo(() => buildResourceLabelMap(catalog), [catalog])

  const refresh = useCallback(async () => {
    if (!blueprints) return

    setLoading(true)
    setError(null)

    if (syncOnLoad) {
      const syncResponse = await syncBlueprintResourceCatalog(blueprints)
      if (syncResponse.error) {
        setError(syncResponse.error)
        setLoading(false)
        return
      }
      setSyncResult(syncResponse.result ?? null)
    }

    if (withInventory) {
      const { data, error: fetchError } = await fetchResourceCatalogWithInventory({
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
  }, [blueprints, syncOnLoad, includeInactive, withInventory])

  useEffect(() => {
    if (blueprints) void refresh()
  }, [blueprints, refresh])

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
