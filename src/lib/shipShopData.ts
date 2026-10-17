import gameBlueprints from '../data/game-blueprints.json'
import gameShips from '../data/game-ships.json'
import type { BlueprintForEffectiveStats } from './blueprintEffectiveStats'
import { buildDefaultSlotQualities } from './blueprintQuality'
import type { BlueprintWithSlots } from './blueprintResources'
import { getShipItem, shipItems } from './shipItemCatalog'
import {
  addPartToSnapshot,
  assignedSegments,
  columnTotal,
  effectivePartStats,
  emptySnapshot,
  itemIsEquippable,
  powerColumns,
  radarRangeForPips,
  resolvedPower,
  segmentScale,
  type FittedPart,
  type MissileMount,
  type PowerPart,
  type ShipItemStats,
  type ShipSnapshotNumbers,
} from './shipShopMath'

export type { FittedPart, ShipItemStats, ShipSnapshotNumbers }

export interface ShipPort {
  id: string
  label: string
  section: string
  kind: string
  size: number
  minSize: number
  maxSize: number
  defaultEntityClass: string | null
  locked?: boolean
  requiredTags?: string
  portTags?: string
}

export interface GameShip {
  id: string
  displayName: string
  manufacturer: string
  manufacturerCode: string
  role: string
  career: string
  crew: number
  hullHp: number | null
  crossSection?: number | null
  noise?: number
  decoy?: number
  damageReduction: number | null
  pitch: number | null
  yaw: number | null
  roll: number | null
  scmSpeed: number | null
  boostSpeed: number | null
  maxSpeed: number | null
  weaponPowerPool?: number
  ports: ShipPort[]
}

export interface ShipBuild {
  shipId: string | null
  ports: Record<string, FittedPart>
  power?: Record<string, number>
}

export interface ShipShopStore {
  version: 1
  builds: ShipBuild[]
}

export interface CraftBlueprint extends BlueprintForEffectiveStats {
  entityClass?: string | null
  blueprintName?: string
  categoryName?: string
}

export const SHIP_SHOP_BUILD_COUNT = 4

export const SHIP_SECTIONS = [
  { id: 'weapons', label: 'Weapons' },
  { id: 'missiles', label: 'Missiles' },
  { id: 'shields', label: 'Shields' },
  { id: 'power', label: 'Power Plants' },
  { id: 'coolers', label: 'Coolers' },
  { id: 'quantum', label: 'Quantum Drives' },
  { id: 'flight', label: 'Flight Blades' },
  { id: 'radar', label: 'Radar' },
  { id: 'tractor', label: 'Tractor Beams' },
  { id: 'interdiction', label: 'Interdiction' },
] as const

const SECTION_KIND: Record<string, string> = {
  weapons: 'weapon',
  missiles: 'missileRack',
  shields: 'shield',
  power: 'power',
  coolers: 'cooler',
  quantum: 'quantum',
  flight: 'flight',
  radar: 'radar',
  tractor: 'tractor',
  interdiction: 'qed',
}

export interface WeaponNode {
  port: ShipPort
  children: WeaponNode[]
}

/** Turrets and mounts group the guns that sit on them. A turret with no guns stays out of this list. */
export function weaponTree(ship: GameShip): WeaponNode[] {
  const ports = ship.ports.filter((port) => port.kind === 'turret' || port.kind === 'weaponMount' || port.kind === 'weapon')
  const ids = new Set(ports.map((port) => port.id))
  const childMap = new Map<string, ShipPort[]>()
  const roots: ShipPort[] = []
  for (const port of ports) {
    const parentId = [...ids].filter((id) => id !== port.id && port.id.startsWith(`${id}/`)).sort((a, b) => b.length - a.length)[0]
    if (!parentId) roots.push(port)
    else childMap.set(parentId, [...(childMap.get(parentId) || []), port])
  }
  const build = (port: ShipPort): WeaponNode => ({
    port,
    children: (childMap.get(port.id) || []).map(build),
  })
  const hasGun = (node: WeaponNode): boolean => node.port.kind !== 'turret' || node.children.some(hasGun)
  return roots.map(build).filter(hasGun)
}

