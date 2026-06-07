import type { ExtractedBlueprintResource } from '../lib/blueprintResources'

/** Salvage / crafting inputs not always present in blueprint JSON. */
export const EXTRA_CATALOG_RESOURCES: ExtractedBlueprintResource[] = [
  { resourceKey: 'rmc', label: 'RMC (Recycled Material Composite)' },
  { resourceKey: 'construction_material', label: 'Construction Material' },
]

export const EXTRA_CATALOG_RESOURCE_KEYS = new Set(
  EXTRA_CATALOG_RESOURCES.map((r) => r.resourceKey)
)

/** Salvage materials have no in-game quality tier — always Q0. */
export const SALVAGE_ORDER_MIN_QUALITY = 0

/** Strict allowlist — only explicit extra-catalog keys, never label heuristics. */
export const SALVAGE_RESOURCE_KEYS = EXTRA_CATALOG_RESOURCE_KEYS

export function isSalvageResource(resourceKey: string): boolean {
  return SALVAGE_RESOURCE_KEYS.has(resourceKey)
}
