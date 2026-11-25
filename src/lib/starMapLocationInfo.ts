import miningLocations from '../data/game-mining-locations.json'
import caveData from '../data/game-caves.json'
import shopIndex from '../data/shop-commodity-index.json'
import shopItems from '../data/shop-item-index.json'
import shipShops from '../data/ship-shop-shops.json'
import {
  ORB_KINDS,
  starMapJumpDestination,
  type StarMapEnvironment,
  type StarMapMarker,
  type StarMapSystems,
} from './starMap'
import { matchMarkers, normalizeMapName, resolveShopMarker } from './starMapHighlight'

export type ServiceGroup = 'Medical' | 'Ships' | 'Trade' | 'Shopping'

export interface ServiceBlock {
  /** Place on this body that is not on the map. Unset for the marker itself. */
  place: string | null
  groups: { group: ServiceGroup; items: string[] }[]
}

export interface TradePlace {
  place: string | null
  buy: string[]
  sell: string[]
  refinery: boolean
}

export interface ShopPlace {
  place: string | null
  store: string
  kinds: string[]
}

export interface OreChip {
  name: string
  rarity: string | null
}

export interface GemChip {
  name: string
  habitat: 'surface' | 'caves' | 'both' | null
}

export interface HarvestChip {
  name: string
  caves: boolean
}

export interface StarMapLocationInfo {
  description: string | null
  facts: { label: string; value: string }[]
  environment: StarMapEnvironment | null
  services: ServiceBlock[]
  trade: TradePlace[]
  shops: ShopPlace[]
  ship: OreChip[]
  ground: OreChip[]
  hand: GemChip[]
  harvestables: HarvestChip[]
  creatures: string[]
  caves: { total: number; occupied: number; biomes: { label: string; count: number }[] } | null
}

const SERVICE_GROUP: Record<string, ServiceGroup> = {
  Hospital: 'Medical',
  Clinic: 'Medical',
  Docking: 'Ships',
  Garage: 'Ships',
  'Vehicle Services': 'Ships',
  Refinery: 'Trade',
  'Commodity Trading': 'Trade',
  'Loading Dock': 'Trade',
}

function serviceGroup(label: string): ServiceGroup {
  if (SERVICE_GROUP[label]) return SERVICE_GROUP[label]
  if (/^(Hangar|Landing Pad)/.test(label)) return 'Ships'
  return 'Shopping'
}

const GROUP_ORDER: ServiceGroup[] = ['Medical', 'Ships', 'Trade', 'Shopping']

export function groupServices(amenities: readonly string[]): { group: ServiceGroup; items: string[] }[] {
  const by = new Map<ServiceGroup, string[]>()
  for (const label of amenities) {
    const group = serviceGroup(label)
    const list = by.get(group) || []
    if (!list.includes(label)) list.push(label)
    by.set(group, list)
  }
  return GROUP_ORDER.filter((g) => by.has(g)).map((group) => ({ group, items: by.get(group)! }))
}

// ── Place → marker ─────────────────────────────────────────────────────────

interface PlaceFields {
  system?: string | null
  planet?: string | null
  moon?: string | null
  orbit?: string | null
  station?: string | null
  city?: string | null
  outpost?: string | null
}

function gatewayMarker(name: string, systemId: string, systems: StarMapSystems): StarMapMarker | null {
  const dest = name.match(/^(\w+)\s+Gateway\b/i)?.[1]?.toLowerCase()
  if (!dest) return null
  return systems[systemId]?.markers.find((m) => m.kind === 'jump_point' && starMapJumpDestination(m) === dest) ?? null
}

/** UEX station names that differ from the in-game map name. */
const UEX_STATION_NAMES: Record<string, string> = {
  'green imperial housing exchange': 'Grim HEX',
}

function stationNames(name: string): string[] {
  const out = [UEX_STATION_NAMES[name.toLowerCase()] || name]
  const bare = out[0].replace(/\s+station$/i, '')
  if (bare !== out[0]) out.push(bare)
  return out
}

