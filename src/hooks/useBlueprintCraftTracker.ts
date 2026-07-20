import { useCallback, useMemo, useState } from 'react'
import { useMiningData } from './useArchiveData'
import { useMiningTracker } from './useMiningTracker'
import {
  blueprintHasRsTrackableOres,
  extractBlueprintTrackableOres,
  type AddBlueprintOresToRsTrackerResult,
} from '../lib/blueprintRsTracker'
import type { BlueprintWithSlots } from '../lib/blueprintResources'

export type AddBlueprintToCraftTrackerResult = AddBlueprintOresToRsTrackerResult & {
  error?: string
}

export function useBlueprintCraftTracker() {
  const { data: miningCatalog } = useMiningData()
  const { addEntry, isTracked } = useMiningTracker()
  const [pendingBlueprintId, setPendingBlueprintId] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  const catalog = useMemo(() => miningCatalog ?? [], [miningCatalog])

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

      setPendingBlueprintId(blueprintId)
      setLastMessage(null)

      const added: AddBlueprintOresToRsTrackerResult['added'] = []
      const skipped: AddBlueprintOresToRsTrackerResult['skipped'] = []

      try {
        for (const ore of ores) {
          for (const depositType of ore.depositTypes) {
            if (isTracked(ore.oreName, depositType)) {
              skipped.push({ oreName: ore.oreName, depositType })
              continue
            }

            const ok = await addEntry(ore.oreName, ore.rarity, {
              depositType,
              profileMode: 'overall',
            })
            if (ok) {
              added.push({ oreName: ore.oreName, depositType })
            }
          }
        }

        const message =
          added.length === 0
            ? 'Those ores are already on your RS Tracker.'
            : `Added ${added.length} ore entr${added.length === 1 ? 'y' : 'ies'} to RS Tracker.`
        setLastMessage(message)
        return { added, skipped }
      } finally {
        setPendingBlueprintId(null)
      }
    },
    [addEntry, catalog, isTracked]
  )

  const isPendingForBlueprint = useCallback(
    (blueprintId: string) => pendingBlueprintId === blueprintId,
    [pendingBlueprintId]
  )

  const hasRsTrackableMaterials = useCallback(
    (blueprint: BlueprintWithSlots) =>
      catalog.length > 0 && blueprintHasRsTrackableOres(blueprint, catalog),
    [catalog]
  )

  return {
    addMaterialsFromBlueprint,
    isPendingForBlueprint,
    hasRsTrackableMaterials,
    lastMessage,
    clearLastMessage: () => setLastMessage(null),
  }
}
