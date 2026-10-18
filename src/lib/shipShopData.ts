import gameBlueprints from '../data/game-blueprints.json'
import gameShips from '../data/game-ships.json'
import type { BlueprintForEffectiveStats } from './blueprintEffectiveStats'
import { buildDefaultSlotQualities } from './blueprintQuality'
import type { BlueprintWithSlots } from './blueprintResources'
import { getShipItem, shipItems } from './shipItemCatalog'
import {
  addPartToSnapshot,
  coolantDemand,
  coolantSupply,
  effectivePartStats,
  electromagneticSignature,
  emptySnapshot,
  infraredSignature,
  flightBladeFamily,
  itemIsEquippable,
  powerColumns,
  powerGenerated,
  radarRangeForPips,
  resolvedPower,
  segmentScale,
  shieldPowerFactor,
  type FittedPart,
  type MissileMount,
  type PortAccept,
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
  accepts?: PortAccept[]
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

function mountSizeFits(size: number, mount: { minSize: number; maxSize: number }): boolean {
  const min = mount.minSize || mount.maxSize || 0
  const max = mount.maxSize || mount.minSize || 0
  if (!max) return true
  return size >= min && size <= max
}

function humanMountName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function ordnanceSlotKind(mount: MissileMount): 'missile' | 'torpedo' | 'bomb' | null {
  if (mount.kind === 'bomb' || mount.kind === 'torpedo' || mount.kind === 'missile') return mount.kind
  return null
}

function slotFromMount(ship: GameShip, parentId: string, mount: MissileMount, fitted?: Record<string, FittedPart>): ShipPort {
  const id = `${parentId}/${mount.name}`
  const stock = ship.ports.find((port) => port.id === id)
  const fittedItem = fitted ? getShipItem(fitted[id]?.entityClass) : null
  const stockItem = getShipItem(mount.defaultEntityClass || stock?.defaultEntityClass || '')
  const shown = fittedItem || stockItem
  const ordnance = ordnanceSlotKind(mount)
  const kind = ordnance || (shown?.kind === 'weaponMount' || stock?.kind === 'weaponMount' ? 'weaponMount' : 'weapon')
  return {
    id,
    label: stock?.label || humanMountName(mount.name),
    section: ordnance ? 'missiles' : 'weapons',
    kind,
    size: mount.maxSize || mount.minSize,
    minSize: mount.minSize || mount.maxSize,
    maxSize: mount.maxSize || mount.minSize,
    defaultEntityClass: mount.defaultEntityClass || stock?.defaultEntityClass || null,
    locked: Boolean(mount.locked || stock?.locked),
    requiredTags: mount.requiredTags || stock?.requiredTags,
    portTags: mount.portTags || stock?.portTags,
    accepts: mount.accepts?.length ? mount.accepts : stock?.accepts,
  }
}

function resolveWeaponPorts(ship: GameShip, fitted?: Record<string, FittedPart>): ShipPort[] {
  const weaponPorts = ship.ports.filter((port) => port.kind === 'turret' || port.kind === 'weaponMount' || port.kind === 'weapon' || effectivePortKind(port) === 'weaponMount')
  if (!fitted) return weaponPorts
  const hidden = new Set<string>()
  const generated: ShipPort[] = []
  const visit = (parentId: string, item: ShipItemStats) => {
    for (const mount of item.mounts || []) {
      if (ordnanceSlotKind(mount)) continue
      const slot = slotFromMount(ship, parentId, mount, fitted)
      generated.push(slot)
      const child = getShipItem(fitted[slot.id]?.entityClass)
      if (child?.kind === 'weaponMount' && child.mounts?.length) visit(slot.id, child)
    }
  }
  for (const port of weaponPorts) {
    const item = getShipItem(fitted[port.id]?.entityClass)
    if (item?.kind !== 'weaponMount' || !item.mounts?.length) continue
    for (const child of weaponPorts) {
      if (child.id.startsWith(`${port.id}/`)) hidden.add(child.id)
    }
    visit(port.id, item)
  }
  const seen = new Set<string>()
  const merged: ShipPort[] = []
  for (const port of [...weaponPorts.filter((port) => !hidden.has(port.id)), ...generated]) {
    if (seen.has(port.id)) continue
    seen.add(port.id)
    merged.push(port)
  }
  return merged
}

/** A child stays only when the fitted parent mount still has that slot and the item fits it. */
function childAllowed(ship: GameShip, ports: Record<string, FittedPart>, portId: string): boolean {
  const slash = portId.lastIndexOf('/')
  if (slash < 0) return true
  const parentId = portId.slice(0, slash)
  if (!childAllowed(ship, ports, parentId)) return false
  const parentItem = getShipItem(ports[parentId]?.entityClass)
  if (!parentItem || parentItem.kind !== 'weaponMount' || !parentItem.mounts?.length) return true
  const mount = parentItem.mounts.find((entry) => entry.name === portId.slice(slash + 1))
  if (!mount) return false
  const item = getShipItem(ports[portId]?.entityClass)
  if (!item) return true
  if (!mountSizeFits(item.size, mount)) return false
  return itemFitsPort(item, slotFromMount(ship, parentId, mount, ports))
}

/** Turrets and mounts group the guns that sit on them. A turret with no guns stays out of this list. */
export function weaponTree(ship: GameShip, fitted?: Record<string, FittedPart>): WeaponNode[] {
  const ports = resolveWeaponPorts(ship, fitted)
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

const BESPOKE_KINDS = new Set(['quantum', 'shield', 'cooler', 'power', 'radar', 'life', 'armor'])

const MAKER_CODES = new Set(
  SHIPS.map((ship) => ship.manufacturerCode?.toLowerCase()).filter((code): code is string => Boolean(code)),
)

function shipHullTokens(shipId: string): string[] {
  let token = shipId.toLowerCase()
  const maker = [...MAKER_CODES].sort((a, b) => b.length - a.length).find((code) => token.startsWith(`${code}_`))
  if (maker) token = token.slice(maker.length + 1)
  if (token.length < 3) return []
  const tokens = [token]
  const series = token.match(/^(.*\d)[a-z]$/)
  if (series && series[1].length >= 3) tokens.push(series[1])
  const split = token.match(/^(.*)_([a-z])$/)
  if (split && split[1].length >= 3) tokens.push(split[1])
  return tokens
}

const HULL_TOKENS = [...new Set(SHIPS.flatMap((ship) => shipHullTokens(ship.id)))].sort((a, b) => b.length - a.length)

/** Ship-named parts (Allegro, a Javelin drive) stay on the hull they were built for. */
export function bespokeHullToken(entityClass: string): string | null {
  const hay = `_${entityClass.toLowerCase()}_`
  for (const token of HULL_TOKENS) {
    if (hay.includes(`_${token}_`)) return token
  }
  return null
}

function limitBespoke(port: ShipPort, items: ShipItemStats[]): ShipItemStats[] {
  const kind = effectivePortKind(port)
  if (!BESPOKE_KINDS.has(port.kind) && !BESPOKE_KINDS.has(kind)) return items
  const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
  const stockToken = stock ? bespokeHullToken(stock.entityClass) : null
  if (stockToken) return items.filter((item) => bespokeHullToken(item.entityClass) === stockToken)
  return items.filter((item) => !bespokeHullToken(item.entityClass))
}

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

function hasRawTag(value: string | null | undefined, tag: string): boolean {
  const needle = tag.toLowerCase()
  return (value || '').split(/\s+/).some((entry) => entry.replace(/^\$/, '').toLowerCase() === needle)
}

/** A gun hardpoint whose stock item is a mount (F7 ball turret) is a mount port. */
export function effectivePortKind(port: ShipPort): string {
  const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
  if (stock?.kind === 'weaponMount') return 'weaponMount'
  return port.kind
}

function attachmentFits(item: ShipItemStats, accepts: PortAccept[] | undefined): boolean {
  if (!accepts || accepts.length === 0) return true
  const type = (item.attachType || '').toLowerCase()
  const subtype = (item.attachSubType || '').toLowerCase()
  if (!type) return false
  return accepts.some((rule) => {
    if (rule.type.toLowerCase() !== type) return false
    const subtypes = (rule.subtypes || []).filter((entry) => entry && entry.toLowerCase() !== 'undefined')
    if (subtypes.length === 0 || !subtype || subtype === 'undefined') return true
    return subtypes.some((entry) => entry.toLowerCase() === subtype)
  })
}

function itemFitsPort(item: ShipItemStats, port: ShipPort): boolean {
  const portGives = tagList(port.portTags)
  const itemNeeds = tagList(item.requiredTags)
  if (itemNeeds.length > 0 && !itemNeeds.every((tag) => portGives.includes(tag))) return false
  const portNeeds = tagList(port.requiredTags)
  const itemGives = tagList(item.tags)
  if (portNeeds.length > 0 && !portNeeds.some((tag) => itemGives.includes(tag))) return false
  if (port.accepts && port.accepts.length > 0 && !attachmentFits(item, port.accepts)) return false
  const kind = effectivePortKind(port)
  if (kind === 'weapon' && item.kind === 'weapon') {
    const stockClass = (port.defaultEntityClass || '').toLowerCase()
    const shipLocked = item.entityClass.toLowerCase() !== stockClass && itemNeeds.length === 0 && !hasRawTag(item.tags, 'weaponMountUsable')
    if (shipLocked) return false
  }
  if (!(port.accepts && port.accepts.length > 0)) {
    if (port.kind === 'torpedo') return item.ordnance === 'torpedo'
    if (port.kind === 'bomb') return item.ordnance === 'bomb'
    if (port.kind === 'missile') return item.ordnance === 'missile' || (item.kind === 'missile' && item.ordnance == null)
  }
  return true
}

function sameKind(item: ShipItemStats, port: ShipPort): boolean {
  const kind = effectivePortKind(port)
  if (kind === 'torpedo' || kind === 'missile' || kind === 'bomb') return item.kind === 'missile'
  return item.kind === kind
}

function ordnancePort(port: ShipPort): boolean {
  return port.kind === 'missile' || port.kind === 'torpedo' || port.kind === 'bomb'
}

export function partsForPort(port: ShipPort): ShipItemStats[] {
  if (port.locked) {
    const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
    return stock ? [stock] : []
  }
  const min = port.minSize || port.size
  const max = port.maxSize || port.size
  const typed = Boolean(port.accepts && port.accepts.length > 0)
  const pool = shipItems().filter((item, index, list) => {
    if (!itemIsEquippable(item)) return false
    if (typed) {
      if (!attachmentFits(item, port.accepts)) return false
    } else if (!sameKind(item, port)) return false
    if (min && (item.size < min || item.size > max)) return false
    return list.findIndex((other) => other.entityClass === item.entityClass) === index
  })
  if (port.kind === 'flight') {
    const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
    if (!stock) return []
    const family = flightBladeFamily(stock.entityClass, stock.tags, stock.requiredTags)
    return pool
      .filter((item) => flightBladeFamily(item.entityClass, item.tags, item.requiredTags) === family)
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.entityClass.localeCompare(b.entityClass))
  }
  let matched = pool.filter((item) => itemFitsPort(item, port))
  if (matched.length === 0 && !ordnancePort(port)) {
    const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
    const stockTags = tagList(stock?.tags)
    matched = stockTags.length > 0
      ? pool.filter((item) => tagList(item.tags).some((tag) => stockTags.includes(tag)))
      : pool.filter((item) => item.entityClass === port.defaultEntityClass)
  }
  return limitBespoke(port, matched).sort((a, b) => a.displayName.localeCompare(b.displayName))
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
    const kind = mount.kind === 'bomb' || mount.kind === 'torpedo' || mount.kind === 'missile'
      ? mount.kind
      : rack.kind === 'torpedo' ? 'torpedo' : 'missile'
    return {
      id,
      label: mount.name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      section: 'missiles',
      kind,
      locked: rack.locked,
      size: maxSize,
      minSize,
      maxSize,
      defaultEntityClass: stock?.defaultEntityClass ?? mount.defaultEntityClass ?? null,
      requiredTags: mount.requiredTags || stock?.requiredTags,
      portTags: mount.portTags || stock?.portTags,
      accepts: mount.accepts?.length ? mount.accepts : stock?.accepts,
    }
  })
}