export const SHIPS: GameShip[] = (gameShips as { ships: GameShip[] }).ships

const shipById = new Map(SHIPS.map((ship) => [ship.id, ship]))

const blueprintsByClass = new Map<string, CraftBlueprint>()
for (const blueprint of (gameBlueprints as { blueprints: CraftBlueprint[] }).blueprints) {
  if (blueprint.entityClass) rememberBlueprint(blueprint.entityClass, blueprint)
}

function aliasKeys(entityClass: string): string[] {
  const key = entityClass.toLowerCase()
  const keys = [key]
  if (key.endsWith('_scitem')) keys.push(key.slice(0, -'_scitem'.length))
  return keys
}

function rememberBlueprint(entityClass: string, blueprint: CraftBlueprint) {
  for (const key of aliasKeys(entityClass)) {
    if (!blueprintsByClass.has(key)) blueprintsByClass.set(key, blueprint)
  }
}

export function getShip(shipId: string | null | undefined): GameShip | null {
  if (!shipId) return null
  return shipById.get(shipId) ?? null
}

export function blueprintForEntity(entityClass: string | null | undefined): CraftBlueprint | null {
  if (!entityClass) return null
  return blueprintsByClass.get(entityClass.toLowerCase()) ?? null
}

const GENERIC_PORT_TAGS = new Set(['flightready', 'weaponmountusable'])

function tagList(value: string | null | undefined): string[] {
  return (value || '')
    .split(/\s+/)
    .map((tag) => tag.replace(/^\$/, ''))
    .filter((tag) => tag && !GENERIC_PORT_TAGS.has(tag.toLowerCase()))
}

function itemFitsPort(item: ShipItemStats, port: ShipPort): boolean {
  const portGives = tagList(port.portTags)
  const itemNeeds = tagList(item.requiredTags)
  if (itemNeeds.length > 0 && !itemNeeds.every((tag) => portGives.includes(tag))) return false
  const portNeeds = tagList(port.requiredTags)
  const itemGives = tagList(item.tags)
  if (portNeeds.length > 0 && !portNeeds.some((tag) => itemGives.includes(tag))) return false
  if (port.kind === 'torpedo') return item.ordnance === 'torpedo'
  if (port.kind === 'missile') return item.ordnance !== 'torpedo'
  return true
}

function sameKind(item: ShipItemStats, port: ShipPort): boolean {
  if (port.kind === 'torpedo' || port.kind === 'missile') return item.kind === 'missile'
  return item.kind === port.kind
}