/** Map marker a UEX place sits on, and the place label when that place is not the marker itself. */
export function placeOnMap(fields: PlaceFields, systems: StarMapSystems): { marker: StarMapMarker; place: string } | null {
  const systemId = String(fields.system || '').toLowerCase()
  if (!systems[systemId]) return null
  const tries = [fields.station, fields.outpost, fields.city, fields.moon, fields.planet]
    .map((v) => String(v || '').replace(/\s*\([^)]*\)\s*$/, '').trim())
    .filter(Boolean)
  const label = tries[0] ? stationNames(tries[0])[0] : ''
  for (const name of tries.flatMap(stationNames)) {
    const gate = gatewayMarker(name, systemId, systems)
    const marker = gate || resolveShopMarker(name, systems)
    if (marker && marker.systemId === systemId) return { marker, place: label }
  }
  return null
}

function sameName(marker: StarMapMarker, place: string): boolean {
  if (marker.kind === 'jump_point' && /gateway/i.test(place)) return true
  const keys = new Set(stationNames(place).map(normalizeMapName))
  return [marker.name, ...(marker.aliases || [])].some((label) => keys.has(normalizeMapName(label)))
}

// ── Indexes (built once per map data) ──────────────────────────────────────

interface Indexes {
  trade: Map<string, TradePlace[]>
  shops: Map<string, ShopPlace[]>
  guide: Map<string, string[]>
}

const cache = new WeakMap<StarMapSystems, Indexes>()

interface RawTerminal extends PlaceFields {
  id: number
  isRefinery: boolean
}

interface RawShopListing extends PlaceFields {
  store: string
}

function buildTrade(systems: StarMapSystems): Map<string, TradePlace[]> {
  const raw = shopIndex as unknown as {
    commodities: { id: number; name: string }[]
    terminals: RawTerminal[]
    listings: { c: number; t: number; buy: boolean; sell: boolean }[]
  }
  const names = new Map(raw.commodities.map((c) => [c.id, c.name]))
  const byTerminal = new Map<number, { buy: Set<string>; sell: Set<string> }>()
  for (const l of raw.listings) {
    const name = names.get(l.c)
    if (!name) continue
    const row = byTerminal.get(l.t) || { buy: new Set<string>(), sell: new Set<string>() }
    if (l.buy) row.buy.add(name)
    if (l.sell) row.sell.add(name)
    byTerminal.set(l.t, row)
  }
  const out = new Map<string, Map<string, TradePlace>>()
  for (const t of raw.terminals) {
    const hit = placeOnMap(t, systems)
    const lists = byTerminal.get(t.id)
    if (!hit || (!lists && !t.isRefinery)) continue
    const place = sameName(hit.marker, hit.place) ? null : hit.place
    const at = out.get(hit.marker.id) || new Map<string, TradePlace>()
    const row = at.get(place || '') || { place, buy: [], sell: [], refinery: false }
    row.buy = [...new Set([...row.buy, ...(lists?.buy || [])])]
    row.sell = [...new Set([...row.sell, ...(lists?.sell || [])])]
    row.refinery = row.refinery || t.isRefinery
    at.set(place || '', row)
    out.set(hit.marker.id, at)
  }
  const final = new Map<string, TradePlace[]>()
  for (const [id, at] of out) {
    final.set(
      id,
      [...at.values()]
        .map((row) => ({ ...row, buy: row.buy.sort(), sell: row.sell.sort() }))
        .sort((a, b) => (a.place ? 1 : 0) - (b.place ? 1 : 0) || String(a.place).localeCompare(String(b.place))),
    )
  }
  return final
}

