import gameCommoditiesData from '../data/game-commodities.json'
import type { ExtractedBlueprintResource } from '../lib/blueprintResources'

/**
 * Cargo commodities from game files (resourcetypedatabase) that are neither
 * blueprint materials nor in EXTRA_CATALOG_RESOURCES. Regenerated each patch by
 * scripts/parse-extracted-data.mjs.
 */
export type GameCommodityKind =
  | 'supplies'
  | 'vice'
  | 'food'
  | 'gas'
  | 'organic'
  | 'mineral'
  | 'goods'

interface GameCommodity {
  key: string
  label: string
  kind: string
}

const commodities = (gameCommoditiesData.commodities ?? []) as GameCommodity[]

export const GAME_COMMODITY_RESOURCES: ExtractedBlueprintResource[] = commodities.map((c) => ({
  resourceKey: c.key,
  label: c.label,
}))

export const GAME_COMMODITY_RESOURCE_KEYS = new Set(commodities.map((c) => c.key))

const kindByKey = new Map(commodities.map((c) => [c.key, c.kind as GameCommodityKind]))

export function gameCommodityKind(resourceKey: string): GameCommodityKind | null {
  return kindByKey.get(resourceKey) ?? null
}

/** Mined minerals keep quality bands; every other hauled good is Q0 only. */
export function isNoQualityGameCommodity(resourceKey: string): boolean {
  const kind = kindByKey.get(resourceKey)
  return kind != null && kind !== 'mineral'
}
