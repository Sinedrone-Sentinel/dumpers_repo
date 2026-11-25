export type StarMapKind =
  | 'star'
  | 'planet'
  | 'moon'
  | 'belt'
  | 'station'
  | 'jump_point'
  | 'wikelo'
  | 'comm_array'
  | 'executive_hangar'
  | 'admin_base'
  | 'olp'
  | 'pa_station'
  | 'qv'
  | 'outlaw'
  | 'rab'
  | 'rmb'
  | 'cluster'

export interface StarMapMarker {
  id: string
  systemId: string
  name: string
  aliases: string[]
  kind: StarMapKind
  description: string | null
  x: number
  y: number
  z: number
  radiusM: number | null
  innerRadiusM: number | null
  outerRadiusM: number | null
  toSystem: string | null
  toMarkerName: string | null
  toMarkerId?: string | null
  notes: string[]
  parentName: string | null
}

export interface StarMapSystem {
  id: string
  name: string
  description: string | null
  markers: StarMapMarker[]
}

export interface StarMapSystemSummary {
  id: string
  name: string
  description: string | null
  overview: { x: number; y: number; z: number }
}

export interface StarMapLink {
  from: string
  to: string
  depart: string
  arrive: string | null
  arriveName: string | null
}

export interface StarMapIndex {
  version: number
  systems: StarMapSystemSummary[]
  links: StarMapLink[]
}

export type StarMapSystems = Record<string, StarMapSystem>

export const ORB_KINDS: ReadonlySet<StarMapKind> = new Set(['star', 'planet', 'moon'])

export const STAR_MAP_KIND_LABELS: Record<StarMapKind, string> = {
  star: 'Star',
  planet: 'Planet',
  moon: 'Moon',
  belt: 'Asteroid Belt',
  station: 'Station',
  jump_point: 'Jump Point',
  wikelo: 'Wikelo Station',
  comm_array: 'Comm Array',
  executive_hangar: 'Executive Hangar',
  admin_base: 'Admin Station',
  olp: 'Orbital Laser Platform',
  pa_station: "People's Alliance Station",
  qv: 'QV Breaker Station',
  outlaw: 'Outlaw Station',
  rab: 'Resource Asteroid Base',
  rmb: 'Resource Mining Base',
  cluster: 'Asteroid Cluster',
}

export const STAR_MAP_COLORS = {
  star: '#f59e5b',
  starCore: '#ffe4a8',
  planet: '#3b82f6',
  planetCore: '#93c5fd',
  moon: '#7dd3fc',
  moonCore: '#e0f2fe',
  orbit: 'rgba(148, 148, 148, 0.55)',
  belt: 'rgba(74, 222, 128, 0.16)',
  route: '#facc15',
  blink: '#facc15',
} as const

export const STAR_MAP_ICON_COLORS: Record<StarMapKind, string> = {
  star: STAR_MAP_COLORS.star,
  planet: STAR_MAP_COLORS.planet,
  moon: STAR_MAP_COLORS.moon,
  belt: '#4ade80',
  station: '#a78bfa',
  jump_point: '#ef4444',
  wikelo: '#fbbf24',
  comm_array: '#67e8f9',
  executive_hangar: '#f472b6',
  admin_base: '#2dd4bf',
  olp: '#a3e635',
  pa_station: '#4ade80',
  qv: '#93c5fd',
  outlaw: '#fca5a5',
  rab: '#fb923c',
  rmb: '#d6a35c',
  cluster: '#f8fafc',
}

/** Icon draw order when two icons compete for the same spot (lower wins). */
const ICON_PRIORITY: Partial<Record<StarMapKind, number>> = {
  jump_point: 0,
  wikelo: 1,
  executive_hangar: 1,
  admin_base: 2,
  station: 3,
  pa_station: 3,
  outlaw: 4,
  rab: 5,
  rmb: 5,
  qv: 6,
  olp: 7,
  cluster: 7,
  comm_array: 8,
}

// ── Blink ──────────────────────────────────────────────────────────────────

export const BLINK_FADE_IN_MS = 500
export const BLINK_FADE_OUT_MS = 750
export const BLINK_CYCLE_MS = BLINK_FADE_IN_MS + BLINK_FADE_OUT_MS

/** 0→1 over the fade-in, then 1→0 over the fade-out, repeating. */
export function blinkAlpha(timeMs: number): number {
  const phase = ((timeMs % BLINK_CYCLE_MS) + BLINK_CYCLE_MS) % BLINK_CYCLE_MS
  if (phase < BLINK_FADE_IN_MS) return phase / BLINK_FADE_IN_MS
  return 1 - (phase - BLINK_FADE_IN_MS) / BLINK_FADE_OUT_MS
}

// ── Display scale ──────────────────────────────────────────────────────────

