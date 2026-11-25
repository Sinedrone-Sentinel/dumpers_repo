import type {
  StarMapIndex,
  StarMapKind,
  StarMapLink,
  StarMapMarker,
  StarMapSystems,
} from './starMap'
import { navMap } from './navSystems'

// ── Name matching ──────────────────────────────────────────────────────────

/** `PYR6 L3 · Endgame` → `pyr6l3`; `CRU-L3` → `crul3`. */
export function normalizeMapName(value: string): string {
  return value.split('·')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
}

const GROUP_NAME_KINDS: { pattern: RegExp; kinds: StarMapKind[]; systemId?: string }[] = [
  { pattern: /^pyro asteroid clusters?$/i, kinds: ['rab', 'rmb'], systemId: 'pyro' },
  // Spawn pools for Pyro's numbered asteroid clusters (Cluster LHB-976 …), filed under Stanton by CIG.
  { pattern: /^lagrange (g|occupied)$/i, kinds: ['cluster'], systemId: 'pyro' },
  { pattern: /^qv breaker stations?\b/i, kinds: ['qv'] },
  { pattern: /^outlaw stations?\b/i, kinds: ['outlaw'] },
  { pattern: /^rockcracker sites?\b/i, kinds: ['qv'] },
  { pattern: /^all pyro planets$/i, kinds: ['planet'], systemId: 'pyro' },
  { pattern: /^found in all stanton deposits\b/i, kinds: ['planet', 'moon'], systemId: 'stanton' },
  { pattern: /^all moons\/planets/i, kinds: ['planet', 'moon'] },
]

function markerKeys(m: StarMapMarker): string[] {
  return [m.name, ...(m.aliases || [])].map(normalizeMapName).filter(Boolean)
}

/** Every marker a member-facing location name can refer to. */
export function matchMarkers(name: string, systems: StarMapSystems): StarMapMarker[] {
  const trimmed = name.trim()
  if (!trimmed) return []
  for (const group of GROUP_NAME_KINDS) {
    if (!group.pattern.test(trimmed)) continue
    const out: StarMapMarker[] = []
    for (const sys of Object.values(systems)) {
      if (group.systemId && sys.id !== group.systemId) continue
      for (const m of sys.markers) {
        if (!group.kinds.includes(m.kind)) continue
        if (group.kinds.includes('qv') && /rockcracker/i.test(trimmed) !== /rockcracker/i.test(m.name)) continue
        out.push(m)
      }
    }
    return out
  }
  const key = normalizeMapName(trimmed)
  if (!key) return []
  const out: StarMapMarker[] = []
  for (const sys of Object.values(systems)) {
    for (const m of sys.markers) {
      if (markerKeys(m).includes(key)) out.push(m)
    }
  }
  // A moon or planet ring (`Yela Ring`) that has no belt of its own is shown on its body.
  const ringBase = trimmed.match(/^(.+?)\s+ring$/i)
  if (!out.length && ringBase) return matchMarkers(ringBase[1], systems)
  return out
}

export function findMarkerById(id: string, systems: StarMapSystems): StarMapMarker | null {
  const systemId = id.split(':')[0]
  return systems[systemId]?.markers.find((m) => m.id === id) ?? null
}

/**
 * A shopping stop on the map. A station matches itself. A surface city, which
 * is not a map marker, uses the planet or moon it sits on.
 */
export function resolveShopMarker(place: string, systems: StarMapSystems): StarMapMarker | null {
  const exact = matchMarkers(place, systems)
  if (exact.length) return exact[0]
  const key = normalizeMapName(place)
  if (!key) return null
  const point = navMap.points.find(
    (p) => normalizeMapName(p.name) === key || p.aliases.some((alias) => normalizeMapName(alias) === key),
  )
  const sys = point ? systems[point.system] : undefined
  if (!point || !sys) return null
  const kinds: StarMapKind[] = point.kind === 'city' || point.surface ? ['planet', 'moon'] : ['station', 'landing', 'planet', 'moon']
  let best: StarMapMarker | null = null
  let bestD = Infinity
  for (const marker of sys.markers) {
    if (!kinds.includes(marker.kind)) continue
    const d = Math.hypot(marker.x - point.x, marker.y - point.y)
    if (d < bestD) {
      bestD = d
      best = marker
    }
  }
  return best
}

function shopRouteName(place: string, systems?: StarMapSystems): string {
  const trimmed = place.trim()
  if (!systems) return trimmed
  return resolveShopMarker(trimmed, systems)?.name || trimmed
}

// ── Payload (search params) ────────────────────────────────────────────────

export interface StarMapShopLine {
  action: 'buy' | 'sell'
  label: string
}

/** One place on a shopping run, and what to buy or sell there. */
export interface StarMapShopStop {
  place: string
  lines: StarMapShopLine[]
}

export interface StarMapPayload {
  /** Location names to blink. */
  marks?: string[]
  /** Ordered stops to connect with a route. */
  route?: string[]
  /** Where the route starts; defaults to the first matched stop. */
  start?: string
  /** Shopping stops keep a temporary icon and a buy/sell list. Not put in the URL. */
  category?: 'shopping'
  shops?: StarMapShopStop[]
  /** Place the bright leg ends at. Earlier legs are dim. Carts omit this. */
  active?: string
}