export function partsForPort(port: ShipPort): ShipItemStats[] {
  if (port.locked) {
    const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
    return stock ? [stock] : []
  }
  const min = port.minSize || port.size
  const max = port.maxSize || port.size
  const pool = shipItems().filter((item, index, list) => {
    if (!sameKind(item, port) || !itemIsEquippable(item)) return false
    if (min && (item.size < min || item.size > max)) return false
    return list.findIndex((other) => other.entityClass === item.entityClass) === index
  })
  let matched = pool.filter((item) => itemFitsPort(item, port))
  if (matched.length === 0) {
    const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
    const stockTags = tagList(stock?.tags)
    matched = stockTags.length > 0
      ? pool.filter((item) => tagList(item.tags).some((tag) => stockTags.includes(tag)))
      : pool.filter((item) => item.entityClass === port.defaultEntityClass)
  }
  return matched.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function missileSlotsForRack(ship: GameShip, rack: ShipPort, fitted: FittedPart | undefined): ShipPort[] {
  if (!fitted) return []
  const mounts: MissileMount[] = getShipItem(fitted.entityClass)?.mounts || []
  if (mounts.length === 0) {
    return ship.ports.filter((port) => port.kind === 'missile' && port.id.startsWith(`${rack.id}/`))
  }
  return mounts.map((mount) => {
    const id = `${rack.id}/${mount.name}`
    const stock = ship.ports.find((port) => port.id === id)
    const maxSize = mount.maxSize || mount.minSize
    const minSize = mount.minSize || maxSize
    return {
      id,
      label: mount.name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      section: 'missiles',
      kind: rack.kind === 'torpedo' ? 'torpedo' : 'missile',
      locked: rack.locked,
      size: maxSize,
      minSize,
      maxSize,
      defaultEntityClass: stock?.defaultEntityClass ?? null,
      requiredTags: stock?.requiredTags,
      portTags: stock?.portTags,
    }
  })
}

export function applyPortFit(
  ship: GameShip | null,
  ports: Record<string, FittedPart>,
  port: ShipPort,
  part: FittedPart | null,
): Record<string, FittedPart> {
  const next = { ...ports }
  if (!part) delete next[port.id]
  else next[port.id] = part
  if (port.kind !== 'missileRack' || !ship) return next
  const mounts = part ? getShipItem(part.entityClass)?.mounts || [] : []
  const allowed = new Map(mounts.map((mount) => [`${port.id}/${mount.name}`, mount]))
  for (const key of Object.keys(next)) {
    if (!key.startsWith(`${port.id}/`)) continue
    const mount = allowed.get(key)
    const item = getShipItem(next[key].entityClass)
    const min = mount ? mount.minSize || mount.maxSize : 0
    const max = mount ? mount.maxSize || mount.minSize : 0
    if (!mount || !item || (max > 0 && (item.size < min || item.size > max))) delete next[key]
  }
  return next
}

export function emptyBuild(): ShipBuild {
  return { shipId: null, ports: {} }
}

export function emptyShipShopStore(): ShipShopStore {
  return {
    version: 1,
    builds: Array.from({ length: SHIP_SHOP_BUILD_COUNT }, () => emptyBuild()),
  }
}

export function stockPorts(ship: GameShip): Record<string, FittedPart> {
  const ports: Record<string, FittedPart> = {}
  for (const port of ship.ports) {
    if (!port.defaultEntityClass || !getShipItem(port.defaultEntityClass)) continue
    ports[port.id] = { entityClass: port.defaultEntityClass, source: 'stock' }
  }
  return ports
}

function normalizeQualities(raw: unknown): Record<number, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const qualities: Record<number, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key)
    if (Number.isInteger(index) && typeof value === 'number' && Number.isFinite(value)) {
      qualities[index] = value
    }
  }
  return Object.keys(qualities).length > 0 ? qualities : undefined
}

function normalizePower(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const power: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) power[key] = value
  }
  return Object.keys(power).length > 0 ? power : undefined
}

