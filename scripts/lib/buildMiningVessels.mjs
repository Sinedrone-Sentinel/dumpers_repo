/**
 * Smart Cracker ship list from hulls that actually mount a mining laser.
 * A head whose required tags name a hull is bespoke to that hull.
 * Ships with bespoke heads list only those heads. Shared ships never list them.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const GENERIC_TAGS = new Set(['miningmount', 'flightready', 'weaponmountusable'])
const VARIANT_SUFFIX = /_(?:btala|ox|edition|pirate|showdown|carbon|gs)$/i

/** Saved loadout ids. New hulls keep their game id. */
const STABLE = {
  misc_prospector: { id: 'prospector', displayName: 'Prospector' },
  argo_mole: { id: 'mole', displayName: 'Mole' },
  drak_golem: { id: 'golem', displayName: 'Golem' },
  grin_roc: { id: 'roc', displayName: 'ROC', isGroundVehicle: true },
  grin_roc_ds: { id: 'roc-ds', displayName: 'ROC-DS', isGroundVehicle: true },
}

const STABLE_ORDER = ['prospector', 'mole', 'golem', 'roc', 'roc-ds']

function tokens(value) {
  return String(value || '')
    .split(/\s+/)
    .map((tag) => tag.replace(/^\$/, '').trim())
    .filter(Boolean)
}

function hullTokens(requiredTags) {
  return tokens(requiredTags).filter((tag) => !GENERIC_TAGS.has(tag.toLowerCase()))
}

function familyKey(shipId) {
  const id = String(shipId || '').toLowerCase()
  if (id.startsWith('grin_roc_ds')) return 'grin_roc_ds'
  if (id.startsWith('grin_roc')) return 'grin_roc'
  return id.replace(VARIANT_SUFFIX, '')
}

function entityFromEntry(entry) {
  if (entry?.entityClassName && /^mining_laser_/i.test(entry.entityClassName)) {
    return entry.entityClassName
  }
  const ref = entry?.entityClassReference
  if (typeof ref === 'string') {
    const match = ref.match(/([^/\\]+)\.json$/i)
    return match ? match[1] : ''
  }
  return ''
}

function walkLaserLeaves(node, parentPath, out) {
  const list = Array.isArray(node?.entries) ? node.entries : null
  if (!list) return
  for (const entry of list) {
    if (entry?._Type_ !== 'SItemPortLoadoutEntryParams') continue
    const name = entry.itemPortName || 'port'
    const path = parentPath ? `${parentPath}/${name}` : name
    if (entry.loadout && typeof entry.loadout === 'object') walkLaserLeaves(entry.loadout, path, out)
    const entity = entityFromEntry(entry)
    if (!/^mining_laser_/i.test(entity)) continue
    if (out.some((row) => row.path.startsWith(`${path}/`))) continue
    out.push({ path, entity: entity.toLowerCase() })
  }
}

function laserKey(nameOrEntity) {
  return String(nameOrEntity || '')
    .replace(/^Mining_Laser_/i, 'mining_laser_')
    .toLowerCase()
}

function compactName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isUnresolvedHeadName(laser) {
  const human = String(laser.name || '').replace(/^Mining_Laser_/i, '').replace(/_/g, ' ')
  const display = compactName(laser.displayName)
  return display === compactName(human) || display === compactName(`Mining Laser ${human}`)
}

function resolveVehicleName(key, localization) {
  if (!key) return ''
  const lookup = String(key).replace(/^@/, '')
  const value = localization?.[lookup] || localization?.[lookup.toLowerCase()]
  if (!value || String(value).startsWith('@')) return ''
  return String(value).trim()
}

function miningPortsFromShip(ship) {
  return (ship.ports || []).filter((port) => {
    const entity = String(port.defaultEntityClass || '')
    if (!/^mining_laser_/i.test(entity)) return false
    if (port.kind && port.kind !== 'weapon') return false
    return true
  })
}