/**
 * A shopping run. One place, or a start that is the only stop, blinks.
 * A calculated cart draws every leg bright. A haul in progress draws the
 * leg into the current stop bright and the legs already traveled dim.
 */
export function shoppingMapPayload(
  input: {
    from?: string | null
    stops: StarMapShopStop[]
    progressive?: boolean
  },
  systems?: StarMapSystems,
): StarMapPayload {
  const stops = input.stops
    .map((stop) => ({ place: stop.place.trim(), lines: stop.lines.filter((line) => line.label.trim()) }))
    .filter((stop) => stop.place)
  const places: string[] = []
  const push = (name?: string | null) => {
    const next = name?.trim()
    if (!next) return
    const routed = shopRouteName(next, systems)
    if (places.length && normalizeMapName(places[places.length - 1]) === normalizeMapName(routed)) return
    places.push(routed)
  }
  push(input.from)
  for (const stop of stops) push(stop.place)
  const blink = places.length <= 1
  return {
    category: 'shopping',
    shops: stops,
    marks: blink && places[0] ? [places[0]] : undefined,
    start: blink ? undefined : places[0],
    route: blink ? undefined : places.slice(1),
    active: input.progressive && !blink ? places[places.length - 1] : undefined,
  }
}

export interface StarMapShopPin {
  markerId: string
  /** The place, or the body several places share. */
  title: string
  lines: { action: 'buy' | 'sell'; label: string; where?: string }[]
}

/**
 * One pin per map body. Later stops at that body add their lines, so a second
 * commodity does not open the first stop's list.
 */
export function groupShopPins(shops: StarMapShopStop[], systems: StarMapSystems, systemId: string): StarMapShopPin[] {
  const order: string[] = []
  const pins = new Map<string, { markerName: string; lines: { action: 'buy' | 'sell'; label: string; where: string }[] }>()
  for (const shop of shops) {
    const marker = resolveShopMarker(shop.place, systems)
    if (!marker || marker.systemId !== systemId) continue
    let pin = pins.get(marker.id)
    if (!pin) {
      pin = { markerName: marker.name, lines: [] }
      pins.set(marker.id, pin)
      order.push(marker.id)
    }
    for (const line of shop.lines) {
      pin.lines.push({ action: line.action, label: line.label, where: shop.place })
    }
  }
  return order.map((id) => {
    const pin = pins.get(id) as { markerName: string; lines: { action: 'buy' | 'sell'; label: string; where: string }[] }
    const places = [...new Set(pin.lines.map((line) => line.where))]
    const shared = places.length === 1
    return {
      markerId: id,
      title: shared ? places[0] : pin.markerName,
      lines: pin.lines.map((line) => ({
        action: line.action,
        label: line.label,
        where: shared ? undefined : line.where,
      })),
    }
  })
}

/** Bright on the leg that arrives at `active`, including the jumps in that leg. Earlier legs are dim. */
export function routeLegTone(
  points: { name: string; aliases?: string[]; kind?: string }[],
  fromIndex: number,
  active?: string,
): 'bright' | 'dim' {
  const key = active ? normalizeMapName(active) : ''
  if (!key || fromIndex < 0) return 'bright'
  let activeAt = -1
  for (let i = 0; i < points.length; i++) {
    const names = [points[i].name, ...(points[i].aliases || [])].map(normalizeMapName)
    if (names.includes(key)) activeAt = i
  }
  if (activeAt <= 0) return 'bright'
  let prevStop = 0
  for (let i = activeAt - 1; i >= 0; i--) {
    if (points[i].kind !== 'jump_point') {
      prevStop = i
      break
    }
  }
  return fromIndex < prevStop ? 'dim' : 'bright'
}

export interface StarMapSearch {
  marks?: string
  route?: string
  start?: string
  /** Id of a shopping run stored for the Star Map tab. Not the run itself. */
  handoff?: string
}

const LIST_SEP = '|'

export function starMapSearch(payload: StarMapPayload): StarMapSearch {
  const out: StarMapSearch = {}
  const marks = (payload.marks || []).map((s) => s.trim()).filter(Boolean)
  const route = (payload.route || []).map((s) => s.trim()).filter(Boolean)
  if (marks.length) out.marks = [...new Set(marks)].join(LIST_SEP)
  if (route.length) out.route = route.join(LIST_SEP)
  if (payload.start?.trim()) out.start = payload.start.trim()
  return out
}

export function payloadFromSearch(search: StarMapSearch): StarMapPayload {
  const split = (v?: string) => (v ? v.split(LIST_SEP).map((s) => s.trim()).filter(Boolean) : [])
  return {
    marks: split(search.marks),
    route: split(search.route),
    start: search.start?.trim() || undefined,
  }
}

export function validateStarMapSearch(search: Record<string, unknown>): StarMapSearch {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
  return {
    marks: str(search.marks),
    route: str(search.route),
    start: str(search.start),
    handoff: str(search.handoff),
  }
}

