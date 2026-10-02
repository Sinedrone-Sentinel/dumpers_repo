import { useCallback, useMemo, useState } from 'react'
import { useMiningData } from './useArchiveData'
import { useMiningTracker } from './useMiningTracker'
import {
  blueprintHasRsTrackableOres,
  extractBlueprintTrackableOres,
  trackableOreForResource,
  type AddBlueprintOresToRsTrackerResult,
  type BlueprintTrackableOre,
} from '../lib/blueprintRsTracker'
import type { BlueprintWithSlots } from '../lib/blueprintResources'

export type AddBlueprintToCraftTrackerResult = AddBlueprintOresToRsTrackerResult & {
  error?: string
}

const RESOURCE_PENDING_PREFIX = 'resource:'

export function useBlueprintCraftTracker() {
  const { data: miningCatalog } = useMiningData()
  const { addEntry, isTracked } = useMiningTracker()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  const catalog = useMemo(() => miningCatalog ?? [], [miningCatalog])

  const addOres = useCallback(
    async (
      ores: BlueprintTrackableOre[],
      pendingKey: string
    ): Promise<AddBlueprintOresToRsTrackerResult> => {
      setPendingId(pendingKey)
      setLastMessage(null)

      const added: AddBlueprintOresToRsTrackerResult['added'] = []
      const skipped: AddBlueprintOresToRsTrackerResult['skipped'] = []

      try {
        for (const ore of ores) {
          if (isTracked(ore.oreName, ore.depositType)) {
            skipped.push({ oreName: ore.oreName, depositType: ore.depositType })
            continue
          }

          const ok = await addEntry(ore.oreName, ore.rarity, {
            depositType: ore.depositType,
            profileMode: 'overall',
          })
          if (ok) {
            added.push({ oreName: ore.oreName, depositType: ore.depositType })
          }
        }
        return { added, skipped }
      } finally {
        setPendingId(null)
      }
    },
    [addEntry, isTracked]
  )

  const addMaterialsFromBlueprint = useCallback(
    async (blueprint: BlueprintWithSlots): Promise<AddBlueprintToCraftTrackerResult> => {
      const blueprintId = (blueprint as { internalName?: string; file?: string }).internalName
        || (blueprint as { file?: string }).file
        || ''

      if (!catalog.length) {
        return { added: [], skipped: [], error: 'Mining data is still loading — try again.' }
      }

      const ores = extractBlueprintTrackableOres(blueprint, catalog)
      if (ores.length === 0) {
        return {
          added: [],
          skipped: [],
          error: 'No RS-trackable ores in this blueprint (only mineable ores can be added).',
        }
      }

      const result = await addOres(ores, blueprintId)
      setLastMessage(
        result.added.length === 0
          ? 'Those ores are already on your RS Tracker.'
          : `Added ${result.added.length} ore${result.added.length === 1 ? '' : 's'} to RS Tracker.`
      )
      return result
    },
    [addOres, catalog]
  )

  const addResourceToRsTracker = useCallback(
    async (resourceKey: string, label: string): Promise<AddBlueprintToCraftTrackerResult> => {
      const ore = catalog.length ? trackableOreForResource(label, catalog) : null
      if (!ore) {
        const error = catalog.length
          ? `${label} is not an RS-trackable ore.`
          : 'Mining data is still loading — try again.'
        setLastMessage(error)
        return { added: [], skipped: [], error }
      }

      const result = await addOres([ore], RESOURCE_PENDING_PREFIX + resourceKey)
      setLastMessage(
        result.added.length === 0
          ? `${label} is already on your RS Tracker.`
          : `Added ${label} to RS Tracker.`
      )
      return result
    },
    [addOres, catalog]
  )

  const addResourcesToRsTracker = useCallback(
    async (labels: string[], pendingKey: string): Promise<AddBlueprintToCraftTrackerResult> => {
      if (!catalog.length) {
        const error = 'Mining data is still loading — try again.'
        setLastMessage(error)
        return { added: [], skipped: [], error }
      }

      const byOre = new Map<string, BlueprintTrackableOre>()
      for (const label of labels) {
        const ore = trackableOreForResource(label, catalog)
        if (ore && !byOre.has(ore.oreName)) byOre.set(ore.oreName, ore)
      }
      if (byOre.size === 0) {
        const error = 'No RS-trackable ores here.'
        setLastMessage(error)
        return { added: [], skipped: [], error }
      }

      const result = await addOres([...byOre.values()], pendingKey)
      setLastMessage(
        result.added.length === 0
          ? 'Those ores are already on your RS Tracker.'
          : `Added ${result.added.length} ore${result.added.length === 1 ? '' : 's'} to RS Tracker.`
      )
      return result
    },
    [addOres, catalog]
  )

  const isPendingKey = useCallback((key: string) => pendingId === key, [pendingId])

  const isPendingForBlueprint = useCallback(
    (blueprintId: string) => pendingId === blueprintId,
    [pendingId]
  )

  const isPendingForResource = useCallback(
    (resourceKey: string) => pendingId === RESOURCE_PENDING_PREFIX + resourceKey,
    [pendingId]
  )

  const hasRsTrackableMaterials = useCallback(
    (blueprint: BlueprintWithSlots) =>
      catalog.length > 0 && blueprintHasRsTrackableOres(blueprint, catalog),
    [catalog]
  )

  const isRsTrackableResource = useCallback(
    (label: string) => catalog.length > 0 && trackableOreForResource(label, catalog) !== null,
    [catalog]
  )

  return {
    addMaterialsFromBlueprint,
    addResourceToRsTracker,
    addResourcesToRsTracker,
    isPendingKey,
    isPendingForBlueprint,
    isPendingForResource,
    hasRsTrackableMaterials,
    isRsTrackableResource,
    lastMessage,
    clearLastMessage: () => setLastMessage(null),
  }
}
