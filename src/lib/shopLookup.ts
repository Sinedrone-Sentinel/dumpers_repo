import shopIndex from '../data/shop-commodity-index.json'

/**
 * Commodity buy/sell location lookup — Powered by UEX.
 *
 * Data is baked from the UEX API by `scripts/fetch-shop-commodity-data.mjs`
 * (`npm run fetch-shop-data`). This module turns the compact index into typed,
 * queryable structures shared by the Commodity Lookup page and the resource
 * lookup modal.
 *
 * UEX semantics (player perspective):
 *   - a terminal where you can SELL a commodity  = the terminal buys it from you
 *   - a terminal where you can BUY a commodity   = the terminal sells it to you
 */

export interface ShopCommodity {
  id: number
  name: string
  code: string | null
  kind: string | null
  isRefined: boolean
  isRaw: boolean
  isMineral: boolean
  isHarvestable: boolean
  isIllegal: boolean
}

export interface ShopTerminal {
  id: number
  name: string
  nickname: string | null
  code: string | null
  system: string | null
  planet: string | null
  orbit: string | null
  moon: string | null
  station: string | null
  city: string | null
  outpost: string | null
  isRefinery: boolean
  hasFreightElevator: boolean
  hasLoadingDock: boolean
}

export interface ShopListing {
  c: number
  t: number
  buy: boolean
  sell: boolean
  box: string | null
  /** aUEC/SCU when the player sells here (UEX price_sell). */
  ps?: number
  /** aUEC/SCU when the player buys here (UEX price_buy). */
  pb?: number
}

export interface ShopIndexMeta {
  generatedAt: string
  source: string
  sourceUrl: string
  attribution: string
  commodityCount: number
  terminalCount: number
  listingCount: number
}

/** A resolved place to trade one commodity. */
export interface TradeLocation {
  terminal: ShopTerminal
  /** SCU box (container) sizes offered, e.g. [1, 2, 4, 8, 16, 24, 32]. */
  boxSizes: number[]
  /** aUEC per SCU when the player sells here. */
  sellPricePerScu: number | null
  /** aUEC per SCU when the player buys here. */
  buyPricePerScu: number | null
}

export interface CommodityTradeResult {
  commodity: ShopCommodity
  /** Terminals where the player can SELL this commodity (turn ore into aUEC). */
  sellAt: TradeLocation[]
  /** Terminals where the player can BUY this commodity. */
  buyAt: TradeLocation[]
}

const raw = shopIndex as unknown as ShopIndexMeta & {
  commodities: ShopCommodity[]
  terminals: ShopTerminal[]
  listings: ShopListing[]
}

export const SHOP_INDEX_META: ShopIndexMeta = {
  generatedAt: raw.generatedAt,
  source: raw.source,
  sourceUrl: raw.sourceUrl,
  attribution: raw.attribution,
  commodityCount: raw.commodityCount,
  terminalCount: raw.terminalCount,
  listingCount: raw.listingCount,
}

export const SHOP_COMMODITIES: ShopCommodity[] = raw.commodities
export const SHOP_TERMINALS: ShopTerminal[] = raw.terminals

const terminalById = new Map<number, ShopTerminal>(raw.terminals.map((t) => [t.id, t]))
const listingsByCommodity = new Map<number, ShopListing[]>()
for (const l of raw.listings) {
  const arr = listingsByCommodity.get(l.c)
  if (arr) arr.push(l)
  else listingsByCommodity.set(l.c, [l])
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const commodityByNormalizedName = new Map<string, ShopCommodity>()
for (const c of raw.commodities) {
  const key = normalize(c.name)
  if (!commodityByNormalizedName.has(key)) commodityByNormalizedName.set(key, c)
}

function parseBoxSizes(box: string | null): number[] {
  if (!box) return []
  return box
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

/** Most specific place name for a terminal (outpost > station > city > moon > planet). */
export function terminalPlace(t: ShopTerminal): string {
  return t.outpost || t.station || t.city || t.moon || t.planet || t.orbit || t.system || t.name
}

/** Full location breadcrumb, e.g. "Stanton › ArcCorp › Wala › ArcCorp Mining Area 045". */
export function terminalPath(t: ShopTerminal): string {
  const parts = [t.system, t.planet, t.moon || t.orbit, t.city || t.outpost || t.station]
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    if (seen.has(part)) continue
    seen.add(part)
    out.push(part)
  }
  return out.join(' › ')
}

/** Format UEX per-SCU price for display. */
export function formatShopPricePerScu(price: number | null | undefined): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null
  return `${Math.round(price).toLocaleString()} aUEC/SCU`
}

export function getCommodityTradeInfo(commodityId: number): CommodityTradeResult | null {
  const commodity = raw.commodities.find((c) => c.id === commodityId)
  if (!commodity) return null
  const listings = listingsByCommodity.get(commodityId) ?? []
  const sellAt: TradeLocation[] = []
  const buyAt: TradeLocation[] = []
  for (const l of listings) {
    const terminal = terminalById.get(l.t)
    if (!terminal) continue
    const location: TradeLocation = {
      terminal,
      boxSizes: parseBoxSizes(l.box),
      sellPricePerScu: l.ps ?? null,
      buyPricePerScu: l.pb ?? null,
    }
    if (l.sell) sellAt.push(location)
    if (l.buy) buyAt.push(location)
  }
  const sortByPlace = (a: TradeLocation, b: TradeLocation) =>
    terminalPath(a.terminal).localeCompare(terminalPath(b.terminal))
  sellAt.sort(sortByPlace)
  buyAt.sort(sortByPlace)
  return { commodity, sellAt, buyAt }
}

/** Find a commodity by fuzzy name (used by the resource lookup modal). */
export function findCommodityByName(name: string): ShopCommodity | null {
  if (!name) return null
  const key = normalize(name)
  const exact = commodityByNormalizedName.get(key)
  if (exact) return exact
  // Try "Laranite (Ore)" -> "Laranite", and refined/raw suffix variants.
  const stripped = normalize(name.replace(/\((ore|raw|refined)\)/gi, ''))
  if (stripped && commodityByNormalizedName.has(stripped)) {
    return commodityByNormalizedName.get(stripped) ?? null
  }
  // Fall back to a contains match on either side.
  for (const c of raw.commodities) {
    const cn = normalize(c.name)
    if (cn === stripped || cn.includes(key) || key.includes(cn)) return c
  }
  return null
}

/** Distinct commodity "kind" values present in the index, sorted. */
export function getCommodityKinds(): string[] {
  const kinds = new Set<string>()
  for (const c of raw.commodities) if (c.kind) kinds.add(c.kind)
  return [...kinds].sort()
}