function deleteDescendants(ports: Record<string, FittedPart>, parentId: string) {
  const prefix = `${parentId}/`
  for (const key of Object.keys(ports)) {
    if (key.startsWith(prefix)) delete ports[key]
  }
}

function lockedFit(mount: MissileMount, stock: ShipPort | undefined): FittedPart | null {
  const entityClass = mount.defaultEntityClass || stock?.defaultEntityClass
  const item = entityClass ? getShipItem(entityClass) : null
  if (!item || !mountSizeFits(item.size, mount)) return null
  return { entityClass: item.entityClass, source: 'stock' }
}

function mountFit(ship: GameShip, parentId: string, mount: MissileMount, stock: ShipPort | undefined): FittedPart | null {
  const fit = lockedFit(mount, stock)
  if (!fit) return null
  const item = getShipItem(fit.entityClass)
  if (!item || !itemFitsPort(item, slotFromMount(ship, parentId, mount))) return null
  return fit
}

function missileTubeOk(item: ShipItemStats | null, mount: MissileMount): boolean {
  if (!item || !mountSizeFits(item.size, mount)) return false
  if (mount.accepts?.length && !attachmentFits(item, mount.accepts)) return false
  return true
}

function syncMissileTubes(ports: Record<string, FittedPart>, parentId: string, item: ShipItemStats | null) {
  const mounts = item?.kind === 'missileRack' ? item.mounts || [] : []
  const allowed = new Map(mounts.map((mount) => [`${parentId}/${mount.name}`, mount]))
  for (const key of Object.keys(ports)) {
    if (!key.startsWith(`${parentId}/`)) continue
    const mount = allowed.get(key)
    const child = getShipItem(ports[key].entityClass)
    if (!mount || !missileTubeOk(child, mount)) delete ports[key]
  }
}

