import siteLootData from '../data/game-site-loot.json'
import type { BlueprintDisplayTag, BlueprintTagKind } from './blueprintTaxonomy'
import {
  blueprintHasLootLocations as blueprintHasLootLocationsInIndex,
  buildLootEntityIndex,
  lookupLootItemInIndex,
} from './lootBlueprintLookup'

export type SiteLootKind =
  | 'fps_weapon'
  | 'ship_weapon'
  | 'ship_component'
  | 'armour'
  | 'clothing'
  | 'npc_gear'
  | 'plushie'
  | 'consumable'

export type SiteLootLocationType = {
  id: string
  label: string
  /** Shared pool family when several named sites use the same loot table (olp / paf / contested_zone). */
  group?: string | null
  groupLabel?: string | null
  systems: string[]
  poolId: string
}

export type SiteLootLocationHit = {
  locationTypeId: string
  ratePct: number
}

export type SiteLootItem = {
  key: string
  /** Extra entity classes merged into this exact display-name row. */
  aliasKeys?: string[]
  displayName: string
  kind: SiteLootKind | string
  kindLabel: string
  stats?: Record<string, unknown>
  locations: SiteLootLocationHit[]
}

export type SiteLootLocationItem = {
  key: string
  displayName: string
  kind: SiteLootKind | string
  kindLabel: string
  ratePct: number
  stats?: Record<string, unknown>
}

type SiteLootFile = {
  _extracted?: string
  locationTypes: SiteLootLocationType[]
  items: SiteLootItem[]
  byLocation: Record<string, SiteLootLocationItem[]>
  summary?: { itemCount?: number; locationTypeCount?: number }
}

const data = siteLootData as SiteLootFile

export const SITE_LOOT_LOCATION_TYPES = data.locationTypes
export const SITE_LOOT_ITEMS = data.items
export const SITE_LOOT_BY_LOCATION = data.byLocation
export const SITE_LOOT_EXTRACTED = data._extracted ?? null
export const SITE_LOOT_ITEM_COUNT = data.summary?.itemCount ?? data.items.length

export const RATE_TOOLTIP =
  'Relative chance within this site loot pool from game weights — not a guarantee for any one visit.'

/** Stable chip order for By location. Every baked item maps to one of these (or Other). */
export const SITE_LOOT_KIND_CHIPS = [
  { id: 'fps_weapon', label: 'FPS Weapons' },
  { id: 'ship_weapon', label: 'Ship Weapons' },
  { id: 'ship_component', label: 'Ship Components' },
  { id: 'armour', label: 'Armour' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'npc_gear', label: 'NPC Gear' },
  { id: 'plushie', label: 'Plushies' },
  { id: 'consumable', label: 'Consumables' },
  { id: 'other', label: 'Other' },
] as const

export type SiteLootKindChipId = (typeof SITE_LOOT_KIND_CHIPS)[number]['id']

const KIND_CHIP_IDS = new Set<string>(SITE_LOOT_KIND_CHIPS.map((chip) => chip.id))

export function formatRatePct(ratePct: number): string {
  if (ratePct >= 10) return `${ratePct.toFixed(1)}%`
  if (ratePct >= 1) return `${ratePct.toFixed(2)}%`
  if (ratePct >= 0.1) return `${ratePct.toFixed(2)}%`
  return `${ratePct.toFixed(3)}%`
}

export function locationTypeById(id: string): SiteLootLocationType | undefined {
  return SITE_LOOT_LOCATION_TYPES.find((loc) => loc.id === id)
}

export function systemsLabel(loc: SiteLootLocationType | undefined): string {
  if (!loc?.systems?.length) return ''
  return loc.systems.join(', ')
}

