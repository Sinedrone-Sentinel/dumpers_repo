/**
 * Bake site loot pools (Lazarus, Onyx, OLP, PAF, Contested Zone, Executive Hangar, QV Investigation)
 * into game-site-loot.json for Loot Finder.
 *
 * Relative rates are weight shares within each location after the allowlist.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const SLOT_PRESET_ROOT = 'libs/foundry/records/harvestable/slotpresets'
const LOOT_ROOT = 'libs/foundry/records/lootgeneration'
const ENTITY_ROOT = 'libs/foundry/records/entities/scitem'
const TAG_DB = 'libs/foundry/records/tagdatabase/tagdatabase.tagdatabase.json'

const LOCATION_DEFS = [
  {
    id: 'lazarus',
    label: 'Lazarus',
    systems: ['Pyro'],
    poolId: 'asddelving',
    presets: [
      'v3slotpreset_asddelving.json',
      'v3slotpreset_asddelving_sciencewing.json',
    ],
  },
  {
    id: 'onyx',
    label: 'Onyx',
    systems: ['Stanton'],
    poolId: 'welcometonyx',
    presets: ['v3slotpreset_welcometonyx.json'],
  },
  {
    id: 'olp',
    label: 'OLP',
    systems: ['Stanton'],
    poolId: 'orbageddon',
    presets: ['v3slotpreset_orbageddon.json'],
  },
  {
    id: 'paf',
    label: 'PAF',
    systems: ['Stanton'],
    poolId: 'orbageddon',
    presets: ['v3slotpreset_orbageddon.json'],
  },
  {
    id: 'contested_zone',
    label: 'Contested Zone',
    systems: ['Pyro'],
    poolId: 'contestedzones',
    presets: ['v3slotpreset_contestedzones.json'],
  },
  {
    id: 'executive_hangar',
    label: 'Executive Hangar',
    systems: ['Pyro'],
    poolId: 'executive_hangar',
    presets: ['asteroidbases/asteroidbase_exec_hangar_001.json'],
  },
  {
    id: 'qv_investigation',
    label: 'QV Investigation',
    systems: ['Nyx'],
    poolId: 'kaboos',
    presets: ['lootgeneration_slotpreset_kaboos.json'],
  },
]

const SKIP_CONFIG_NAME =
  /^(Minable|Salvageable|Compboard|PowerBank|Datapad|Decryption|Loose Commodity|ATLS Suit)\b/i

const KIND_LABELS = {
  fps_weapon: 'FPS Weapon',
  ship_weapon: 'Ship Weapon',
  ship_component: 'Ship Component',
  armour: 'Armour',
  plushie: 'Plushie',
  consumable: 'Consumable',
}

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

function extractWeaponFromRack(entity, index) {
  if (!entity) return []
  const text = JSON.stringify(entity.components || [])
  const re = /entities\/scitem\/weapons\/fps_weapons\/([^\"]+)\.json/g
  const keys = new Set()
  let m
  while ((m = re.exec(text))) {
    keys.add(basename(m[1]))
  }
  const out = []
  for (const key of keys) {
    const ent = index.byKey.get(key)
    if (ent?.kind === 'fps_weapon') out.push(ent)
  }
  return out
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

  if (/weapon_rack_/i.test(entityKey)) {
    const weapons = extractWeaponFromRack(ent, index)
    if (weapons.length) return weapons
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
  const bp = catalogs?.blueprintByClass?.get(entity.key)
  if (bp?.armorBaseStats) {
    stats.armor = bp.armorBaseStats
  }
  if (entity.kind === 'armour' && entity.subType) stats.slot = entity.subType
  if (entity.kind === 'consumable' && entity.subType) stats.consumableType = entity.subType
  return Object.keys(stats).length ? stats : undefined
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
  const locationTypes = []

  for (const loc of LOCATION_DEFS) {
    locationTypes.push({
      id: loc.id,
      label: loc.label,
      systems: loc.systems,
      poolId: loc.poolId,
    })
    if (pools.has(loc.poolId)) continue
    console.log(`  Pool ${loc.poolId} (${loc.label})...`)
    const weights = accumulatePool(loc.presets, extractedRoot, index, cache)
    pools.set(loc.poolId, weights)
    console.log(`    ${weights.size} weighted keys before allowlist join`)
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
    for (const { ent, weight } of kept) {
      const ratePct = total > 0 ? (100 * weight) / total : 0
      if (ratePct < 0.001) continue
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
    _source: 'Star Citizen Game Files (site loot slot presets + loot tables)',
    _extracted: new Date().toISOString(),
    locationTypes,
    items: itemList,
    byLocation,
    summary: {
      locationTypeCount: locationTypes.length,
      itemCount: itemList.length,
      poolCount: pools.size,
    },
  }
}
