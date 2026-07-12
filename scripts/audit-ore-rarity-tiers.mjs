#!/usr/bin/env node
/**
 * Audit the manual ore classification tables against parsed game data.
 *
 * These tables are manual because the game records do not expose rarity, and
 * gem lists are duplicated between the parser (scripts/lib) and the site
 * (src/lib). This audit fails when:
 *
 * 1. A spawn-backed ship ore is missing from ORE_RARITY_TIERS (it would
 *    silently fall back to 'common' — the Torite/Ice bug class)
 * 2. A published guide ore is neither tiered nor a known gem
 * 3. The gem sets in src/lib/handMineables.ts drift from scripts/lib/miningOreConsts.mjs
 * 4. A parsed FPS / ground-vehicle mineable that the guide publishes is not in
 *    the matching gem set
 * 5. The parser's isFPS/isGroundVehicle flags are all false (case-bug regression guard)
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ORE_RARITY_TIERS } from './lib/miningOreRarity.mjs'
import { HAND_MINEABLE_ORES, GROUND_VEHICLE_GEMS } from './lib/miningOreConsts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

const spawns = JSON.parse(readFileSync(join(PROJECT_ROOT, 'src', 'data', 'game-mining-spawns.json'), 'utf-8'))
const locations = JSON.parse(readFileSync(join(PROJECT_ROOT, 'src', 'data', 'game-mining-locations.json'), 'utf-8'))
const mining = JSON.parse(readFileSync(join(PROJECT_ROOT, 'src', 'data', 'game-mining.json'), 'utf-8'))

const failures = []
const infos = []

const tieredOres = new Map()
for (const [tier, ores] of Object.entries(ORE_RARITY_TIERS)) {
  for (const ore of ores) {
    if (tieredOres.has(ore)) failures.push(`Ore "${ore}" appears in multiple tiers: ${tieredOres.get(ore)} and ${tier}`)
    tieredOres.set(ore, tier)
  }
}

const isGem = (ore) => HAND_MINEABLE_ORES.has(ore) || GROUND_VEHICLE_GEMS.has(ore)

// ── 1. Spawn-backed ship ores must be explicitly tiered ─────────────────────
for (const ore of Object.keys(spawns.ores ?? {})) {
  if (!tieredOres.has(ore)) {
    failures.push(`Spawn-backed ore "${ore}" missing from ORE_RARITY_TIERS (would silently default to common)`)
  }
}

// ── 2. Published guide ores must be tiered or a known gem ───────────────────
for (const ore of Object.keys(locations.oreLocations ?? {})) {
  if (!tieredOres.has(ore) && !isGem(ore)) {
    failures.push(`Published guide ore "${ore}" is neither tiered nor a known gem`)
  }
}

// Tiered ores with no published presence are allowed (e.g. Diamond exists in
// game records but currently has no spawn data) — report as info only.
for (const ore of tieredOres.keys()) {
  if (!(ore in (locations.oreLocations ?? {})) && !(ore in (spawns.ores ?? {}))) {
    infos.push(`Tiered ore "${ore}" has no published locations or spawn data (kept for future patches)`)
  }
}

// ── 3. src/lib gem sets must match scripts/lib gem sets ─────────────────────
function extractTsSet(source, constName) {
  const match = source.match(new RegExp(`${constName}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]`, 's'))
  if (!match) return null
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
}

const handMineablesTs = readFileSync(join(PROJECT_ROOT, 'src', 'lib', 'handMineables.ts'), 'utf-8')
const tsHand = extractTsSet(handMineablesTs, 'HAND_MINEABLE_ORES')
const tsGround = extractTsSet(handMineablesTs, 'GROUND_VEHICLE_GEMS')

function compareSets(label, scriptsSet, tsSet) {
  if (!tsSet) {
    failures.push(`Could not extract ${label} from src/lib/handMineables.ts — audit regex needs updating`)
    return
  }
  for (const ore of scriptsSet) {
    if (!tsSet.has(ore)) failures.push(`${label}: "${ore}" in scripts/lib but missing from src/lib/handMineables.ts`)
  }
  for (const ore of tsSet) {
    if (!scriptsSet.has(ore)) failures.push(`${label}: "${ore}" in src/lib/handMineables.ts but missing from scripts/lib`)
  }
}

compareSets('HAND_MINEABLE_ORES', HAND_MINEABLE_ORES, tsHand)
compareSets('GROUND_VEHICLE_GEMS', GROUND_VEHICLE_GEMS, tsGround)

// ── 4. Parsed FPS / GV mineables published in the guide must be classified ──
const publishedOres = new Set(Object.keys(locations.oreLocations ?? {}))
for (const element of mining.mineableElements ?? []) {
  const cleanName = element.name.replace(/^(Ore_|Raw_|Raw)/, '')
  if (!publishedOres.has(cleanName)) continue
  if (element.isFPS && !HAND_MINEABLE_ORES.has(cleanName)) {
    failures.push(`FPS mineable "${cleanName}" published in guide but not in HAND_MINEABLE_ORES`)
  }
  if (element.isGroundVehicle && !GROUND_VEHICLE_GEMS.has(cleanName)) {
    failures.push(`Ground-vehicle mineable "${cleanName}" published in guide but not in GROUND_VEHICLE_GEMS`)
  }
}

// ── 5. Classification flags sanity (case-bug regression guard) ──────────────
const fpsCount = (mining.mineableElements ?? []).filter((e) => e.isFPS).length
const gvCount = (mining.mineableElements ?? []).filter((e) => e.isGroundVehicle).length
if (fpsCount === 0) failures.push('No mineable element has isFPS=true — parser record-name matching is broken')
if (gvCount === 0) failures.push('No mineable element has isGroundVehicle=true — parser record-name matching is broken')

console.log('Ore rarity / gem classification audit')
console.log('=====================================')
console.log(`Tiered ores: ${tieredOres.size} · gems: ${new Set([...HAND_MINEABLE_ORES, ...GROUND_VEHICLE_GEMS]).size}`)
console.log(`Spawn-backed: ${Object.keys(spawns.ores ?? {}).length} · published guide ores: ${publishedOres.size}`)
console.log(`Element flags — FPS: ${fpsCount}, ground vehicle: ${gvCount}`)

for (const info of infos) console.log(`  (info) ${info}`)

if (failures.length) {
  console.log(`\nFAIL — ${failures.length} issue(s):`)
  for (const failure of failures) console.log(`  ✗ ${failure}`)
  process.exit(1)
}

console.log('\nPASS: rarity tiers, gem lists, and classification flags are consistent')
