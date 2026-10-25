import gameShips from '../data/game-ships.json'
import shipShopShops from '../data/ship-shop-shops.json'
import shopItemIndex from '../data/shop-item-index.json'
import { getShipItem } from './shipItemCatalog'
import {
  SHOP_COMMODITIES,
  getCommodityTradeInfo,
  terminalPath,
  terminalPlace,
  type CommodityTradeResult,
  type ShopTerminal,
  type TradeLocation,
} from './shopLookup'

export const UEX_GROUPS = ['Guns', 'Ammo', 'Components', 'Armor', 'Ships', 'Commodities', 'Food', 'Drinks'] as const
export type UexGroup = (typeof UEX_GROUPS)[number]

export interface UexCatalogItem {
  id: string
  name: string
  group: UexGroup
  unit: 'scu' | 'each'
  buyAt: TradeLocation[]
  sellAt: TradeLocation[]
}

interface ShopListing {
  store: string
  price: number
  system?: string
  planet?: string
  moon?: string
  station?: string
  city?: string
  outpost?: string
}

interface ShopItemRow {
  id: string
  name: string
  group: UexGroup
  listings: ShopListing[]
}

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function blankTerminal(id: number, name: string, listing: ShopListing): ShopTerminal {
  return {
    id,
    name,
    nickname: null,
    code: null,
    system: listing.system || 'Other',
    planet: listing.planet || null,
    orbit: null,
    moon: listing.moon || null,
    station: listing.station || null,
    city: listing.city || null,
    outpost: listing.outpost || null,
    isRefinery: false,
    hasFreightElevator: false,
    hasLoadingDock: false,
  }
}

let placeSeq = 1

/** UEX names many personal-item terminals as a counter plus a short place, such as "Guns Checkmate". */
const COUNTER_PREFIXES = [
  'FPS Armor',
  'Weapons & Armor',
  'Tools & Supplies',
  'Filtered Water',
  'Coffee To Go',
  'Fried Grubs',
  'Feed The People',
  'Shelf Stable',
  'Cargo Services',
  'Ship Parts',
  'Hot Dogs',
  'Noodle Bar',
  'Near Beer',
  'Wake Up',
  'Gear Up',
  'Shooters',
  'Clothing',
  'Pharmacy',
  'Refinery',
  'Sundries',
  'Medical',
  'Convenience',
  'Burrito',
  'Noodles',
  'Noodle',
  'Cargo',
  'Juice',
  'Pizza',
  'Guns',
  'Shop',
  'Bar',
  'CZ',
]

function placeTitle(listing: ShopListing): string {
  return listing.station || listing.city || listing.outpost || listing.moon || listing.planet || listing.store
}

function shopLabel(listing: ShopListing): string {
  const store = listing.store
  const lower = store.toLowerCase()
  const counter = COUNTER_PREFIXES.some((prefix) => {
    const head = prefix.toLowerCase()
    return lower === head || lower.startsWith(`${head} `)
  })
  return counter ? placeTitle(listing) : store
}

function eachPlace(listing: ShopListing, usePlace: boolean): TradeLocation {
  const terminal = blankTerminal(placeSeq++, listing.store, listing)
  return {
    terminal,
    label: usePlace ? shopLabel(listing) : listing.store,
    pathLabel: terminalPath(terminal),
    unit: 'each',
    boxSizes: [],
    sellPricePerScu: null,
    buyPricePerScu: listing.price,
  }
}

function commodityGroup(kind: string | null): UexGroup {
  if (kind === 'Ammunition') return 'Ammo'
  if (kind === 'Food') return 'Food'
  return 'Commodities'
}

function commodityLocation(loc: TradeLocation): TradeLocation {
  return { ...loc, unit: 'scu', label: terminalPlace(loc.terminal) }
}

