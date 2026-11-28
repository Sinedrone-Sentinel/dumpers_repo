/**
 * Enemy ship waves for ship-combat contracts.
 * Counts and roles come from MissionPropertyValue_ShipSpawnDescriptions.
 * The ship the player is sent to protect is left out.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const CLASS_RANK = [
  'Bomber',
  'Gunship',
  'Assaultship',
  'CapitalShip',
  'Flagships',
  'Industrial',
  'Fighter',
  'Cargo',
  'PersonalTransport',
  'Versatile',
  'Capital',
]

const ROLE_WORD = {
  Bomber: 'bomber',
  Fighter: 'fighter',
  Gunship: 'gunship',
  Assaultship: 'assault ship',
  Flagships: 'flagship',
  Industrial: 'industrial ship',
  CapitalShip: 'capital ship',
  Capital: 'capital ship',
  Cargo: 'cargo ship',
  PersonalTransport: 'transport',
  Versatile: 'ship',
}

const SIZE_WORDS = new Set(['Light', 'Medium', 'Heavy', 'Frontal', 'Lateral'])

const ENTITY_ROLE = {
  Bomber: 'bomber',
  Bombers: 'bomber',
  Fighter: 'fighter',
  Fighters: 'fighter',
  Gunship: 'gunship',
  Gunships: 'gunship',
}

export function buildTagIndex(tagDb) {
  const byId = new Map()
  const roots = tagDb?._RecordValue_?.tags || tagDb?.tags || []

  function walk(node, path) {
    if (!node || typeof node !== 'object') return
    const name = node.tagName || null
    const next = name ? [...path, name] : path
    if (node._RecordId_) byId.set(node._RecordId_, { name, path: next })
    for (const child of node.children || []) walk(child, next)
  }

  for (const root of roots) walk(root, [])
  return byId
}

function tagIds(list) {
  const tags = Array.isArray(list) ? list : list?.tags
  if (!Array.isArray(tags)) return []
  return tags.map((tag) => tag?._RecordId_ || tag?.id).filter(Boolean)
}

function roleFromTag(tag) {
  if (!tag?.name) return null
  const { name, path } = tag
  if (name === 'ShipClass' || name === 'Ships' || name === 'Ship') return null
  if (
    (path[0] === 'Ship' && (path[1] === 'Series' || path[1] === 'Model'))
    || path.includes('ShipModel')
  ) {
    return { label: name, hull: true }
  }
  if (name === 'CombatShip') return { label: 'combat ship', hull: false }

  if (path.includes('ShipClass')) {
    if (name === 'AntiCapital') {
      const parent = path[path.length - 2]
      const parentWord = ROLE_WORD[parent] || 'fighter'
      return { label: `anti-capital ${parentWord}`, hull: false }
    }
    if (SIZE_WORDS.has(name)) {
      const parent = path[path.length - 2]
      const parentWord = ROLE_WORD[parent] || 'ship'
      return { label: `${name.toLowerCase()} ${parentWord}`, hull: false }
    }
    return { label: ROLE_WORD[name] || name.toLowerCase(), hull: false }
  }

  if (path.includes('Ships')) {
    const label = ENTITY_ROLE[name]
    return label ? { label, hull: false } : null
  }
  return null
}

export function roleForSpawn(option, tagIndex) {
  const ids = [...tagIds(option?.tags), ...tagIds(option?.entityTags)]
  const candidates = []
  for (const id of ids) {
    const tag = tagIndex.get(id)
    const role = roleFromTag(tag)
    if (!role || !tag) continue
    const rank = CLASS_RANK.indexOf(tag.name)
    candidates.push({
      label: role.label,
      hull: role.hull,
      depth: tag.path.length,
      rank: rank === -1 ? 50 : rank,
      shipClass: tag.path.includes('ShipClass'),
    })
  }
  if (candidates.length === 0) return 'ship'
  candidates.sort((a, b) => {
    if (a.hull !== b.hull) return a.hull ? -1 : 1
    if (a.shipClass !== b.shipClass) return a.shipClass ? -1 : 1
    if (b.depth !== a.depth) return b.depth - a.depth
    return a.rank - b.rank
  })
  return candidates[0].label
}

function pluralRole(role) {
  if (role.endsWith('s')) return role
  return `${role}s`
}

function countPhrase(count, role) {
  const shown = Number.isInteger(count) ? String(count) : String(count)
  return `${shown} ${count === 1 ? role : pluralRole(role)}`
}

function slotParts(shipOptions, tagIndex) {
  const parts = []
  for (const option of shipOptions?.options || []) {
    const weight = option.weight ?? option.weighting ?? 1
    if (!(weight > 0)) continue
    const count = Number(option.concurrentAmount)
    if (!Number.isFinite(count) || count <= 0) continue
    const role = roleForSpawn(option, tagIndex)
    parts.push({ count, role })
  }
  if (parts.length === 0) return null
  const unique = []
  for (const part of parts) {
    if (!unique.some((row) => row.role === part.role && row.count === part.count)) unique.push(part)
  }
  if (unique.length === 1) return unique[0]
  return { or: unique.map((part) => countPhrase(part.count, part.role)).join(' or ') }
}

function mergeSlots(slots) {
  const order = []
  const sums = new Map()
  const alternatives = []
  for (const slot of slots) {
    if (!slot) continue
    if (slot.or) {
      alternatives.push(slot.or)
      continue
    }
    if (!sums.has(slot.role)) {
      sums.set(slot.role, 0)
      order.push(slot.role)
    }
    sums.set(slot.role, sums.get(slot.role) + slot.count)
  }
  const parts = order.map((role) => countPhrase(sums.get(role), role))
  parts.push(...alternatives)
  return parts.join(', ')
}

function humanWave(name) {
  if (!name || typeof name !== 'string') return null
  const match = name.match(/^Wave\s*(\d+)$/i)
  if (match) return `Wave ${Number(match[1])}`
  return null
}

function waveNumber(name) {
  const match = String(name).match(/Wave0*(\d+)/i)
  return match ? Number(match[1]) : null
}

function lineForGroup(spawnGroup, tagIndex, forcedWave) {
  const slots = (spawnGroup?.ships || []).map((slot) => slotParts(slot, tagIndex))
  const merged = mergeSlots(slots)
  if (!merged) return null
  const wave = humanWave(spawnGroup?.Name) || (forcedWave != null ? `Wave ${forcedWave}` : null)
  return wave ? `${wave} — ${merged}` : merged
}

function isProtectedShip(name) {
  return /EscortShip_BP$/i.test(name) && !/Reinforc/i.test(name)
}

function familyOf(name) {
  if (!name || isProtectedShip(name)) return null
  if (/RecipientShip|Allied|Friendly|CargoShip|Salvage|Decoy|FakeShip|Chicken|ShipToBoard|BoardedShip|HeistShip/i.test(name)) {
    return null
  }
  if (/AttackedShipSpawn|_AttackedShip_BP$/i.test(name)) return null
  if (/Bomber/i.test(name)) return { family: 'bombers', label: 'Bombers' }
  if (/SupportShip/i.test(name)) return { family: 'support', label: 'Support ships' }
  if (/InitialEnem/i.test(name)) return { family: 'opening', label: 'Opening enemies' }
  if (/Interdiction/i.test(name)) return { family: 'interdiction', label: 'Interdiction' }
  if (/Reinforc/i.test(name)) return { family: 'reinforcements', label: 'Reinforcements' }
  if (/Scout/i.test(name)) return { family: 'scouts', label: 'Scouts' }
  if (/AcePilot/i.test(name)) return { family: 'ace', label: 'Ace' }
  if (/DefendingShip/i.test(name)) return { family: 'defenders', label: 'Defenders' }
  if (/Hijacker/i.test(name)) return { family: 'hijackers', label: 'Hijackers' }
  if (/Ambuscade/i.test(name)) return { family: 'ambush', label: 'Ambush' }
  if (/Hostile|EnemyShip|EnemyWave|Combatant/i.test(name)) return { family: 'hostile', label: 'Hostile ships' }
  if (/MissionTarget|TargetSpawn|KillShip/i.test(name)) return { family: 'targets', label: 'Targets' }
  if (/Polaris|Vanduul|WaveShip|ShipsToSpawn|ShipWaves/i.test(name)) return { family: 'waves', label: 'Enemy ships' }
  return null
}

function phaseOf(name) {
  if (/ToLanding/i.test(name)) return 'On the way in'
  if (/FromLanding/i.test(name)) return 'On the way out'
  return null
}

function boolValue(value) {
  if (!value || typeof value !== 'object') return null
  if (typeof value.value === 'boolean') return value.value
  const option = value.options?.[0]
  if (typeof option?.value === 'boolean') return option.value
  return null
}

function numericOptions(value) {
  if (!value || typeof value !== 'object') return []
  if (typeof value.value === 'number') return [value.value]
  return (value.options || [])
    .map((option) => Number(option?.value))
    .filter((n) => Number.isFinite(n))
}

function propertyMap(properties) {
  const map = new Map()
  for (const prop of properties || []) {
    if (prop?.missionVariableName) map.set(prop.missionVariableName, prop.value)
  }
  return map
}

function chanceState(value) {
  const nums = numericOptions(value)
  if (nums.length === 0) return null
  const max = Math.max(...nums)
  const min = Math.min(...nums)
  if (max <= 0) return 'off'
  if (min < 1) return 'maybe'
  return 'on'
}

function gateState(name, map) {
  let boolName = null
  const chanceNames = []
  if (/InitialEnemies_BP$/i.test(name)) {
    boolName = name.replace(/InitialEnemies_BP$/i, 'InitialEnemiesBool_BP')
  }
  if (/ReinforcementsWave\d+_BP$/i.test(name)) {
    chanceNames.push(name.replace(/ReinforcementsWave\d+_BP$/i, 'ReinforcementChance_BP'))
  } else if (/ShipReinforcemenets_BP$/i.test(name)) {
    chanceNames.push(name.replace(/ShipReinforcemenets_BP$/i, 'ReinforcementChance_BP'))
  } else if (/Reinforcements_BP$/i.test(name)) {
    chanceNames.push(name.replace(/Reinforcements_BP$/i, 'ReinforcementChance_BP'))
  } else if (/ReinforcementShips_BP$/i.test(name)) {
    chanceNames.push(name.replace(/ReinforcementShips_BP$/i, 'ReinforcementChance_BP'))
  }
  if (/InterdictionShips_BP$/i.test(name)) {
    chanceNames.push(name.replace(/InterdictionShips_BP$/i, 'InterdictionChance_BP'))
  }
  const genericChance = name.replace(/_BP$/, 'Chance_BP')
  if (genericChance !== name) chanceNames.push(genericChance)

  if (boolName && map.has(boolName) && boolValue(map.get(boolName)) === false) return 'off'
  let state = 'on'
  for (const chanceName of chanceNames) {
    if (!map.has(chanceName)) continue
    const next = chanceState(map.get(chanceName))
    if (next === 'off') return 'off'
    if (next === 'maybe') state = 'maybe'
  }
  return state
}

export function enemiesFromProperties(properties, tagIndex) {
  const map = propertyMap(properties)
  const groups = new Map()

  for (const prop of properties || []) {
    const name = prop?.missionVariableName
    const value = prop?.value
    if (!name || value?._Type_ !== 'MissionPropertyValue_ShipSpawnDescriptions') continue
    const spec = familyOf(name)
    if (!spec) continue
    const gate = gateState(name, map)
    if (gate === 'off') continue

    const forcedWave = spec.family === 'reinforcements' ? waveNumber(name) : null
    const lines = []
    for (const spawnGroup of value.spawnDescriptions || []) {
      const line = lineForGroup(spawnGroup, tagIndex, forcedWave)
      if (line) lines.push(line)
    }
    if (lines.length === 0) continue

    const phase = phaseOf(name)
    const key = `${phase || ''}|${spec.family}`
    let bucket = groups.get(key)
    if (!bucket) {
      bucket = {
        label: phase ? `${phase} — ${spec.label}` : spec.label,
        maybe: false,
        lines: [],
      }
      groups.set(key, bucket)
    }
    if (gate === 'maybe') bucket.maybe = true
    bucket.lines.push(...lines)
  }

  const result = []
  for (const bucket of groups.values()) {
    const row = { label: bucket.label, lines: bucket.lines }
    if (bucket.maybe) row.maybe = true
    result.push(row)
  }
  return result
}

function propertiesForContract(contract, templateJson) {
  const map = new Map()
  const templateProps = templateJson?._RecordValue_?.contractProperties || []
  for (const prop of templateProps) {
    if (prop?.missionVariableName) map.set(prop.missionVariableName, prop)
  }
  for (const prop of contract?.paramOverrides?.propertyOverrides || []) {
    if (prop?.missionVariableName) map.set(prop.missionVariableName, prop)
  }
  return [...map.values()]
}

function contractsInFile(json) {
  const generators = json?._RecordValue_?.generators
  if (!Array.isArray(generators)) return []
  const contracts = []
  for (const generator of generators) {
    for (const contract of generator?.contracts || []) {
      if (contract?.id && contract.paramOverrides) contracts.push(contract)
    }
  }
  return contracts
}

function resolveTemplatePath(templateField, generatorFile) {
  if (typeof templateField !== 'string' || !templateField.startsWith('file://')) return null
  const relative = templateField.replace(/^file:\/\/\/?\.\//, '')
  return resolve(dirname(generatorFile), relative)
}

function loadTemplate(templateField, generatorFile, cache) {
  const templatePath = resolveTemplatePath(templateField, generatorFile)
  if (!templatePath) return null
  if (cache.has(templatePath)) return cache.get(templatePath)
  let json = null
  try {
    json = JSON.parse(readFileSync(templatePath, 'utf8'))
  } catch {
    json = null
  }
  cache.set(templatePath, json)
  return json
}

function walkJsonFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(full, out)
    else if (entry.name.endsWith('.json')) out.push(full)
  }
  return out
}

export function parseMissionEnemies(extractedRoot) {
  const tagPath = join(
    extractedRoot,
    'libs/foundry/records/tagdatabase/tagdatabase.tagdatabase.json',
  )
  const tagIndex = buildTagIndex(JSON.parse(readFileSync(tagPath, 'utf8')))
  const generatorRoot = join(extractedRoot, 'libs/foundry/records/contracts/contractgenerator')
  const byId = {}
  const templateCache = new Map()

  for (const file of walkJsonFiles(generatorRoot)) {
    let json
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const contract of contractsInFile(json)) {
      const properties = propertiesForContract(contract, loadTemplate(contract.template, file, templateCache))
      const groups = enemiesFromProperties(properties, tagIndex)
      if (groups.length > 0) byId[String(contract.id).toLowerCase()] = groups
    }
  }

  return byId
}

export function writeMissionEnemies({ extractedRoot, outFile }) {
  const byId = parseMissionEnemies(extractedRoot)
  const payload = {
    _source: 'Star Citizen Game Files (contract generators)',
    byId,
  }
  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`)
  return { contracts: Object.keys(byId).length }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const summary = writeMissionEnemies({
    extractedRoot: join(projectRoot, 'extracted-data'),
    outFile: join(projectRoot, 'src/data/game-mission-enemies.json'),
  })
  console.log(`Mission enemies: ${summary.contracts} contracts`)
}
