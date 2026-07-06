#!/usr/bin/env node
/**
 * Audit manual mining alias / rarity tables for redundancy vs game-file resolution.
 * Does not modify data — reports what must stay manual.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  SPAWN_CODE_GUIDE_NAMES,
  buildLocationAliases,
  buildGuideToSpawnKeys,
  parseLocationDescKey,
  hppRecordToSpawnKey,
} from './lib/miningLocationAliases.mjs'
import { loadHppProviderPresets } from './lib/hppProviderPresets.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTRACTED_DATA = join(root, 'extracted-data')

function loadLocalization() {
  const path = join(EXTRACTED_DATA, 'Data', 'Localization', 'english', 'global.ini')
  const raw = readFileSync(path, 'utf-8')
  const localization = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('=')) continue
    const eq = line.indexOf('=')
    localization[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  localization._lowerMap = Object.fromEntries(
    Object.entries(localization).map(([k, v]) => [k.toLowerCase(), v])
  )
  return localization
}

console.log('=== HPP spawn key heuristics (no manual override map) ===')
const hppTests = [
  ['Pyro_AkiroCluster', 'Akiro Cluster'],
  ['Nyx_GlaciemRing', 'Glaciem Ring'],
  ['Nyx_KeegerBelt', 'Keeger Belt'],
  ['Pyro_Warm01', 'Pyro Warm01'],
  ['Pyro_DeepSpaceAsteroids', 'Pyro Deepspaceasteroids'],
  ['Lagrange_F', 'Lagrange F'],
  ['AaronHalo', 'Aaron Halo'],
]
let hppFailures = 0
for (const [raw, expected] of hppTests) {
  const actual = hppRecordToSpawnKey(`HarvestableProviderPreset.HPP_${raw}`)
  const ok = actual === expected
  if (!ok) hppFailures++
  console.log(`  ${raw}: ${ok ? 'OK' : `FAIL (got ${actual})`}`)
}

console.log('\n=== SPAWN_CODE_GUIDE_NAMES vs localization desc ===')
const localization = loadLocalization()
const aliases = buildLocationAliases(localization, EXTRACTED_DATA)
const fromDesc = new Set()
for (const key of Object.keys(localization)) {
  if (key === '_lowerMap') continue
  const parsed = parseLocationDescKey(key)
  if (parsed?.guideName) fromDesc.add(parsed.spawnKey)
}

const spawnTableOnly = []
const alsoInDesc = []
for (const [spawnKey, guideName] of Object.entries(SPAWN_CODE_GUIDE_NAMES)) {
  if (fromDesc.has(spawnKey)) alsoInDesc.push(spawnKey)
  else spawnTableOnly.push({ spawnKey, guideName })
}
console.log(`From desc + table: ${alsoInDesc.length}`)
console.log(`Table-only fallbacks (keep): ${spawnTableOnly.length}`)
for (const row of spawnTableOnly.slice(0, 10)) {
  console.log(`  ${row.spawnKey} → ${row.guideName}`)
}
if (spawnTableOnly.length > 10) console.log(`  ... and ${spawnTableOnly.length - 10} more`)

console.log('\n=== HPP presets without localization desc alias ===')
const hppPresets = loadHppProviderPresets(EXTRACTED_DATA)
const hppOnly = []
for (const preset of hppPresets) {
  const spawnKey = hppRecordToSpawnKey(preset.hppKey)
  if (!aliases[spawnKey]) hppOnly.push(spawnKey)
}
console.log(`HPP-only spawn keys (need manual/overlay): ${hppOnly.length}`)
for (const key of hppOnly.sort().slice(0, 15)) console.log(`  ${key}`)
if (hppOnly.length > 15) console.log(`  ... and ${hppOnly.length - 15} more`)

console.log('\n=== Manual overlay categories (must keep) ===')
const bySource = {}
for (const alias of Object.values(aliases)) {
  const src = alias.source ?? 'unknown'
  bySource[src] = (bySource[src] ?? 0) + 1
}
console.log(bySource)

console.log('\n=== Rarity tiers ===')
console.log('Ore rarity is not exposed in MineableElement records — manual tier table required.')
console.log('See scripts/lib/miningOreRarity.mjs')

const guideToSpawnKeys = buildGuideToSpawnKeys(aliases)
console.log(`guideToSpawnKeys entries: ${Object.keys(guideToSpawnKeys).length}`)

process.exit(hppFailures > 0 ? 1 : 0)