/** Keep a child gun when it still fits the new mount. Locked guns are filled from the mount. */
function syncMountChildren(ship: GameShip, ports: Record<string, FittedPart>, parentId: string, item: ShipItemStats | null) {
  const mounts = item?.kind === 'weaponMount' ? item.mounts || [] : []
  if (mounts.length === 0) {
    deleteDescendants(ports, parentId)
    return
  }
  const allowed = new Set(mounts.map((mount) => mount.name))
  for (const key of Object.keys(ports)) {
    if (!key.startsWith(`${parentId}/`)) continue
    const top = key.slice(parentId.length + 1).split('/')[0]
    if (!allowed.has(top)) delete ports[key]
  }
  for (const mount of mounts) {
    const id = `${parentId}/${mount.name}`
    const stock = ship.ports.find((port) => port.id === id)
    const slot = slotFromMount(ship, parentId, mount)
    const current = ports[id] ? getShipItem(ports[id].entityClass) : null
    const currentFits = Boolean(current && mountSizeFits(current.size, mount) && itemFitsPort(current, slot))
    if (mount.locked) {
      const fit = lockedFit(mount, stock)
      if (fit) ports[id] = fit
      else if (!currentFits) {
        delete ports[id]
        deleteDescendants(ports, id)
      }
    } else if (!currentFits) {
      const fit = mountFit(ship, parentId, mount, stock)
      if (fit) ports[id] = fit
      else {
        delete ports[id]
        deleteDescendants(ports, id)
      }
    }
    const fittedNow = ports[id] ? getShipItem(ports[id].entityClass) : null
    if (fittedNow?.kind === 'weaponMount') {
      if (mount.child) {
        const childMount = (fittedNow.mounts || []).find((entry) => entry.name === mount.child?.name) || fittedNow.mounts?.[0]
        const childItem = getShipItem(mount.child.defaultEntityClass)
        const childId = childMount ? `${id}/${childMount.name}` : ''
        const childCurrent = childId && ports[childId] ? getShipItem(ports[childId].entityClass) : null
        const childSlot = childMount ? slotFromMount(ship, id, childMount) : null
        const childFits = Boolean(childCurrent && childMount && childSlot && mountSizeFits(childCurrent.size, childMount) && itemFitsPort(childCurrent, childSlot))
        if (childMount && childItem && childSlot && mountSizeFits(childItem.size, childMount) && itemFitsPort(childItem, childSlot) && (mount.locked || !childFits)) {
          ports[`${id}/${childMount.name}`] = { entityClass: childItem.entityClass, source: 'stock' }
        }
      }
      syncMountChildren(ship, ports, id, fittedNow)
    } else if (fittedNow?.kind === 'missileRack') {
      syncMissileTubes(ports, id, fittedNow)
    } else {
      deleteDescendants(ports, id)
    }
  }
}

