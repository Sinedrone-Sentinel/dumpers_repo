/**
 * Flyable ship catalog for Fuzy's Ship Shop.
 * Player ships only: AI, unmanned, and template variants are skipped.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { extractShipItemStats, weaponBurstDps } from './shipItemStats.mjs'
import { applyShipPartRules } from './shipPartRules.mjs'

const SKIP_SHIP = /(?:^|_)(?:pu(?:_|$)|ai(?:_|$)|unmanned|template|display|showdown|gamemaster|fleetweek|tutorial|hijacked|teach|boarded|nointerior|swarm|defendship|collector|lowpoly|invictus|restoration|ninetails|temp(?:_|$)|test(?:_|$)|gs(?:_|$)|ea(?:_|$)|exec(?:_|$)|plat(?:_|$)|bis\d|eaobjective|derelict)/i

const INDEX_DIRS = [
  'entities/scitem/ships/weapons',
  'entities/scitem/ships/weapons/missiles',
  'entities/scitem/ships/cooler',
  'entities/scitem/ships/powerplant',
  'entities/scitem/ships/shieldgenerator',
  'entities/scitem/ships/quantumdrive',
  'entities/scitem/ships/radar',
  'entities/scitem/ships/armor',
  'entities/scitem/ships/weapon_mounts',
  'entities/scitem/ships/missile_racks',
  'entities/scitem/ships/controller',
  'entities/scitem/ships/countermeasures',
  'entities/scitem/ships/lifesupport',
  'entities/scitem/ships/quantumenforcementdevice',
  'entities/scitem/ships/module',
]

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(path, acc)
    else if (entry.name.endsWith('.json')) acc.push(path)
  }
  return acc
}

function usableName(name) {
  const text = String(name || '').trim()
  if (!text || text.startsWith('@') || text.startsWith('<=')) return false
  if (/placeholder/i.test(text)) return false
  return true
}

function humanizeEntity(entityClass) {
  return String(entityClass || '')
    .replace(/_scitem$/i, '')
    .split('_')
    .filter((word) => word && !/^\d+$/.test(word))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function weaponClassFromName(entityClass, displayName) {
  const text = `${entityClass} ${displayName}`.toLowerCase()
  if (text.includes('scatter')) return 'Scattergun'
  if (text.includes('gatling')) return 'Gatling'
  if (text.includes('repeater')) return 'Repeater'
  if (text.includes('cannon')) return 'Cannon'
  if (text.includes('distortion')) return 'Distortion'
  return 'Gun'
}

function damageTypeFromStats(stats) {
  const physical = stats.Weapon_Damage_Physical || 0
  const energy = stats.Weapon_Damage_Energy || 0
  const distortion = stats.Weapon_Damage_Distortion || 0
  const ranked = [
    ['Physical', physical],
    ['Energy', energy],
    ['Distortion', distortion],
  ].sort((a, b) => b[1] - a[1])
  return ranked[0][1] > 0 ? ranked[0][0] : null
}

function resolveName(key, localization) {
  if (!key || typeof key !== 'string') return null
  if (!key.startsWith('@')) return key
  const lookup = key.slice(1)
  const value = localization[lookup] || localization[lookup.toLowerCase()]
  if (!value || value.startsWith('@')) return null
  return value
}

function isPlayerShipFile(fileName) {
  const base = fileName.replace(/\.json$/i, '')
  if (base === 'spaceship_template') return false
  if (/^(probe_|orbital_sentry)/i.test(base)) return false
  return !SKIP_SHIP.test(base)
}

function sizeFromName(name) {
  const match = String(name || '').match(/_s0*(\d+)(?:_|$)/i)
  return match ? Number(match[1]) : null
}

/** An empty loadout entry still names its class, as in hardpoint_class_4_nose. */
function sizeFromClass(name) {
  const match = String(name || '').match(/class_(\d+)/i)
  return match ? Number(match[1]) : null
}

/** XML port types for a slot that has no item fitted. */
function kindFromPortDef(def) {
  if (!def?.accepts?.length) return null
  const types = def.accepts.map((entry) => String(entry.type || '').toLowerCase())
  const has = (name) => types.includes(name)
  if (has('missilelauncher') || has('bomblauncher')) return { section: 'missiles', kind: 'missileRack' }
  if (has('torpedo') && !has('missilelauncher')) return { section: 'missiles', kind: 'torpedo' }
  if (has('turret')) return { section: 'weapons', kind: 'weaponMount' }
  if (has('weapongun')) return { section: 'weapons', kind: 'weapon' }
  if (has('emp')) return { section: 'emp', kind: 'emp' }
  if (has('module')) return { section: 'modules', kind: 'module' }
  if (has('shield')) return { section: 'defense', kind: 'shield' }
  if (has('cooler')) return { section: 'systems', kind: 'cooler' }
  if (has('powerplant')) return { section: 'systems', kind: 'power' }
  if (has('quantumdrive')) return { section: 'systems', kind: 'quantum' }
  if (has('radar')) return { section: 'systems', kind: 'radar' }
  if (has('lifesupport')) return { section: 'systems', kind: 'life' }
  if (has('armor') || has('armour')) return { section: 'defense', kind: 'armor' }
  if (has('flightcontroller')) return { section: 'systems', kind: 'flight' }
  return null
}

function entityKeyFromEntry(entry) {
  if (entry?.entityClassName) return entry.entityClassName
  const ref = entry?.entityClassReference
  if (typeof ref === 'string') {
    const match = ref.match(/([^/\\]+)\.json$/i)
    return match ? match[1] : ''
  }
  return ''
}

function refPath(ref, fromFile, extractedRoot) {
  if (!ref || typeof ref !== 'string' || !ref.startsWith('file://')) return null
  const rel = ref.replace(/^file:\/\/\.?\/?/i, '')
  const candidate = join(fromFile, '..', rel)
  if (existsSync(candidate)) return candidate
  const libs = ref.toLowerCase().indexOf('libs/foundry/records/')
  if (libs >= 0) {
    const tail = ref.slice(libs)
    const rooted = join(extractedRoot, tail)
    if (existsSync(rooted)) return rooted
  }
  return null
}