function buildShops(systems: StarMapSystems): Map<string, ShopPlace[]> {
  const stores = new Map<string, { fields: RawShopListing; kinds: Set<string> }>()
  const add = (listing: RawShopListing, kind: string) => {
    if (!listing?.store) return
    const key = `${listing.system || ''}|${listing.store}`
    const row = stores.get(key) || { fields: listing, kinds: new Set<string>() }
    row.kinds.add(kind)
    stores.set(key, row)
  }
  for (const item of (shopItems as unknown as { items: { group: string; listings: RawShopListing[] }[] }).items) {
    for (const listing of item.listings || []) add(listing, item.group)
  }
  const ships = shipShops as unknown as { ships?: Record<string, RawShopListing[]>; items?: Record<string, RawShopListing[]> }
  for (const rows of Object.values(ships.ships || {})) for (const listing of rows) add(listing, 'Ships')
  for (const rows of Object.values(ships.items || {})) for (const listing of rows) add(listing, 'Ship Components')

  const out = new Map<string, ShopPlace[]>()
  for (const { fields, kinds } of stores.values()) {
    const hit = placeOnMap(fields, systems)
    if (!hit) continue
    const list = out.get(hit.marker.id) || []
    list.push({ place: sameName(hit.marker, hit.place) ? null : hit.place, store: fields.store, kinds: [...kinds].sort() })
    out.set(hit.marker.id, list)
  }
  for (const list of out.values()) {
    list.sort((a, b) => String(a.place || '').localeCompare(String(b.place || '')) || a.store.localeCompare(b.store))
  }
  return out
}

type Mineables = {
  shipMineables?: string[]
  groundVehicleMineables?: string[]
  handMineables?: string[]
  harvestables?: string[]
  creatures?: string[]
}

const MINING = miningLocations as unknown as {
  locationOres: Record<string, { name: string; rarity: string }[]>
  locationMineables: Record<string, Mineables>
  handMineableHabitats: Record<string, Record<string, 'surface' | 'caves' | 'both'>>
  locationAliases?: Record<string, { system?: string }>
  redundantSubsiteGuideLocations?: string[]
}

/** Guide names that cover every body in a system. They say nothing about one place. */
const BROAD_GUIDE = /^(all |found in all )/i

function buildGuide(systems: StarMapSystems): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const skip = new Set(MINING.redundantSubsiteGuideLocations || [])
  for (const key of Object.keys(MINING.locationMineables)) {
    if (skip.has(key) || BROAD_GUIDE.test(key)) continue
    const system = MINING.locationAliases?.[key]?.system?.toLowerCase()
    for (const marker of matchMarkers(key, systems)) {
      if (system && marker.systemId !== system && !/^lagrange (g|occupied)$/i.test(key)) continue
      const list = out.get(marker.id) || []
      if (!list.includes(key)) list.push(key)
      out.set(marker.id, list)
    }
  }
  return out
}

function indexes(systems: StarMapSystems): Indexes {
  let hit = cache.get(systems)
  if (!hit) {
    hit = { trade: buildTrade(systems), shops: buildShops(systems), guide: buildGuide(systems) }
    cache.set(systems, hit)
  }
  return hit
}

// ── Builder ────────────────────────────────────────────────────────────────

const RARITY_RANK: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 }

function uniq<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const k = key(row)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function formatKm(m: number): string {
  const km = m / 1000
  return `${km >= 100 ? Math.round(km).toLocaleString() : km.toFixed(1)} km`
}

