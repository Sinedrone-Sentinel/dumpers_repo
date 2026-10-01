/**
 * Trackable cargo commodities from resourcetypedatabase.json.
 *
 * Feeds the Resource Tracker catalog (src/config/gameCommodities.ts) so every
 * hauled good in the game can be logged, not only blueprint materials and the
 * hand-kept UEX list in src/config/extraResources.ts.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { slugifyResourceKey } from './commodityLocalization.mjs'

export const RESOURCE_TYPE_DATABASE_PATH =
  'libs/foundry/records/resourcetypedatabase/resourcetypedatabase.json'

/** Game display-name slug -> existing Resource Tracker key. */
export const RESOURCE_TYPE_KEY_ALIASES = {
  recycled_material_composite: 'rmc',
  construction_materials: 'construction_material',
  construction_pieces: 'construction_material_pebbles',
  construction_rubble: 'construction_material_rubble',
  construction_salvage: 'construction_material_salvage',
  lastaprene: 'lastaphrene',
  lunes_spiral_fruit: 'lunes',
  quantainium: 'quantanium',
}

/** Mined cargo that still needs refining, by record name. */
const UNREFINED_RECORD_NAMES = new Set(['MixedMining'])
const UNREFINED_GROUPS = new Set(['UnrefinedOres', 'Raw_Minerals'])
const UNREFINED_LABEL = /\((?:ore|raw|r)\)\s*$/i

function cargoContainerCount(resource) {
  const containers = resource?.defaultCargoContainers
  if (!containers || typeof containers !== 'object') return 0
  return Object.entries(containers).filter(([key, value]) => key !== '_Type_' && value).length
}

function resolveLabel(locKey, localization) {
  if (!locKey || typeof locKey !== 'string' || !locKey.startsWith('@')) return null
  const key = locKey.slice(1)
  const value = localization[key] ?? localization._lowerMap?.[key.toLowerCase()] ?? null
  if (!value) return null
  const cleaned = value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.startsWith('@') || /placeholder/i.test(cleaned)) return null
  return cleaned
}

function commodityKind(groupPath) {
  if (groupPath.includes('Bulk_Supplies')) return 'supplies'
  if (groupPath.includes('Vice')) return 'vice'
  if (groupPath.includes('Food')) return 'food'
  if (groupPath[0] === 'Gas') return 'gas'
  if (groupPath[0] === 'Organic') return 'organic'
  if (groupPath[0] === 'Metal' || groupPath[0] === 'Mineral' || groupPath[0] === 'Nonmetal') {
    return 'mineral'
  }
  return 'goods'
}

function recordShortName(record) {
  const name = record?._RecordName_ ?? ''
  const dot = name.indexOf('.')
  return dot >= 0 ? name.slice(dot + 1) : name
}

export function resourceTypeKeyForLabel(label) {
  const slug = slugifyResourceKey(label)
  return RESOURCE_TYPE_KEY_ALIASES[slug] ?? slug
}

/**
 * @param {object} database parsed resourcetypedatabase.json
 * @param {Record<string, string>} localization
 * @param {Set<string>} [existingKeys] keys already in the tracker (blueprint materials + extras)
 * @returns {{ key: string, label: string, kind: string }[]}
 */
export function buildGameCommodities(database, localization, existingKeys = new Set()) {
  const byKey = new Map()

  function walk(group, parentPath) {
    const groupPath = [...parentPath, recordShortName(group)]
    for (const resource of group?.resources ?? []) {
      if (!resource || cargoContainerCount(resource) === 0) continue
      if (resource.refinedVersion) continue
      if (UNREFINED_RECORD_NAMES.has(recordShortName(resource))) continue
      if (groupPath.some((name) => UNREFINED_GROUPS.has(name))) continue

      const label = resolveLabel(resource.displayName, localization)
      if (!label || UNREFINED_LABEL.test(label)) continue

      const key = resourceTypeKeyForLabel(label)
      if (!key || existingKeys.has(key) || byKey.has(key)) continue
      byKey.set(key, { key, label, kind: commodityKind(groupPath) })
    }
    for (const child of group?.groups ?? []) walk(child, groupPath)
  }

  for (const group of database?._RecordValue_?.groups ?? []) walk(group, [])

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Keys the app already knows: blueprint craft materials + EXTRA_CATALOG_RESOURCES. */
export function loadExistingTrackerKeys(projectRoot, blueprints) {
  const keys = new Set()
  for (const bp of blueprints ?? []) {
    for (const slot of bp.slots ?? []) {
      for (const option of slot.options ?? []) {
        if (option.type && option.type !== 'resource' && option.type !== 'item') continue
        const label =
          option.resourceName || option.entityName || option.displayName || option.itemName
        const key = slugifyResourceKey(label)
        if (key) keys.add(key === 'saldynium' ? 'saldynium_ore' : key)
      }
    }
  }
  const extraPath = join(projectRoot, 'src', 'config', 'extraResources.ts')
  if (existsSync(extraPath)) {
    const source = readFileSync(extraPath, 'utf8')
    for (const match of source.matchAll(/resourceKey:\s*'([^']+)'/g)) keys.add(match[1])
  }
  return keys
}

export function parseResourceTypes({ extractedData, localization, existingKeys }) {
  const dbPath = join(extractedData, RESOURCE_TYPE_DATABASE_PATH)
  if (!existsSync(dbPath)) return null
  const database = JSON.parse(readFileSync(dbPath, 'utf8'))
  return buildGameCommodities(database, localization, existingKeys)
}