function indexLasers(lasers) {
  const byEntity = new Map()
  for (const laser of lasers || []) {
    const key = laserKey(laser.name)
    if (key && !byEntity.has(key)) byEntity.set(key, laser)
  }
  return byEntity
}

function indexRequiredTags(items) {
  const byEntity = new Map()
  for (const item of items || []) {
    const key = String(item.entityClass || '').toLowerCase()
    if (!key.startsWith('mining_laser_')) continue
    if (item.requiredTags) byEntity.set(key, item.requiredTags)
  }
  return byEntity
}

function groundVehicles(extractedRoot, localization) {
  const dir = join(extractedRoot, 'libs/foundry/records/entities/groundvehicles')
  if (!existsSync(dir)) return []
  const vehicles = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || /template/i.test(file)) continue
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const vehicle = (json?._RecordValue_?.Components || []).find(
      (comp) => comp && comp._Type_ === 'VehicleComponentParams'
    )
    const loadout = (json?._RecordValue_?.Components || []).find(
      (comp) => comp && comp._Type_ === 'SEntityComponentDefaultLoadoutParams'
    )
    const leaves = []
    walkLaserLeaves(loadout?.loadout, '', leaves)
    if (leaves.length === 0) continue
    const id = basename(file, '.json').toLowerCase()
    vehicles.push({
      id,
      displayName: resolveVehicleName(vehicle?.vehicleName, localization) || id,
      isGroundVehicle: true,
      leaves,
    })
  }
  return vehicles
}

function chooseCanonical(rows) {
  return rows.find((row) => row.id === row.family) || rows.slice().sort((a, b) => a.id.length - b.id.length)[0]
}

/**
 * @param {{
 *   ships: Array<{ id: string, displayName: string, ports?: unknown[] }>,
 *   items: Array<{ entityClass?: string, requiredTags?: string }>,
 *   lasers: Array<{ name: string, displayName: string, size: number }>,
 *   extractedRoot: string,
 *   localization?: Record<string, string>,
 * }} input
 */
