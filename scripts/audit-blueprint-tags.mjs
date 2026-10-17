#!/usr/bin/env node
/**
 * Listed blueprints must meet their family's tag minimum.
 *
 * Prints every shortfall at the end of a parse. Capital components that were
 * left without a class or grade are reported and do not fail the run. Any
 * other shortfall exits non-zero so a patch cannot ship a half-tagged row.
 *
 * Usage: node scripts/audit-blueprint-tags.mjs
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

/** Capitals left untagged on purpose. Still printed every run. */
const DEFERRED_CATEGORY = new Set([
  'cool_aegs_s04_idris',
  'cool_aegs_s04_javelin',
  'powr_aegs_s04_idris',
  'powr_aegs_s04_reclaimer',
  'qdrv_wetk_s04_idris_temp',
  'radr_gnrp_s03_idris_temp',
  'radr_rsi_s04_polaris',
  'radr_wlop_s03_lephari',
  'shld_godi_s04_idris',
])

const outFile = path.join(root, 'node_modules', '.cache', 'blueprint-category-tags.mjs')
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/blueprintCategoryTags.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  logLevel: 'silent',
})

const { blueprintTagRequirement, collectBlueprintCategoryTags } = await import(
  pathToFileURL(outFile).href
)

const catalog = JSON.parse(readFileSync(path.join(root, 'src/data/game-blueprints.json'), 'utf8'))
const mustFix = []
const deferred = []

for (const bp of catalog.blueprints || []) {
  if (!bp?.entityClass) continue
  const rule = blueprintTagRequirement(bp)
  if (!rule) continue
  const tags = collectBlueprintCategoryTags(bp)
  if (tags.length >= rule.required) continue
  const row = {
    name: bp.blueprintName || bp.internalName,
    internalName: bp.internalName,
    category: bp.categoryName || '',
    family: rule.family,
    have: tags.length,
    required: rule.required,
    tags: tags.map((tag) => tag.label).join(', ') || '(none)',
  }
  if (DEFERRED_CATEGORY.has(bp.internalName)) deferred.push(row)
  else mustFix.push(row)
}

function printRows(rows) {
  for (const row of rows) {
    console.log(
      `  • ${row.name} (${row.internalName}) — ${row.category} — ${row.have}/${row.required} ${row.family}: ${row.tags}`,
    )
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log('  BLUEPRINT CATEGORY CHECK')
console.log('='.repeat(60))

if (mustFix.length === 0 && deferred.length === 0) {
  console.log('\n✓ Every listed blueprint meets its category tag minimum')
} else {
  if (mustFix.length) {
    console.log(`\n✗ Needs a category fix (${mustFix.length}):`)
    printRows(mustFix)
  } else {
    console.log('\n✓ No new category gaps')
  }
  if (deferred.length) {
    console.log(`\nStill open — left for a category decision (${deferred.length}):`)
    printRows(deferred)
  }
}

console.log('')
process.exit(mustFix.length ? 1 : 0)