const HANDOFF_KEY = 'dumper-star-map-handoff'
export const STAR_MAP_CHANNEL = 'dumper-star-map'
export const STAR_MAP_WINDOW = 'dumper-star-map'

/** Park a shopping run where the Star Map tab can read it. Returns its id. */
export function publishStarMapHandoff(payload: StarMapPayload): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const body = JSON.stringify({ id, payload })
  localStorage.setItem(HANDOFF_KEY, body)
  try {
    const channel = new BroadcastChannel(STAR_MAP_CHANNEL)
    channel.postMessage({ id, payload })
    channel.close()
  } catch {
    // The tab reads localStorage on open when BroadcastChannel is missing.
  }
  return id
}

/** The run for this id, or null. Safe to call twice for the same id. */
export function readStarMapHandoff(id: string): StarMapPayload | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: string; payload?: StarMapPayload }
    if (parsed.id !== id || !parsed.payload) return null
    return parsed.payload
  } catch {
    return null
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

/** System ids from `from` to `to` following jump links (inclusive), or null. */
export function systemPath(from: string, to: string, links: StarMapLink[]): string[] | null {
  if (from === to) return [from]
  const prev = new Map<string, string>([[from, '']])
  const queue = [from]
  while (queue.length) {
    const cur = queue.shift() as string
    for (const l of links) {
      if (l.from !== cur || prev.has(l.to)) continue
      prev.set(l.to, cur)
      if (l.to === to) {
        const path = [to]
        let p = cur
        while (p) {
          path.unshift(p)
          p = prev.get(p) || ''
        }
        return path
      }
      queue.push(l.to)
    }
  }
  return null
}

/**
 * Ordered route points. A stop in another system is reached through the
 * departure jump point and continues from the arrival jump point.
 */
export function expandRoute(
  payload: StarMapPayload,
  systems: StarMapSystems,
  links: StarMapLink[],
): StarMapMarker[] {
  const names = [...(payload.start ? [payload.start] : []), ...(payload.route || [])]
  const stops: StarMapMarker[] = []
  for (const name of names) {
    const options = matchMarkers(name, systems)
    if (!options.length) continue
    const prev = stops[stops.length - 1]
    const same = prev ? options.find((m) => m.systemId === prev.systemId) : undefined
    const pick = same ?? options[0]
    if (prev && prev.id === pick.id) continue
    stops.push(pick)
  }

  const points: StarMapMarker[] = []
  for (const stop of stops) {
    const prev = points[points.length - 1]
    if (prev && prev.systemId !== stop.systemId) {
      const path = systemPath(prev.systemId, stop.systemId, links)
      if (path) {
        for (let i = 0; i < path.length - 1; i++) {
          const link = links.find((l) => l.from === path[i] && l.to === path[i + 1])
          const depart = link ? findMarkerById(link.depart, systems) : null
          const arrive = link?.arrive ? findMarkerById(link.arrive, systems) : null
          if (depart) points.push(depart)
          if (arrive) points.push(arrive)
        }
      }
    }
    if (points[points.length - 1]?.id !== stop.id) points.push(stop)
  }
  return points
}

/** Consecutive route pairs that are drawn inside one system. */
export function routeSegmentsInSystem(points: StarMapMarker[], systemId: string): [StarMapMarker, StarMapMarker][] {
  const out: [StarMapMarker, StarMapMarker][] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.systemId === systemId && b.systemId === systemId) out.push([a, b])
  }
  return out
}

// ── Resolving which system to open ─────────────────────────────────────────

export type StarMapResolution =
  | { kind: 'empty' }
  | { kind: 'single'; systemId: string }
  | { kind: 'multiple'; systemIds: string[] }
  | { kind: 'none'; systemIds: string[] }

export function resolveStarMapSystem(
  payload: StarMapPayload,
  systems: StarMapSystems,
  index: StarMapIndex,
): StarMapResolution {
  const marks = payload.marks || []
  const route = payload.route || []
  const allIds = index.systems.map((s) => s.id).filter((id) => systems[id])
  if (!marks.length && !route.length && !payload.start) return { kind: 'empty' }

  if (route.length || payload.start) {
    const points = expandRoute(payload, systems, index.links)
    if (points.length) return { kind: 'single', systemId: points[0].systemId }
    if (!marks.length) return { kind: 'none', systemIds: allIds }
  }

  const found = new Set<string>()
  for (const name of marks) for (const m of matchMarkers(name, systems)) found.add(m.systemId)
  const ordered = allIds.filter((id) => found.has(id))
  if (ordered.length === 1) return { kind: 'single', systemId: ordered[0] }
  if (ordered.length > 1) return { kind: 'multiple', systemIds: ordered }
  return { kind: 'none', systemIds: allIds }
}

/** Marker ids to blink inside one system. */
export function markedIdsInSystem(payload: StarMapPayload, systems: StarMapSystems, systemId: string): Set<string> {
  const out = new Set<string>()
  for (const name of payload.marks || []) {
    for (const m of matchMarkers(name, systems)) if (m.systemId === systemId) out.add(m.id)
  }
  return out
}