/** Select options: ungrouped sites first, then optgroups for OLP / PAF / Contested Zone. */
export function locationSelectGroups(): {
  ungrouped: SiteLootLocationType[]
  groups: { key: string; label: string; locations: SiteLootLocationType[] }[]
} {
  const ungrouped: SiteLootLocationType[] = []
  const byGroup = new Map<string, { label: string; locations: SiteLootLocationType[] }>()
  for (const loc of SITE_LOOT_LOCATION_TYPES) {
    if (!loc.group) {
      ungrouped.push(loc)
      continue
    }
    let entry = byGroup.get(loc.group)
    if (!entry) {
      entry = { label: loc.groupLabel || loc.group, locations: [] }
      byGroup.set(loc.group, entry)
    }
    entry.locations.push(loc)
  }
  const groupOrder = ['contested_zone']
  const groups = [
    ...groupOrder.filter((key) => byGroup.has(key)).map((key) => ({ key, ...byGroup.get(key)! })),
    ...[...byGroup.entries()]
      .filter(([key]) => !groupOrder.includes(key))
      .map(([key, value]) => ({ key, ...value })),
  ]
  return { ungrouped, groups }
}

/** BP-style chips from baked loot stats (Size / damage type / class / grade / slot). */
export function lootStatChips(stats?: Record<string, unknown> | null): BlueprintDisplayTag[] {
  if (!stats) return []
  const tags: BlueprintDisplayTag[] = []
  const push = (kind: BlueprintTagKind, label: string | number | null | undefined) => {
    if (label == null || label === '') return
    const text = String(label).trim()
    if (!text) return
    tags.push({ kind, label: text })
  }
  if (stats.size != null && stats.size !== '') push('size', `S${stats.size}`)
  push('subtype', typeof stats.damageType === 'string' ? stats.damageType : null)
  push('subtype', typeof stats.weaponClass === 'string' ? stats.weaponClass : null)
  push('subtype', typeof stats.weaponType === 'string' ? stats.weaponType : null)
  push('category', typeof stats.componentType === 'string' ? stats.componentType : null)
  push('itemClass', typeof stats.itemClass === 'string' ? stats.itemClass : null)
  push('grade', stats.grade != null && stats.grade !== '' ? String(stats.grade) : null)
  push('armorSlot', typeof stats.slot === 'string' ? stats.slot : null)
  push('garment', typeof stats.wornAs === 'string' ? `Worn ${stats.wornAs}` : null)
  push('subtype', typeof stats.consumableType === 'string' ? stats.consumableType : null)
  return tags
}

const lootByEntityClass = buildLootEntityIndex(SITE_LOOT_ITEMS)

/**
 * Loot Finder row for a blueprint entity class (crate loot preferred over NPC-only).
 * Returns null when the item is not in any tracked location — that is when the
 * gold chest must not render on Blueprint cards / details.
 */
export function lootItemForEntityClass(entityClass?: string | null): SiteLootItem | null {
  return lookupLootItemInIndex(lootByEntityClass, entityClass) as SiteLootItem | null
}

/** True when this blueprint entity appears in at least one tracked Loot Finder location. */
export function blueprintHasLootLocations(entityClass?: string | null): boolean {
  return blueprintHasLootLocationsInIndex(lootByEntityClass, entityClass)
}

/** Every item gets exactly one chip id so no row is orphaned behind All. */
export function kindChipForItem(item: { kind?: string | null }): SiteLootKindChipId {
  const kind = String(item.kind || '').trim()
  if (KIND_CHIP_IDS.has(kind) && kind !== 'other') return kind as SiteLootKindChipId
  return 'other'
}

export function kindChipsForItems(items: SiteLootLocationItem[]): { id: SiteLootKindChipId; label: string }[] {
  const present = new Set(items.map((item) => kindChipForItem(item)))
  return SITE_LOOT_KIND_CHIPS.filter((chip) => present.has(chip.id)).map((chip) => ({
    id: chip.id,
    label: chip.label,
  }))
}

export function filterItemsByQuery(query: string, limit = 40): SiteLootItem[] {
  const term = query.trim().toLowerCase()
  if (!term) return SITE_LOOT_ITEMS.slice(0, limit)
  const starts: SiteLootItem[] = []
  const contains: SiteLootItem[] = []
  for (const item of SITE_LOOT_ITEMS) {
    const name = item.displayName.toLowerCase()
    if (name.startsWith(term)) starts.push(item)
    else if (name.includes(term) || item.kindLabel.toLowerCase().includes(term)) contains.push(item)
    if (starts.length + contains.length >= limit * 3) break
  }
  return [...starts, ...contains].slice(0, limit)
}
