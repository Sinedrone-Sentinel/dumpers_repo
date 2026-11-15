/**
 * Bake site loot pools (Lazarus, Onyx, OLP/PAF, Contested Zone, Executive Hangar,
 * QV Investigation, Siege of Orison) into game-site-loot.json for Loot Finder.
 *
 * Uses location-true slot presets (not shared V3 catalogs that flatten every tagged config).
 * Relative rates are weight shares within each location after the allowlist.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const SLOT_PRESET_ROOT = 'libs/foundry/records/harvestable/slotpresets'
const LOOT_ROOT = 'libs/foundry/records/lootgeneration'
const ENTITY_ROOT = 'libs/foundry/records/entities/scitem'
const TAG_DB = 'libs/foundry/records/tagdatabase/tagdatabase.tagdatabase.json'

/**
 * Location-true presets (not shared V3 catalogs that list every tagged config type).
 * V3SlotPreset_* files include Ship Weapon / Ship Missile configs that only apply when
 * a spawn carries those tags — flattening them made ship guns appear at every site.
 *
 * OLP + PAF share one Orbageddon pool (bit-identical) — one member-facing location.
 */
const ORBAGEDDON_PRESETS = [
  'lootgeneration_slotpreset_orbageddon.json',
  'orb_orbitalplatform_ext.json',
  'orb_orbitalplatform_int.json',
  'orb_dishalignmentfacility.json',
  'orbageddon/orb_warehouse_multiconfig.json',
]

const LOADOUT_BUNDLE_ROOT = 'libs/foundry/records/loadoutkits/pu_loadoutbundles'
const CHARACTER_LOADOUT_ROOT = 'character-loadouts'

const LOCATION_DEFS = [
  {
    id: 'lazarus',
    label: 'Lazarus',
    group: null,
    systems: ['Pyro'],
    poolId: 'asddelving',
    presets: ['lootgeneration_slotpreset_asddelving.json'],
    loadoutFolders: ['associated_science_and_development'],
  },
  {
    id: 'onyx',
    label: 'Onyx',
    group: null,
    systems: ['Stanton'],
    poolId: 'welcometonyx',
    // No non-V3 WelcomeToOnyx preset in extract — use V3 but skip Ship Weapon/Missile configs.
    presets: ['v3slotpreset_welcometonyx.json'],
    loadoutFolders: ['associated_science_and_development'],
  },
  {
    id: 'olp_paf',
    label: 'OLP/PAF',
    group: null,
    systems: ['Stanton'],
    poolId: 'orbageddon',
    presets: ORBAGEDDON_PRESETS,
    loadoutFolders: ['criminal_gang', 'outlaws'],
  },
  {
    id: 'cz_checkmate',
    label: 'Checkmate CZ',
    group: 'contested_zone',
    groupLabel: 'Contested Zone',
    systems: ['Pyro'],
    poolId: 'contestedzone_checkmate',
    presets: [
      'contestedzones/contestedzone_1a.json',
      'contestedzones/contestedzone_1a_rewardroom_001.json',
    ],
    loadoutFolders: ['contested_zones', 'pyro_generic_outlaw'],
  },
  {
    id: 'cz_orbituary',
    label: 'Orbituary CZ',
    group: 'contested_zone',
    groupLabel: 'Contested Zone',
    systems: ['Pyro'],
    poolId: 'contestedzone_orbituary',
    // 1b reward room is the only Contested Zone preset with Components_ShipWeapons.
    presets: [
      'contestedzones/contestedzone_1a.json',
      'contestedzones/contestedzone_1b_rewardroom_002.json',
    ],
    loadoutFolders: ['contested_zones', 'rough_and_ready'],
  },
  {
    id: 'cz_ruin',
    label: 'Ruin CZ',
    group: 'contested_zone',
    groupLabel: 'Contested Zone',
    systems: ['Pyro'],
    poolId: 'contestedzone_ruin',
    presets: ['contestedzones/ghostarena_01.json'],
    loadoutFolders: ['contested_zones', 'headhunters'],
  },
  {
    id: 'executive_hangar',
    label: 'Executive Hangar',
    group: null,
    systems: ['Pyro'],
    poolId: 'executive_hangar',
    presets: ['asteroidbases/asteroidbase_exec_hangar_001.json'],
    loadoutFolders: [],
  },
  {
    id: 'qv_investigation',
    label: 'QV Investigation',
    group: null,
    systems: ['Nyx'],
    poolId: 'kaboos',
    presets: ['lootgeneration_slotpreset_kaboos.json'],
    loadoutFolders: [],
  },
  {
    id: 'siege_of_orison',
    label: 'Siege of Orison',
    group: null,
    systems: ['Stanton'],
    poolId: 'soo',
    // Event-only V3 preset (weapons caches + SOO event armour tables). Skip Ship Weapon/Missile configs.
    presets: ['v3slotpreset_soo.json'],
    loadoutFolders: ['xenothreat'],
  },
]

/** Skip non-loot / placement-gated catalog rows (esp. Ship Weapon tags on shared V3 presets). */
const SKIP_CONFIG_NAME =
  /^(Minable|Salvageable|Compboard|PowerBank|Datapad|Decryption|Loose Commodity|Loose Sustenance|ATLS Suit|Ship Weapon|S\d+ Ship Missile|Mining |Repair |Harvestables )\b/i

const KIND_LABELS = {
  fps_weapon: 'FPS Weapon',
  ship_weapon: 'Ship Weapon',
  ship_component: 'Ship Component',
  armour: 'Armour',
  clothing: 'Clothing',
  npc_gear: 'NPC Gear',
  plushie: 'Plushie',
  consumable: 'Consumable',
}