export function applyPortFit(
  ship: GameShip | null,
  ports: Record<string, FittedPart>,
  port: ShipPort,
  part: FittedPart | null,
): Record<string, FittedPart> {
  const previous = getShipItem(ports[port.id]?.entityClass)
  const next = { ...ports }
  if (!part) delete next[port.id]
  else next[port.id] = part
  if (!ship) return next
  const item = part ? getShipItem(part.entityClass) : null
  if (port.kind === 'missileRack' || item?.kind === 'missileRack' || previous?.kind === 'missileRack') {
    syncMissileTubes(next, port.id, item?.kind === 'missileRack' ? item : null)
    return next
  }
  const mountParent = port.kind === 'weaponMount' || port.kind === 'turret' || effectivePortKind(port) === 'weaponMount' || item?.kind === 'weaponMount'
  if (mountParent) syncMountChildren(ship, next, port.id, item)
  return next
}

export function fitPartOnPorts(
  ship: GameShip,
  ports: Record<string, FittedPart>,
  targets: ShipPort[],
  part: FittedPart | null,
): Record<string, FittedPart> {
  return targets.reduce((next, target) => applyPortFit(ship, next, target, part), ports)
}

/** Other slots of the same component, or the other missiles on this rack, that can take this part. */
export function matchingCopyPorts(ship: GameShip, fitted: Record<string, FittedPart>, source: ShipPort): ShipPort[] {
  const part = fitted[source.id]
  const item = part ? getShipItem(part.entityClass) : null
  if (!item || source.locked) return []
  const accepts = (port: ShipPort) => port.id !== source.id && !port.locked && partsForPort(port).some((entry) => entry.entityClass === item.entityClass)
  if (source.kind === 'missile') {
    const rackId = source.id.slice(0, source.id.lastIndexOf('/'))
    const rack = ship.ports.find((port) => port.id === rackId)
    if (!rack) return []
    return missileSlotsForRack(ship, rack, fitted[rack.id]).filter(accepts)
  }
  if (source.kind === 'weapon' || source.kind === 'torpedo' || source.kind === 'missileRack' || source.kind === 'weaponMount' || source.kind === 'turret') return []
  return ship.ports.filter((port) => port.kind === source.kind && accepts(port))
}