function walkEntries(node, parentPath, out) {
  if (!node || typeof node !== 'object') return
  const list = Array.isArray(node.entries) ? node.entries : null
  if (!list) return
  for (const entry of list) {
    if (entry?._Type_ !== 'SItemPortLoadoutEntryParams') continue
    const name = entry.itemPortName || 'port'
    const path = parentPath ? `${parentPath}/${name}` : name
    out.push({ path, name, entry })
    if (entry.loadout && typeof entry.loadout === 'object') walkEntries(entry.loadout, path, out)
  }
}

function firstComponent(json, type) {
  return (json?._RecordValue_?.Components || []).find((comp) => comp?._Type_ === type) || null
}

function attachDef(json) {
  return firstComponent(json, 'SAttachableComponentParams')?.AttachDef || null
}

function kindForItem(filePath, entityKey) {
  const id = `${filePath} ${entityKey}`.toLowerCase().replace(/\\/g, '/')
  if (id.includes('/missiles/') || /(?:^|_)misl_|gmisl_/.test(entityKey.toLowerCase())) return 'missile'
  if (id.includes('/weapon_mounts/') || /mount_gimbal|mount_fixed/.test(id)) return 'weaponMount'
  if (id.includes('/shieldgenerator/')) return 'shield'
  if (id.includes('/cooler/')) return 'cooler'
  if (id.includes('/powerplant/')) return 'power'
  if (id.includes('/quantumdrive/')) return 'quantum'
  if (id.includes('/radar/')) return 'radar'
  if (id.includes('/armor/')) return 'armor'
  if (id.includes('/controller/') && id.includes('flight')) return 'flight'
  if (id.includes('/lifesupport/')) return 'life'
  if (id.includes('/quantumenforcementdevice/') || /(?:^|_)(?:qed|qdmp)_/.test(entityKey.toLowerCase())) return 'qed'
  if (/tractorbeam/.test(entityKey.toLowerCase())) return 'tractor'
  if (id.includes('/weapons/emp/') || /(?:^|_)emp_device/.test(entityKey.toLowerCase())) return 'emp'
  if (id.includes('/ships/module/')) return 'module'
  if (id.includes('/weapons/') && !id.includes('/missiles/')) return 'weapon'
  if (/mrck_|missilerack/.test(id)) return 'missileRack'
  return null
}

const ITEM_KIND_PORT = {
  shield: ['defense', 'shield'],
  armor: ['defense', 'armor'],
  cooler: ['systems', 'cooler'],
  power: ['systems', 'power'],
  quantum: ['systems', 'quantum'],
  radar: ['systems', 'radar'],
  life: ['systems', 'life'],
  flight: ['systems', 'flight'],
  weapon: ['weapons', 'weapon'],
  emp: ['emp', 'emp'],
  module: ['modules', 'module'],
}

function isShieldPortName(name) {
  return name.includes('shieldgenerator') || name.includes('shield_generator') || name.includes('shield_gen') || name.includes('shieldgen')
}

function isRadarPortName(name) {
  if (!name.includes('radar') || !name.includes('hardpoint')) return false
  return !name.includes('display') && !name.includes('helper') && !name.includes('screen')
}

function isQuantumPortName(name) {
  if (name.includes('fuel') || name.includes('tank')) return false
  return name.includes('quantumdrive') || name.includes('quantum_drive')
}

function classifyPort(name, entityKey, itemKind) {
  const n = name.toLowerCase()
  const e = (entityKey || '').toLowerCase()
  if (n.includes('weapon_rack') || n.includes('weaponrack') || n.includes('weapon_locker') || n.includes('weaponlocker') || n.includes('weapons_locker') || n.includes('gun_rack') || n.includes('gunrack') || n.includes('regen_pool')) return null
  if (n.includes('seat') || n.includes('dashboard') || n.includes('seataccess') || n.includes('camera')) return null
  if (n.includes('controller_flight')) return { section: 'systems', kind: 'flight' }
  if (n.includes('controller')) return null
  if (itemKind === 'emp' || /(?:^|_)emp_device(?:_|$)/.test(e)) return { section: 'emp', kind: 'emp' }
  if (e.includes('tractorbeam')) return { section: 'systems', kind: 'tractor' }
  if (n === 'hardpoint_qed' || e.includes('qed_') || e.includes('qdmp_')) return { section: 'systems', kind: 'qed' }
  if (n.includes('missilerack') || e.includes('mrck_') || e.includes('missilerack')) {
    return { section: 'missiles', kind: 'missileRack' }
  }
  if (n.includes('missile') || e.includes('misl_') || e.includes('gmisl_')) {
    return { section: 'missiles', kind: 'missile' }
  }
  if (itemKind === 'weaponMount' || e.includes('mount_gimbal') || e.includes('mount_fixed') || e.includes('varipuck') || n.includes('varipuck')) {
    return { section: 'weapons', kind: 'weaponMount' }
  }
  const fromItem = ITEM_KIND_PORT[itemKind]
  if (fromItem) return { section: fromItem[0], kind: fromItem[1] }
  // Radar ports are sometimes named like a turret. The fitted item wins above;
  // the name check still has to beat the turret rule when the item is unnamed.
  if (isRadarPortName(n)) return { section: 'systems', kind: 'radar' }
  if (isShieldPortName(n)) return { section: 'defense', kind: 'shield' }
  if (n.includes('turret') && !n.includes('tractor') && !n.includes('relay')) return { section: 'weapons', kind: 'turret' }
  if (n.includes('weapon') || n.includes('hardpoint_class_') || n.includes('hardpoint_gun')) return { section: 'weapons', kind: 'weapon' }
  if (itemKind === 'weapon' && !/salvage|mining_laser|rpod_|massdriver|railgun|(?:^|_)emp(?:_|$)/.test(`${n} ${e}`)) {
    return { section: 'weapons', kind: 'weapon' }
  }
  if (/(^|_)armou?r(_|$)/.test(n)) return { section: 'defense', kind: 'armor' }
  if (n.includes('cooler')) return { section: 'systems', kind: 'cooler' }
  if (n.includes('power_plant') || n.includes('powerplant')) return { section: 'systems', kind: 'power' }
  if (isQuantumPortName(n)) return { section: 'systems', kind: 'quantum' }
  if (n.includes('lifesupport') || n.includes('life_support')) return { section: 'systems', kind: 'life' }
  if (n.includes('torpedo')) return { section: 'missiles', kind: 'torpedo' }
  return null
}