/** Worn clothing/armour kinds that can appear on NPC loadouts. */
const WORN_GEAR_KINDS = new Set(['armour', 'clothing'])

const SHIP_COMPONENT_TYPES = new Set([
  'Cooler',
  'PowerPlant',
  'Shield',
  'QuantumDrive',
  'Radar',
  'FuelTank',
  'FuelIntake',
  'MainThruster',
  'ManneuverThruster',
  'Missile',
  'MissileLauncher',
  'WeaponMount',
  'Turret',
  'GunTurret',
  'MissileTurret',
  'Control',
  'FlightController',
  'DoorController',
  'Lifesupport',
  'Armor',
  'ShipArmor',
  'QuantumEnforcementDevice',
  'Bomb',
  'BombLauncher',
  'Countermeasure',
  'Ping',
  'Emblem',
  'TowingBeam',
  'TractorBeam',
  'MiningLaser',
  'SalvageModifier',
  'UtilityTurret',
  'WeaponRegenPool',
  'AirTrafficController',
  'LandingSystem',
  'SelfDestruct',
  'CommsController',
])

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

function resolveRecordPath(ref, extractedRoot) {
  if (!ref || typeof ref !== 'string') return null
  const normalized = ref.replace(/\\/g, '/')
  const marker = 'libs/foundry/records/'
  const idx = normalized.indexOf(marker)
  if (idx >= 0) return join(extractedRoot, marker + normalized.slice(idx + marker.length))
  if (normalized.startsWith('file://./')) {
    // relative refs without libs path — unsupported here
    return null
  }
  return null
}

function entityClassFromRef(ref) {
  if (!ref || typeof ref !== 'string') return null
  const base = basename(ref.replace(/\\/g, '/'), '.json')
  return base || null
}

function tagId(node) {
  if (!node) return null
  return node._RecordId_ || (typeof node._RecordName_ === 'string' && node._RecordName_.startsWith('Tag.')
    ? node._RecordName_.slice(4)
    : null)
}

