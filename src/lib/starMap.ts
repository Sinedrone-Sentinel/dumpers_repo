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
  | 'supervisor'
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
  supervisor: 'Supervisor Station',
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
  supervisor: '#2dd4bf',
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
  supervisor: 2,
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

/** Who sits around which planet or moon, worked out once per system. */
interface BodyLayout {
  byName: Map<string, StarMapMarker>
  /** Body id → closest neighbour that is not riding on it (its first moon orbit for a planet), meters. */
  clearM: Map<string, number>
  /** Station / comm array / other marker id → the body it orbits close in. */
  attachedTo: Map<string, StarMapMarker>
}

export interface BodyScale {
  /** Pixels per meter of map position. */
  pxPerM: number
  /** Pixels per meter when the whole system fits the view. */
  fitPxPerM: number
  /** Largest planet radius in the system, in meters. */
  maxPlanetRadiusM: number
  /** Display radius of the largest planet at the fit zoom, in pixels. */
  maxPlanetPx: number
  /** Distance from the star to the closest planet, in meters. */
  innerOrbitM: number
  layout: BodyLayout
}

/** A planet never covers more than this share of the gap to its first moon or neighbour. */
const BODY_CLEAR_SHARE = 0.45
/** Markers within this many body radii (and inside the first moon orbit) ride on that body. */
const ATTACH_RADII = 30

const layoutCache = new WeakMap<StarMapSystem, BodyLayout>()

function bodyLayout(system: StarMapSystem): BodyLayout {
  const cached = layoutCache.get(system)
  if (cached) return cached
  const byName = new Map<string, StarMapMarker>()
  const bodies = system.markers.filter((m) => m.kind === 'planet' || m.kind === 'moon')
  for (const m of system.markers) if (ORB_KINDS.has(m.kind)) byName.set(m.name, m)
  const dist = (a: StarMapMarker, b: StarMapMarker) => Math.hypot(a.x - b.x, a.y - b.y)

  const firstMoonM = new Map<string, number>()
  for (const moon of bodies) {
    if (moon.kind !== 'moon' || !moon.parentName) continue
    const parent = byName.get(moon.parentName)
    if (!parent) continue
    firstMoonM.set(parent.id, Math.min(firstMoonM.get(parent.id) ?? Infinity, dist(moon, parent)))
  }

  const attachedTo = new Map<string, StarMapMarker>()
  for (const m of system.markers) {
    if (ORB_KINDS.has(m.kind) || m.kind === 'belt' || m.kind === 'jump_point') continue
    let best: StarMapMarker | null = null
    let bestD = Infinity
    for (const b of bodies) {
      const d = dist(m, b)
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    if (!best?.radiusM) continue
    const limit = Math.min(best.radiusM * ATTACH_RADII, (firstMoonM.get(best.id) ?? Infinity) * 0.9)
    if (bestD < limit) attachedTo.set(m.id, best)
  }

  const clearM = new Map<string, number>()
  for (const b of bodies) {
    let clear = firstMoonM.get(b.id) ?? Infinity
    for (const m of system.markers) {
      if (m.id === b.id || m.kind === 'star' || m.kind === 'belt') continue
      if (attachedTo.get(m.id)?.id === b.id) continue
      if (m.kind === 'moon' && m.parentName === b.name) continue
      if (b.kind === 'moon' && m.name === b.parentName) continue
      clear = Math.min(clear, dist(m, b))
    }
    clearM.set(b.id, clear)
  }

  const layout = { byName, clearM, attachedTo }
  layoutCache.set(system, layout)
  return layout
}

export function systemBodyScale(
  system: StarMapSystem,
  pxPerM: number,
  fitPxPerM: number = pxPerM,
  maxPlanetPx = 16,
): BodyScale {
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
    fitPxPerM: fitPxPerM > 0 ? fitPxPerM : pxPerM,
    maxPlanetRadiusM: maxPlanetRadiusM || 1,
    maxPlanetPx,
    innerOrbitM: Number.isFinite(innerOrbitM) ? innerOrbitM : Infinity,
    layout: bodyLayout(system),
  }
}