function classAndGrade(description, gradeNumber) {
  const text = String(description || '')
  const grade = text.match(/Grade:\s*([A-D])/i)?.[1]?.toUpperCase()
  const itemClass = text.match(/Class:\s*([A-Za-z]+)/)?.[1] || null
  const letters = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }
  return { itemClass, grade: grade || letters[gradeNumber] || null }
}

function missileGuidance(entityClass) {
  const key = String(entityClass || '').toLowerCase()
  if (/(?:^|_)em(?:_|$)/.test(key)) return 'EM'
  if (/(?:^|_)ir(?:_|$)/.test(key)) return 'IR'
  if (/(?:^|_)cs(?:_|$)/.test(key)) return 'CS'
  return null
}

function attrValue(source, key) {
  const found = String(source || '').match(new RegExp(`${key}="([^"]*)"`, 'i'))
  return found ? found[1] : ''
}

function shapePort(name, port, portDefs) {
  const def = portDefs.get(String(name || '').toLowerCase())
  const next = { ...port }
  const acceptTypes = (def?.accepts || []).map((entry) => String(entry.type || '').toLowerCase())
  const turretMount = acceptTypes.includes('turret') && !acceptTypes.some((type) => type.includes('missile') || type.includes('bomb') || type === 'torpedo')
  if (/torpedo/i.test(name) && !turretMount) next.kind = 'torpedo'
  if (def) {
    if (def.minSize) next.minSize = def.minSize
    if (def.maxSize) next.maxSize = def.maxSize
    if (def.minSize && def.maxSize && def.minSize === def.maxSize) next.size = def.maxSize
    if (def.requiredTags) next.requiredTags = def.requiredTags
    if (def.portTags) next.portTags = def.portTags
    if (def.accepts?.length) next.accepts = def.accepts
  }
  if (next.kind === 'torpedo' || next.kind === 'life') next.locked = true
  if (def && /uneditable/i.test(def.flags || '') && next.kind !== 'flight') next.locked = true
  return next
}

function portDefsFromXml(text) {
  const defs = new Map()
  if (!text) return defs
  let part = ''
  let current = null
  for (const line of text.split('\n')) {
    const partMatch = line.match(/<Part name="([^"]+)"/i)
    if (partMatch) part = partMatch[1]
    const portMatch = line.match(/<ItemPort\s+([^>]+)>/i)
    if (portMatch && part) {
      const attrs = portMatch[1]
      const minSize = Number(attrValue(attrs, 'minSize')) || 0
      const maxSize = Number(attrValue(attrs, 'maxSize')) || minSize
      current = {
        minSize,
        maxSize,
        flags: attrValue(attrs, 'flags'),
        requiredTags: attrValue(attrs, 'requiredTags'),
        portTags: attrValue(attrs, 'portTags'),
        accepts: [],
      }
      defs.set(part.toLowerCase(), current)
    }
    if (!current) continue
    const typeMatch = line.match(/<Type\s+([^>]*?)\s*\/?>/i)
    if (typeMatch) {
      const type = attrValue(typeMatch[1], 'type')
      if (type) {
        const subtypes = attrValue(typeMatch[1], 'subtypes')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
        current.accepts.push({ type, subtypes })
      }
    }
    if (/<\/ItemPort>/i.test(line)) current = null
  }
  return defs
}

function portTitle(name) {
  return name
    .split('/')
    .pop()
    .replace(/^hardpoint_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function applyNumberModifier(base, modifier) {
  if (base == null || !modifier || typeof modifier.value !== 'number') return base
  return modifier.type === 'Scalar' ? base * modifier.value : base + modifier.value
}

function legacyFlightModifier(json, readRef) {
  let ref = null
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.modifiersLegacy === 'string') ref = node.modifiersLegacy
    for (const value of Object.values(node)) walk(value)
  }
  walk(json)
  if (!ref) return null
  const record = readRef(ref)
  const value = record?._RecordValue_ || null
  return value?._Type_ === 'SIFCSModifiersLegacy' ? value : null
}

/** Handling and speed blades store a change on top of the stock speeds and turn rates. */
export function applyLegacyFlightModifiers(flight, modifier) {
  if (!modifier) return flight
  const numbers = modifier.numbers || []
  flight.scmSpeed = applyNumberModifier(flight.scmSpeed, numbers[0])
  flight.boostSpeed = applyNumberModifier(flight.boostSpeed, numbers[1])
  flight.boostBack = applyNumberModifier(flight.boostBack, numbers[2])
  flight.maxSpeed = applyNumberModifier(flight.maxSpeed, numbers[3])
  const angular = modifier.vectors?.[0]
  if (angular?.value) {
    const scale = angular.type === 'Scalar'
    if (flight.pitch != null) flight.pitch = scale ? flight.pitch * angular.value.x : flight.pitch + angular.value.x
    if (flight.roll != null) flight.roll = scale ? flight.roll * angular.value.y : flight.roll + angular.value.y
    if (flight.yaw != null) flight.yaw = scale ? flight.yaw * angular.value.z : flight.yaw + angular.value.z
  }
  return flight
}

