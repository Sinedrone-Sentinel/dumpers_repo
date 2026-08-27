#!/usr/bin/env node
/**
 * Post-patch audit battery — run after `npm run parse-game-data` on a new game build.
 *
 * Runs every data audit + math verifier in sequence, prints a pass/fail summary,
 * and exits non-zero if anything failed. Audits that need the raw game extract
 * are skipped (with a warning) when extracted-data/ is not present.
 *
 * Usage: npm run patch-audit
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const hasExtract = existsSync(path.join(root, 'extracted-data', 'libs', 'foundry', 'records'))

/** @type {{ script: string; label: string; needsExtract?: boolean }[]} */
const STEPS = [
  // Parsed-data consistency (works from bundled src/data JSON alone)
  { script: 'audit-mining-aliases.mjs', label: 'Mining spawn-key aliases' },
  { script: 'audit-ore-name-consistency.mjs', label: 'Ore name consistency' },
  { script: 'audit-ore-rarity-tiers.mjs', label: 'Ore rarity tiers + gem lists' },
  { script: 'audit-broad-mining-locations.mjs', label: 'Broad mining locations' },
  { script: 'validate-blueprints.mjs', label: 'Blueprint data validation' },
  { script: 'audit-blueprint-mission-rewards.mjs', label: 'Blueprint mission rewards' },
  { script: 'audit-blueprint-missions.mjs', label: 'Mission factions / systems / titles' },
  { script: 'verify-wikelo-donor-craft-bps.mjs', label: 'Wikelo donor craft BP paths' },
  { script: 'verify-dfp-acquisition-premiums.mjs', label: 'DFP acquisition premiums (sibling build)' },

  // Raw-extract cross-checks (need extracted-data/ from extract-game-data.ps1)
  { script: 'audit-hpp-mining-locations.mjs', label: 'HPP mining locations', needsExtract: true },
  { script: 'audit-alias-tables.mjs', label: 'Alias tables vs localization', needsExtract: true },
  { script: 'audit-ore-location-coverage.mjs', label: 'Ore location coverage', needsExtract: true },

  // Math verifiers (calculator + head plans still agree with the data)
  { script: 'verify-mining-math.mjs', label: 'Mining math verifier' },
  { script: 'verify-mole-crew-strategy.mjs', label: 'Mole crew strategy verifier' },

  // Patch diff report (compares parsed JSON against git HEAD) — last, informational output
  { script: 'diff-game-data.mjs', label: 'Game data diff vs git' },
]

const results = []

for (const step of STEPS) {
  if (step.needsExtract && !hasExtract) {
    results.push({ ...step, status: 'skipped' })
    continue
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ${step.label}  (${step.script})`)
  console.log('═'.repeat(70))

  const run = spawnSync(process.execPath, [path.join(__dirname, step.script)], {
    cwd: root,
    stdio: 'inherit',
  })
  results.push({ ...step, status: run.status === 0 ? 'passed' : 'failed' })
}

console.log(`\n${'═'.repeat(70)}`)
console.log('  PATCH AUDIT SUMMARY')
console.log('═'.repeat(70))

const icons = { passed: '✓', failed: '✗', skipped: '−' }
for (const result of results) {
  console.log(`  ${icons[result.status]} ${result.label} — ${result.status}`)
}

const failed = results.filter((r) => r.status === 'failed')
const skipped = results.filter((r) => r.status === 'skipped')

if (skipped.length) {
  console.log(
    `\n${skipped.length} audit(s) skipped — run scripts/extract-game-data.ps1 first for full raw-extract cross-checks.`
  )
}

if (failed.length) {
  console.log(`\n${failed.length} audit(s) FAILED.`)
  process.exit(1)
}

console.log('\nAll audits passed.')
