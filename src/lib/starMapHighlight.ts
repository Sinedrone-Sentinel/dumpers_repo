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

/** Which tool sent the pins. The glyph is that tool's menu icon. The frame is shared. */
export type StarMapTelemetry = 'shopping' | 'hauler'

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
  /** Which tool's menu icon to draw. Not put in the URL. */
  category?: StarMapTelemetry
  shops?: StarMapShopStop[]
  /** Place the bright leg ends at. Earlier legs are dim. Carts omit this. */
  active?: string
}

/**
 * A shopping run. One place, or a start that is the only stop, blinks.
 * A calculated cart draws every leg bright. A haul in progress draws the
 * leg into the current stop bright and the legs already traveled dim.
 */
function cleanStops(stops: StarMapShopStop[]): StarMapShopStop[] {
  return stops
    .map((stop) => ({ place: stop.place.trim(), lines: stop.lines.filter((line) => line.label.trim()) }))
    .filter((stop) => stop.place)
}

export function shoppingMapPayload(
  input: {
    from?: string | null
    /** Stops the route line runs through, in order. The last one is the current leg when progressive. */
    stops: StarMapShopStop[]
    /**
     * Buy and sell rows drawn on the map. Defaults to `stops`.
     * A sell list can pass every current buyer while the route line stays short.
     */
    pins?: StarMapShopStop[]
    progressive?: boolean
    category?: StarMapTelemetry
  },
  systems?: StarMapSystems,
): StarMapPayload {
  const stops = cleanStops(input.stops)
  const pins = cleanStops(input.pins ?? input.stops)
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
    category: input.category ?? 'shopping',
    shops: pins,
    marks: blink && places[0] ? [places[0]] : undefined,
    start: blink ? undefined : places[0],
    route: blink ? undefined : places.slice(1),
    active: input.progressive && !blink ? places[places.length - 1] : undefined,
  }
}

/**
 * The haul that is underway. Icons and the route line run only through the
 * current stop, so a later trade stays off the map until the member reaches it.
 * Traveled legs dim and the current leg stays bright. Pass `pins` to list
 * stops that are all current, such as every buyer still on a sell list.
 */
export function haulMapPayload(
  input: {
    from?: string | null
    stops: StarMapShopStop[]
    /** Index into `stops` of the stop the member is on now. */
    current: number
    /** Stops to draw even when the route has not reached them. */
    pins?: StarMapShopStop[]
  },
  systems?: StarMapSystems,
): StarMapPayload {
  const stops = cleanStops(input.stops)
  const current = Math.max(0, Math.min(input.current, Math.max(0, stops.length - 1)))
  const reached = stops.slice(0, current + 1)
  return shoppingMapPayload({
    category: 'hauler',
    from: input.from,
    progressive: true,
    stops: reached,
    pins: input.pins ?? reached,
  }, systems)
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
/** The Smart Hauler run, kept while that run is active even if the map tab is closed. */
export const STAR_MAP_HAUL_KEY = 'dumper-star-map-haul'
export const STAR_MAP_CHANNEL = 'dumper-star-map'
export const STAR_MAP_WINDOW = 'dumper-star-map'

/** The named tab View Map opens. That tab is the map alone. */
export function isDedicatedStarMapWindow(): boolean {
  return typeof window !== 'undefined' && window.name === STAR_MAP_WINDOW
}

/** `/star-map` and `/star-map/stanton`. A trailing slash still counts. */
export function isStarMapPath(pathname: string): boolean {
  const bare = (pathname || '/').split('?')[0].split('#')[0] || '/'
  const normalized = bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare
  return normalized === '/star-map' || normalized.startsWith('/star-map/')
}

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

let lastHaulBody: string | null = null

/** Remember the haul, and tell an open map. `null` means the run ended. */
export function writeLiveHaul(payload: StarMapPayload | null): void {
  const body = payload ? JSON.stringify(payload) : ''
  if (body === lastHaulBody) return
  lastHaulBody = body
  try {
    if (typeof localStorage !== 'undefined') {
      if (payload) localStorage.setItem(STAR_MAP_HAUL_KEY, body)
      else localStorage.removeItem(STAR_MAP_HAUL_KEY)
    }
  } catch {
    // Private mode can refuse storage. The open map still hears the channel.
  }
  try {
    const channel = new BroadcastChannel(STAR_MAP_CHANNEL)
    channel.postMessage({ kind: 'haul', payload })
    channel.close()
  } catch {
    // The map reads localStorage when it opens.
  }
}

/** The haul still in progress, or null. */
export function readLiveHaul(): StarMapPayload | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STAR_MAP_HAUL_KEY)
    if (!raw) return null
    const payload = JSON.parse(raw) as StarMapPayload
    if (!payload || payload.category !== 'hauler') return null
    if (!payload.route?.length && !payload.marks?.length && !payload.shops?.length) return null
    return payload
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

