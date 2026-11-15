/** Minimal loot row shape for blueprint ↔ Loot Finder chest lookup. */
export type LootLookupItem = {
  key: string
  locations: { locationTypeId: string; ratePct: number }[]
}

/**
 * Index loot rows by entity class. Crate loot wins over NPC-only (`npc:`) rows.
 * Only rows with at least one tracked location are indexed (chest must disappear
 * when a blueprint leaves every Loot Finder location after rebake).
 */
export function buildLootEntityIndex(items: LootLookupItem[]): Map<string, LootLookupItem> {
  const map = new Map<string, LootLookupItem>()
  for (const item of items) {
    if (!item?.locations?.length) continue
    if (item.key.startsWith('npc:')) {
      const bare = item.key.slice(4)
      if (!bare) continue
      if (!map.has(bare)) map.set(bare, item)
      if (bare.endsWith('_scitem')) {
        const stripped = bare.slice(0, -'_scitem'.length)
        if (stripped && !map.has(stripped)) map.set(stripped, item)
      } else if (!map.has(`${bare}_scitem`)) {
        map.set(`${bare}_scitem`, item)
      }
      continue
    }
    map.set(item.key, item)
    if (item.key.endsWith('_scitem')) {
      const stripped = item.key.slice(0, -'_scitem'.length)
      if (stripped) map.set(stripped, item)
    } else {
      map.set(`${item.key}_scitem`, item)
    }
  }
  return map
}

/** Resolve a blueprint entityClass to a loot row that still has at least one tracked location. */
export function lookupLootItemInIndex(
  index: Map<string, LootLookupItem>,
  entityClass?: string | null,
): LootLookupItem | null {
  const key = String(entityClass || '').trim()
  if (!key) return null
  const hit = index.get(key)
  if (hit?.locations?.length) return hit
  if (key.endsWith('_scitem')) {
    const stripped = key.slice(0, -'_scitem'.length)
    const alt = stripped ? index.get(stripped) : null
    if (alt?.locations?.length) return alt
  } else {
    const alt = index.get(`${key}_scitem`)
    if (alt?.locations?.length) return alt
  }
  return null
}

/** True when any tracked Loot Finder location lists this blueprint entity. */
export function blueprintHasLootLocations(
  index: Map<string, LootLookupItem>,
  entityClass?: string | null,
): boolean {
  return Boolean(lookupLootItemInIndex(index, entityClass)?.locations?.length)
}
