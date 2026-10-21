import shopIndex from '../data/ship-shop-shops.json'

export interface ShopListing {
  system?: string | null
  planet?: string | null
  moon?: string | null
  station?: string | null
  city?: string | null
  outpost?: string | null
  store: string
  price: number
}

interface ShopIndex {
  attribution?: string
  ships?: Record<string, ShopListing[]>
  items?: Record<string, ShopListing[]>
}

const index = shopIndex as ShopIndex

export const SHOP_ATTRIBUTION = index.attribution || 'Powered by UEX'

export function shipListings(shipId: string | null | undefined): ShopListing[] {
  if (!shipId) return []
  return index.ships?.[shipId] || []
}

export function partListings(entityClass: string | null | undefined): ShopListing[] {
  if (!entityClass) return []
  return index.items?.[entityClass] || []
}

export function listingsFor(kind: 'ship' | 'part', id: string): ShopListing[] {
  return kind === 'ship' ? shipListings(id) : partListings(id)
}

export function isForSale(listings: ShopListing[]): boolean {
  return listings.some((row) => row.price > 0)
}

function carriesPdcTag(tags: string | null | undefined, requiredTags: string | null | undefined): boolean {
  return /\bpdc\b/i.test(`${tags || ''} ${requiredTags || ''}`)
}

/** An unsold point-defense part has no shop to open. Sold parts, including a PDC gun that is sold, still do. */
export function showPartWhereToBuy(item: { entityClass: string; tags?: string | null; requiredTags?: string | null }): boolean {
  if (isForSale(partListings(item.entityClass))) return true
  return !carriesPdcTag(item.tags, item.requiredTags)
}

export function placeName(listing: ShopListing): string {
  return listing.station || listing.city || listing.outpost || listing.moon || listing.planet || 'Unknown'
}

export function placeKey(listing: ShopListing): string {
  return `${listing.system || ''}|${placeName(listing)}`
}

export function placeLabel(listing: ShopListing): string {
  const place = placeName(listing)
  return listing.system ? `${listing.system} — ${place}` : place
}

/** Stanton, Crusader, Orison, Crusader Showroom. The planet is included when the stop is not the planet itself. */
export function locationLine(listing: ShopListing): string {
  const place = placeName(listing)
  const parts: string[] = []
  if (listing.system) parts.push(listing.system)
  if (listing.planet && listing.planet !== place) parts.push(listing.planet)
  if (listing.moon && listing.moon !== place && listing.moon !== listing.planet) parts.push(listing.moon)
  if (!parts.includes(place)) parts.push(place)
  if (listing.store && listing.store !== place) parts.push(listing.store)
  return parts.join(', ')
}

export interface CartPlanLine {
  name: string
  qty: number
  listings: ShopListing[]
}

export interface PlannedPurchase {
  name: string
  qty: number
  store: string
  price: number
  lineTotal: number
}

export interface PlannedStop {
  place: string
  total: number
  lines: PlannedPurchase[]
}

function cheapestAt(line: CartPlanLine, key: string): ShopListing | null {
  let best: ShopListing | null = null
  for (const listing of line.listings) {
    if (listing.price <= 0 || placeKey(listing) !== key) continue
    if (!best || listing.price < best.price) best = listing
  }
  return best
}

function namesJoined(names: string[]): string {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

/** Fewest places that cover every line. A place is a station, city, or outpost, not the store. */
export function planStops(lines: CartPlanLine[]): PlannedStop[] {
  const pending = lines.filter((line) => line.qty > 0 && line.listings.some((row) => row.price > 0))
  const places = new Map<string, ShopListing>()
  for (const line of pending) {
    for (const listing of line.listings) {
      if (listing.price <= 0) continue
      const key = placeKey(listing)
      if (!places.has(key)) places.set(key, listing)
    }
  }
  const remaining = new Set(pending.map((_, index) => index))
  const stops: PlannedStop[] = []
  while (remaining.size > 0) {
    let bestKey = ''
    let bestCover: number[] = []
    let bestCost = Number.POSITIVE_INFINITY
    for (const key of places.keys()) {
      const cover: number[] = []
      let cost = 0
      for (const index of remaining) {
        const listing = cheapestAt(pending[index], key)
        if (!listing) continue
        cover.push(index)
        cost += listing.price * pending[index].qty
      }
      if (cover.length === 0) continue
      if (cover.length > bestCover.length || (cover.length === bestCover.length && cost < bestCost)) {
        bestKey = key
        bestCover = cover
        bestCost = cost
      }
    }
    if (!bestKey || bestCover.length === 0) break
    const sample = places.get(bestKey)
    const bought: PlannedPurchase[] = []
    for (const index of bestCover) {
      const listing = cheapestAt(pending[index], bestKey)
      if (!listing || !sample) continue
      const line = pending[index]
      bought.push({
        name: line.name,
        qty: line.qty,
        store: listing.store,
        price: listing.price,
        lineTotal: listing.price * line.qty,
      })
      remaining.delete(index)
    }
    stops.push({
      place: sample ? placeName(sample) : bestKey,
      total: bought.reduce((sum, row) => sum + row.lineTotal, 0),
      lines: bought,
    })
  }
  return stops
}

export function itineraryText(stops: PlannedStop[]): string {
  if (stops.length === 0) return ''
  const sentences = stops.map((stop, index) => {
    const byStore = new Map<string, string[]>()
    for (const line of stop.lines) {
      const label = line.qty > 1 ? `${line.name} × ${line.qty}` : line.name
      const names = byStore.get(line.store) || []
      names.push(label)
      byStore.set(line.store, names)
    }
    const chunks = [...byStore].map(([store, names]) => `${namesJoined(names)} at ${store}`)
    const lead = index === 0 ? stop.place : `Then ${stop.place}`
    return `${lead} — ${chunks.join('; ')}, ${stop.total.toLocaleString('en-US')} aUEC`
  })
  return `${sentences.join('. ')}.`
}