function normalizeBuild(raw: unknown): ShipBuild {
  if (!raw || typeof raw !== 'object') return emptyBuild()
  const record = raw as { shipId?: unknown; ports?: unknown; power?: unknown }
  const shipId = typeof record.shipId === 'string' && getShip(record.shipId) ? record.shipId : null
  const ports: Record<string, FittedPart> = {}
  if (record.ports && typeof record.ports === 'object') {
    for (const [portId, value] of Object.entries(record.ports as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const fitted = value as { entityClass?: unknown; source?: unknown; qualities?: unknown }
      if (typeof fitted.entityClass !== 'string' || !getShipItem(fitted.entityClass)) continue
      if (!itemIsEquippable(getShipItem(fitted.entityClass)!)) continue
      ports[portId] = {
        entityClass: fitted.entityClass,
        source: fitted.source === 'crafted' && blueprintForEntity(fitted.entityClass) ? 'crafted' : 'stock',
        qualities: normalizeQualities(fitted.qualities),
      }
    }
  }
  return { shipId, ports, power: normalizePower(record.power) }
}

export function parseShipShopStore(raw: unknown): ShipShopStore {
  const empty = emptyShipShopStore()
  if (!raw || typeof raw !== 'object') return empty
  const builds = (raw as { builds?: unknown }).builds
  if (!Array.isArray(builds)) return empty
  return {
    version: 1,
    builds: Array.from({ length: SHIP_SHOP_BUILD_COUNT }, (_, index) => normalizeBuild(builds[index])),
  }
}

export function defaultCraftQualities(entityClass: string): Record<number, number> | undefined {
  const blueprint = blueprintForEntity(entityClass)
  if (!blueprint?.slots?.length) return undefined
  return buildDefaultSlotQualities(blueprint as BlueprintWithSlots)
}

export function statsForFitted(part: FittedPart | undefined): { item: ShipItemStats; stats: Record<string, number> } | null {
  if (!part) return null
  const item = getShipItem(part.entityClass)
  if (!item) return null
  const blueprint = part.source === 'crafted' ? blueprintForEntity(part.entityClass) : null
  return {
    item,
    stats: effectivePartStats(item, part.source, blueprint, part.qualities),
  }
}

export function fittedPowerParts(ship: GameShip, ports: Record<string, FittedPart>): PowerPart[] {
  const parts: PowerPart[] = []
  for (const port of ship.ports) {
    const fitted = statsForFitted(ports[port.id])
    if (!fitted) continue
    parts.push({
      portId: port.id,
      kind: port.kind,
      size: fitted.item.size || port.size || port.maxSize || 0,
      stats: fitted.stats,
    })
  }
  return parts
}

export function snapshotForBuild(
  ship: GameShip | null,
  ports: Record<string, FittedPart>,
  power?: Record<string, number> | null,
): ShipSnapshotNumbers {
  const snapshot = emptySnapshot(ship)
  if (!ship) return snapshot
  const parts = fittedPowerParts(ship, ports)
  const columns = powerColumns(ship.weaponPowerPool || 0, parts)
  const assignedPower = resolvedPower(columns, power, powerGenerated(parts))
  const scales = new Map<string, number>()
  const pipCounts = new Map<string, number>()
  const weaponColumn = columns.find((column) => column.id === 'weapons')
  const weaponTotal = weaponColumn ? columnTotal(weaponColumn) : 0
  const weaponFraction = weaponColumn ? (assignedPower[weaponColumn.id] || 0) / Math.max(1, weaponTotal) : 1
  for (const column of columns) {
    if (column.id === 'weapons') continue
    const selected = assignedPower[column.id] || 0
    const assigned = assignedSegments(column, selected)
    for (const [portId, count] of assigned) {
      pipCounts.set(portId, count)
      const part = parts.find((entry) => entry.portId === portId)
      scales.set(portId, part ? segmentScale(part.stats, count) : 0)
    }
  }
  for (const part of parts) {
    let scale = scales.get(part.portId) ?? 1
    if (part.kind === 'weapon') scale = weaponColumn ? weaponFraction : 1
    addPartToSnapshot(snapshot, part.kind, part.stats, scale)
    if (part.kind === 'radar') {
      const range = radarRangeForPips(part.stats, pipCounts.get(part.portId) || 0)
      if (range != null) snapshot.radarRange = Math.max(snapshot.radarRange || 0, range)
    }
  }
  const armor = parts.find((part) => part.kind === 'armor')
  const multiplier = (percent?: number) => 1 + (percent || 0) / 100
  snapshot.signatureEm *= multiplier(armor?.stats.Armor_SignalEm)
  snapshot.signatureIr *= multiplier(armor?.stats.Armor_SignalIr)
  if (snapshot.signatureCs != null) snapshot.signatureCs *= multiplier(armor?.stats.Armor_SignalCs)
  return snapshot
}

export function portsForSection(ship: GameShip, sectionId: string): ShipPort[] {
  if (sectionId === 'missiles') return ship.ports.filter((port) => port.kind === 'missileRack' || port.kind === 'torpedo')
  const kind = SECTION_KIND[sectionId]
  if (!kind) return []
  return ship.ports.filter((port) => port.kind === kind)
}
