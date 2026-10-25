import {
  pathBetween,
  pointById,
  systemById,
  type NavHop,
  type NavMap,
} from './navSystems'

export type ShopRouteMode = 'fewest' | 'cheapest' | 'efficient'

export interface ShopRouteOffer {
  pointId: string
  price: number
  store?: string
}

export interface ShopRouteLine {
  id: string
  label: string
  offers: ShopRouteOffer[]
}

export interface ShopRouteStopLine {
  id: string
  label: string
  price: number
  store?: string
}

export interface ShopRouteStop {
  pointId: string
  name: string
  systemId: string
  systemName: string
  surface: boolean
  total: number
  lines: ShopRouteStopLine[]
}

export interface ShopRouteLeg {
  hops: NavHop[]
  stop: ShopRouteStop
}

export interface ShopRouteResult {
  legs: ShopRouteLeg[]
  unavailable: Array<{ id: string; label: string }>
  km: number
}

export interface ShopRouteRequest {
  nav: NavMap
  lines: ShopRouteLine[]
  startId?: string | null
  systems: string[]
  mode: ShopRouteMode
  firstLineId?: string | null
}

interface Prepared extends ShopRouteLine {
  offers: ShopRouteOffer[]
}

function usableOffers(line: ShopRouteLine, nav: NavMap, systems: Set<string>): ShopRouteOffer[] {
  const byPoint = new Map<string, ShopRouteOffer>()
  for (const offer of line.offers) {
    const point = pointById(nav, offer.pointId)
    if (!point || !systems.has(point.system) || !(offer.price > 0)) continue
    const prev = byPoint.get(point.id)
    if (!prev || offer.price < prev.price) byPoint.set(point.id, { ...offer, pointId: point.id })
  }
  return [...byPoint.values()]
}

function preferPads(offers: ShopRouteOffer[], nav: NavMap): ShopRouteOffer[] {
  const pads = offers.filter((offer) => pointById(nav, offer.pointId)?.surface === false)
  return pads.length > 0 ? pads : offers
}

function nearestOffer(offers: ShopRouteOffer[], nav: NavMap, startId: string): ShopRouteOffer {
  return offers.slice().sort((a, b) => {
    const left = pathBetween(nav, startId, a.pointId).km
    const right = pathBetween(nav, startId, b.pointId).km
    if (left !== right) return left - right
    if (a.price !== b.price) return a.price - b.price
    return a.pointId.localeCompare(b.pointId)
  })[0]
}

function covers(line: Prepared, pointId: string): boolean {
  return line.offers.some((offer) => offer.pointId === pointId)
}

function homeScore(lines: Prepared[], chosen: string[], nav: NavMap, startSystem: string | null): number {
  if (!startSystem) return 0
  let score = 0
  for (const line of lines) {
    if (line.offers.some((offer) => chosen.includes(offer.pointId) && pointById(nav, offer.pointId)?.system === startSystem)) {
      score += 1
    }
  }
  return score
}

function greedyCover(lines: Prepared[], nav: NavMap, startSystem: string | null, preferHome: boolean): string[] {
  const remaining = new Set(lines.map((_, index) => index))
  const candidates = [...new Set(lines.flatMap((line) => line.offers.map((offer) => offer.pointId)))]
  const chosen: string[] = []
  while (remaining.size > 0) {
    let bestId = ''
    let bestCover: number[] = []
    let bestHome = -1
    for (const pointId of candidates) {
      const cover = [...remaining].filter((index) => covers(lines[index], pointId))
      if (cover.length === 0) continue
      const home = preferHome && pointById(nav, pointId)?.system === startSystem ? cover.length : 0
      const better = cover.length > bestCover.length
        || (cover.length === bestCover.length && home > bestHome)
        || (cover.length === bestCover.length && home === bestHome && (bestId === '' || pointId < bestId))
      if (better) {
        bestId = pointId
        bestCover = cover
        bestHome = home
      }
    }
    if (!bestId) break
    chosen.push(bestId)
    for (const index of bestCover) remaining.delete(index)
  }
  return chosen
}

