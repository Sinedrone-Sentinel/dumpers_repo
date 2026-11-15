/** Minimal loot row shape for blueprint ↔ Loot Finder chest lookup. */
export type LootLookupItem = {
  key: string
  /** Extra entity classes collapsed into this display-name row. */
  aliasKeys?: string[]
  locations: { locationTypeId: string; ratePct: number }[]
}

function indexEntityKey(map: Map<string, LootLookupItem>, key: string, item: LootLookupItem, allowOverwrite: boolean) {
  const raw = String(key || '').trim()
  if (!raw) return
  const bare = raw.startsWith('npc:') ? raw.slice(4) : raw
  if (!bare) return
  const write = (k: string) => {
    if (!k) return
    if (allowOverwrite || !map.has(k)) map.set(k, item)
  }
  write(bare)
  if (bare.endsWith('_scitem')) {
    write(bare.slice(0, -'_scitem'.length))
  } else {
    write(`${bare}_scitem`)
  }
}

/**
 * Index loot rows by entity class. Crate loot wins over NPC-only (`npc:`) rows.
 * Collapsed same-name rows register aliasKeys so every variant still finds the chest.
 * Only rows with at least one tracked location are indexed (chest must disappear
 * when a blueprint leaves every Loot Finder location after rebake).
 */
export function buildLootEntityIndex(items: LootLookupItem[]): Map<string, LootLookupItem> {
  const map = new Map<string, LootLookupItem>()
  // Pass 1: crate / non-npc rows (and their aliases).
  for (const item of items) {
    if (!item?.locations?.length) continue
    if (item.key.startsWith('npc:')) continue
    indexEntityKey(map, item.key, item, true)
    for (const alias of item.aliasKeys || []) {
      if (String(alias).startsWith('npc:')) continue
      indexEntityKey(map, alias, item, true)
    }
  }
  // Pass 2: NPC-only rows — fill gaps only.
  for (const item of items) {
    if (!item?.locations?.length) continue
    if (!item.key.startsWith('npc:')) continue
    indexEntityKey(map, item.key, item, false)
    for (const alias of item.aliasKeys || []) {
      indexEntityKey(map, alias, item, false)
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
