/**
 * Flyable ship catalog for Fuzy's Ship Shop.
 * Player ships only: AI, unmanned, and template variants are skipped.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { extractShipItemStats, weaponBurstDps } from './shipItemStats.mjs'

const SKIP_SHIP = /(?:^|_)(?:pu(?:_|$)|ai(?:_|$)|unmanned|template|display|showdown|gamemaster|fleetweek|tutorial|hijacked|teach|boarded|nointerior|swarm|defendship|collector|lowpoly|invictus|restoration|ninetails|temp(?:_|$)|test(?:_|$)|gs(?:_|$)|ea(?:_|$)|exec(?:_|$)|plat(?:_|$)|bis\d)/i

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
  if (id.includes('/weapons/') && !id.includes('/missiles/')) return 'weapon'
  if (/mrck_|missilerack/.test(id)) return 'missileRack'
  return null
}

function classifyPort(name, entityKey) {
  const n = name.toLowerCase()
  const e = (entityKey || '').toLowerCase()
  if (n.includes('controller_flight')) return { section: 'systems', kind: 'flight' }
  if (n.includes('controller')) return null
  if (n.includes('missilerack') || e.includes('mrck_') || e.includes('missilerack')) {
    return { section: 'missiles', kind: 'missileRack' }
  }
  if (n.includes('missile') || e.includes('misl_') || e.includes('gmisl_')) {
    return { section: 'missiles', kind: 'missile' }
  }
  if ((n.includes('weapon') && (e.includes('mount_') || e.includes('gimbal'))) || e.includes('weapon_mount')) {
    return { section: 'weapons', kind: 'weaponMount' }
  }
  if (n.includes('weapon') || n.includes('hardpoint_class_')) return { section: 'weapons', kind: 'weapon' }
  if (n.includes('shield_generator')) return { section: 'defense', kind: 'shield' }
  if (n.includes('armor') || n.includes('armour')) return { section: 'defense', kind: 'armor' }
  if (n.includes('cooler')) return { section: 'systems', kind: 'cooler' }
  if (n.includes('power_plant') || n.includes('powerplant')) return { section: 'systems', kind: 'power' }
  if (n.includes('quantum_drive')) return { section: 'systems', kind: 'quantum' }
  if (n.includes('hardpoint_radar')) return { section: 'systems', kind: 'radar' }
  return null
}

function portTitle(name) {
  return name
    .split('/')
    .pop()
    .replace(/^hardpoint_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function flightStats(json) {
  let angular = null
  let scm = null
  let boost = null
  let maxSpeed = null
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.scmSpeed === 'number') {
      scm = node.scmSpeed
      if (node.maxAngularVelocity?.x != null) angular = node.maxAngularVelocity
    }
    if (typeof node.boostSpeedForward === 'number') boost = node.boostSpeedForward
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

  for (const [key, filePath] of byKey) {
    if (seenFiles.has(filePath)) continue
    const normalized = filePath.replace(/\\/g, '/').toLowerCase()
    if (normalized.includes('/ammoparams/') || normalized.includes('lowpoly') || normalized.includes('template')) continue
    const json = readJson(filePath)
    if (!json) continue
    const entityClass = basename(filePath, '.json').toLowerCase()
    const kind = kindForItem(filePath, entityClass)
    if (!kind || kind === 'weaponMount') continue
    const def = attachDef(json)
    const resolvedName = resolveName(def?.Localization?.Name, localization)
    const displayName = usableName(resolvedName) ? resolvedName : humanizeEntity(entityClass)
    if (!displayName) continue
    const stats = extractShipItemStats(json, {
      readRef: (ref) => readRef(ref, filePath),
    })
    if (kind === 'missile' && stats.Weapon_Damage) stats.Missile_Damage = stats.Weapon_Damage
    if (kind === 'flight') {
      const flight = flightStats(json)
      if (flight.pitch) stats.Flight_Pitch = flight.pitch
      if (flight.yaw) stats.Flight_Yaw = flight.yaw
      if (flight.roll) stats.Flight_Roll = flight.roll
      if (flight.scmSpeed) stats.Flight_ScmSpeed = flight.scmSpeed
      if (flight.boostSpeed) stats.Flight_BoostSpeed = flight.boostSpeed
      if (flight.maxSpeed) stats.Flight_MaxSpeed = flight.maxSpeed
    }
    const size = def?.Size || sizeFromName(entityClass) || 0
    const manufacturerCode = String(def?.Manufacturer || '').match(/scitemmanufacturer\.(\w+)\.json/i)?.[1]?.toUpperCase() || null
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
    const health = firstComponent(json, 'SHealthComponentParams')
    const hullHp = health?.Health > 1 ? health.Health : null

    const loadout = firstComponent(json, 'SEntityComponentDefaultLoadoutParams')
    const entries = []
    walkEntries(loadout?.loadout, '', entries)

    let flight = { pitch: null, yaw: null, roll: null, scmSpeed: null, boostSpeed: null, maxSpeed: null }
    const ports = []

    for (const entry of entries) {
      const entityKey = entityKeyFromEntry(entry.entry)
      const loaded = loadKey(entityKey)
      const classed = classifyPort(entry.name, entityKey)
      if (!classed) continue

      if (classed.kind === 'flight' && loaded?.json) {
        flight = { ...flight, ...flightStats(loaded.json) }
      }

      if (classed.kind === 'weaponMount') {
        const child = entries.find(
          (candidate) =>
            candidate.path.startsWith(`${entry.path}/`) &&
            !candidate.path.slice(entry.path.length + 1).includes('/') &&
            classifyPort(candidate.name, entityKeyFromEntry(candidate.entry))?.kind === 'weapon',
        )
        const childKey = child ? entityKeyFromEntry(child.entry) : ''
        const childItem = catalogByKey.get(childKey.toLowerCase()) || null
        const size = sizeFromName(entityKey) || childItem?.size || 0
        ports.push({
          id: entry.path,
          label: portTitle(entry.name),
          section: 'weapons',
          kind: 'weapon',
          size,
          minSize: size,
          maxSize: size,
          defaultEntityClass: childItem?.entityClass || null,
        })
        continue
      }

      if (classed.kind === 'weapon' && entry.path.includes('/')) continue

      const item = catalogByKey.get(entityKey.toLowerCase()) || null
      const size = item?.size || sizeFromName(entityKey) || 0
      ports.push({
        id: entry.path,
        label: portTitle(entry.name),
        section: classed.section,
        kind: classed.kind === 'missileRack' ? 'missileRack' : classed.kind,
        size,
        minSize: size,
        maxSize: size,
        defaultEntityClass: item?.entityClass || null,
      })
    }

    const ship = {
      id,
      displayName,
      manufacturer: manufacturer ? localization[`manufacturer_Name${manufacturer}`] || manufacturer : null,
      manufacturerCode: manufacturer,
      role,
      career,
      crew: vehicle.crewSize || null,
      hullHp,
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

  ships.sort((a, b) => a.displayName.localeCompare(b.displayName))
  catalog.sort((a, b) => a.displayName.localeCompare(b.displayName))

  return { ships, catalog }
}