export function buildMiningVesselCatalog(input) {
  const lasersByEntity = indexLasers(input.lasers)
  const requiredByEntity = indexRequiredTags(input.items)
  const groups = new Map()

  function addHull(row) {
    const family = familyKey(row.id)
    const list = groups.get(family) || []
    list.push({ ...row, family })
    groups.set(family, list)
  }

  for (const ship of input.ships || []) {
    const ports = miningPortsFromShip(ship)
    if (ports.length === 0) continue
    addHull({
      id: String(ship.id || '').toLowerCase(),
      displayName: ship.displayName,
      isGroundVehicle: false,
      ports,
    })
  }

  for (const vehicle of groundVehicles(input.extractedRoot, input.localization || {})) {
    addHull(vehicle)
  }

  const drafts = []
  for (const rows of groups.values()) {
    const hull = chooseCanonical(rows)
    const stable = STABLE[hull.family] || STABLE[hull.id]
    const id = stable?.id || hull.id
    const displayName = stable?.displayName || hull.displayName || id
    const portTags = new Set()
    const entities = []

    if (hull.ports) {
      for (const port of hull.ports) {
        entities.push(String(port.defaultEntityClass).toLowerCase())
        for (const tag of tokens(port.portTags)) portTags.add(tag.toLowerCase())
      }
    } else {
      for (const leaf of hull.leaves || []) entities.push(leaf.entity)
    }

    const laserSize = entities.reduce((size, entity) => {
      const laser = lasersByEntity.get(entity)
      return laser && Number.isFinite(laser.size) ? laser.size : size
    }, 0)

    drafts.push({
      id,
      displayName,
      shipId: hull.id,
      laserSlotCount: entities.length,
      laserSize,
      entities,
      portTags,
      isGroundVehicle: Boolean(stable?.isGroundVehicle || hull.isGroundVehicle),
    })
  }

  const bespokeLasers = []
  for (const laser of input.lasers || []) {
    const entity = laserKey(laser.name)
    const required = requiredByEntity.get(entity) || ''
    const hull = hullTokens(required)
    if (hull.length === 0) continue
    const owners = drafts.filter((draft) => hull.every((tag) => draft.portTags.has(tag.toLowerCase())))
    if (owners.length === 0) continue
    const displayName = isUnresolvedHeadName(laser) && owners.length === 1
      ? `${owners[0].displayName} Mining Laser`
      : laser.displayName
    for (const owner of owners) {
      bespokeLasers.push({ name: laser.name, vesselId: owner.id, displayName })
    }
  }

  const bespokeByVessel = new Map()
  for (const row of bespokeLasers) {
    const list = bespokeByVessel.get(row.vesselId) || []
    list.push(row)
    bespokeByVessel.set(row.vesselId, list)
  }

  const vessels = drafts.map((draft) => {
    const owned = (bespokeByVessel.get(draft.id) || []).slice().sort(
      (a, b) => a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name)
    )
    const defaultEntity = draft.entities[0]
    const defaultLaser = lasersByEntity.get(defaultEntity)
    const defaultIsBespoke = owned.some((row) => laserKey(row.name) === defaultEntity)
    const factory = owned.length > 0
      ? (defaultIsBespoke ? owned.find((row) => laserKey(row.name) === defaultEntity) : owned[0])
      : null
    const vessel = {
      id: draft.id,
      displayName: draft.displayName,
      laserSlotCount: draft.laserSlotCount,
      laserSize: draft.laserSize,
      defaultLaserName: factory?.name || defaultLaser?.name || '',
    }
    if (draft.isGroundVehicle) vessel.isGroundVehicle = true
    if (owned.length > 0) vessel.isBespoke = true
    return vessel
  })

  vessels.sort((a, b) => {
    const ai = STABLE_ORDER.indexOf(a.id)
    const bi = STABLE_ORDER.indexOf(b.id)
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    }
    return a.displayName.localeCompare(b.displayName)
  })

  bespokeLasers.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.vesselId.localeCompare(b.vesselId))

  return {
    _source: 'Star Citizen Game Files (hulls with a mining laser)',
    vessels,
    bespokeLasers,
  }
}

function loadVehicleNames(extractedRoot) {
  const ini = join(extractedRoot, 'Data/Localization/english/global.ini')
  const names = {}
  if (!existsSync(ini)) return names
  for (const line of readFileSync(ini, 'utf8').split('\n')) {
    if (!line.startsWith('vehicle_Name')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    names[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return names
}

function writeCatalogFromRepo() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  const data = join(root, 'src/data')
  const ships = JSON.parse(readFileSync(join(data, 'game-ships.json'), 'utf8'))
  const items = JSON.parse(readFileSync(join(data, 'game-ship-item-stats.json'), 'utf8'))
  const mining = JSON.parse(readFileSync(join(data, 'game-mining.json'), 'utf8'))
  const catalog = buildMiningVesselCatalog({
    ships: ships.ships,
    items: items.items,
    lasers: mining.miningLasers,
    extractedRoot: join(root, 'extracted-data'),
    localization: loadVehicleNames(join(root, 'extracted-data')),
  })
  const dest = join(data, 'game-mining-vessels.json')
  writeFileSync(dest, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
  console.log(
    `Wrote ${catalog.vessels.length} mining vessels (${catalog.bespokeLasers.length} bespoke heads) -> src/data/game-mining-vessels.json`
  )
  for (const vessel of catalog.vessels) {
    const heads = catalog.bespokeLasers.filter((row) => row.vesselId === vessel.id).map((row) => row.displayName)
    console.log(
      `  ${vessel.displayName}: ${vessel.laserSlotCount}x S${vessel.laserSize}${vessel.isBespoke ? ` bespoke (${heads.join(', ')})` : ''}`
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeCatalogFromRepo()
}
