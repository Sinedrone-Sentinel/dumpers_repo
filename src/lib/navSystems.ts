import raw from '../data/nav-systems.json'

export type NavKind = 'planet' | 'moon' | 'station' | 'city' | 'gateway'

export interface NavPoint {
  id: string
  name: string
  aliases: string[]
  system: string
  kind: NavKind
  surface: boolean
  x: number
  y: number
  z: number
}

export interface NavLink {
  from: string
  to: string
  depart: string
  arrive: string
}

export interface NavSystem {
  id: string
  name: string
}

export interface NavMap {
  systems: NavSystem[]
  points: NavPoint[]
  links: NavLink[]
}

export interface ShopPlace {
  system?: string | null
  planet?: string | null
  moon?: string | null
  station?: string | null
  city?: string | null
  outpost?: string | null
}

export interface NavSearchHit {
  id: string
  name: string
  systemId: string
  systemName: string
  label: string
}

export interface NavHop {
  pointId: string
  name: string
  systemId: string
  systemName: string
  label: string
  role: 'depart' | 'arrive'
}

export interface NavPath {
  km: number
  hops: NavHop[]
  reachable: boolean
}

export const navMap = raw as NavMap

const START_KEY = 'nav-route:start'

/** UEX names that are not the in-game place name. */
const PLACE_ALIASES: Record<string, string> = {
  greenimperialhousingexchange: 'Grim HEX',
  grimhex: 'Grim HEX',
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function pointById(nav: NavMap, id: string | null | undefined): NavPoint | null {
  if (!id) return null
  return nav.points.find((point) => point.id === id) || null
}

export function systemById(nav: NavMap, id: string | null | undefined): NavSystem | null {
  if (!id) return null
  return nav.systems.find((system) => system.id === id) || null
}

function systemByLabel(nav: NavMap, label: string | null | undefined): NavSystem | null {
  if (!label) return null
  const key = compact(label)
  return nav.systems.find((system) => compact(system.id) === key || compact(system.name) === key) || null
}

function hopFor(nav: NavMap, pointId: string, role: 'depart' | 'arrive'): NavHop {
  const point = pointById(nav, pointId)
  const system = systemById(nav, point?.system)
  const name = point?.name || pointId
  const systemName = system?.name || point?.system || ''
  return {
    pointId,
    name,
    systemId: point?.system || '',
    systemName,
    label: `${name} in ${systemName}`,
    role,
  }
}

function kmBetween(a: NavPoint, b: NavPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / 1000
}

function linksBetween(nav: NavMap, fromSystem: string, toSystem: string): NavLink[] | null {
  if (fromSystem === toSystem) return []
  const queue: Array<{ system: string; links: NavLink[] }> = [{ system: fromSystem, links: [] }]
  const seen = new Set([fromSystem])
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    for (const link of nav.links) {
      if (link.from !== current.system || seen.has(link.to)) continue
      const links = [...current.links, link]
      if (link.to === toSystem) return links
      seen.add(link.to)
      queue.push({ system: link.to, links })
    }
  }
  return null
}

/** Straight-line kilometers inside a system. A system change uses that system's gateway. */
export function pathBetween(nav: NavMap, fromId: string | null, toId: string): NavPath {
  const to = pointById(nav, toId)
  if (!to) return { km: 0, hops: [], reachable: false }
  if (!fromId) return { km: 0, hops: [], reachable: true }
  const from = pointById(nav, fromId)
  if (!from) return { km: 0, hops: [], reachable: false }
  if (from.id === to.id) return { km: 0, hops: [], reachable: true }
  const links = linksBetween(nav, from.system, to.system)
  if (!links) return { km: Number.POSITIVE_INFINITY, hops: [], reachable: false }
  let km = 0
  let cursor = from
  const hops: NavHop[] = []
  for (const link of links) {
    const depart = pointById(nav, link.depart)
    const arrive = pointById(nav, link.arrive)
    if (!depart || !arrive) return { km: Number.POSITIVE_INFINITY, hops: [], reachable: false }
    if (cursor.id !== depart.id) km += kmBetween(cursor, depart)
    if (depart.id !== from.id && depart.id !== to.id) hops.push(hopFor(nav, depart.id, 'depart'))
    if (arrive.id !== from.id && arrive.id !== to.id && arrive.id !== depart.id) hops.push(hopFor(nav, arrive.id, 'arrive'))
    cursor = arrive
  }
  if (cursor.id !== to.id) km += kmBetween(cursor, to)
  return { km, hops, reachable: true }
}

/** One sentence per system jump. A depart/arrive pair is a single jump. */
export function describeJumps(hops: NavHop[]): string[] {
  const sentences: string[] = []
  let index = 0
  while (index < hops.length) {
    const hop = hops[index]
    const next = hops[index + 1]
    if (hop.role === 'depart' && next?.role === 'arrive') {
      sentences.push(`Use ${hop.label}, jump to ${next.label}`)
      index += 2
      continue
    }
    sentences.push(hop.role === 'arrive' ? `Jump to ${hop.label}` : `Use ${hop.label} to jump`)
    index += 1
  }
  return sentences
}

