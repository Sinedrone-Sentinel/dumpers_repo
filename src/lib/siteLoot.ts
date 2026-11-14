import siteLootData from '../data/game-site-loot.json'

export type SiteLootKind =
  | 'fps_weapon'
  | 'ship_weapon'
  | 'ship_component'
  | 'armour'
  | 'plushie'
  | 'consumable'

export type SiteLootLocationType = {
  id: string
  label: string
  systems: string[]
  poolId: string
}

export type SiteLootLocationHit = {
  locationTypeId: string
  ratePct: number
}

export type SiteLootItem = {
  key: string
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