export interface WeaponCopyGroup {
  rootId: string
  rootName: string
  slots: ShipPort[]
}

function mountFamily(port: ShipPort, fitted?: FittedPart): string {
  const item = getShipItem(fitted?.entityClass || port.defaultEntityClass || '')
  const text = `${port.id} ${port.label} ${item?.entityClass || ''} ${item?.displayName || ''}`.toLowerCase()
  if (text.includes('ball')) return 'ball'
  if (port.kind === 'turret' || text.includes('turret')) return 'turret'
  if (text.includes('gimbal') || text.includes('varipuck')) return 'gimbal'
  if (text.includes('fixed')) return 'fixed'
  return 'fixed'
}

function gunLeaves(node: WeaponNode): ShipPort[] {
  if (node.port.kind !== 'turret' && effectivePortKind(node.port) !== 'weaponMount') return [node.port]
  return node.children.flatMap(gunLeaves)
}

function findWeaponNode(nodes: WeaponNode[], portId: string): WeaponNode | null {
  for (const node of nodes) {
    if (node.port.id === portId) return node
    const nested = findWeaponNode(node.children, portId)
    if (nested) return nested
  }
  return null
}

function rootWeaponNode(nodes: WeaponNode[], portId: string): WeaponNode | null {
  for (const node of nodes) {
    if (node.port.id === portId || findWeaponNode(node.children, portId)) return node
  }
  return null
}