function fewestCover(lines: Prepared[], nav: NavMap, startSystem: string | null, preferHome: boolean): string[] {
  let best: string[] | null = null
  let bestScore = -1
  let nodes = 0
  const visit = (uncovered: number[], chosen: string[]) => {
    nodes += 1
    if (nodes > 50000) return
    if (uncovered.length === 0) {
      const score = preferHome ? homeScore(lines, chosen, nav, startSystem) : 0
      if (!best || chosen.length < best.length || (chosen.length === best.length && score > bestScore)) {
        best = [...chosen]
        bestScore = score
      }
      return
    }
    if (best && chosen.length >= best.length) return
    const options = [...new Set(lines[uncovered[0]].offers.map((offer) => offer.pointId))].sort()
    for (const pointId of options) {
      if (chosen.includes(pointId)) continue
      visit(uncovered.filter((index) => !covers(lines[index], pointId)), [...chosen, pointId])
    }
  }
  visit(lines.map((_, index) => index), [])
  if (!best || nodes > 50000) return greedyCover(lines, nav, startSystem, preferHome)
  return best
}

function orderStops(ids: string[], nav: NavMap, startId: string | null, locked: string | null): string[] {
  const left = ids.filter((id) => id !== locked)
  const ordered: string[] = []
  if (locked) ordered.push(locked)
  let cursor = locked || startId
  if (!cursor && left.length > 0) {
    left.sort()
    const first = left.shift()
    if (first) ordered.push(first)
    cursor = ordered[0] || null
  }
  while (left.length > 0) {
    let best = 0
    let bestKm = Number.POSITIVE_INFINITY
    for (let index = 0; index < left.length; index += 1) {
      const km = cursor ? pathBetween(nav, cursor, left[index]).km : 0
      if (km < bestKm || (km === bestKm && left[index] < left[best])) {
        bestKm = km
        best = index
      }
    }
    const next = left.splice(best, 1)[0]
    ordered.push(next)
    cursor = next
  }
  return ordered
}

function stopFor(nav: NavMap, pointId: string, lines: Prepared[]): ShopRouteStop {
  const point = pointById(nav, pointId)
  const bought: ShopRouteStopLine[] = []
  for (const line of lines) {
    const offer = line.offers.filter((row) => row.pointId === pointId).sort((a, b) => a.price - b.price)[0]
    if (!offer) continue
    bought.push({ id: line.id, label: line.label, price: offer.price, store: offer.store })
  }
  return {
    pointId,
    name: point?.name || pointId,
    systemId: point?.system || '',
    systemName: systemById(nav, point?.system)?.name || point?.system || '',
    surface: point?.surface === true,
    total: bought.reduce((sum, line) => sum + line.price, 0),
    lines: bought,
  }
}

/** Catalog-agnostic shopping route. Callers pass point ids and prices. */
export function planShopRoute(request: ShopRouteRequest): ShopRouteResult {
  const systems = new Set(request.systems)
  const startId = request.startId && pointById(request.nav, request.startId) ? request.startId : null
  const startSystem = pointById(request.nav, startId)?.system || null
  const unavailable: Array<{ id: string; label: string }> = []
  const available: Prepared[] = []
  for (const line of request.lines) {
    let offers = usableOffers(line, request.nav, systems)
    if (request.mode === 'efficient') offers = preferPads(offers, request.nav)
    if (offers.length === 0) unavailable.push({ id: line.id, label: line.label })
    else available.push({ ...line, offers })
  }

  let locked: string | null = null
  let rest = available
  if (request.firstLineId && startId) {
    const first = available.find((line) => line.id === request.firstLineId)
    if (first) {
      locked = nearestOffer(first.offers, request.nav, startId).pointId
      rest = available.filter((line) => line.id !== first.id && !covers(line, locked as string))
    }
  }

  const cheapestLines = rest.map((line) => {
    const min = Math.min(...line.offers.map((offer) => offer.price))
    return { ...line, offers: line.offers.filter((offer) => offer.price === min) }
  })
  const picked = request.mode === 'cheapest'
    ? (cheapestLines.length > 0 ? fewestCover(cheapestLines, request.nav, startSystem, false) : [])
    : (rest.length > 0 ? fewestCover(rest, request.nav, startSystem, request.mode === 'fewest' && Boolean(startSystem)) : [])
  const chosen = locked && !picked.includes(locked) ? [locked, ...picked] : picked
  const ordered = orderStops(chosen, request.nav, startId, locked)

  const legs: ShopRouteLeg[] = []
  let km = 0
  let cursor = startId
  for (const pointId of ordered) {
    const mine = available.filter((line) => ordered.find((id) => covers(line, id)) === pointId)
    if (mine.length === 0) continue
    const path = pathBetween(request.nav, cursor, pointId)
    if (path.reachable && Number.isFinite(path.km)) km += path.km
    legs.push({ hops: path.reachable ? path.hops : [], stop: stopFor(request.nav, pointId, mine) })
    cursor = pointId
  }
  return { legs, unavailable, km }
}