function fromListings(id: string, name: string, group: UexGroup, listings: ShopListing[], usePlace = false): UexCatalogItem | null {
  const buyAt = listings.filter((row) => row.price > 0).map((listing) => eachPlace(listing, usePlace))
  if (buyAt.length === 0 || !name) return null
  return { id, name, group, unit: 'each', buyAt, sellAt: [] }
}

function buildCatalog(): UexCatalogItem[] {
  const items: UexCatalogItem[] = []

  for (const commodity of SHOP_COMMODITIES) {
    const info = getCommodityTradeInfo(commodity.id)
    if (!info) continue
    const buyAt = info.buyAt.filter((loc) => (loc.buyPricePerScu || 0) > 0).map((loc) => commodityLocation(loc))
    const sellAt = info.sellAt.filter((loc) => (loc.sellPricePerScu || 0) > 0).map((loc) => commodityLocation(loc))
    if (buyAt.length === 0 && sellAt.length === 0) continue
    items.push({
      id: `commodity:${commodity.id}`,
      name: commodity.name,
      group: commodityGroup(commodity.kind),
      unit: 'scu',
      buyAt,
      sellAt,
    })
  }

  const ships = shipShopShops as unknown as { ships: Record<string, ShopListing[]>; items: Record<string, ShopListing[]> }
  const shipNames = new Map(
    ((gameShips as unknown as { ships: Array<{ id: string; displayName: string }> }).ships || []).map((ship) => [ship.id, ship.displayName]),
  )
  for (const [shipId, listings] of Object.entries(ships.ships || {})) {
    const row = fromListings(`ship:${shipId}`, shipNames.get(shipId) || '', 'Ships', listings)
    if (row) items.push(row)
  }
  for (const [entityClass, listings] of Object.entries(ships.items || {})) {
    const stats = getShipItem(entityClass)
    if (!stats?.displayName) continue
    const group: UexGroup = stats.kind === 'weapon'
      ? 'Guns'
      : stats.ordnance || stats.kind === 'missile'
        ? 'Ammo'
        : 'Components'
    const row = fromListings(`part:${entityClass}`, stats.displayName, group, listings)
    if (row) items.push(row)
  }

  for (const row of (shopItemIndex as unknown as { items: ShopItemRow[] }).items || []) {
    if (!UEX_GROUPS.includes(row.group)) continue
    const item = fromListings(`item:${row.id}`, row.name, row.group, row.listings, true)
    if (item) items.push(item)
  }

  items.sort((a, b) => a.name.localeCompare(b.name) || a.group.localeCompare(b.group))
  return items
}

export const UEX_CATALOG: UexCatalogItem[] = buildCatalog()

const byId = new Map(UEX_CATALOG.map((item) => [item.id, item]))
const byClass = new Map<string, UexCatalogItem>()
const byName = new Map<string, UexCatalogItem>()

for (const item of UEX_CATALOG) {
  if (item.id.startsWith('part:')) byClass.set(item.id.slice('part:'.length).toLowerCase(), item)
  const key = nameKey(item.name)
  const prev = byName.get(key)
  if (!prev || item.buyAt.length > prev.buyAt.length) byName.set(key, item)
}

export function uexItemById(id: string): UexCatalogItem | null {
  return byId.get(id) ?? null
}

/** A blueprint is for sale only when a shop listing has a buy price. */
export function shopItemForBlueprint(entityClass: string | null | undefined, displayName: string | null | undefined): UexCatalogItem | null {
  const byEntity = entityClass ? byClass.get(entityClass.toLowerCase()) : null
  const item = byEntity || (displayName ? byName.get(nameKey(displayName)) : null)
  if (!item || item.buyAt.length === 0) return null
  return item
}

export function tradeResultFor(item: UexCatalogItem): CommodityTradeResult {
  return {
    commodity: {
      id: 0,
      name: item.name,
      code: null,
      kind: item.group,
      isRefined: false,
      isRaw: false,
      isMineral: false,
      isHarvestable: false,
      isIllegal: false,
    },
    sellAt: item.sellAt,
    buyAt: item.buyAt,
  }
}
