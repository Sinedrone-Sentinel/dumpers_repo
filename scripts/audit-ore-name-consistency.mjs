/**
 * Audit ore name consistency across generated mining data.
 * Run: node scripts/audit-ore-name-consistency.mjs
 */

import mining from '../src/data/game-mining.json' with { type: 'json' }
import spawns from '../src/data/game-mining-spawns.json' with { type: 'json' }
import bands from '../src/data/game-quality-bands.json' with { type: 'json' }
import { ORE_SIGNATURES } from './lib/parseMiningSpawns.mjs'
import {
  COMPOSITION_ELEMENT_ALIASES,
  normalizeCompositionElementName,
  SHIP_ORE_SLUG_TO_NAME,
} from './lib/miningOreNames.mjs'

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

const canonicalOres = new Set(Object.keys(ORE_SIGNATURES))
const bandKeys = new Set(Object.keys(bands.bandThresholds ?? {}))

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
          `composition element "${part.elementName}" should be "${normalized}" (run parse-extracted-data or patch spawns JSON)`
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