function humanizeToken(value) {
  return String(value || '')
    .replace(/^@item_Name/i, '')
    .replace(/^@/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

function resolveLoc(key, localization) {
  if (!key || typeof key !== 'string') return null
  if (!key.startsWith('@')) return key
  const hit = localization?.[key] ?? localization?.[key.slice(1)]
  if (!hit || String(hit).startsWith('@') || /placeholder|uninitialized|loc_empty/i.test(String(hit))) return null
  return String(hit).trim()
}

function usableName(name) {
  const text = String(name || '').trim()
  if (!text || text.startsWith('@') || text.startsWith('<=')) return false
  if (/placeholder|uninitialized|loc_empty/i.test(text)) return false
  return true
}

function buildTagHierarchy(extractedRoot) {
  const raw = readJson(join(extractedRoot, TAG_DB))
  const roots = raw?._RecordValue_?.tags || []
  const byId = new Map()
  const children = new Map()

  function walk(nodes, parentId = null) {
    for (const node of nodes || []) {
      const id = node._RecordId_
      if (!id) continue
      byId.set(id, { id, name: node.tagName || id, parentId })
      if (!children.has(id)) children.set(id, [])
      if (parentId) {
        if (!children.has(parentId)) children.set(parentId, [])
        children.get(parentId).push(id)
      }
      walk(node.children || [], id)
    }
  }
  walk(roots)

  const ancestorsCache = new Map()
  function ancestorsOf(id) {
    if (ancestorsCache.has(id)) return ancestorsCache.get(id)
    const out = []
    let cur = byId.get(id)?.parentId || null
    while (cur) {
      out.push(cur)
      cur = byId.get(cur)?.parentId || null
    }
    ancestorsCache.set(id, out)
    return out
  }

  const descendantsCache = new Map()
  function descendantsOf(id) {
    if (descendantsCache.has(id)) return descendantsCache.get(id)
    const out = []
    const stack = [...(children.get(id) || [])]
    while (stack.length) {
      const c = stack.pop()
      out.push(c)
      stack.push(...(children.get(c) || []))
    }
    descendantsCache.set(id, out)
    return out
  }

  return { byId, ancestorsOf, descendantsOf }
}

function isNonPlayerEntityKey(key) {
  const id = String(key || '').toLowerCase()
  return (
    /(?:^|_)(?:ai|aionly)(?:_|$)/i.test(id) ||
    /placeholder/i.test(id) ||
    /_default_(?:charge_drain|grapple|energy)/i.test(id) ||
    /_npc(?:_|$)/i.test(id) ||
    /_template(?:_|$)/i.test(id)
  )
}

function classifyEntity(entity) {
  if (!entity) return null
  const type = String(entity.type || '')
  const subType = String(entity.subType || '')
  const tagsStr = String(entity.attachTags || '')
  const key = String(entity.key || '').toLowerCase()
  const path = String(entity.path || '').toLowerCase()

  if (isNonPlayerEntityKey(key)) return null
  if (/magazine|ammo(?!_)|_mag$|ammobox|ammo_box/i.test(key) || type === 'Magazine' || type === 'AmmoBox') return null
  if (/keycard|compboard|powerbank|datapad|removablechip/i.test(key)) return null
  if (type === 'RemovableChip' || type === 'UNDEFINED' || type === 'Door' || type === 'Usable') return null
  if (/lootable_container|lootable_generated_container|weapon_rack_/i.test(key)) return null

  if (/plushy|plushie|toy_plush/i.test(key) || /plushy|plushie/i.test(tagsStr)) return 'plushie'
  if (type === 'WeaponPersonal') return 'fps_weapon'
  if (type === 'WeaponGun' || type === 'WeaponMining' || type === 'Missile' || type === 'Bomb' || /\/ships\/weapons\//.test(path)) {
    return 'ship_weapon'
  }
  if (type.startsWith('Char_Clothing')) return 'clothing'
  if (
    type.startsWith('Char_Armor') ||
    /undersuit|flight_suit|flight.?suit|cds_armor|armor_(light|medium|heavy)/i.test(key) ||
    (/\/characters\//.test(path) && /armor|undersuit|flight.?suit/i.test(key + path))
  ) {
    return 'armour'
  }
  if (type === 'FPS_Consumable' || type === 'Drink' || type === 'Food' || type === 'Bottle' || type === 'Can') {
    return 'consumable'
  }
  if (SHIP_COMPONENT_TYPES.has(type) || /\/ships\/(cooler|powerplant|shieldgenerator|quantumdrive|radar|armor|missile|weapon_mounts)\//.test(path)) {
    return 'ship_component'
  }
  if (/medpen|medpack|consumable_|food_|drink_|energy_bar|water_bottle/i.test(key)) return 'consumable'
  if (type === 'Misc' && /Personal/i.test(subType) && /plush|toy/i.test(key)) return 'plushie'
  if (type === 'Misc' && /(Food|Drink|Medical|Drug)/i.test(subType)) return 'consumable'
  return null
}

function buildEntityIndex(extractedRoot, localization, tagHierarchy) {
  const files = walkFiles(join(extractedRoot, ENTITY_ROOT))
  const byKey = new Map()
  const byTag = new Map()

  const addTag = (tag, key) => {
    if (!tag) return
    if (!byTag.has(tag)) byTag.set(tag, new Set())
    byTag.get(tag).add(key)
  }

  for (const file of files) {
    const json = readJson(file)
    const value = json?._RecordValue_
    if (!value) continue
    const key = basename(file, '.json')
    const components = value.Components || []
    const attach = components.find((c) => c?._Type_ === 'SAttachableComponentParams')
    const attachDef = attach?.AttachDef || {}
    const nameKey = attachDef?.Localization?.Name
    const displayName =
      resolveLoc(nameKey, localization) ||
      (usableName(nameKey) ? nameKey : null) ||
      humanizeToken(key)

    const directTags = []
    for (const t of value.tags || []) {
      const id = tagId(t)
      if (id) directTags.push(id)
    }

    const expanded = new Set(directTags)
    for (const id of directTags) {
      for (const a of tagHierarchy.ancestorsOf(id)) expanded.add(a)
    }

    const entity = {
      key,
      path: file.replace(/\\/g, '/'),
      type: attachDef.Type || '',
      subType: attachDef.SubType || '',
      attachTags: attachDef.Tags || '',
      displayName,
      tags: expanded,
      components,
    }
    entity.kind = classifyEntity(entity)
    byKey.set(key, entity)
    for (const t of expanded) addTag(t, key)
  }

  return { byKey, byTag }
}

function matchesTags(entity, positiveIds, negativeIds) {
  if (!entity) return false
  for (const id of positiveIds || []) {
    if (!entity.tags.has(id)) return false
  }
  for (const id of negativeIds || []) {
    if (entity.tags.has(id)) return false
  }
  return true
}

function dnfIds(term) {
  const positive = []
  const negative = []
  for (const t of term?.positiveTags || []) {
    const id = tagId(t)
    if (id) positive.push(id)
  }
  for (const t of term?.negativeTags || []) {
    const id = tagId(t)
    if (id) negative.push(id)
  }
  return { positive, negative }
}

function entitiesMatchingTags(index, positive, negative) {
  if (!positive.length) {
    // negative-only: scan is expensive; return empty for safety unless negative alone
    const out = []
    if (!negative.length) return out
    for (const ent of index.byKey.values()) {
      if (matchesTags(ent, positive, negative)) out.push(ent)
    }
    return out
  }
  let set = null
  for (const id of positive) {
    const bucket = index.byTag.get(id) || new Set()
    if (!set) set = new Set(bucket)
    else {
      for (const key of [...set]) {
        if (!bucket.has(key)) set.delete(key)
      }
    }
  }
  const out = []
  for (const key of set || []) {
    const ent = index.byKey.get(key)
    if (ent && matchesTags(ent, positive, negative)) out.push(ent)
  }
  return out
}

function loadJsonRef(ref, extractedRoot, cache) {
  const path = resolveRecordPath(ref, extractedRoot)
  if (!path) return null
  if (cache.has(path)) return cache.get(path)
  const json = readJson(path)
  cache.set(path, json)
  return json
}

function extractAttachedEntities(entity, index, kindFilter) {
  if (!entity) return []
  const text = JSON.stringify(entity.components || [])
  const keys = new Set()
  const patterns = [
    /entities\/scitem\/weapons\/fps_weapons\/([^\"]+)\.json/g,
    /entities\/scitem\/ships\/weapons\/([^\"]+)\.json/g,
    /entities\/scitem\/ships\/missiles\/([^\"]+)\.json/g,
    /entities\/scitem\/ships\/weapon_mounts\/([^\"]+)\.json/g,
  ]
  for (const re of patterns) {
    let m
    while ((m = re.exec(text))) {
      keys.add(basename(m[1]))
    }
  }
  const out = []
  for (const key of keys) {
    const ent = index.byKey.get(key)
    if (!ent?.kind) continue
    if (kindFilter && !kindFilter.has(ent.kind)) continue
    out.push(ent)
  }
  return out
}

function extractWeaponFromRack(entity, index) {
  return extractAttachedEntities(entity, index, new Set(['fps_weapon']))
}

function resolveFixedEntity(slot, extractedRoot, index, cache) {
  const results = []
  let entityKey = null

  if (slot.harvestableEntityClass) {
    entityKey = entityClassFromRef(slot.harvestableEntityClass)
  } else if (slot.harvestable) {
    const preset = loadJsonRef(slot.harvestable, extractedRoot, cache)
    const ec = preset?._RecordValue_?.entityClass
    entityKey = entityClassFromRef(ec)
  }

  if (!entityKey) return results
  const ent = index.byKey.get(entityKey)
  if (!ent) return results

  // FPS weapon racks and Contested Zone ship-gun usables (weapon_ship_cz_*) wrap the real item.
  if (/weapon_rack_/i.test(entityKey) || /weapon_ship_cz/i.test(entityKey) || !ent.kind) {
    const shipGuns = extractAttachedEntities(ent, index, new Set(['ship_weapon']))
    if (shipGuns.length) return shipGuns
    const fps = extractWeaponFromRack(ent, index)
    if (fps.length) return fps
  }

  if (ent.kind) results.push(ent)
  return results
}

function parseSecondaryLayers(secondaryChoices, extractedRoot, cache) {
  if (!secondaryChoices) return []
  const layers = []
  const type = secondaryChoices._Type_ || ''
  let layerRefs = []
  if (type.includes('MultiLayer')) {
    const multi = loadJsonRef(secondaryChoices.multiLayerRecord, extractedRoot, cache)
    layerRefs = multi?._RecordValue_?.layers || []
  } else if (type.includes('SingleLayer')) {
    layerRefs = [secondaryChoices.singleLayerRecord || secondaryChoices.layerRecord].filter(Boolean)
  }

  for (const ref of layerRefs) {
    const layerJson = typeof ref === 'string' ? loadJsonRef(ref, extractedRoot, cache) : null
    const choices = layerJson?._RecordValue_?.choices || []
    const parsed = []
    for (const choice of choices) {
      const sel = choice.selector
      if (sel?._Type_?.includes('Tags')) {
        const { positive, negative } = dnfIds(sel.tags)
        parsed.push({ name: choice.name, weight: Number(choice.weight) || 0, positive, negative })
      }
    }
    if (parsed.length) layers.push(parsed)
  }
  return layers
}

function secondaryWeight(entity, layers) {
  if (!layers.length) return 1
  let weight = 1
  for (const layer of layers) {
    let best = null
    for (const choice of layer) {
      if (matchesTags(entity, choice.positive, choice.negative)) {
        if (best == null || choice.weight > best) best = choice.weight
      }
    }
    if (best == null || best <= 0) return 0
    weight *= best
  }
  return weight
}

function evalPoolFilterNode(node, extractedRoot, cache, entity, depth = 0) {
  if (!node || depth > 12) return true
  const type = node._Type_ || ''

  if (type === 'PoolFilter_Sequence') {
    // Sequence is handled by caller with modes; bare sequence without modes = all must pass
    return (node.filters || []).every((f) => {
      const inner = f.filter || f
      return evalPoolFilterNode(inner, extractedRoot, cache, entity, depth + 1)
    })
  }

  if (type === 'PoolFilterInstance') {
    return evalPoolFilterNode(node.filter, extractedRoot, cache, entity, depth + 1)
  }

  if (type === 'PoolFilter_RecordRef') {
    const rec = loadJsonRef(node.filterRecord, extractedRoot, cache)
    return evalPoolFilterNode(rec?._RecordValue_?.filter, extractedRoot, cache, entity, depth + 1)
  }

  if (type === 'PoolFilter_Tags') {
    const { positive, negative } = dnfIds(node.tagFilter)
    return matchesTags(entity, positive, negative)
  }

  // Unknown filter types: do not exclude
  return true
}

function applyPoolFilter(candidates, filterRef, extractedRoot, cache) {
  if (!filterRef) return candidates
  const rec = loadJsonRef(filterRef, extractedRoot, cache)
  const root = rec?._RecordValue_?.filter
  if (!root) return candidates

  if (root._Type_ !== 'PoolFilter_Sequence') {
    return candidates.filter((ent) => evalPoolFilterNode(root, extractedRoot, cache, ent))
  }

  let result = [...candidates]
  const original = candidates
  for (const instance of root.filters || []) {
    const mode = instance.mode || 'Cumulative'
    const filterNode = instance.filter || instance
    if (mode === 'Additive') {
      const added = original.filter((ent) => evalPoolFilterNode(filterNode, extractedRoot, cache, ent))
      const keys = new Set(result.map((e) => e.key))
      for (const ent of added) {
        if (!keys.has(ent.key)) {
          result.push(ent)
          keys.add(ent.key)
        }
      }
    } else {
      result = result.filter((ent) => evalPoolFilterNode(filterNode, extractedRoot, cache, ent))
    }
  }
  return result
}

function expandArchetypeV3(archetype, index, extractedRoot, cache) {
  // returns [{ entity, weight }]
  const type = archetype?._Type_ || ''
  let entries = []
  if (type === 'LootArchetypeV3_RecordRef') {
    const rec = loadJsonRef(archetype.lootArchetypeRecord, extractedRoot, cache)
    entries = rec?._RecordValue_?.lootArchetype?.entries || []
  } else if (type === 'LootArchetypeV3') {
    entries = archetype.entries || []
  }

  const weighted = []
  let entryWeightSum = 0
  const resolvedEntries = []

  for (const entry of entries) {
    const entryWeight = Number(entry.weight) || 0
    if (entryWeight <= 0) continue
    const sel = entry.selector
    let ents = []
    if (sel?._Type_?.includes('EntityClasses')) {
      const list = sel.entityClasses?.entityClasses || []
      for (const ref of list) {
        const key = entityClassFromRef(ref)
        const ent = key ? index.byKey.get(key) : null
        if (ent) ents.push(ent)
      }
    } else if (sel?._Type_?.includes('Tags')) {
      const { positive, negative } = dnfIds(sel.tags)
      ents = entitiesMatchingTags(index, positive, negative)
    }
    if (!ents.length) continue
    entryWeightSum += entryWeight
    resolvedEntries.push({ entryWeight, ents })
  }

  for (const { entryWeight, ents } of resolvedEntries) {
    const share = entryWeightSum > 0 ? entryWeight / entryWeightSum : 0
    const per = share / ents.length
    for (const ent of ents) weighted.push({ entity: ent, weight: per })
  }
  return weighted
}

function expandLootTableV3(tableRef, index, extractedRoot, cache, poolFilterRef, secondaryLayers) {
  const rec = loadJsonRef(tableRef, extractedRoot, cache)
  const entries = rec?._RecordValue_?.lootTable?.lootArchetypes || []
  const out = new Map() // key -> weight

  let tableWeightSum = 0
  const resolved = []
  for (const entry of entries) {
    const w = Number(entry.weight) || 0
    if (w <= 0) continue
    const archWeights = expandArchetypeV3(entry.archetype, index, extractedRoot, cache)
    if (!archWeights.length) continue
    tableWeightSum += w
    resolved.push({ w, archWeights })
  }

  for (const { w, archWeights } of resolved) {
    const tableShare = tableWeightSum > 0 ? w / tableWeightSum : 0
    for (const { entity, weight: archShare } of archWeights) {
      let candidates = [entity]
      candidates = applyPoolFilter(candidates, poolFilterRef, extractedRoot, cache)
      if (!candidates.length) continue
      const ent = candidates[0]
      const sec = secondaryWeight(ent, secondaryLayers)
      if (sec <= 0) continue
      if (!ent.kind) continue
      const add = tableShare * archShare * sec
      out.set(ent.key, (out.get(ent.key) || 0) + add)
    }
  }

  // Re-run with pool filter applied before secondary for tag-selected pools:
  // When expandArchetype returns many ents, filter the set as a group for better Additive behavior.
  // The per-entity path above is correct for EntityClasses; for large tag sets we redo:
  return out
}

function expandLootTableV3Grouped(tableRef, index, extractedRoot, cache, poolFilterRef, secondaryLayers) {
  const rec = loadJsonRef(tableRef, extractedRoot, cache)
  const entries = rec?._RecordValue_?.lootTable?.lootArchetypes || []
  const out = new Map()

  let tableWeightSum = 0
  const resolved = []

  for (const entry of entries) {
    const w = Number(entry.weight) || 0
    if (w <= 0) continue
    const type = entry.archetype?._Type_ || ''
    let archEntries = []
    if (type === 'LootArchetypeV3_RecordRef') {
      const archRec = loadJsonRef(entry.archetype.lootArchetypeRecord, extractedRoot, cache)
      archEntries = archRec?._RecordValue_?.lootArchetype?.entries || []
    } else if (type === 'LootArchetypeV3') {
      archEntries = entry.archetype.entries || []
    }

    const archBucket = []
    let archSum = 0
    for (const archEntry of archEntries) {
      const aw = Number(archEntry.weight) || 0
      if (aw <= 0) continue
      const sel = archEntry.selector
      let ents = []
      if (sel?._Type_?.includes('EntityClasses')) {
        for (const ref of sel.entityClasses?.entityClasses || []) {
          const key = entityClassFromRef(ref)
          const ent = key ? index.byKey.get(key) : null
          if (ent) ents.push(ent)
        }
      } else if (sel?._Type_?.includes('Tags')) {
        const { positive, negative } = dnfIds(sel.tags)
        ents = entitiesMatchingTags(index, positive, negative)
      }
      ents = applyPoolFilter(ents, poolFilterRef, extractedRoot, cache)
      const weightedEnts = []
      for (const ent of ents) {
        if (!ent.kind) continue
        const sec = secondaryWeight(ent, secondaryLayers)
        if (sec <= 0) continue
        weightedEnts.push({ ent, sec })
      }
      if (!weightedEnts.length) continue
      const secSum = weightedEnts.reduce((s, x) => s + x.sec, 0)
      archSum += aw
      archBucket.push({ aw, weightedEnts, secSum })
    }
    if (!archBucket.length) continue
    tableWeightSum += w
    resolved.push({ w, archBucket, archSum })
  }

  for (const { w, archBucket, archSum } of resolved) {
    const tableShare = tableWeightSum > 0 ? w / tableWeightSum : 0
    for (const { aw, weightedEnts, secSum } of archBucket) {
      const archShare = archSum > 0 ? aw / archSum : 0
      for (const { ent, sec } of weightedEnts) {
        const itemShare = secSum > 0 ? sec / secSum : 0
        const add = tableShare * archShare * itemShare
        out.set(ent.key, (out.get(ent.key) || 0) + add)
      }
    }
  }
  return out
}

function expandClassicLootTable(tableRef, index, extractedRoot, cache) {
  const rec = loadJsonRef(tableRef, extractedRoot, cache)
  const archetypes = rec?._RecordValue_?.lootArchetypes || []
  const out = new Map()
  let sum = 0
  const resolved = []

  for (const weighted of archetypes) {
    const w = Number(weighted.weight) || 0
    if (w <= 0) continue
    const arch = loadJsonRef(weighted.archetype, extractedRoot, cache)?._RecordValue_
    if (!arch) continue
    const primary = arch.primaryOrGroup?.entries || []
    const secondaryGroups = arch.secondaryOrGroups || []

    const ents = []
    for (const entry of primary) {
      const primaryTag = tagId(entry.tag)
      const add = dnfIds(entry.additionalTags)
      const positive = [primaryTag, ...add.positive].filter(Boolean)
      const matches = entitiesMatchingTags(index, positive, add.negative)
      for (const ent of matches) {
        if (!ent.kind) continue
        let secMul = 1
        for (const group of secondaryGroups) {
          let best = null
          for (const sec of group.entries || []) {
            const sid = tagId(sec.tag)
            if (sid && ent.tags.has(sid)) {
              const sw = Number(sec.weight) || 0
              if (best == null || sw > best) best = sw
            }
          }
          if (best == null) {
            secMul = 0
            break
          }
          secMul *= best
        }
        if (secMul <= 0) continue
        ents.push({ ent, secMul: secMul * (Number(entry.weight) || 1) })
      }
    }
    if (!ents.length) continue
    const localSum = ents.reduce((s, x) => s + x.secMul, 0)
    sum += w
    resolved.push({ w, ents, localSum })
  }

  for (const { w, ents, localSum } of resolved) {
    const share = sum > 0 ? w / sum : 0
    for (const { ent, secMul } of ents) {
      const itemShare = localSum > 0 ? secMul / localSum : 0
      out.set(ent.key, (out.get(ent.key) || 0) + share * itemShare)
    }
  }
  return out
}

function collectSlotsFromConfig(subConfig, extractedRoot, cache) {
  if (!subConfig) return { slots: [], initialProb: 1 }
  if (subConfig._Type_ === 'SubHarvestableConfigSingleManual') {
    const manual = subConfig.subConfigManual || {}
    return {
      slots: manual.subHarvestables || [],
      initialProb: Number(manual.initialSlotsProbability) || 1,
    }
  }
  if (subConfig._Type_ === 'SubHarvestableConfigSingleRef') {
    const rec = loadJsonRef(subConfig.subConfigRef, extractedRoot, cache)
    const cfg = rec?._RecordValue_?.subConfig || {}
    return {
      slots: cfg.subHarvestables || [],
      initialProb: Number(cfg.initialSlotsProbability) || 1,
    }
  }
  return { slots: [], initialProb: 1 }
}

function accumulatePool(presetPaths, extractedRoot, index, cache) {
  /** @type {Map<string, number>} */
  const weights = new Map()

  for (const rel of presetPaths) {
    const presetPath = join(extractedRoot, SLOT_PRESET_ROOT, rel)
    const preset = readJson(presetPath)
    const tagged = preset?._RecordValue_?.multiConfig?.taggedConfigs || []
    for (const config of tagged) {
      const name = String(config.name || '')
      if (SKIP_CONFIG_NAME.test(name)) continue
      const { slots, initialProb } = collectSlotsFromConfig(config.subConfig, extractedRoot, cache)
      if (!slots.length) continue

      const slotWeightSum = slots.reduce((s, slot) => s + (Number(slot.relativeProbability) || 0), 0) || slots.length

      for (const slot of slots) {
        const relProb = Number(slot.relativeProbability) || 0
        const slotShare = (relProb > 0 ? relProb : 1) / slotWeightSum
        const lootConfig = slot.lootConfig
        const chance = Number(lootConfig?.lootConstraints?.chanceToGenerate ?? 1) || 0
        const mass = initialProb * chance * slotShare
        if (mass <= 0) continue

        if (lootConfig?.lootTableV3) {
          const layers = parseSecondaryLayers(lootConfig.lootConstraints?.secondaryChoices, extractedRoot, cache)
          const distributed = expandLootTableV3Grouped(
            lootConfig.lootTableV3,
            index,
            extractedRoot,
            cache,
            lootConfig.lootConstraints?.poolFilter,
            layers,
          )
          for (const [key, w] of distributed) {
            weights.set(key, (weights.get(key) || 0) + mass * w)
          }
          continue
        }

        if (lootConfig?.lootTable) {
          const distributed = expandClassicLootTable(lootConfig.lootTable, index, extractedRoot, cache)
          for (const [key, w] of distributed) {
            weights.set(key, (weights.get(key) || 0) + mass * w)
          }
          continue
        }

        const fixed = resolveFixedEntity(slot, extractedRoot, index, cache)
        if (!fixed.length) continue
        const each = mass / fixed.length
        for (const ent of fixed) {
          weights.set(ent.key, (weights.get(ent.key) || 0) + each)
        }
      }
    }
  }

  return weights
}

function titleCaseToken(value) {
  if (!value || typeof value !== 'string') return null
  const t = value.trim()
  if (!t) return null
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function buildStats(entity, catalogs) {
  const stats = {}
  const fps = catalogs?.fpsByClass?.get(entity.key)
  if (fps) {
    if (fps.weaponType) stats.weaponType = fps.weaponType
    if (fps.damage) stats.damage = fps.damage
    if (fps.fireRate) stats.fireRate = fps.fireRate
  }
  const comp = catalogs?.componentByClass?.get(entity.key)
  if (comp) {
    if (comp.type) stats.componentType = comp.type
    if (comp.size != null) stats.size = comp.size
    if (comp.grade != null) stats.grade = comp.grade
    if (comp.class) stats.itemClass = comp.class
  }
  const ship = catalogs?.shipByClass?.get(entity.key)
  if (ship) {
    if (ship.size != null) stats.size = ship.size
    if (ship.damageType) stats.damageType = ship.damageType
    if (ship.weaponClass) stats.weaponClass = ship.weaponClass
    if (ship.itemClass) stats.itemClass = ship.itemClass
    if (ship.grade != null && ship.grade !== '') stats.grade = ship.grade
    if (ship.attachType && ship.attachType !== 'WeaponGun' && ship.attachType !== 'UNDEFINED') {
      stats.componentType = ship.attachType
    } else if (ship.kind && ship.kind !== 'weapon') {
      stats.componentType = titleCaseToken(ship.kind)
    }
  }
  const bp = catalogs?.blueprintByClass?.get(entity.key)
  if (bp?.armorBaseStats) {
    stats.armor = bp.armorBaseStats
  }
  if (bp) {
    const cat = bp.categoryName || ''
    const sizeMatch = /\bS(\d+)\b/i.exec(cat)
    if (stats.size == null && sizeMatch) stats.size = Number(sizeMatch[1])
    if (!stats.itemClass && bp.class) stats.itemClass = bp.class
    if (stats.grade == null && bp.grade != null) stats.grade = bp.grade
    if (!stats.componentType && bp.subCategoryName) stats.componentType = bp.subCategoryName
    if (!stats.weaponType && bp.subtype && entity.kind === 'fps_weapon') stats.weaponType = bp.subtype
  }
  if ((entity.kind === 'armour' || entity.kind === 'clothing' || entity.kind === 'npc_gear') && entity.subType) {
    stats.slot = entity.subType
  }
  if (entity.kind === 'consumable' && entity.subType) stats.consumableType = entity.subType
  return Object.keys(stats).length ? stats : undefined
}

function resolveLoadoutXmlPath(loadoutPath, extractedRoot) {
  if (!loadoutPath || typeof loadoutPath !== 'string') return null
  const normalized = loadoutPath.replace(/\\/g, '/')
  const marker = 'Scripts/Loadouts/Character/'
  const idx = normalized.indexOf(marker)
  const rel = idx >= 0 ? normalized.slice(idx + 'Scripts/Loadouts/'.length) : normalized.replace(/^Data\//, '')
  const candidate = join(extractedRoot, CHARACTER_LOADOUT_ROOT, rel)
  if (existsSync(candidate)) return candidate
  const alt = join(extractedRoot, 'Data', 'Scripts', 'Loadouts', rel)
  return existsSync(alt) ? alt : null
}

function itemNamesFromLoadoutXml(xmlPath) {
  if (!xmlPath || !existsSync(xmlPath)) return []
  const text = readFileSync(xmlPath, 'utf8')
  const names = []
  const re = /itemName="([^"]*)"/g
  let m
  while ((m = re.exec(text))) {
    const name = String(m[1] || '').trim()
    if (name) names.push(name)
  }
  return names
}

function collectLoadoutXmlPaths(bundleJson, extractedRoot, cache) {
  const paths = []
  const groups = bundleJson?._RecordValue_?.GroupedLoadouts || []
  for (const group of groups) {
    const groupName = String(group.Group || '')
    // Skip weapon / medical / body-mesh groups — worn clothing & armour live on Outfit / armor slots.
    if (/Weapon|Medical|Grenade|Optic|^Item$|Attachment|Hair|^Body$|Mobiglas|Utility/i.test(groupName)) {
      continue
    }
    for (const lo of group.Loadouts || []) {
      if (lo.loadoutPath) {
        const abs = resolveLoadoutXmlPath(lo.loadoutPath, extractedRoot)
        if (abs) paths.push(abs)
      }
      for (const inv of lo.InventoryItems || []) {
        const ref = inv.entityClass || inv.entityClassRecord || inv.item
        const key = entityClassFromRef(ref) || (typeof ref === 'string' ? basename(ref, '.json') : null)
        if (key) paths.push({ __entityKey: key })
      }
    }
  }
  return paths
}

/**
 * Count worn clothing/armour entity keys from NPC loadout bundles for a site pool.
 * @returns {Map<string, number>}
 */
function accumulateNpcWornGear(folderNames, extractedRoot, index, cache) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  if (!folderNames?.length) return counts

  for (const folder of folderNames) {
    const dir = join(extractedRoot, LOADOUT_BUNDLE_ROOT, folder)
    if (!existsSync(dir)) continue
    let files = []
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    } catch {
      continue
    }
    for (const file of files) {
      const bundle = readJson(join(dir, file))
      if (!bundle) continue
      const entries = collectLoadoutXmlPaths(bundle, extractedRoot, cache)
      for (const entry of entries) {
        if (entry && typeof entry === 'object' && entry.__entityKey) {
          const ent = index.byKey.get(entry.__entityKey)
          if (ent && WORN_GEAR_KINDS.has(ent.kind)) {
            counts.set(ent.key, (counts.get(ent.key) || 0) + 1)
          }
          continue
        }
        for (const itemName of itemNamesFromLoadoutXml(entry)) {
          const ent = index.byKey.get(itemName)
          if (!ent || !WORN_GEAR_KINDS.has(ent.kind)) continue
          counts.set(ent.key, (counts.get(ent.key) || 0) + 1)
        }
      }
    }
  }
  return counts
}

/**
 * @param {{ extractedRoot: string, localization?: Record<string,string>, catalogs?: object }} options
 */
export function parseSiteLoot(options = {}) {
  const extractedRoot = options.extractedRoot
  const localization = options.localization || {}
  const catalogs = options.catalogs || {}
  const cache = new Map()

  console.log('\n[SITE LOOT] Building entity tag index...')
  const tagHierarchy = buildTagHierarchy(extractedRoot)
  const index = buildEntityIndex(extractedRoot, localization, tagHierarchy)
  console.log(`  Indexed ${index.byKey.size} entities`)

  /** @type {Map<string, Map<string, number>>} poolId -> weights */
  const pools = new Map()
  /** @type {Map<string, Set<string>>} poolId -> loadout folder names */
  const loadoutFoldersByPool = new Map()
  const locationTypes = []

  for (const loc of LOCATION_DEFS) {
    locationTypes.push({
      id: loc.id,
      label: loc.label,
      group: loc.group || null,
      groupLabel: loc.groupLabel || null,
      systems: loc.systems,
      poolId: loc.poolId,
    })
    if (!loadoutFoldersByPool.has(loc.poolId)) loadoutFoldersByPool.set(loc.poolId, new Set())
    for (const folder of loc.loadoutFolders || []) loadoutFoldersByPool.get(loc.poolId).add(folder)

    if (pools.has(loc.poolId)) continue
    console.log(`  Pool ${loc.poolId} (${loc.label})...`)
    const weights = accumulatePool(loc.presets, extractedRoot, index, cache)
    pools.set(loc.poolId, weights)
    console.log(`    ${weights.size} weighted keys before allowlist join`)
  }

  /** @type {Map<string, Map<string, number>>} poolId -> worn gear counts */
  const npcPools = new Map()
  for (const [poolId, folderSet] of loadoutFoldersByPool) {
    const folders = [...folderSet]
    if (!folders.length) {
      npcPools.set(poolId, new Map())
      continue
    }
    console.log(`  NPC worn gear ${poolId} (${folders.join(', ')})...`)
    const counts = accumulateNpcWornGear(folders, extractedRoot, index, cache)
    npcPools.set(poolId, counts)
    console.log(`    ${counts.size} worn clothing/armour keys`)
  }

  /** @type {Map<string, any>} */
  const items = new Map()

  for (const loc of locationTypes) {
    const weights = pools.get(loc.poolId) || new Map()
    // allowlist + renormalize
    let total = 0
    const kept = []
    for (const [key, weight] of weights) {
      const ent = index.byKey.get(key)
      if (!ent?.kind || weight <= 0) continue
      if (!usableName(ent.displayName) && !ent.displayName) continue
      kept.push({ ent, weight })
      total += weight
    }
    const crateKeys = new Set()
    for (const { ent, weight } of kept) {
      const ratePct = total > 0 ? (100 * weight) / total : 0
      if (ratePct < 0.001) continue
      crateKeys.add(ent.key)
      let item = items.get(ent.key)
      if (!item) {
        item = {
          key: ent.key,
          displayName: usableName(ent.displayName) ? ent.displayName : humanizeToken(ent.key),
          kind: ent.kind,
          kindLabel: KIND_LABELS[ent.kind] || ent.kind,
          stats: buildStats(ent, catalogs),
          locations: [],
        }
        items.set(ent.key, item)
      }
      item.locations.push({
        locationTypeId: loc.id,
        ratePct: Math.round(ratePct * 1000) / 1000,
      })
    }

    // NPC worn clothing/armour that does not also appear in this site's crate loot.
    const worn = npcPools.get(loc.poolId) || new Map()
    const npcOnly = []
    let npcTotal = 0
    for (const [key, count] of worn) {
      if (crateKeys.has(key)) continue
      const ent = index.byKey.get(key)
      if (!ent || !WORN_GEAR_KINDS.has(ent.kind)) continue
      if (!usableName(ent.displayName) && !ent.displayName) continue
      npcOnly.push({ ent, count })
      npcTotal += count
    }
    for (const { ent, count } of npcOnly) {
      const ratePct = npcTotal > 0 ? (100 * count) / npcTotal : 0
      if (ratePct < 0.001) continue
      const itemKey = `npc:${ent.key}`
      let item = items.get(itemKey)
      if (!item) {
        item = {
          key: itemKey,
          displayName: usableName(ent.displayName) ? ent.displayName : humanizeToken(ent.key),
          kind: 'npc_gear',
          kindLabel: KIND_LABELS.npc_gear,
          stats: {
            ...buildStats(ent, catalogs),
            wornAs: ent.kind === 'clothing' ? 'Clothing' : 'Armour',
          },
          locations: [],
        }
        items.set(itemKey, item)
      }
      item.locations.push({
        locationTypeId: loc.id,
        ratePct: Math.round(ratePct * 1000) / 1000,
      })
    }
  }

  const itemList = [...items.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const byLocation = {}
  for (const loc of locationTypes) {
    byLocation[loc.id] = itemList
      .map((item) => {
        const hit = item.locations.find((l) => l.locationTypeId === loc.id)
        if (!hit) return null
        return {
          key: item.key,
          displayName: item.displayName,
          kind: item.kind,
          kindLabel: item.kindLabel,
          ratePct: hit.ratePct,
          stats: item.stats,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.ratePct - a.ratePct || a.displayName.localeCompare(b.displayName))
  }

  return {
    _source:
      'Star Citizen Game Files (site loot slot presets + NPC loadout worn gear; location-true presets)',
    _extracted: new Date().toISOString(),
    locationTypes,
    items: itemList,
    byLocation,
    summary: {
      locationTypeCount: locationTypes.length,
      itemCount: itemList.length,
      poolCount: pools.size,
      npcGearItemCount: itemList.filter((i) => i.kind === 'npc_gear').length,
      clothingItemCount: itemList.filter((i) => i.kind === 'clothing').length,
    },
  }
}