function flightStats(json) {
  let angular = null
  let scm = null
  let boost = null
  let boostBack = null
  let maxSpeed = null
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.scmSpeed === 'number') {
      scm = node.scmSpeed
      if (node.maxAngularVelocity?.x != null) angular = node.maxAngularVelocity
    }
    if (typeof node.boostSpeedForward === 'number') boost = node.boostSpeedForward
    if (typeof node.boostSpeedBackward === 'number') boostBack = node.boostSpeedBackward
    if (typeof node.maxSpeed === 'number' && node.scmSpeed != null) maxSpeed = node.maxSpeed
    for (const value of Object.values(node)) walk(value)
  }
  walk(json)
  return {
    pitch: angular?.x ?? null,
    yaw: angular?.z ?? null,
    roll: angular?.y ?? null,
    scmSpeed: scm,
    boostSpeed: boost,
    boostBack,
    maxSpeed,
  }
}

function weaponPowerPool(json) {
  let pool = 0
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node._Type_ === 'FixedPowerPool' && node.itemType === 'WeaponGun' && typeof node.poolSize === 'number') {
      pool = Math.max(pool, node.poolSize)
    }
    for (const value of Object.values(node)) walk(value)
  }
  walk(json)
  return pool
}

function damageReduction(vehicle) {
  const mods = vehicle?.vehicleArmourModifiers
  if (!Array.isArray(mods)) return null
  const gun = mods.find((mod) => Array.isArray(mod.types) && mod.types.includes('WeaponGun'))
  return typeof gun?.modifier === 'number' && gun.modifier > 0 ? gun.modifier : null
}

function vehicleXml(extractedRoot, vehicle) {
  const def = vehicle?.vehicleDefinition
  if (!def || typeof def !== 'string') return ''
  const path = join(extractedRoot, 'vehicle-xml', basename(def))
  if (!existsSync(path)) return ''
  const text = readFileSync(path, 'utf8')
  return text.includes('<Vehicle') ? text : ''
}

/** Hull HP is the sum of structural damageMax values in the vehicle XML. */
function hullHpFromXml(text) {
  if (!text) return null
  let total = 0
  for (const match of text.matchAll(/damageMax="([\d.]+)"/g)) {
    const value = Number(match[1])
    if (value > 0) total += value
  }
  return total > 1 ? Math.round(total) : null
}

function crossSectionFromShip(json) {
  let found = null
  const walk = (node) => {
    if (!node || typeof node !== 'object' || found) return
    if (node._Type_ === 'SSCSignatureSystemManualCrossSectionParams' && node.crossSection) {
      const axes = [node.crossSection.x, node.crossSection.y, node.crossSection.z].filter((value) => typeof value === 'number')
      if (axes.length) found = Math.max(...axes)
    }
    for (const value of Object.values(node)) walk(value)
  }
  walk(json)
  return found
}

