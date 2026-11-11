import cavesData from '../data/game-caves.json'
import { describeJumps, navMap, pathBetween, pointById, type NavMap } from './navSystems'

export interface CaveBody {
  id: string
  name: string
  label: string
  systemId: string
  systemName: string
  navPointId: string
  radiusM: number
  omRadiusM: number
}

export interface CaveSite {
  id: string
  bodyId: string
  biome: string
  biomeNum: string
  occupied: boolean
  occNum: string
  size: string
  sizeRest: string[]
  x: number
  y: number
  z: number
}

export interface CavePlace {
  bodyId: string
  name: string
  x: number
  y: number
  z: number
}

type Vec = [number, number, number]

const AXES: { name: string; axis: Vec }[] = [
  { name: 'OM-1', axis: [0, 0, 1] },
  { name: 'OM-2', axis: [0, 0, -1] },
  { name: 'OM-3', axis: [0, 1, 0] },
  { name: 'OM-4', axis: [0, -1, 0] },
  { name: 'OM-5', axis: [1, 0, 0] },
  { name: 'OM-6', axis: [-1, 0, 0] },
]

export const caveBodies = cavesData.bodies as CaveBody[]
export const caveSites = cavesData.caves as CaveSite[]
export const cavePlaces = cavesData.places as CavePlace[]

const bodyById = new Map(caveBodies.map((body) => [body.id, body]))
const placesByBody = new Map<string, CavePlace[]>()
for (const place of cavePlaces) {
  const list = placesByBody.get(place.bodyId)
  if (list) list.push(place)
  else placesByBody.set(place.bodyId, [place])
}

export function caveBody(id: string): CaveBody | null {
  return bodyById.get(id) ?? null
}

const caveIndex = new Map<string, number>()
{
  const groups = new Map<string, CaveSite[]>()
  for (const cave of caveSites) {
    const key = `${cave.bodyId}\0${cave.biome}`
    const list = groups.get(key)
    if (list) list.push(cave)
    else groups.set(key, [cave])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id))
    list.forEach((cave, index) => caveIndex.set(cave.id, index + 1))
  }
}

function biomeLabel(biome: string): string {
  if (!biome) return 'Unknown'
  return biome.charAt(0).toUpperCase() + biome.slice(1)
}

/** Stable catalog name: "Stanton 1b Sand Cave 023". The number is that body's count of this kind. */
export function caveDisplayName(cave: CaveSite): string {
  const where = bodyById.get(cave.bodyId)?.label ?? cave.bodyId
  const number = String(caveIndex.get(cave.id) ?? 0).padStart(3, '0')
  return `${where} ${biomeLabel(cave.biome)} Cave ${number}`
}

export function caveTags(cave: CaveSite): string[] {
  const size = [cave.size, ...cave.sizeRest].join('x')
  const tags = [
    `${cave.biome} - ${cave.biomeNum}`,
    `${cave.occupied ? 'occupied' : 'unoccupied'} - ${cave.occNum}`,
    `size ${size}`,
  ]
  if (cave.id.endsWith('_fauna')) tags.push('fauna')
  return tags
}

function vecOf(point: { x: number; y: number; z: number }): Vec {
  return [point.x, point.y, point.z]
}

function distanceM(a: Vec, b: Vec): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * In-game compass north lies along +Y (OM-3). Checked against published
 * surface headings: HDMS-Bezdek to the Arial cave at 26.0, -235.2, 251.1 km
 * is 222.9°, and the reverse is 43.0°.
 */
export function compassHeading(from: Vec, to: Vec): number {
  const remap = (p: Vec): Vec => [p[2], p[0], p[1]]
  const [ax, ay, az] = remap(from)
  const [bx, by, bz] = remap(to)
  const ar = Math.hypot(ax, ay, az)
  const br = Math.hypot(bx, by, bz)
  const lat1 = Math.asin(az / ar)
  const lon1 = Math.atan2(ay, ax)
  const lat2 = Math.asin(bz / br)
  const lon2 = Math.atan2(by, bx)
  const dlon = lon2 - lon1
  const y = Math.sin(dlon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlon)
  return (Math.atan2(y, x) * 180) / Math.PI
}

export function heading360(degrees: number): number {
  return (degrees + 360) % 360
}