export function searchNavPoints(query: string, nav: NavMap = navMap, limit = 12): NavSearchHit[] {
  const key = compact(query)
  if (key.length < 2) return []
  const hits: Array<NavSearchHit & { starts: boolean }> = []
  for (const point of nav.points) {
    const names = [point.name, ...point.aliases]
    if (!names.some((name) => compact(name).includes(key))) continue
    const systemName = systemById(nav, point.system)?.name || point.system
    hits.push({
      id: point.id,
      name: point.name,
      systemId: point.system,
      systemName,
      label: `${point.name} · ${systemName}`,
      starts: compact(point.name).startsWith(key),
    })
  }
  hits.sort((a, b) => Number(b.starts) - Number(a.starts) || a.label.localeCompare(b.label))
  return hits.slice(0, limit).map(({ starts: _starts, ...hit }) => hit)
}

function splitLocated(label: string): { name: string; systemHint: string | null } {
  const match = label.trim().match(/^(.*)\s+\(([^)]+)\)$/)
  const raw = (match ? match[1] : label).trim()
  return {
    name: PLACE_ALIASES[compact(raw)] || raw,
    systemHint: match ? match[2].trim() : null,
  }
}

function pickPoint(points: NavPoint[], label: string): NavPoint | null {
  const key = compact(label)
  if (!key) return null
  let best: NavPoint | null = null
  let bestScore = 99
  let bestLen = Number.POSITIVE_INFINITY
  for (const point of points) {
    const names = [point.name, ...point.aliases].map(compact)
    let score = 99
    if (names.some((name) => name === key)) score = 0
    else if (key.length >= 4 && names.some((name) => name.startsWith(key) || key.startsWith(name))) score = 1
    if (score < bestScore || (score === bestScore && point.name.length < bestLen)) {
      best = point
      bestScore = score
      bestLen = point.name.length
    }
  }
  return bestScore === 99 ? null : best
}

/** Station, city, or gateway name, otherwise the moon, otherwise the planet. Outpost names are not searched. */
export function resolveShopPlace(place: ShopPlace, nav: NavMap = navMap): string | null {
  if (place.system && !systemByLabel(nav, place.system)) return null
  const system = systemByLabel(nav, place.system)
  const inSystem = system ? nav.points.filter((point) => point.system === system.id) : nav.points
  const pads = (points: NavPoint[]) => points.filter((point) => point.kind === 'station' || point.kind === 'city' || point.kind === 'gateway')
  for (const label of [place.station, place.city]) {
    if (!label) continue
    const cleaned = splitLocated(label)
    const hint = systemByLabel(nav, cleaned.systemHint)
    const pool = hint ? nav.points.filter((point) => point.system === hint.id) : inSystem
    const hit = pickPoint(pads(pool), cleaned.name)
    if (hit) return hit.id
  }
  if (place.moon) {
    const hit = pickPoint(inSystem.filter((point) => point.kind === 'moon'), place.moon)
    if (hit) return hit.id
  }
  if (place.planet) {
    const hit = pickPoint(inSystem.filter((point) => point.kind === 'planet'), place.planet)
    if (hit) return hit.id
  }
  return null
}

export function defaultRouteSystems(nav: NavMap = navMap): string[] {
  if (nav.systems.some((system) => system.id === 'stanton')) return ['stanton']
  return nav.systems[0] ? [nav.systems[0].id] : []
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readRouteStart(nav: NavMap = navMap): string | null {
  const id = storage()?.getItem(START_KEY) ?? null
  return pointById(nav, id) ? id : null
}

export function writeRouteStart(id: string | null): void {
  const store = storage()
  if (!store) return
  if (id) store.setItem(START_KEY, id)
  else store.removeItem(START_KEY)
}

export function readCallerSystems(callerId: string, nav: NavMap = navMap): string[] {
  const rawIds = storage()?.getItem(`nav-route:${callerId}:systems`)
  const known = new Set(nav.systems.map((system) => system.id))
  const ids = (rawIds || '').split(',').map((id) => id.trim()).filter((id) => known.has(id))
  return ids.length > 0 ? ids : defaultRouteSystems(nav)
}

export function writeCallerSystems(callerId: string, systems: string[]): void {
  storage()?.setItem(`nav-route:${callerId}:systems`, systems.join(','))
}

export function readCallerMode(callerId: string): 'fewest' | 'cheapest' | 'efficient' {
  const mode = storage()?.getItem(`nav-route:${callerId}:mode`)
  if (mode === 'cheapest' || mode === 'efficient' || mode === 'fewest') return mode
  return 'fewest'
}

export function writeCallerMode(callerId: string, mode: 'fewest' | 'cheapest' | 'efficient'): void {
  storage()?.setItem(`nav-route:${callerId}:mode`, mode)
}

export function readShipFirst(callerId: string): boolean {
  return storage()?.getItem(`nav-route:${callerId}:ship-first`) === '1'
}

export function writeShipFirst(callerId: string, on: boolean): void {
  storage()?.setItem(`nav-route:${callerId}:ship-first`, on ? '1' : '0')
}