export function buildLocationInfo(marker: StarMapMarker, systems: StarMapSystems): StarMapLocationInfo {
  const idx = indexes(systems)
  const sys = systems[marker.systemId]
  const parent = marker.parentName ? sys?.markers.find((m) => m.name === marker.parentName && ORB_KINDS.has(m.kind)) : undefined

  const facts: { label: string; value: string }[] = []
  if (marker.radiusM && ORB_KINDS.has(marker.kind)) facts.push({ label: 'Diameter', value: formatKm(marker.radiusM * 2) })
  if (marker.kind === 'belt' && marker.innerRadiusM && marker.outerRadiusM) {
    facts.push({ label: 'Width', value: formatKm(marker.outerRadiusM - marker.innerRadiusM) })
  }
  if (marker.parentName) facts.push({ label: marker.kind === 'belt' ? 'Around' : 'Orbits', value: marker.parentName })
  const moons = sys?.markers.filter((m) => m.kind === 'moon' && m.parentName === marker.name).map((m) => m.name) || []
  if (marker.kind === 'planet' && moons.length) facts.push({ label: 'Moons', value: moons.join(', ') })
  const jurisdiction = marker.jurisdiction || parent?.jurisdiction
  if (jurisdiction) facts.push({ label: 'Jurisdiction', value: jurisdiction })

  const services: ServiceBlock[] = []
  if (marker.amenities?.length) services.push({ place: null, groups: groupServices(marker.amenities) })
  for (const row of marker.services || []) services.push({ place: row.place, groups: groupServices(row.amenities) })

  const ship: OreChip[] = []
  const ground: OreChip[] = []
  const hand: GemChip[] = []
  const harvestables: HarvestChip[] = []
  const creatures: string[] = []
  const caveOnly = new Set((marker.caveOnly || []).map((n) => n.toLowerCase()))
  for (const key of idx.guide.get(marker.id) || []) {
    const rows = MINING.locationMineables[key] || {}
    const rarity = new Map((MINING.locationOres[key] || []).map((o) => [o.name, o.rarity]))
    for (const name of rows.shipMineables || []) ship.push({ name, rarity: rarity.get(name) ?? null })
    for (const name of rows.groundVehicleMineables || []) ground.push({ name, rarity: rarity.get(name) ?? null })
    for (const name of rows.handMineables || []) {
      const habitat = MINING.handMineableHabitats[name]?.[key] ?? (caveOnly.has(name.toLowerCase()) ? 'caves' : null)
      hand.push({ name, habitat })
    }
    for (const name of rows.harvestables || []) harvestables.push({ name, caves: caveOnly.has(name.toLowerCase()) })
    for (const name of rows.creatures || []) creatures.push(name.trim())
  }
  const byRarity = (a: OreChip, b: OreChip) =>
    (RARITY_RANK[a.rarity || ''] ?? 9) - (RARITY_RANK[b.rarity || ''] ?? 9) || a.name.localeCompare(b.name)

  const bodies = (caveData as unknown as { bodies: { id: string; name: string; systemId: string }[] }).bodies
  const caveRows = (caveData as unknown as { caves: { bodyId: string; biome: string; occupied: boolean }[] }).caves
  const body = ORB_KINDS.has(marker.kind)
    ? bodies.find((b) => b.systemId === marker.systemId && b.name.toLowerCase() === marker.name.toLowerCase())
    : undefined
  let caves: StarMapLocationInfo['caves'] = null
  if (body) {
    const here = caveRows.filter((c) => c.bodyId === body.id)
    if (here.length) {
      const biomes = new Map<string, number>()
      for (const c of here) {
        const label = c.biome ? c.biome.charAt(0).toUpperCase() + c.biome.slice(1) : 'Other'
        biomes.set(label, (biomes.get(label) || 0) + 1)
      }
      caves = {
        total: here.length,
        occupied: here.filter((c) => c.occupied).length,
        biomes: [...biomes].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      }
    }
  }

  return {
    description: marker.description?.trim() || null,
    facts,
    environment: marker.environment ?? null,
    services,
    trade: idx.trade.get(marker.id) || [],
    shops: idx.shops.get(marker.id) || [],
    ship: uniq(ship, (o) => o.name).sort(byRarity),
    ground: uniq(ground, (o) => o.name).sort(byRarity),
    hand: uniq(hand, (o) => o.name).sort((a, b) => a.name.localeCompare(b.name)),
    harvestables: uniq(harvestables, (o) => o.name).sort((a, b) => a.name.localeCompare(b.name)),
    creatures: [...new Set(creatures)].sort(),
    caves,
  }
}
