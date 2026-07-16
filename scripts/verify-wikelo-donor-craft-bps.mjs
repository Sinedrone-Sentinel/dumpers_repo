#!/usr/bin/env node
/**
 * Verify Wikelo barter donor weapons vs mission blueprint rewards.
 * Fails only if a donor craft BP unexpectedly appears in a mission pool.
 *
 * Usage: node scripts/verify-wikelo-donor-craft-bps.mjs
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const blueprints = JSON.parse(readFileSync(join(root, 'src/data/game-blueprints.json'), 'utf-8')).blueprints
const missionJson = JSON.parse(readFileSync(join(root, 'src/data/game-blueprint-missions.json'), 'utf-8'))
const missionBlueprints = missionJson.missionBlueprints ?? {}
const wikelo = JSON.parse(readFileSync(join(root, 'src/data/game-wikelo-trades.json'), 'utf-8'))

const bpByInternal = new Map(
  blueprints.map((bp) => [(bp.internalName || bp.file || '').toLowerCase(), bp]),
)

const missionRewardBpNames = new Set()
for (const items of Object.values(missionBlueprints)) {
  for (const item of items ?? []) {
    if (item.name) missionRewardBpNames.add(item.name.toLowerCase())
  }
}

const hardFailures = []
const donorGaps = []

for (const trade of wikelo.trades ?? []) {
  for (const cost of trade.costs ?? []) {
    const entity = cost.entityClass?.toLowerCase()
    if (!entity) continue
    const bp = bpByInternal.get(entity)
    if (!bp || bp.isReward) continue

    const rewardSibling = (trade.blueprintPools ?? [])
      .flatMap((poolKey) => missionBlueprints[poolKey] ?? [])
      .map((item) => bpByInternal.get((item.name || '').toLowerCase()))
      .find((sib) => sib?.isReward)

    if (!rewardSibling) continue

    donorGaps.push({
      trade: trade.title,
      donor: bp.blueprintName || bp.internalName,
      rewardSibling: rewardSibling.blueprintName || rewardSibling.internalName,
    })
  }
}

const baseHmg = 'apar_hmg_ballistic_01'
if (missionRewardBpNames.has(baseHmg)) {
  hardFailures.push(
    `${baseHmg} found in a mission reward pool — re-verify extraction (expected: no mission BP).`,
  )
}

console.log('=== Wikelo donor craft BP verification ===\n')

const superheavy = (missionBlueprints.superheavy ?? []).map((i) => i.name)
console.log(`Northrock "superheavy" pool: ${superheavy.join(', ') || '(empty)'}`)
console.log(
  `${baseHmg} in mission pools: ${missionRewardBpNames.has(baseHmg) ? 'YES (unexpected)' : 'no'}`,
)

if (donorGaps.length) {
  console.log(`\nWikelo trades with donor craft BP but no mission reward path (${donorGaps.length}):`)
  for (const gap of donorGaps) {
    console.log(
      `  - "${gap.trade}": hand in ${gap.donor} → reward BP ${gap.rewardSibling} only`,
    )
  }
  console.log(
    '\nDonor items may be kiosk/loot until CIG assigns a mission pool (not a parser miss if absent from game files).',
  )
}

if (hardFailures.length) {
  console.error('\nFAIL:')
  for (const msg of hardFailures) console.error(`  - ${msg}`)
  process.exit(1)
}

console.log('\nPASS: no unexpected mission pools for guarded donor craft BPs.')
process.exit(0)
