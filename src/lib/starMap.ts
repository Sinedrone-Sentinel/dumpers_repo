export type StarMapKind =
  | 'star'
  | 'planet'
  | 'moon'
  | 'belt'
  | 'station'
  | 'transit'
  | 'landing'
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
  transit: 'Transit Point',
  landing: 'Landing Zone',
  jump_point: 'Jump Point',
  wikelo: 'Wikelo Station',
  comm_array: 'Comm Array',
  executive_hangar: 'Executive Hangar',
  supervisor: 'Supervisor Station',
  olp: 'Orbital Laser Platform',
  pa_station: "People's Alliance Station",
  qv: 'QV Station',
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
  orbit: 'rgba(148, 163, 184, 0.2)',
  belt: 'rgba(168, 184, 156, 0.06)',
  beltLabel: 'rgba(198, 206, 188, 0.8)',
  route: '#facc15',
  blink: '#facc15',
} as const

export const STAR_MAP_ICON_COLORS: Record<StarMapKind, string> = {
  star: STAR_MAP_COLORS.star,
  planet: STAR_MAP_COLORS.planet,
  moon: STAR_MAP_COLORS.moon,
  belt: '#4ade80',
  station: '#a78bfa',
  transit: '#67e8f9',
  landing: '#f0c674',
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

/** One row in the map key. QV stations are split so each type can be shown on its own. */
export interface StarMapPoiGroup {
  id: string
  label: string
  iconKind: StarMapKind
  color: string
  /** Off until the member clicks this row. */
  startsHidden: boolean
  /** A place a contract can send you, rather than a station you live at. */
  missionLocation: boolean
}

const QV_MISSION = 'Potential mission location. A contract can send you here.'

function uninitializedText(text: string | null | undefined): boolean {
  return !!text && text.toUpperCase().includes('UNINITIALIZED')
}

/** A marker whose text was never filled in. It stays off the map. */
export function isHiddenStarMapMarker(marker: StarMapMarker): boolean {
  return uninitializedText(marker.name) || uninitializedText(marker.description)
}

/**
 * Key row for an icon marker. Planets, moons, stars and belts are not rows.
 * Uninitialized markers are not rows. QV stations are split by the name members see.
 */
export function starMapPoiGroup(marker: StarMapMarker): StarMapPoiGroup | null {
  if (isHiddenStarMapMarker(marker) || ORB_KINDS.has(marker.kind) || marker.kind === 'belt') return null
  if (marker.kind === 'qv') {
    const name = marker.name
    if (/extraction/i.test(name)) {
      return {
        id: 'qv_extraction',
        label: 'QV Extraction Station',
        iconKind: 'qv',
        color: '#7dd3fc',
        startsHidden: true,
        missionLocation: true,
      }
    }
    if (/rockcracker/i.test(name)) {
      return {
        id: 'qv_rockcracker',
        label: 'Rockcracker Site',
        iconKind: 'qv',
        color: '#38bdf8',
        startsHidden: true,
        missionLocation: true,
      }
    }
    if (/BRK-\d+/i.test(name)) {
      return {
        id: 'qv_breaker_named',
        label: 'QV Breaker Station',
        iconKind: 'qv',
        color: '#c4b5fd',
        startsHidden: false,
        missionLocation: false,
      }
    }
    return {
      id: 'qv_breaker',
      label: 'QV Breaker Station',
      iconKind: 'qv',
      color: '#93c5fd',
      startsHidden: true,
      missionLocation: true,
    }
  }
  return {
    id: marker.kind,
    label: STAR_MAP_KIND_LABELS[marker.kind],
    iconKind: marker.kind,
    color: STAR_MAP_ICON_COLORS[marker.kind],
    startsHidden: false,
    missionLocation: false,
  }
}

/** Whether this marker is drawn. `enabled` holds key rows the member has clicked. */
export function starMapMarkerShown(marker: StarMapMarker, enabled: Readonly<Record<string, boolean>>): boolean {
  if (marker.kind === 'belt' || ORB_KINDS.has(marker.kind)) return !isHiddenStarMapMarker(marker)
  const group = starMapPoiGroup(marker)
  if (!group) return false
  if (Object.prototype.hasOwnProperty.call(enabled, group.id)) return enabled[group.id] === true
  return !group.startsHidden
}

/**
 * System a jump point opens for the member. Stanton's Magnus jump is the live
 * route to Nyx, so it reads as Nyx while the record name stays Magnus.
 * Nyx's Castra file is the live Stanton jump until that system exists.
 */
export function starMapJumpDestination(marker: StarMapMarker): string | null {
  if (marker.kind !== 'jump_point') return null
  if (marker.toSystem === 'magnus' || /magnus/i.test(marker.name)) return 'nyx'
  if (marker.systemId === 'nyx' && (marker.toSystem === 'castra' || /castra/i.test(marker.name))) return 'stanton'
  return marker.toSystem
}

/** Name drawn on the map. Jump points use the destination only. */
export function starMapMarkerLabel(marker: StarMapMarker): string {
  const dest = starMapJumpDestination(marker)
  if (!dest) return marker.name
  return `${dest.charAt(0).toUpperCase()}${dest.slice(1)} Jump Point`
}

export function starMapMarkerReadout(marker: StarMapMarker): { subtitle: string; mission: string | null; description: string | null } {
  const group = starMapPoiGroup(marker)
  let description = marker.description?.trim() || null
  if (description && uninitializedText(description)) description = null
  const dest = starMapJumpDestination(marker)
  if (dest && marker.toSystem && dest !== marker.toSystem) {
    const from = marker.systemId.charAt(0).toUpperCase() + marker.systemId.slice(1)
    const to = dest.charAt(0).toUpperCase() + dest.slice(1)
    description = `This jump point connects ${from} to ${to}.`
  }
  return {
    subtitle: group?.label ?? STAR_MAP_KIND_LABELS[marker.kind],
    mission: group?.missionLocation ? QV_MISSION : null,
    description,
  }
}

/** Legend order. QV types sit together. */
export const STAR_MAP_POI_ORDER = [
  'jump_point',
  'station',
  'transit',
  'landing',
  'wikelo',
  'comm_array',
  'executive_hangar',
  'supervisor',
  'olp',
  'pa_station',
  'qv_extraction',
  'qv_breaker',
  'qv_breaker_named',
  'qv_rockcracker',
  'outlaw',
  'rab',
  'rmb',
  'cluster',
]

/** Icon draw order when two icons compete for the same spot (lower wins). */
const ICON_PRIORITY: Partial<Record<StarMapKind, number>> = {
  jump_point: 0,
  wikelo: 1,
  executive_hangar: 1,
  supervisor: 2,
  landing: 2,
  station: 3,
  transit: 3,
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
  /** Planet id → its closest and farthest moon, meters. */
  moonSpanM: Map<string, { inner: number; outer: number }>
  /** Planet id → closest marker that is not the planet, its moons, or anything riding on them, meters. */
  neighbourM: Map<string, number>
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
  const moonSpanM = new Map<string, { inner: number; outer: number }>()
  for (const moon of bodies) {
    if (moon.kind !== 'moon' || !moon.parentName) continue
    const parent = byName.get(moon.parentName)
    if (!parent) continue
    const d = dist(moon, parent)
    firstMoonM.set(parent.id, Math.min(firstMoonM.get(parent.id) ?? Infinity, d))
    const span = moonSpanM.get(parent.id) ?? { inner: Infinity, outer: 0 }
    moonSpanM.set(parent.id, { inner: Math.min(span.inner, d), outer: Math.max(span.outer, d) })
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

  const neighbourM = new Map<string, number>()
  for (const planet of bodies) {
    if (planet.kind !== 'planet' || !moonSpanM.has(planet.id)) continue
    const family = (m: StarMapMarker | undefined): boolean =>
      !!m && (m.id === planet.id || (m.kind === 'moon' && m.parentName === planet.name))
    let near = Infinity
    for (const m of system.markers) {
      if (m.kind === 'star' || m.kind === 'belt' || family(m) || family(attachedTo.get(m.id))) continue
      near = Math.min(near, dist(m, planet))
    }
    neighbourM.set(planet.id, near)
  }

  const layout = { byName, clearM, attachedTo, moonSpanM, neighbourM }
  layoutCache.set(system, layout)
  return layout
}

export function systemBodyScale(
  system: StarMapSystem,
  pxPerM: number,
  fitPxPerM: number = pxPerM,
  maxPlanetPx = 14,
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

/** Gas giants read a little larger. Every other planet is the same disc. */
const GAS_GIANT_NAMES = new Set(['Crusader', 'Pyro V', 'Nyx III'])

/** Largest on-screen radius for a planet, as a multiple of the system-view disc. */
const PLANET_CEILING = 3
/** Largest on-screen radius for a moon. */
const MOON_MAX_PX = 16

function planetCeilingPx(marker: StarMapMarker, scale: BodyScale): number {
  const gas = GAS_GIANT_NAMES.has(marker.name) ? 1 : 0.9
  return scale.maxPlanetPx * gas * PLANET_CEILING
}

/** Pixels between a planet's disc and its first moon once the moons spread out. */
const MOON_GAP_PX = 12
/** The spread moons stay inside this share of the gap to the planet's nearest neighbour. */
const MOON_SPREAD_SHARE = 0.6

/**
 * Planet radius in pixels. Positions stay true to distance. A planet is not
 * scaled against the other planets in the system — a rocky world stays a disc
 * beside a gas giant. Zooming in only makes it larger, up to the on-screen
 * ceiling. Moons spread around that disc when the gap allows; the disc is
 * never shrunk to make that gap.
 */
function planetPx(marker: StarMapMarker, scale: BodyScale): number {
  const floor = scale.maxPlanetPx * (GAS_GIANT_NAMES.has(marker.name) ? 1 : 0.9)
  const zoom = Math.max(1, scale.pxPerM / scale.fitPxPerM)
  // Grow from the first zoom step, then stop at the on-screen ceiling.
  // Further zoom opens space around the disc instead of filling the view.
  return Math.min(floor * Math.pow(zoom, 0.65), planetCeilingPx(marker, scale))
}

/**
 * Orb radius in pixels. Planets share one readable size (gas giants a step
 * larger). A moon is its true share of its own planet. The star is larger
 * than any planet but never past half the innermost planet orbit. True pixel
 * size takes over only when the view is zoomed in that far.
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
    if (!parent?.radiusM) return Math.max(realPx, 1.5)
    const share = (marker.radiusM || 0) / parent.radiusM
    return Math.min(Math.max(orbDisplayRadiusPx(parent, scale) * share, 1.5), MOON_MAX_PX)
  }
  return Math.min(Math.max(planetPx(marker, scale), 10), planetCeilingPx(marker, scale))
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
 * How far a planet's moons are pushed out from it (1 = true distance). When the
 * view has room around the planet, the first moon sits just past the disc and
 * the other moons keep their distance ratios. With no room the moons stay put
 * (and hide behind the planet) until the view zooms in further.
 */
export function moonSpread(planet: StarMapMarker, scale: BodyScale): number {
  const span = scale.layout.moonSpanM.get(planet.id)
  if (!span) return 1
  const p = scale.pxPerM
  const want = (orbDisplayRadiusPx(planet, scale) + MOON_GAP_PX) / (span.inner * p)
  if (want <= 1) return 1
  const room = (scale.layout.neighbourM.get(planet.id) ?? Infinity) * p * MOON_SPREAD_SHARE
  return span.outer * p * want <= room ? want : 1
}

/** Pixels of clear space between a body disc and an icon parked on its rim. */
const ICON_RIM_GAP_PX = 4

/**
 * Keep an icon on its bearing from a body. When the drawn disc covers that
 * bearing, the icon sits just outside the disc so it can show as soon as the
 * rim has room.
 */
function besideBody(
  body: StarMapMarker,
  at: { x: number; y: number },
  dx: number,
  dy: number,
  scale: BodyScale,
): { x: number; y: number } {
  const dist = Math.hypot(dx, dy) || 1
  const need = orbDisplayRadiusPx(body, scale) + ICON_PX / 2 + ICON_RIM_GAP_PX
  const distPx = dist * scale.pxPerM
  const reach = (distPx < need ? need : distPx) / scale.pxPerM
  return { x: at.x + (dx / dist) * reach, y: at.y + (dy / dist) * reach }
}

/**
 * Map position to draw a marker at. Moons follow their planet's spread. An
 * icon covered by a drawn planet, moon, or its own nearby body moves out to
 * the rim on its real bearing. Once the true spot is clear, it uses that spot.
 */
export function displayPositionM(marker: StarMapMarker, scale: BodyScale): { x: number; y: number } {
  if (marker.kind === 'moon' && marker.parentName) {
    const parent = scale.layout.byName.get(marker.parentName)
    if (!parent) return { x: marker.x, y: marker.y }
    const s = moonSpread(parent, scale)
    return { x: parent.x + (marker.x - parent.x) * s, y: parent.y + (marker.y - parent.y) * s }
  }
  const body = scale.layout.attachedTo.get(marker.id)
  if (body) {
    const at = displayPositionM(body, scale)
    return besideBody(body, at, marker.x - body.x, marker.y - body.y, scale)
  }
  const pos = { x: marker.x, y: marker.y }
  for (const other of scale.layout.byName.values()) {
    if (other.kind !== 'planet' && other.kind !== 'moon' && other.kind !== 'star') continue
    const at = other.kind === 'moon' ? displayPositionM(other, scale) : { x: other.x, y: other.y }
    const next = besideBody(other, at, pos.x - at.x, pos.y - at.y, scale)
    if (next.x !== pos.x || next.y !== pos.y) return next
  }
  return pos
}

// ── 2D camera ──────────────────────────────────────────────────────────────

/** Map point at the view centre (meters, y up) and zoom. */
export interface StarMapCamera {
  cx: number
  cy: number
  pxPerM: number
}

/**
 * Camera after a box zoom. The middle of the rectangle becomes the middle of
 * the view, and the zoom fits the whole rectangle on screen.
 */
export function boxZoomCamera(
  cam: StarMapCamera,
  view: { w: number; h: number },
  box: { left: number; top: number; width: number; height: number },
): StarMapCamera {
  const width = Math.max(box.width, 1)
  const height = Math.max(box.height, 1)
  const pxPerM = cam.pxPerM * Math.min(view.w / width, view.h / height)
  const midX = box.left + width / 2
  const midY = box.top + height / 2
  return {
    pxPerM,
    cx: cam.cx + (midX - view.w / 2) / cam.pxPerM,
    cy: cam.cy - (midY - view.h / 2) / cam.pxPerM,
  }
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