export function headingCardinal(degrees: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return names[Math.round(heading360(degrees) / 45) % 8]
}

export function formatKm(km: number): string {
  const digits = km < 100 ? 1 : 0
  return `${km.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} km`
}

export interface CaveMarker {
  name: string
  km: number
}

export interface CaveOmDescent {
  marker: string
  heading: number
  /** Surface distance from the point under the marker to the cave. */
  approxKm: number
  /** Flight from the marker down to the surface, then across to the cave. */
  flyKm: number
}

export interface CaveApproach {
  name: string
  km: number
  heading: number
  backHeading: number
}

export interface CaveSurfaceRoute {
  markers: CaveMarker[]
  place: CaveApproach | null
  /** True when the orbital-marker flight is shorter than the nearest named location, or there is no named location. */
  useOmDescent: boolean
  omDescent: CaveOmDescent
}

function surfaceArcKm(from: Vec, to: Vec, radiusM: number): number {
  const fromLen = Math.hypot(from[0], from[1], from[2])
  const toLen = Math.hypot(to[0], to[1], to[2])
  if (fromLen === 0 || toLen === 0 || radiusM <= 0) return distanceM(from, to) / 1000
  const dot = (from[0] * to[0] + from[1] * to[1] + from[2] * to[2]) / (fromLen * toLen)
  const clamped = Math.min(1, Math.max(-1, dot))
  return (Math.acos(clamped) * radiusM) / 1000
}

export function surfaceRoute(cave: CaveSite): CaveSurfaceRoute {
  const body = bodyById.get(cave.bodyId)
  const here = vecOf(cave)
  const radius = body?.omRadiusM ?? 0
  const ranked = AXES.map(({ name, axis }) => {
    const beacon: Vec = [axis[0] * radius, axis[1] * radius, axis[2] * radius]
    return { name, axis, km: distanceM(here, beacon) / 1000 }
  }).sort((a, b) => a.km - b.km)
  const nearest = ranked[0]
  const surfaceRadius = body?.radiusM ?? 0
  const surfacePoint: Vec = [
    nearest.axis[0] * surfaceRadius,
    nearest.axis[1] * surfaceRadius,
    nearest.axis[2] * surfaceRadius,
  ]
  const approxKm = surfaceArcKm(surfacePoint, here, surfaceRadius)
  const descentKm = Math.max(0, (radius - surfaceRadius) / 1000)
  const omDescent: CaveOmDescent = {
    marker: nearest.name,
    heading: heading360(compassHeading(surfacePoint, here)),
    approxKm,
    flyKm: descentKm + approxKm,
  }
  const markers = ranked.slice(0, 3).map(({ name, km }) => ({ name, km }))

  let place: CaveApproach | null = null
  let best = Number.POSITIVE_INFINITY
  for (const candidate of placesByBody.get(cave.bodyId) ?? []) {
    const from = vecOf(candidate)
    const meters = distanceM(from, here)
    if (meters >= best) continue
    best = meters
    place = {
      name: candidate.name,
      km: meters / 1000,
      heading: heading360(compassHeading(from, here)),
      backHeading: heading360(compassHeading(here, from)),
    }
  }
  const useOmDescent = place == null || place.km >= omDescent.flyKm
  return { markers, place, useOmDescent, omDescent }
}

export interface CaveSmartRoute {
  reachable: boolean
  jumps: string[]
  alreadyThere: boolean
  bodyName: string
  surface: CaveSurfaceRoute
}

export function smartCaveRoute(startId: string | null, cave: CaveSite, nav: NavMap = navMap): CaveSmartRoute {
  const body = bodyById.get(cave.bodyId)
  const bodyName = body?.name ?? cave.bodyId
  const surface = surfaceRoute(cave)
  if (!body) return { reachable: false, jumps: [], alreadyThere: false, bodyName, surface }
  const start = pointById(nav, startId)
  if (!start) return { reachable: false, jumps: [], alreadyThere: false, bodyName, surface }
  if (start.id === body.navPointId) {
    return { reachable: true, jumps: [], alreadyThere: true, bodyName, surface }
  }
  const path = pathBetween(nav, start.id, body.navPointId)
  return {
    reachable: path.reachable,
    jumps: describeJumps(path.hops),
    alreadyThere: false,
    bodyName,
    surface,
  }
}
