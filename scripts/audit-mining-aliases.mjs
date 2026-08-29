#!/usr/bin/env node
/**
 * Verify locationAliases coverage for all spawn keys in game-mining-spawns.json.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { auditAliasCoverage, buildGuideToSpawnKeys } from './lib/miningLocationAliases.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'src', 'data')

const spawns = JSON.parse(readFileSync(join(DATA, 'game-mining-spawns.json'), 'utf-8'))
const locations = JSON.parse(readFileSync(join(DATA, 'game-mining-locations.json'), 'utf-8'))

const spawnKeys = new Set()
for (const ore of Object.values(spawns.ores ?? {})) {
  for (const loc of Object.values(ore.locations ?? {})) {
    spawnKeys.add(loc.spawnKey ?? loc.locationName)
  }
}

const aliases = locations.locationAliases ?? {}
const guideToSpawnKeys = locations.guideToSpawnKeys ?? buildGuideToSpawnKeys(aliases)
const { unmapped, rawDisplayNames } = auditAliasCoverage(spawnKeys, aliases)

let exitCode = 0

console.log(`Spawn keys in game-mining-spawns.json: ${spawnKeys.size}`)
console.log(`locationAliases entries: ${Object.keys(aliases).length}`)

if (unmapped.length) {
  exitCode = 1
  console.error('\nMissing locationAliases entries:')
  for (const key of unmapped.sort()) console.error(`  - ${key}`)
}

if (rawDisplayNames.length) {
  console.warn('\nDisplay names still look like internal slugs:')
  for (const row of rawDisplayNames) {
    console.warn(`  - ${row.spawnKey}: "${row.displayName}" (${row.source})`)
  }
}

const missingDisplayOnProfiles = []
for (const ore of Object.values(spawns.ores ?? {})) {
  for (const loc of Object.values(ore.locations ?? {})) {
    if (!loc.displayName || (loc.displayName === loc.locationName && loc.displayName.match(/^(Stanton|Pyro)\d/i))) {
      missingDisplayOnProfiles.push(`${ore.oreName}: ${loc.locationName}`)
    }
  }
}

if (missingDisplayOnProfiles.length) {
  exitCode = 1
  console.error('\nSpawn profiles missing displayName:')
  for (const row of missingDisplayOnProfiles.slice(0, 20)) console.error(`  - ${row}`)
  if (missingDisplayOnProfiles.length > 20) {
    console.error(`  ... and ${missingDisplayOnProfiles.length - 20} more`)
  }
}

/** Spot-check guide names that must resolve to a specific system via spawn aliases. */
const REQUIRED_GUIDE_SYSTEMS = {
  'Glaciem Ring': 'Nyx',
  'Keeger Belt': 'Nyx',
  'Akiro Cluster': 'Pyro',
  Aberdeen: 'Stanton',
  'Lagrange G': 'Stanton',
  'Lagrange Occupied': 'Stanton',
}

function auditGuideLocationSystems(aliases, guideToSpawnKeysMap) {
  const mismatches = []
  for (const [guideName, expected] of Object.entries(REQUIRED_GUIDE_SYSTEMS)) {
    const keys = guideToSpawnKeysMap[guideName] ?? [guideName]
    const systems = [...new Set(keys.map((k) => aliases[k]?.system).filter(Boolean))]
    if (systems.length !== 1 || systems[0] !== expected) {
      mismatches.push({ guideName, expected, systems })
    }
  }
  return mismatches
}

const systemMismatches = auditGuideLocationSystems(aliases, guideToSpawnKeys)
if (systemMismatches.length) {
  exitCode = 1
  console.error('\nGuide location system mismatches:')
  for (const row of systemMismatches) {
    console.error(`  - ${row.guideName}: expected ${row.expected}, got ${row.systems.join(', ') || 'none'}`)
  }
}

const BROAD_GUIDE_LOCATION_SYSTEMS = {
  'All Moons/Planets/Caves': 'Stanton',
  'All Pyro Planets': 'Pyro',
  'Pyro Asteroid Clusters': 'Pyro',
  'Found in All Stanton Deposits (Rare)': 'Stanton',
  'Found in All Stanton Deposits': 'Stanton',
  'QV Breaker Stations (Nyx)': 'Nyx',
}

const unresolvedGuideSites = []
for (const loc of Object.keys(locations.locationOres ?? {})) {
  if (BROAD_GUIDE_LOCATION_SYSTEMS[loc]) continue
  const keys = guideToSpawnKeys[loc] ?? [loc]
  const fromKeys = keys.map((k) => aliases[k]?.system).find((s) => s && s !== 'Unknown')
  const fromAlias = aliases[loc]?.system
  if ((!fromAlias || fromAlias === 'Unknown') && !fromKeys) {
    unresolvedGuideSites.push(loc)
  }
}
if (unresolvedGuideSites.length) {
  exitCode = 1
  console.error('\nBy Location sites with no star system:')
  for (const loc of unresolvedGuideSites.sort()) console.error(`  - ${loc}`)
}

if (exitCode === 0) {
  console.log('\nAlias audit passed.')
} else {
  console.error('\nAlias audit failed.')
}

process.exit(exitCode)
