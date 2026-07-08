/**
 * Audit ore name consistency across generated mining data.
 * Run: node scripts/audit-ore-name-consistency.mjs
 */

import mining from '../src/data/game-mining.json' with { type: 'json' }
import spawns from '../src/data/game-mining-spawns.json' with { type: 'json' }
import locations from '../src/data/game-mining-locations.json' with { type: 'json' }
import bands from '../src/data/game-quality-bands.json' with { type: 'json' }
import aliasData from '../src/data/mining-ore-aliases.json' with { type: 'json' }
import {
  COMPOSITION_ELEMENT_ALIASES,
  normalizeCompositionElementName,
  SHIP_ORE_SLUG_TO_NAME,
} from './lib/miningOreNames.mjs'
import { resolveCanonicalOreName } from './lib/miningOreCanonical.mjs'

/** Mirrors src/lib/qualityBands.ts RESOURCE_ALIASES for audit-only band lookup. */
const QUALITY_BAND_ALIASES = {
  quantainium: 'quantainium',
  quantanium: 'quantainium',
  aluminium: 'aluminum',
  aluminum: 'aluminum',
  pressurizedice: 'rawice',
  yormandieye: 'beryl',
  sileron: 'stileron',
  ice: 'rawice',
}

function bandKeyForOre(oreName) {
  const normalized = String(oreName || '')
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/^raw\s+/i, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '')
  return QUALITY_BAND_ALIASES[normalized] ?? normalized
}

const canonicalOres = new Set(Object.keys(mining.oreSignatures ?? {}))
const bandKeys = new Set(Object.keys(bands.bandThresholds ?? {}))
const aliasKeys = new Set(Object.keys(aliasData.aliases))

const issues = []

// MineableElement record stem vs internal name field (informational)
const recordStemMismatches = []
for (const el of mining.mineableElements ?? []) {
  const fromRecord = el.recordName
    ?.replace(/^MineableElement\./i, '')
    .replace(/_ore$|_raw$/i, '')
  const fromName = el.name?.replace(/^(Ore_|Raw_)/i, '').replace(/_ore$|_raw$/i, '')
  if (fromRecord && fromName && fromRecord.toLowerCase() !== fromName.toLowerCase()) {
    recordStemMismatches.push({ recordStem: fromRecord, nameField: fromName })
  }
}

// Location / guide data must not contain unresolved alias keys
for (const ore of Object.keys(locations.oreLocations ?? {})) {
  if (aliasKeys.has(ore)) {
    issues.push(
      `game-mining-locations oreLocations still has alias key "${ore}" (should be "${aliasData.aliases[ore]}")`
    )
  }
  const resolved = resolveCanonicalOreName(ore)
  if (resolved !== ore && !canonicalOres.has(resolved) && aliasKeys.has(ore)) {
    issues.push(`unresolved location ore key "${ore}"`)
  }
}

for (const tier of Object.values(locations.rarityTiers ?? {})) {
  for (const row of tier) {
    if (aliasKeys.has(row.name)) {
      issues.push(
        `rarityTiers entry "${row.name}" should be "${aliasData.aliases[row.name]}"`
      )
    }
  }
}

// Spawn profile keys must be canonical
for (const oreKey of Object.keys(spawns.ores ?? {})) {
  if (aliasKeys.has(oreKey)) {
    issues.push(`spawn profile key "${oreKey}" should be "${aliasData.aliases[oreKey]}"`)
  }
}

// Composition element names must resolve to canonical RS ores
const badCompositionElements = new Map()
for (const profile of Object.values(spawns.ores ?? {})) {
  for (const loc of Object.values(profile.locations ?? {})) {
    for (const part of loc.compositionParts ?? []) {
      const normalized = normalizeCompositionElementName(part.elementName)
      if (!canonicalOres.has(normalized)) {
        badCompositionElements.set(
          part.elementName,
          (badCompositionElements.get(part.elementName) ?? 0) + 1
        )
      } else if (normalized !== part.elementName) {
        issues.push(
          `composition element "${part.elementName}" should be "${normalized}" (run normalize-mining-ore-data.mjs)`
        )
      }
    }
  }
}

if (badCompositionElements.size) {
  issues.push(
    `non-canonical composition elements: ${[...badCompositionElements.entries()]
      .map(([name, count]) => `${name} (${count})`)
      .join(', ')}`
  )
}

// Ship slug map should cover all composition element aliases
for (const [alias, canonical] of Object.entries(COMPOSITION_ELEMENT_ALIASES)) {
  const slugKey = alias.toLowerCase()
  if (SHIP_ORE_SLUG_TO_NAME[slugKey] !== canonical) {
    issues.push(`COMPOSITION_ELEMENT_ALIASES ${alias} → ${canonical} not mirrored in SHIP_ORE_SLUG_TO_NAME`)
  }
}

// Canonical ship ores should have quality bands (via normalizeResourceName aliases)
const oresMissingBands = [...canonicalOres].filter((ore) => {
  const key = bandKeyForOre(ore)
  return !bandKeys.has(key)
})
if (oresMissingBands.length) {
  issues.push(`canonical ores missing quality band keys after alias lookup: ${oresMissingBands.join(', ')}`)
}

if (mining.oreSignatures?.Aluminium != null) {
  issues.push('game-mining.json oreSignatures still has duplicate Aluminium key')
}

console.log('Ore name consistency audit')
console.log('==========================')
console.log(`Canonical RS ores: ${canonicalOres.size}`)
console.log(`MineableElement record/name stem mismatches (expected for Raw/FPS): ${recordStemMismatches.length}`)
if (recordStemMismatches.some((m) => m.recordStem === 'Sileron')) {
  console.log('  Note: Sileron_Ore record stem → Stileron (handled at parse time)')
}

if (issues.length === 0) {
  console.log('\nPASS: no composition or band lookup inconsistencies')
  process.exit(0)
}

console.log(`\nFAIL: ${issues.length} issue(s)`)
for (const issue of issues) console.log(`  - ${issue}`)
process.exit(1)