function portAccepts(port) {
  const types = Array.isArray(port?.Types) ? port.Types : []
  return types
    .map((entry) => ({
      type: String(entry?.Type || ''),
      subtypes: (Array.isArray(entry?.SubTypes) ? entry.SubTypes : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    }))
    .filter((entry) => entry.type)
}

/** Missile, torpedo, and bomb tubes are different port types. A torpedo is a Missile whose subtype is Torpedo. */
function ordnanceKind(accepts) {
  const missile = accepts.filter((entry) => entry.type.toLowerCase() === 'missile')
  const bomb = accepts.some((entry) => entry.type.toLowerCase() === 'bomb')
  const torpedoType = accepts.some((entry) => entry.type.toLowerCase() === 'torpedo')
  const subtypes = missile.flatMap((entry) => entry.subtypes.map((value) => value.toLowerCase()))
  if (bomb && missile.length === 0 && !torpedoType) return 'bomb'
  if (torpedoType && missile.length === 0 && !bomb) return 'torpedo'
  if (subtypes.length > 0 && subtypes.every((value) => value === 'torpedo')) return 'torpedo'
  if (missile.length > 0 || torpedoType) return 'missile'
  return null
}

function copyPortRules(row, port) {
  const tags = typeof port?.PortTags === 'string' ? port.PortTags.trim() : ''
  const required = typeof port?.RequiredPortTags === 'string' ? port.RequiredPortTags.trim() : ''
  if (tags) row.portTags = tags
  if (required) row.requiredTags = required
  const accepts = portAccepts(port)
  if (accepts.length > 0) row.accepts = accepts
  return accepts
}

/** One SCU is a 1.25 m cube. Grid volume is that many boxes. */
function cargoScu(container) {
  const value = container?._RecordValue_ || container
  const dims = value?.interiorDimensions
  const edge = Number(value?.inventoryType?.minPermittedItemSize?.x) || 1.25
  if (!dims || edge <= 0) return 0
  const axes = ['x', 'y', 'z'].map((axis) => Math.round((Number(dims[axis]) || 0) / edge))
  if (axes.some((count) => count <= 0)) return 0
  return axes.reduce((total, count) => total * count, 1)
}

function cargoGrids(extractedRoot) {
  const root = join(extractedRoot, 'libs/foundry/records/entities/scitem/ships/cargogrid')
  const rows = []
  for (const filePath of walkFiles(root)) {
    const json = readJson(filePath)
    const ref = firstComponent(json, 'SCItemInventoryContainerComponentParams')?.containerParams
    const containerPath = refPath(ref, filePath, extractedRoot)
    const scu = cargoScu(containerPath ? readJson(containerPath) : null)
    if (scu <= 0) continue
    rows.push({ name: basename(filePath, '.json').toLowerCase(), scu })
  }
  return rows
}

/** Cargo grids that share the module's hull and side, such as the Retaliator front bay. */
function cargoForModule(entityClass, grids) {
  const name = String(entityClass || '').toLowerCase()
  if (!name.includes('cargo')) return 0
  const skip = new Set(['module', 'cargo', 'front', 'rear', 'left', 'right', 'top', 'bottom', 'center'])
  const tokens = name.split('_').filter((token) => token.length >= 3 && !skip.has(token))
  const side = ['front', 'rear', 'left', 'right', 'top', 'bottom', 'center'].find((token) => name.includes(`_${token}_`) || name.endsWith(`_${token}`))
  const matched = grids.filter((grid) => {
    if (tokens.some((token) => !grid.name.includes(token))) return false
    if (side && !grid.name.includes(side)) return false
    return true
  })
  const split = matched.filter((grid) => /_(?:main|left|right|top|bottom)$/.test(grid.name))
  const chosen = split.length > 0 ? split : matched
  return chosen.reduce((total, grid) => total + grid.scu, 0)
}

function medFeature(description) {
  const match = String(description || '').match(/(\d+)\s*x\s*(tier\s*\d+)\s*medical beds?/i)
  if (!match) return ''
  const count = Number(match[1])
  const tier = match[2].replace(/\s+/g, ' ').replace(/tier/i, 'Tier')
  return `${count} × ${tier} med bed${count === 1 ? '' : 's'}`
}

/** Editable racks and guns a module brings with it. Doors and the object container stay off the list. */
function moduleMounts(json) {
  const container = firstComponent(json, 'SItemPortContainerComponentParams')
  const entries = []
  walkEntries(firstComponent(json, 'SEntityComponentDefaultLoadoutParams')?.loadout, '', entries)
  const defaults = new Map()
  for (const entry of entries) {
    const key = entityKeyFromEntry(entry.entry)
    if (key) defaults.set(String(entry.name).toLowerCase(), key.toLowerCase())
  }
  const mounts = []
  for (const port of container?.Ports || []) {
    if (/uneditable/i.test(String(port.Flags || ''))) continue
    const name = port.Name
    if (!name) continue
    const row = { name, minSize: 0, maxSize: 0 }
    const accepts = copyPortRules(row, port)
    const types = accepts.map((entry) => entry.type.toLowerCase())
    const launcher = types.includes('missilelauncher') || types.includes('bomblauncher')
    const gun = types.includes('weapongun') || types.includes('turret')
    if (!launcher && !gun) continue
    const maxSize = Number(port.MaxSize) || 0
    const minSize = Number(port.MinSize) || maxSize
    if (!maxSize && !minSize) continue
    row.minSize = minSize || maxSize
    row.maxSize = maxSize || minSize
    row.kind = launcher ? 'missileRack' : 'weapon'
    const fallback = defaults.get(String(name).toLowerCase())
    if (fallback) row.defaultEntityClass = fallback
    mounts.push(row)
  }
  return mounts
}

function moduleFitsPort(item, port) {
  const tokens = (value) => String(value || '')
    .split(/\s+/)
    .map((tag) => tag.replace(/^\$/, '').toLowerCase())
    .filter(Boolean)
  const needs = tokens(item.requiredTags)
  const portGives = new Set(tokens(`${port.portTags || ''} ${port.requiredTags || ''}`))
  if (needs.length > 0 && !needs.every((tag) => portGives.has(tag))) return false
  const portNeeds = tokens(port.requiredTags)
  const gives = new Set(tokens(item.tags))
  if (portNeeds.length > 0 && !portNeeds.some((tag) => gives.has(tag))) return false
  return true
}

function missileMounts(json) {
  const container = firstComponent(json, 'SItemPortContainerComponentParams')
  const mounts = []
  for (const port of container?.Ports || []) {
    const name = port.Name || port.AttachmentImplementation?.Helper?.Helper?.Name
    if (!name) continue
    const maxSize = Number(port.MaxSize) || 0
    const minSize = Number(port.MinSize) || maxSize
    if (!maxSize && !minSize) continue
    const row = { name, minSize: minSize || maxSize, maxSize: maxSize || minSize }
    const accepts = copyPortRules(row, port)
    const ordnance = ordnanceKind(accepts)
    if (!ordnance) continue
    row.kind = ordnance
    if (/uneditable/i.test(String(port.Flags || ''))) row.locked = true
    mounts.push(row)
  }
  return mounts
}

/** Gun and missile slots that belong to a turret or mount, including locked guns. */
function weaponMountPorts(json) {
  const container = firstComponent(json, 'SItemPortContainerComponentParams')
  const defaults = new Map()
  const loadout = firstComponent(json, 'SEntityComponentDefaultLoadoutParams')
  const entries = []
  walkEntries(loadout?.loadout, '', entries)
  for (const entry of entries) {
    if (String(entry.path).includes('/')) continue
    const key = entityKeyFromEntry(entry.entry).toLowerCase()
    if (key) defaults.set(entry.name.toLowerCase(), key)
  }
  const mounts = []
  for (const port of container?.Ports || []) {
    const types = Array.isArray(port.Types) ? port.Types : []
    const typeNames = types.map((entry) => String(entry?.Type || '').toLowerCase())
    const gun = typeNames.includes('weapongun') || typeNames.includes('turret')
    const missile = typeNames.includes('missilelauncher')
    if (!gun && !missile) continue
    const name = port.Name || port.AttachmentImplementation?.Helper?.Helper?.Name
    if (!name) continue
    const maxSize = Number(port.MaxSize) || 0
    const minSize = Number(port.MinSize) || maxSize
    if (!maxSize && !minSize) continue
    const row = { name, minSize: minSize || maxSize, maxSize: maxSize || minSize }
    if (/uneditable/i.test(String(port.Flags || ''))) row.locked = true
    if (missile && !gun) row.kind = 'missile'
    copyPortRules(row, port)
    const fallback = defaults.get(String(name).toLowerCase())
    if (fallback) row.defaultEntityClass = fallback
    const nested = entries.find((entry) => {
      const path = String(entry.path)
      return path.toLowerCase().startsWith(`${String(name).toLowerCase()}/`) && path.split('/').length === 2
    })
    const nestedKey = nested ? entityKeyFromEntry(nested.entry).toLowerCase() : ''
    if (nested && nestedKey) {
      row.child = { name: nested.name, defaultEntityClass: nestedKey }
    }
    mounts.push(row)
  }
  return mounts
}

function itemPortLocks(json) {
  const locks = new Map()
  for (const mount of weaponMountPorts(json)) {
    if (mount.locked) locks.set(String(mount.name).toLowerCase(), mount)
  }
  return locks
}

function countermeasureCounts(json) {
  const ammo = firstComponent(json, 'SAmmoContainerComponentParams')
  const count = Number(ammo?.maxAmmoCount) || 0
  if (count <= 0) return { noise: 0, decoy: 0 }
  const short = String(attachDef(json)?.Localization?.ShortName || '').toLowerCase()
  if (short.includes('decoy')) return { noise: 0, decoy: count }
  if (short.includes('smokescreen') || short.includes('noise')) return { noise: count, decoy: 0 }
  return { noise: 0, decoy: 0 }
}

export function parseShipShop({ extractedRoot, localization }) {
  const records = join(extractedRoot, 'libs/foundry/records')
  const byKey = new Map()

  function remember(filePath) {
    const json = readJson(filePath)
    if (!json?._RecordValue_) return
    const recordName = String(json._RecordName_ || '')
      .replace(/^EntityClassDefinition\./i, '')
    const keys = [basename(filePath, '.json'), recordName]
    for (const key of keys) {
      if (!key) continue
      byKey.set(key.toLowerCase(), filePath)
    }
  }

  for (const dir of INDEX_DIRS) walkFiles(join(records, dir)).forEach(remember)
  walkFiles(join(records, 'ammoparams')).forEach(remember)

  function loadKey(key) {
    if (!key) return null
    const filePath = byKey.get(String(key).toLowerCase())
    return filePath ? { filePath, json: readJson(filePath) } : null
  }

  function readRef(ref, fromFile) {
    const path = refPath(ref, fromFile, extractedRoot)
    if (path) return readJson(path)
    const match = String(ref || '').match(/([^/\\]+)\.json$/i)
    return match ? loadKey(match[1])?.json ?? null : null
  }

  const catalog = []
  const catalogByKey = new Map()
  const seenFiles = new Set()
  const grids = cargoGrids(extractedRoot)

  for (const [key, filePath] of byKey) {
    if (seenFiles.has(filePath)) continue
    const normalized = filePath.replace(/\\/g, '/').toLowerCase()
    if (normalized.includes('/ammoparams/') || normalized.includes('lowpoly') || normalized.includes('template')) continue
    const json = readJson(filePath)
    if (!json) continue
    const entityClass = basename(filePath, '.json').toLowerCase()
    const kind = kindForItem(filePath, entityClass)
    if (!kind) continue
    const def = attachDef(json)
    if (kind === 'module' && String(def?.Type || '').toLowerCase() !== 'module') continue
    const moduleNameKey = String(def?.Localization?.Name || '').replace(/^@/, '')
    if (kind === 'module' && (!moduleNameKey || /^loc_(?:placeholder|empty)$/i.test(moduleNameKey))) continue
    const resolvedName = entityClass === 'mrck_s03_temp_bomb'
      ? (localization.item_NameBEHR_BombRack_S3 || 'CST-313 "Castillo"')
      : resolveName(def?.Localization?.Name, localization)
    const displayName = usableName(resolvedName) ? resolvedName : humanizeEntity(entityClass)
    if (!displayName) continue
    if (kind === 'weapon' && (/slayer cannon/i.test(displayName) || /^(?:bengal_turret_ballisticcannon|hrst_nova_ballisticcannon)/.test(entityClass))) continue
    const stats = extractShipItemStats(json, {
      readRef: (ref) => readRef(ref, filePath),
    })
    if (kind === 'missile' && stats.Weapon_Damage) stats.Missile_Damage = stats.Weapon_Damage
    if (kind === 'emp') {
      const emp = firstComponent(json, 'SCItemEMPParams')
      if (emp?.chargeTime) stats.Emp_Charge = emp.chargeTime
      if (emp?.distortionDamage) stats.Emp_Damage = emp.distortionDamage
      if (emp?.empRadius) stats.Emp_Radius = emp.empRadius
      if (emp?.cooldownTime) stats.Emp_Cooldown = emp.cooldownTime
    }
    if (kind === 'flight') {
      const flight = applyLegacyFlightModifiers(flightStats(json), legacyFlightModifier(json, (ref) => readRef(ref, filePath)))
      if (flight.pitch) stats.Flight_Pitch = flight.pitch
      if (flight.yaw) stats.Flight_Yaw = flight.yaw
      if (flight.roll) stats.Flight_Roll = flight.roll
      if (flight.scmSpeed) stats.Flight_ScmSpeed = flight.scmSpeed
      if (flight.boostSpeed) stats.Flight_BoostSpeed = flight.boostSpeed
      if (flight.boostBack) stats.Flight_BoostBackward = flight.boostBack
      if (flight.maxSpeed) stats.Flight_MaxSpeed = flight.maxSpeed
    }
    const size = def?.Size || sizeFromName(entityClass) || 0
    const manufacturerCode = String(def?.Manufacturer || '').match(/scitemmanufacturer\.(\w+)\.json/i)?.[1]?.toUpperCase() || null
    const tags = typeof def?.Tags === 'string' ? def.Tags.trim() : ''
    const requiredTags = typeof def?.RequiredTags === 'string' ? def.RequiredTags.trim() : ''
    const mounts = kind === 'missileRack' ? missileMounts(json) : kind === 'weaponMount' ? weaponMountPorts(json) : kind === 'module' ? moduleMounts(json) : []
    if (entityClass === 'mrck_s03_temp_bomb') {
      for (const mount of mounts) {
        mount.minSize = 3
        mount.maxSize = 3
      }
    }
    const described = classAndGrade(resolveName(def?.Localization?.Description, localization), def?.Grade)
    const item = {
      entityClass,
      displayName,
      kind,
      size,
      manufacturer: manufacturerCode ? localization[`manufacturer_Name${manufacturerCode}`] || manufacturerCode : null,
      weaponClass: kind === 'weapon' ? weaponClassFromName(entityClass, displayName) : null,
      damageType: kind === 'weapon' || kind === 'missile' ? damageTypeFromStats(stats) : null,
      stats,
      burstDps: kind === 'weapon' ? Math.round(weaponBurstDps(stats)) : 0,
    }
    if (tags) item.tags = tags
    if (requiredTags) item.requiredTags = requiredTags
    if (def?.Type) item.attachType = def.Type
    if (def?.SubType) item.attachSubType = def.SubType
    if (described.itemClass) item.itemClass = described.itemClass
    if (described.grade) item.grade = described.grade
    if (kind === 'missile') {
      const attachType = String(def?.Type || '').toLowerCase()
      const attachSubType = String(def?.SubType || '').toLowerCase()
      item.ordnance = attachType === 'bomb' ? 'bomb' : attachSubType === 'torpedo' ? 'torpedo' : 'missile'
      const guidance = missileGuidance(entityClass)
      if (guidance) item.guidance = guidance
    }
    if (mounts.length > 0) item.mounts = mounts
    if (kind === 'module') {
      const cargo = cargoForModule(entityClass, grids)
      let tubes = 0
      for (const mount of mounts) {
        if (mount.kind !== 'missileRack' || !mount.defaultEntityClass) continue
        tubes += catalogByKey.get(String(mount.defaultEntityClass).toLowerCase())?.mounts?.length || 0
      }
      const feature = cargo > 0
        ? `+${cargo} SCU cargo`
        : tubes > 0
          ? `${tubes} × missiles`
          : medFeature(resolveName(def?.Localization?.Description, localization))
      if (feature) item.feature = feature
    }
    if (typeof json._RecordId_ === 'string' && json._RecordId_) item.uuid = json._RecordId_
    seenFiles.add(filePath)
    catalog.push(item)
    catalogByKey.set(entityClass, item)
    const recordName = String(json._RecordName_ || '').replace(/^EntityClassDefinition\./i, '').toLowerCase()
    if (recordName) catalogByKey.set(recordName, item)
  }

  const shipDir = join(records, 'entities/spaceships')
  const ships = []
  const seenNames = new Map()

  for (const filePath of walkFiles(shipDir)) {
    const fileName = basename(filePath)
    if (!isPlayerShipFile(fileName)) continue
    const json = readJson(filePath)
    const vehicle = firstComponent(json, 'VehicleComponentParams')
    if (!vehicle || vehicle.movementClass !== 'Spaceship') continue
    const displayName = resolveName(vehicle.vehicleName, localization)
    if (!usableName(displayName)) continue
    const id = basename(filePath, '.json').toLowerCase()
    const previous = seenNames.get(displayName.toLowerCase())
    if (previous && previous.length <= id.length) continue

    const manufacturer = vehicle.manufacturer?.match(/scitemmanufacturer\.(\w+)\.json/i)?.[1]?.toUpperCase() || null
    const role = resolveName(vehicle.vehicleRole, localization)
    const career = resolveName(vehicle.vehicleCareer, localization)
    const xml = vehicleXml(extractedRoot, vehicle)
    const hullHp = hullHpFromXml(xml)
    const portDefs = portDefsFromXml(xml)
    const crossSection = crossSectionFromShip(json)

    const loadout = firstComponent(json, 'SEntityComponentDefaultLoadoutParams')
    const entries = []
    walkEntries(loadout?.loadout, '', entries)
    const entryByPath = new Map(entries.map((entry) => [entry.path, entry]))
    const parentLocks = new Map()
    function locksFor(entityKey) {
      const key = String(entityKey || '').toLowerCase()
      if (!key) return null
      if (parentLocks.has(key)) return parentLocks.get(key)
      const loadedParent = loadKey(key)
      const locks = loadedParent?.json ? itemPortLocks(loadedParent.json) : new Map()
      parentLocks.set(key, locks)
      return locks
    }

    let flight = { pitch: null, yaw: null, roll: null, scmSpeed: null, boostSpeed: null, maxSpeed: null }
    let noise = 0
    let decoy = 0
    const ports = []

    for (const entry of entries) {
      const entityKey = entityKeyFromEntry(entry.entry)
      const loaded = loadKey(entityKey)
      if (loaded?.filePath.replace(/\\/g, '/').toLowerCase().includes('/countermeasures/')) {
        const counts = countermeasureCounts(loaded.json)
        noise += counts.noise
        decoy += counts.decoy
      }
      const item = catalogByKey.get(entityKey.toLowerCase()) || null
      const portDef = portDefs.get(String(entry.name || '').toLowerCase())
      const fromDef = kindFromPortDef(portDef)
      let classed = item
        ? classifyPort(entry.name, entityKey, item.kind)
        : (fromDef || classifyPort(entry.name, entityKey, null))
      if (!classed) classed = fromDef
      if (fromDef && fromDef.kind !== 'module' && classed?.kind === 'module') classed = fromDef
      const acceptTypes = (portDef?.accepts || []).map((row) => String(row.type || '').toLowerCase())
      const mixedTurret = acceptTypes.some((type) => type === 'module' || type === 'weapongun' || type === 'missilelauncher' || type === 'bomblauncher')
      if (!item && classed?.kind === 'weaponMount' && /turret/i.test(entry.name) && !/tractor|relay/i.test(entry.name) && !mixedTurret) {
        classed = { section: 'weapons', kind: 'turret' }
      }
      if (!classed) continue

      if (classed.kind === 'flight' && loaded?.json) {
        flight = { ...flight, ...flightStats(loaded.json) }
      }

      const notAComponent = acceptTypes.length > 0 && acceptTypes.every((type) => (
        type === 'display' || type === 'door' || type === 'cargo' || type === 'room' || type === 'seat' || type === 'light' || type === 'toolarm' || type === 'paint' || type === 'flair'
      ))
      if (!item?.entityClass && notAComponent) continue
      const size = item?.size || portDef?.maxSize || sizeFromName(entityKey) || sizeFromClass(entry.name) || (classed.kind === 'turret' ? 1 : 0)
      if (size <= 0 && !item?.entityClass && classed.kind !== 'turret' && classed.kind !== 'weaponMount') continue
      const shaped = shapePort(entry.name, {
        id: entry.path,
        label: portTitle(entry.name),
        section: classed.section,
        kind: classed.kind === 'missileRack' ? 'missileRack' : classed.kind,
        size,
        minSize: size,
        maxSize: size,
        defaultEntityClass: classed.kind !== 'module' && item?.kind === 'module' ? null : (item?.entityClass || null),
      }, portDefs)
      if (shaped.kind === 'turret' && !shaped.defaultEntityClass) shaped.locked = true
      const parentPath = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''
      const parent = parentPath ? entryByPath.get(parentPath) : null
      const parentLock = parent ? locksFor(entityKeyFromEntry(parent.entry))?.get(entry.name.toLowerCase()) : null
      if (parentLock?.locked && shaped.kind !== 'flight') shaped.locked = true
      if (shaped) ports.push(shaped)
    }

    const ship = {
      id,
      uuid: typeof json._RecordId_ === 'string' ? json._RecordId_ : null,
      displayName,
      manufacturer: manufacturer ? localization[`manufacturer_Name${manufacturer}`] || manufacturer : null,
      manufacturerCode: manufacturer,
      role,
      career,
      crew: vehicle.crewSize || null,
      hullHp,
      crossSection,
      noise,
      decoy,
      damageReduction: damageReduction(vehicle),
      weaponPowerPool: weaponPowerPool(json),
      ...flight,
      ports,
    }
    seenNames.set(displayName.toLowerCase(), id)
    const existing = ships.findIndex((row) => row.displayName.toLowerCase() === displayName.toLowerCase())
    if (existing >= 0) ships.splice(existing, 1)
    ships.push(ship)
  }

  const modulePorts = ships.flatMap((ship) => (ship.ports || []).filter((port) => port.kind === 'module'))
  const functional = (item) => Boolean(item.feature) || (item.mounts || []).some((mount) => mount.kind === 'missileRack' || mount.kind === 'weapon')
  const shopPorts = new Set(modulePorts.filter((port) => catalog.some((item) => item.kind === 'module' && moduleFitsPort(item, port) && functional(item))))
  for (const ship of ships) {
    ship.ports = ship.ports.filter((port) => port.kind !== 'module' || shopPorts.has(port))
  }
  for (let index = catalog.length - 1; index >= 0; index -= 1) {
    const item = catalog[index]
    if (item.kind !== 'module') continue
    if ([...shopPorts].some((port) => moduleFitsPort(item, port))) continue
    catalog.splice(index, 1)
    catalogByKey.delete(item.entityClass)
  }

  ships.sort((a, b) => a.displayName.localeCompare(b.displayName))
  catalog.sort((a, b) => a.displayName.localeCompare(b.displayName))
  applyShipPartRules(ships, catalog)

  return { ships, catalog }
}

/** Add attach types, port rules, and rack tubes onto an existing catalog without rewriting item stats. */
export function enrichShipShopData(extractedRoot, ships, items) {
  const records = join(extractedRoot, 'libs/foundry/records')
  const byKey = new Map()
  const remember = (filePath) => {
    const json = readJson(filePath)
    if (!json?._RecordValue_) return
    const recordName = String(json._RecordName_ || '').replace(/^EntityClassDefinition\./i, '')
    for (const key of [basename(filePath, '.json'), recordName]) {
      if (key) byKey.set(key.toLowerCase(), filePath)
    }
  }
  for (const dir of INDEX_DIRS) walkFiles(join(records, dir)).forEach(remember)

  for (const item of items) {
    const filePath = byKey.get(String(item.entityClass || '').toLowerCase())
    if (!filePath) continue
    const json = readJson(filePath)
    if (!json) continue
    const def = attachDef(json)
    if (def?.Type) item.attachType = def.Type
    if (def?.SubType) item.attachSubType = def.SubType
    if (item.kind === 'missile') {
      const attachType = String(def?.Type || '').toLowerCase()
      const attachSubType = String(def?.SubType || '').toLowerCase()
      item.ordnance = attachType === 'bomb' ? 'bomb' : attachSubType === 'torpedo' ? 'torpedo' : 'missile'
    }
    if (item.kind === 'missileRack' || item.kind === 'weaponMount') {
      const mounts = item.kind === 'missileRack' ? missileMounts(json) : weaponMountPorts(json)
      if (mounts.length > 0) item.mounts = mounts
    }
  }

  const shipFiles = new Map()
  for (const filePath of walkFiles(join(records, 'entities/spaceships'))) {
    shipFiles.set(basename(filePath, '.json').toLowerCase(), filePath)
  }
  for (const ship of ships) {
    const filePath = shipFiles.get(String(ship.id || '').toLowerCase())
    if (!filePath) continue
    const json = readJson(filePath)
    const defs = portDefsFromXml(vehicleXml(extractedRoot, firstComponent(json, 'VehicleComponentParams')))
    for (const port of ship.ports || []) {
      const leaf = String(port.id || '').split('/').pop().toLowerCase()
      const def = defs.get(leaf)
      if (def?.accepts?.length) port.accepts = def.accepts
    }
  }
  applyShipPartRules(ships, items)
  return { ships, items }
}
