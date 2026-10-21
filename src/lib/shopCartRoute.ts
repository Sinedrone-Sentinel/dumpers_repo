import { navMap, pointById, resolveShopPlace, type ShopPlace } from './navSystems'
import { terminalPlace, type TradeLocation } from './shopLookup'
import type { ShopRouteOffer } from './shopRoute'
import type { ShopCartLine } from './shopCart'
import { uexItemById } from './uexCatalog'

export function shopCartLineKey(line: Pick<ShopCartLine, 'id' | 'shop'>): string {
  return `${line.id}\n${line.shop || ''}`
}

function placeName(loc: TradeLocation): string {
  return loc.label || terminalPlace(loc.terminal)
}

function placeOf(loc: TradeLocation): ShopPlace {
  return loc.terminal
}

/** One offer per nav point for a line that was added from a shop row. */
export function offersForShopLine(line: ShopCartLine): Array<ShopRouteOffer & { systemId: string }> {
  if (!(line.price && line.price > 0) || !line.shop) return []
  const item = uexItemById(line.id)
  if (!item) return []
  const offers = new Map<string, ShopRouteOffer & { systemId: string }>()
  for (const loc of item.buyAt) {
    if (placeName(loc) !== line.shop) continue
    if (line.system && (loc.terminal.system || null) !== line.system) continue
    if (!((loc.buyPricePerScu || 0) > 0)) continue
    const pointId = resolveShopPlace(placeOf(loc))
    const point = pointById(navMap, pointId)
    if (!pointId || !point) continue
    const price = Math.round(line.price) * line.qty
    const prev = offers.get(pointId)
    if (!prev || price < prev.price) {
      offers.set(pointId, { pointId, price, store: line.shop, systemId: point.system })
    }
  }
  return [...offers.values()]
}