/** Root mounts of the same type as this gun, with each gun slot that can take it. */
export function weaponCopyGroups(ship: GameShip, fitted: Record<string, FittedPart>, source: ShipPort): WeaponCopyGroup[] {
  const part = fitted[source.id]
  const item = part ? getShipItem(part.entityClass) : null
  if (!item || source.kind !== 'weapon' || source.locked) return []
  const tree = weaponTree(ship, fitted)
  const root = rootWeaponNode(tree, source.id)
  if (!root) return []
  const family = mountFamily(root.port, fitted[root.port.id])
  const groups: WeaponCopyGroup[] = []
  for (const node of tree) {
    if (mountFamily(node.port, fitted[node.port.id]) !== family) continue
    const slots = gunLeaves(node).filter((port) => !port.locked && partsForPort(port).some((entry) => entry.entityClass === item.entityClass))
    if (slots.length === 0) continue
    const fittedRoot = getShipItem(fitted[node.port.id]?.entityClass)
    groups.push({
      rootId: node.port.id,
      rootName: fittedRoot?.displayName || node.port.label,
      slots,
    })
  }
  return groups
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
  for (const port of ship.ports) {
    const item = getShipItem(ports[port.id]?.entityClass)
    if (item?.kind === 'weaponMount') syncMountChildren(ship, ports, port.id, item)
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

/** Mining lasers and the towing beam draw their own segments. They are not gun-pool weapons. */
function pipKind(portKind: string, entityClass: string): string {
  const id = entityClass.toLowerCase()
  if (id.includes('towingbeam')) return 'towing'
  if (id.includes('mining_laser')) return 'mining'
  const item = getShipItem(entityClass)
  if (item?.kind === 'missileRack' || item?.kind === 'missile') return item.kind
  return portKind
}

export function fittedPowerParts(ship: GameShip, ports: Record<string, FittedPart> | null | undefined): PowerPart[] {
  const parts: PowerPart[] = []
  if (!ports) return parts
  const seen = new Set<string>()
  const push = (portId: string, kind: string, size: number) => {
    if (seen.has(portId) || !childAllowed(ship, ports, portId)) return
    const fitted = statsForFitted(ports[portId])
    if (!fitted) return
    seen.add(portId)
    parts.push({
      portId,
      kind: pipKind(kind, fitted.item.entityClass),
      size: fitted.item.size || size || 0,
      stats: fitted.stats,
    })
  }
  for (const port of ship.ports) push(port.id, port.kind, port.size || port.maxSize || 0)
  for (const portId of Object.keys(ports)) {
    if (seen.has(portId)) continue
    const item = getShipItem(ports[portId]?.entityClass)
    if (!item) continue
    push(portId, item.kind, item.size)
  }
  return parts
}

export function snapshotForBuild(
  ship: GameShip | null,
  ports: Record<string, FittedPart>,
  power?: Record<string, number> | null,
): ShipSnapshotNumbers {
  const snapshot = emptySnapshot(ship)
  if (!ship || !ports) return snapshot
  const parts = fittedPowerParts(ship, ports)
  const columns = powerColumns(ship.weaponPowerPool || 0, parts)
  const assignedPower = resolvedPower(columns, power, powerGenerated(parts))
  const scales = new Map<string, number>()
  const pipCounts = new Map<string, number>()
  const weaponColumn = columns.find((column) => column.id === 'weapons')
  const weaponSelected = weaponColumn ? (assignedPower[weaponColumn.id] || 0) : 0
  const weaponFull = weaponColumn?.fullPower || 0
  const weaponFraction = weaponFull > 0 ? Math.min(weaponSelected, weaponFull) / weaponFull : 0
  const poweredPorts = new Set(columns.flatMap((column) => column.blocks.map((block) => block.portId).filter((portId): portId is string => Boolean(portId))))
  for (const column of columns) {
    if (column.id === 'weapons') continue
    const seen = new Set<string>()
    for (const block of column.blocks) {
      if (!block.portId || seen.has(block.portId)) continue
      seen.add(block.portId)
      const part = parts.find((entry) => entry.portId === block.portId)
      const count = assignedPower[block.portId] || 0
      pipCounts.set(block.portId, count)
      scales.set(block.portId, part ? segmentScale(part.stats, count) : 0)
    }
  }
  const scaleFor = (part: PowerPart) => {
    if (part.kind === 'weapon') return weaponColumn ? weaponFraction : 1
    if (scales.has(part.portId)) return scales.get(part.portId) || 0
    return poweredPorts.has(part.portId) ? 0 : 1
  }
  for (const part of parts) {
    const pips = pipCounts.get(part.portId) || 0
    const scale = part.kind === 'shield' ? shieldPowerFactor(part.stats, pips) : scaleFor(part)
    addPartToSnapshot(snapshot, part.kind, part.stats, scale)
    if (part.kind === 'radar') {
      const range = radarRangeForPips(part.stats, pips)
      if (range != null) snapshot.radarRange = Math.max(snapshot.radarRange || 0, range)
    }
  }
  const generated = powerGenerated(parts)
  const supply = coolantSupply(parts, pipCounts)
  const demand = coolantDemand(parts, pipCounts, weaponSelected)
  const armor = parts.find((part) => part.kind === 'armor')
  const multiplier = (percent?: number) => 1 + (percent || 0) / 100
  const armorEm = multiplier(armor?.stats.Armor_SignalEm)
  const armorIr = multiplier(armor?.stats.Armor_SignalIr)
  snapshot.coolant = supply
  snapshot.coolantDemand = demand
  snapshot.coolantRatio = supply > 0 ? Math.min(demand / supply, 1) : 0
  snapshot.signatureEm = electromagneticSignature(parts, pipCounts, generated, weaponSelected, armorEm)
  snapshot.signatureIr = infraredSignature(parts, pipCounts, demand, supply, armorIr)
  if (snapshot.signatureCs != null) snapshot.signatureCs *= multiplier(armor?.stats.Armor_SignalCs)
  return snapshot
}

export function portsForSection(ship: GameShip, sectionId: string, fitted?: Record<string, FittedPart>): ShipPort[] {
  const rows = sectionId === 'missiles'
    ? ship.ports.filter((port) => port.kind === 'missileRack' || port.kind === 'torpedo')
    : ship.ports.filter((port) => port.kind === SECTION_KIND[sectionId])
  if (!fitted) return rows
  return rows.filter((port) => childAllowed(ship, fitted, port.id))
}
