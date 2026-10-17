import gameBlueprints from '../data/game-blueprints.json'
import gameShips from '../data/game-ships.json'
import type { BlueprintForEffectiveStats } from './blueprintEffectiveStats'
import { buildDefaultSlotQualities } from './blueprintQuality'
import type { BlueprintWithSlots } from './blueprintResources'
import { getShipItem, shipItems } from './shipItemCatalog'
import {
  addPartToSnapshot,
  assignedSegments,
  columnSelected,
  effectivePartStats,
  emptySnapshot,
  powerColumns,
  segmentScale,
  type FittedPart,
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
  { id: 'defense', label: 'Defense' },
  { id: 'systems', label: 'Systems' },
  { id: 'hull', label: 'Hull and flight' },
] as const

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

export function partsForPort(port: ShipPort): ShipItemStats[] {
  const min = port.minSize || port.size
  const max = port.maxSize || port.size
  return shipItems()
    .filter((item) => {
      if (item.kind !== port.kind) return false
      if (!min) return true
      return item.size >= min && item.size <= max
    })
    .filter((item, index, list) => list.findIndex((other) => other.entityClass === item.entityClass) === index)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
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
    parts.push({ portId: port.id, kind: port.kind, stats: fitted.stats })
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
  const scales = new Map<string, number>()
  let weaponsOn = true
  for (const column of columns) {
    const selected = columnSelected(column, power?.[column.id])
    if (column.id === 'weapons') {
      weaponsOn = selected > 0
      continue
    }
    const assigned = assignedSegments(column, selected)
    for (const [portId, count] of assigned) {
      const part = parts.find((entry) => entry.portId === portId)
      scales.set(portId, part ? segmentScale(part.stats, count) : 0)
    }
  }
  for (const part of parts) {
    let scale = scales.get(part.portId) ?? 1
    if (part.kind === 'weapon') scale *= weaponsOn ? 1 : 0
    addPartToSnapshot(snapshot, part.kind, part.stats, scale)
  }
  return snapshot
}

export function portsForSection(ship: GameShip, sectionId: string): ShipPort[] {
  if (sectionId === 'hull') return ship.ports.filter((port) => port.kind === 'flight')
  if (sectionId === 'systems') return ship.ports.filter((port) => port.section === 'systems' && port.kind !== 'flight')
  return ship.ports.filter((port) => port.section === sectionId)
}