/** Planet radius in pixels before the true-size and minimum-size floors. */
function planetPx(marker: StarMapMarker, scale: BodyScale): number {
  const fitPx = scale.maxPlanetPx * ((marker.radiusM || 0) / scale.maxPlanetRadiusM)
  const grown = fitPx * Math.sqrt(Math.max(1, scale.pxPerM / scale.fitPxPerM))
  const clear = scale.layout.clearM.get(marker.id) ?? Infinity
  return Math.min(grown, Math.max(fitPx, clear * scale.pxPerM * BODY_CLEAR_SHARE))
}

/**
 * Orb radius in pixels. Every planet and moon shares one size scale, so
 * planet-to-planet and moon-to-planet ratios match the game. Bodies grow as
 * the view zooms in, but a planet never covers its first moon orbit, and true
 * size wins once the view is zoomed in that far. The star is larger than any
 * planet but never past half the innermost planet orbit.
 */
export function orbDisplayRadiusPx(marker: StarMapMarker, scale: BodyScale): number {
  const realPx = (marker.radiusM || 0) * scale.pxPerM
  if (marker.kind === 'star') {
    const cap = scale.innerOrbitM * scale.pxPerM * 0.5
    const want = scale.maxPlanetPx * 1.6
    return Math.max(Math.min(want, cap), realPx, 3)
  }
  if (marker.kind === 'moon') {
    const parent = marker.parentName ? scale.layout.byName.get(marker.parentName) : undefined
    const own = planetPx(marker, scale)
    const px = parent?.radiusM
      ? Math.min(own, orbDisplayRadiusPx(parent, scale) * ((marker.radiusM || 0) / parent.radiusM))
      : own
    return Math.max(px, realPx, 1.5)
  }
  return Math.max(planetPx(marker, scale), realPx, 2)
}

/** How much a body is drawn larger than true size (1 = true size). */
export function bodyEnlargement(body: StarMapMarker, scale: BodyScale): number {
  if (!body.radiusM) return 1
  return Math.max(orbDisplayRadiusPx(body, scale) / (body.radiusM * scale.pxPerM), 1)
}

/**
 * Pixels per meter for a belt. A star belt uses the map scale. A planet ring
 * uses its planet's drawn scale, so the ring stays outside the enlarged planet.
 */
export function beltPxPerM(belt: StarMapMarker, parent: StarMapMarker | null, scale: BodyScale): number {
  if (!parent?.radiusM) return scale.pxPerM
  return scale.pxPerM * bodyEnlargement(parent, scale)
}

/**
 * Map position to draw a marker at. A station or comm array close in to a
 * planet or moon keeps its direction but moves out with the enlarged body,
 * so it is never hidden under the disc.
 */
export function displayPositionM(marker: StarMapMarker, scale: BodyScale): { x: number; y: number } {
  const body = scale.layout.attachedTo.get(marker.id)
  if (!body) return { x: marker.x, y: marker.y }
  const k = bodyEnlargement(body, scale)
  return { x: body.x + (marker.x - body.x) * k, y: body.y + (marker.y - body.y) * k }
}

// ── 2D camera ──────────────────────────────────────────────────────────────

/** Map point at the view centre (meters, y up) and zoom. */
export interface StarMapCamera {
  cx: number
  cy: number
  pxPerM: number
}

/**
 * Camera after a box zoom: the box's top-left becomes the view's top-left and
 * the box width spans the view width. Box height does not matter.
 */
export function boxZoomCamera(
  cam: StarMapCamera,
  view: { w: number; h: number },
  box: { left: number; top: number; width: number },
): StarMapCamera {
  const wx = cam.cx + (box.left - view.w / 2) / cam.pxPerM
  const wy = cam.cy - (box.top - view.h / 2) / cam.pxPerM
  const pxPerM = cam.pxPerM * (view.w / box.width)
  return { pxPerM, cx: wx + view.w / 2 / pxPerM, cy: wy - view.h / 2 / pxPerM }
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
