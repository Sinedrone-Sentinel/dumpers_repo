import type {
  StarMapIndex,
  StarMapKind,
  StarMapLink,
  StarMapMarker,
  StarMapSystems,
} from './starMap'

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

// ── Payload (search params) ────────────────────────────────────────────────

export interface StarMapPayload {
  /** Location names to blink. */
  marks?: string[]
  /** Ordered stops to connect with a route. */
  route?: string[]
  /** Where the route starts; defaults to the first matched stop. */
  start?: string
}

export interface StarMapSearch {
  marks?: string
  route?: string
  start?: string
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
