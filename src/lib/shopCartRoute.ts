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

/** The shop name shown on a cart line. Older lines may still store the raw UEX terminal name. */
export function shopCartShopLabel(line: Pick<ShopCartLine, 'id' | 'shop' | 'system'>): string | null {
  if (!line.shop) return null
  const item = uexItemById(line.id)
  if (!item) return line.shop
  for (const loc of item.buyAt) {
    if (line.system && loc.terminal.system && loc.terminal.system !== line.system) continue
    if (loc.terminal.name === line.shop || placeName(loc) === line.shop) return placeName(loc)
  }
  return line.shop
}

function placeOf(loc: TradeLocation): ShopPlace {
  return loc.terminal
}

/**
 * Shops the route may use. A Buy-row line stays at the shop that was picked.
 * A line with no shop, such as one added from a blueprint, uses every shop that sells it.
 * Calculate then picks among those using the start, systems, and route mode.
 */
export function offersForShopLine(line: ShopCartLine): Array<ShopRouteOffer & { systemId: string }> {
  const item = uexItemById(line.id)
  if (!item) return []
  const pinned = Boolean(line.shop)
  const offers = new Map<string, ShopRouteOffer & { systemId: string }>()
  for (const loc of item.buyAt) {
    const shop = placeName(loc)
    if (pinned) {
      if (shop !== line.shop && loc.terminal.name !== line.shop) continue
      if (line.system && (loc.terminal.system || null) !== line.system) continue
    }
    const unit = loc.buyPricePerScu
    if (!(unit && unit > 0)) continue
    const pointId = resolveShopPlace(placeOf(loc))
    const point = pointById(navMap, pointId)
    if (!pointId || !point) continue
    const price = Math.round(pinned && line.price && line.price > 0 ? line.price : unit) * line.qty
    const prev = offers.get(pointId)
    if (!prev || price < prev.price) {
      offers.set(pointId, { pointId, price, store: shop, systemId: point.system })
    }
  }
  return [...offers.values()]
}
