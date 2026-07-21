#!/usr/bin/env node
/**
 * Audit: compare each blueprint's stored display name against the authoritative
 * in-game SCItem name (AttachDef.Localization.Name resolved via global.ini).
 *
 * The game writes that exact localized name to Game.log ("Received Blueprint: X"),
 * so any mismatch means BP Dumper's log text cannot resolve to our catalog.
 *
 * Read-only. Run: node scripts/audit-blueprint-names.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTRACTED = join(repoRoot, 'extracted-data')
const ENTITIES_DIR = join(EXTRACTED, 'libs/foundry/records/entities')
const GLOBAL_INI = join(EXTRACTED, 'Data/Localization/english/global.ini')
const BLUEPRINTS = join(repoRoot, 'src/data/game-blueprints.json')

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.json')) out.push(full)
  }
  return out
}

function loadLocalization() {
  const loc = {}
  if (!existsSync(GLOBAL_INI)) {
    console.error('Missing global.ini — run extraction first.')
    process.exit(1)
  }
  for (const line of readFileSync(GLOBAL_INI, 'utf-8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!(key in loc)) loc[key] = value
    if (key.includes(',')) {
      const base = key.split(',')[0]
      if (!(base in loc)) loc[base] = value
    }
  }
  const lower = {}
  for (const [k, v] of Object.entries(loc)) lower[k.toLowerCase()] = v
  loc._lowerMap = lower
  return loc
}

function resolveLoc(key, loc) {
  if (!key) return null
  if (key.startsWith('@')) {
    const k = key.slice(1)
    if (loc[k]) return loc[k]
    const variations = [k, k.toLowerCase(), k.replace(/_/g, ''), `item_Name${k}`, `item_name${k}`]
    for (const v of variations) {
      if (loc[v]) return loc[v]
      if (loc._lowerMap[v.toLowerCase()]) return loc._lowerMap[v.toLowerCase()]
    }
    return null
  }
  return key
}

console.log('Building entity index (full entities/ tree)...')
const entityIndex = new Map()
for (const file of walk(ENTITIES_DIR)) {
  entityIndex.set(basename(file, '.json').toLowerCase(), file)
}
console.log(`  Indexed ${entityIndex.size} entity records`)

function resolveEntityFile(entityClass) {
  if (!entityClass) return null
  const key = String(entityClass).toLowerCase()
  const candidates = [
    key,
    `${key}_scitem`,
    key.replace(/^fuel_nozzle_/, 'nozzle_fuelgiver_'),
    key.replace(/^nozzle_fuelgiver_/, 'fuel_nozzle_'),
  ]
  for (const c of candidates) if (entityIndex.has(c)) return entityIndex.get(c)
  return null
}

function authoritativeName(entityClass, loc) {
  const file = resolveEntityFile(entityClass)
  if (!file) return { name: null, reason: 'entity_file_not_found' }
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return { name: null, reason: 'parse_error' }
  }
  const comps = json?._RecordValue_?.Components ?? []
  const attach = comps.find((c) => c?._Type_ === 'SAttachableComponentParams')
  const nameKey = attach?.AttachDef?.Localization?.Name
  if (!nameKey || nameKey === '@LOC_PLACEHOLDER' || nameKey === '@LOC_EMPTY' || nameKey === '@LOC_UNINITIALIZED') {
    return { name: null, reason: 'no_loc_key' }
  }
  const resolved = resolveLoc(nameKey, loc)
  if (!resolved || resolved.startsWith('@')) {
    return { name: null, reason: `unresolved:${nameKey}` }
  }
  return { name: resolved, key: nameKey }
}

const APPLY = process.argv.includes('--fix')
const loc = loadLocalization()
const blueprints = JSON.parse(readFileSync(BLUEPRINTS, 'utf-8'))
const list = Array.isArray(blueprints) ? blueprints : blueprints.blueprints || []
console.log(`Loaded ${list.length} blueprints\n`)

const mismatches = []
const noEntity = []
let matched = 0
let noEntityClass = 0

for (const bp of list) {
  const entityClass = bp.entityClass
  if (!entityClass) { noEntityClass++; continue }
  const stored = bp.blueprintName || ''
  const auth = authoritativeName(entityClass, loc)
  if (!auth.name) {
    noEntity.push({ internalName: bp.internalName, entityClass, stored, reason: auth.reason })
    continue
  }
  if (auth.name.trim() === stored.trim()) {
    matched++
  } else {
    mismatches.push({ internalName: bp.internalName, entityClass, stored, authoritative: auth.name, key: auth.key })
    if (APPLY) bp.blueprintName = auth.name.trim()
  }
}

console.log('=== SUMMARY ===')
console.log(`Matched (stored === in-game name): ${matched}`)
console.log(`MISMATCHED: ${mismatches.length}`)
console.log(`No usable entity/loc name: ${noEntity.length}`)
console.log(`No entityClass (WIP/default): ${noEntityClass}`)

console.log('\n=== MISMATCHES (stored -> authoritative) ===')
for (const m of mismatches) {
  console.log(`  ${m.internalName}`)
  console.log(`      stored: "${m.stored}"`)
  console.log(`      ingame: "${m.authoritative}"  [${m.key}]`)
}

// Group no-entity by reason for triage
const byReason = {}
for (const n of noEntity) {
  const r = n.reason.split(':')[0]
  byReason[r] = (byReason[r] || 0) + 1
}
console.log('\n=== NO AUTHORITATIVE NAME (by reason) ===')
for (const [r, c] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${r}: ${c}`)
}

if (APPLY && mismatches.length) {
  // Match the source file's exact serialization (CRLF, no trailing newline) so the
  // diff shows only the changed blueprintName values.
  const serialized = JSON.stringify(blueprints, null, 2).replace(/\n/g, '\r\n')
  writeFileSync(BLUEPRINTS, serialized)
  console.log(`\n✔ Applied ${mismatches.length} name corrections to src/data/game-blueprints.json`)
}