export interface StarMapJumpCallout {
  markerId: string
  /** Display name of the system the route enters next. */
  systemName: string
}

/**
 * Departure jumps where the route leaves this system. The callout is a label,
 * not a shop pin. A shop that sits on that same jump is a separate pin.
 */
export function jumpContinuations(points: StarMapMarker[], systemId: string, index: StarMapIndex): StarMapJumpCallout[] {
  const nameOf = (id: string) => index.systems.find((system) => system.id === id)?.name ?? id
  const out: StarMapJumpCallout[] = []
  const seen = new Set<string>()
  for (let i = 0; i < points.length - 1; i++) {
    const here = points[i]
    const next = points[i + 1]
    if (here.systemId !== systemId || here.kind !== 'jump_point' || next.systemId === systemId) continue
    if (seen.has(here.id)) continue
    seen.add(here.id)
    out.push({ markerId: here.id, systemName: nameOf(next.systemId) })
  }
  return out
}

export interface CalloutBox {
  x: number
  y: number
  w: number
  h: number
}

const CALLOUT_ANGLES = [-Math.PI / 4, -Math.PI / 2, 0, Math.PI / 4, Math.PI / 2, Math.PI, (Math.PI * 3) / 4, (-Math.PI * 3) / 4]

function calloutHits(a: CalloutBox, b: CalloutBox, pad: number): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y
}

/**
 * Centre for a telemetry pin or jump label. Tries a short gold line first, then
 * longer ones and other directions, so the pin stays off markers and labels.
 */
export function placeCallout(
  anchorX: number,
  anchorY: number,
  fromR: number,
  boxW: number,
  boxH: number,
  occupied: CalloutBox[],
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const reach = fromR + Math.max(boxW, boxH) / 2 + 10
  const lengths = [reach, reach + 24, reach + 48, reach + 76]
  let best: { x: number; y: number; overlap: number } | null = null
  for (const len of lengths) {
    for (const ang of CALLOUT_ANGLES) {
      const x = anchorX + Math.cos(ang) * len
      const y = anchorY + Math.sin(ang) * len
      const box = { x: x - boxW / 2, y: y - boxH / 2, w: boxW, h: boxH }
      if (box.x < 2 || box.y < 2 || box.x + box.w > viewW - 2 || box.y + box.h > viewH - 2) continue
      let overlap = 0
      for (const other of occupied) {
        if (!calloutHits(box, other, 6)) continue
        const ix = Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x)
        const iy = Math.min(box.y + box.h, other.y + other.h) - Math.max(box.y, other.y)
        overlap += Math.max(0, ix) * Math.max(0, iy)
      }
      if (overlap === 0) return { x, y }
      if (!best || overlap < best.overlap) best = { x, y, overlap }
    }
  }
  if (best) return { x: best.x, y: best.y }
  const ang = CALLOUT_ANGLES[0]
  return { x: anchorX + Math.cos(ang) * reach, y: anchorY + Math.sin(ang) * reach }
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

  // A haul in progress opens on the stop they are traveling to, not the start they already left.
  if (payload.active) {
    const points = expandRoute(payload, systems, index.links)
    const key = normalizeMapName(payload.active)
    const hit = points.find((point) => [point.name, ...(point.aliases || [])].some((name) => normalizeMapName(name) === key))
    if (hit) return { kind: 'single', systemId: hit.systemId }
  }

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