/** Screen size for stations, jumps, clusters and every other icon. */
export const ICON_PX = 14

export interface BodyScale {
  /** Pixels per meter of map position. */
  pxPerM: number
  /** Largest planet radius in the system, in meters. */
  maxPlanetRadiusM: number
  /** Display radius of the largest planet, in pixels. */
  maxPlanetPx: number
  /** Distance from the star to the closest planet, in meters. */
  innerOrbitM: number
}

export function systemBodyScale(system: StarMapSystem, pxPerM: number, maxPlanetPx = 16): BodyScale {
  const star = system.markers.find((m) => m.kind === 'star')
  const cx = star?.x ?? 0
  const cy = star?.y ?? 0
  let maxPlanetRadiusM = 0
  let innerOrbitM = Infinity
  for (const m of system.markers) {
    if (m.kind !== 'planet') continue
    maxPlanetRadiusM = Math.max(maxPlanetRadiusM, m.radiusM || 0)
    innerOrbitM = Math.min(innerOrbitM, Math.hypot(m.x - cx, m.y - cy))
  }
  return {
    pxPerM,
    maxPlanetRadiusM: maxPlanetRadiusM || 1,
    maxPlanetPx,
    innerOrbitM: Number.isFinite(innerOrbitM) ? innerOrbitM : Infinity,
  }
}

/**
 * Orb radius in pixels. Planets and moons keep their game radii relative to the
 * largest planet; the star is drawn larger than any planet but never past half
 * the innermost planet orbit. Real size wins once the view is zoomed in that far.
 */
export function orbDisplayRadiusPx(marker: StarMapMarker, scale: BodyScale): number {
  const realPx = (marker.radiusM || 0) * scale.pxPerM
  if (marker.kind === 'star') {
    const cap = scale.innerOrbitM * scale.pxPerM * 0.5
    const want = scale.maxPlanetPx * 1.6
    return Math.max(Math.min(want, cap), realPx, 3)
  }
  const rel = (marker.radiusM || 0) / scale.maxPlanetRadiusM
  const display = scale.maxPlanetPx * rel
  const floor = marker.kind === 'planet' ? 2 : 1.5
  return Math.max(display, realPx, floor)
}

// ── Declutter ──────────────────────────────────────────────────────────────

export interface ProjectedMarker {
  marker: StarMapMarker
  sx: number
  sy: number
  /** Orb radius for star/planet/moon; half the icon size otherwise. */
  r: number
}

/**
 * Which markers to draw. Star and planets always show. A moon shows once it
 * clears its planet. An icon shows once it clears every visible orb and every
 * icon already placed. `forced` (highlighted / route) ids always show.
 */
export function declutterMarkers(items: ProjectedMarker[], forced: ReadonlySet<string> = new Set()): Set<string> {
  const visible = new Set<string>()
  const orbs: ProjectedMarker[] = []
  const planetsByName = new Map<string, ProjectedMarker>()

  for (const it of items) {
    if (it.marker.kind === 'star' || it.marker.kind === 'planet') {
      visible.add(it.marker.id)
      orbs.push(it)
      if (it.marker.kind === 'planet') planetsByName.set(it.marker.name, it)
    }
  }
  for (const it of items) {
    if (it.marker.kind !== 'moon') continue
    const parent = it.marker.parentName ? planetsByName.get(it.marker.parentName) : undefined
    const clear = !parent || Math.hypot(it.sx - parent.sx, it.sy - parent.sy) > parent.r + it.r + 2
    if (clear || forced.has(it.marker.id)) {
      visible.add(it.marker.id)
      orbs.push(it)
    }
  }

  const icons = items
    .filter((it) => !ORB_KINDS.has(it.marker.kind) && it.marker.kind !== 'belt')
    .sort((a, b) => {
      const fa = forced.has(a.marker.id) ? 0 : 1
      const fb = forced.has(b.marker.id) ? 0 : 1
      if (fa !== fb) return fa - fb
      return (ICON_PRIORITY[a.marker.kind] ?? 9) - (ICON_PRIORITY[b.marker.kind] ?? 9)
    })
  const placed: ProjectedMarker[] = []
  for (const it of icons) {
    if (forced.has(it.marker.id)) {
      visible.add(it.marker.id)
      placed.push(it)
      continue
    }
    const hitsOrb = orbs.some((o) => Math.hypot(it.sx - o.sx, it.sy - o.sy) < o.r + it.r + 2)
    if (hitsOrb) continue
    const hitsIcon = placed.some((p) => Math.hypot(it.sx - p.sx, it.sy - p.sy) < p.r + it.r + 2)
    if (hitsIcon) continue
    visible.add(it.marker.id)
    placed.push(it)
  }
  for (const it of items) if (it.marker.kind === 'belt') visible.add(it.marker.id)
  return visible
}
