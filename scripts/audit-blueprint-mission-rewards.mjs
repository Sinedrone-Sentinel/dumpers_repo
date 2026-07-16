#!/usr/bin/env node
/**
 * Audit ALL reward blueprints: contract-accurate mission mappings, unlock standing, bundled JSON sync.
 * Exit 1 on any failure (safe to run in CI after data rebuild).
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { BLUEPRINT_MISSION_TRACKING_EXCLUSIONS, REWARD_POOL_TRACKING_EXCLUSIONS } from './lib/orphanPoolBridges.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const missionData = JSON.parse(readFileSync(join(root, 'src/data/game-blueprint-missions.json'), 'utf-8'))
const blueprintData = JSON.parse(readFileSync(join(root, 'src/data/game-blueprints.json'), 'utf-8'))

const missionBlueprints = missionData.missionBlueprints
const blueprintMissions = missionData.blueprintMissions || {}
const contracts = missionData.contracts
const missionsByPool = missionData.missionsByPool

const linkedPoolKeys = new Set()
for (const contract of contracts) {
  for (const pool of contract.blueprintPools || []) {
    linkedPoolKeys.add(pool.key)
  }
}

const orphanPools = Object.keys(missionBlueprints).filter(
  (key) => !linkedPoolKeys.has(key) && !REWARD_POOL_TRACKING_EXCLUSIONS.includes(key)
)

function buildExpectedRewards(internalName) {
  const bpName = internalName.toLowerCase()
  const raw = []

  for (const contract of contracts) {
    for (const poolRef of contract.blueprintPools || []) {
      const poolItems = missionBlueprints[poolRef.key]
      if (!poolItems?.length) continue

      const item = poolItems.find((entry) => (entry.name || '').toLowerCase() === bpName)
      if (!item) continue

      const totalWeight = poolItems.reduce((sum, entry) => sum + (entry.weight || 1), 0)
      const poolChance = poolRef.chance ?? 1
      const dropChance = totalWeight > 0 ? poolChance * ((item.weight || 1) / totalWeight) : 0

      raw.push({
        mission: `${contract.faction}: ${contract.title}`,
        chance: dropChance,
        poolKey: poolRef.key,
        minReputation: contract.minStanding?.minReputation ?? null,
        maxReputation: contract.maxStanding?.minReputation ?? null,
        standingName: contract.minStanding?.name ?? null,
        repPoints: contract.repPoints ?? 0,
      })
    }
  }

  const grouped = new Map()
  for (const reward of raw) {
    const key = `${reward.mission}|${reward.minReputation}|${reward.maxReputation}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { ...reward })
      continue
    }
    if (reward.chance > existing.chance) existing.chance = reward.chance
  }

  return [...grouped.values()].sort((a, b) => {
    const repDiff = (a.minReputation ?? 0) - (b.minReputation ?? 0)
    if (repDiff !== 0) return repDiff
    return a.mission.localeCompare(b.mission)
  })
}

function unlockStanding(rewards) {
  const exactTier = rewards.filter(
    (r) => r.minReputation != null && r.maxReputation != null && r.minReputation === r.maxReputation
  )
  const candidates = exactTier.length > 0 ? exactTier : rewards
  let best = candidates[0]
  for (const r of candidates) {
    if (r.minReputation != null && (best.minReputation == null || r.minReputation < best.minReputation)) {
      best = r
    }
  }
  if (!best?.minReputation && best?.minReputation !== 0) return null
  return { name: best.standingName, rep: best.minReputation }
}

function oldPoolBleedRewards(internalName) {
  const bpName = internalName.toLowerCase()
  const poolKeys = missionData.blueprintMissions[bpName] || []
  const rewards = []
  for (const poolKey of poolKeys) {
    for (const mission of missionsByPool[poolKey] || []) {
      rewards.push({
        mission: `${mission.faction}: ${mission.title}`,
        minReputation: mission.minStanding?.minReputation ?? 0,
        standingName: mission.minStanding?.name ?? null,
      })
    }
  }
  return rewards
}

const orphanBlueprintEntries = Object.entries(blueprintMissions).filter(([name]) => {
  if (BLUEPRINT_MISSION_TRACKING_EXCLUSIONS.includes(name)) return false
  return buildExpectedRewards(name).length === 0
})

const failures = []
const rewardBlueprints = blueprintData.blueprints.filter((bp) => bp.isReward)

let bundledMismatch = 0
let poolBleedRows = 0
let unlockWouldRegress = 0
const regressSamples = []

for (const bp of rewardBlueprints) {
  const name = bp.internalName || bp.name
  const expected = buildExpectedRewards(name)
  const bundled = bp.rewardMissions || []

  if (expected.length !== bundled.length) {
    bundledMismatch++
    if (failures.length < 20) {
      failures.push(`${name}: bundled has ${bundled.length} missions, expected ${expected.length}`)
    }
  }

  for (let i = 0; i < Math.min(expected.length, bundled.length); i++) {
    const exp = expected[i]
    const got = bundled[i]
    if (
      exp.mission !== got.mission ||
      exp.minReputation !== got.minReputation ||
      exp.standingName !== got.standingName
    ) {
      bundledMismatch++
      if (failures.length < 20) {
        failures.push(`${name}: row ${i} mismatch (${got.standingName} ${got.minReputation} vs ${exp.standingName} ${exp.minReputation})`)
      }
      break
    }
  }

  const bleed = oldPoolBleedRewards(name)
  const expectedKeys = new Set(expected.map((r) => `${r.mission}|${r.minReputation}`))
  for (const row of bleed) {
    const key = `${row.mission}|${row.minReputation ?? 0}`
    if (!expectedKeys.has(key)) poolBleedRows++
  }

  const newUnlock = unlockStanding(expected)
  const oldUnlock = unlockStanding(
    bleed.map((r) => ({
      minReputation: r.minReputation,
      maxReputation: r.minReputation,
      standingName: r.standingName,
    }))
  )

  if (
    oldUnlock &&
    newUnlock &&
    (oldUnlock.rep < newUnlock.rep ||
      (oldUnlock.rep !== newUnlock.rep && oldUnlock.name !== newUnlock.name))
  ) {
    unlockWouldRegress++
    if (regressSamples.length < 15) {
      regressSamples.push({
        name: bp.blueprintName || name,
        old: oldUnlock,
        new: newUnlock,
      })
    }
  }
}

console.log('=== Blueprint Mission Reward Audit ===')
console.log(`Reward blueprints: ${rewardBlueprints.length}`)
console.log(`Orphan reward pools (no contract link): ${orphanPools.length}`)
console.log(`Trackable blueprints with zero contract missions: ${orphanBlueprintEntries.length}`)
console.log(`Bundled JSON mismatches: ${bundledMismatch}`)
console.log(`Phantom pool-bleed rows (old logic, not in contract data): ${poolBleedRows}`)
console.log(`Unlock badges corrected (old lowest-rep was wrong): ${unlockWouldRegress}`)

if (regressSamples.length) {
  console.log('\nSample unlock corrections (old → new):')
  for (const sample of regressSamples) {
    console.log(`  ${sample.name}: ${sample.old.name} (${sample.old.rep}) → ${sample.new.name} (${sample.new.rep})`)
  }
}

if (orphanPools.length > 0) {
  console.error('\nFAIL: orphan reward pools with no contract references:')
  for (const pool of orphanPools.slice(0, 30)) {
    const bps = (missionBlueprints[pool] || []).map((b) => b.name).join(', ')
    console.error(`  - ${pool} (${bps})`)
  }
  if (orphanPools.length > 30) console.error(`  ... and ${orphanPools.length - 30} more`)
  process.exit(1)
}

if (orphanBlueprintEntries.length > 0) {
  console.error('\nFAIL: blueprints in reward pools but no contract-accurate missions:')
  for (const [name, pools] of orphanBlueprintEntries.slice(0, 30)) {
    const display = blueprintData.blueprints.find((bp) => (bp.internalName || '').toLowerCase() === name)?.blueprintName
    console.error(`  - ${display || name} → pools: ${pools.join(', ')}`)
  }
  if (orphanBlueprintEntries.length > 30) {
    console.error(`  ... and ${orphanBlueprintEntries.length - 30} more`)
  }
  process.exit(1)
}

if (bundledMismatch > 0) {
  console.error('\nFAIL: game-blueprints.json rewardMissions out of sync. Run: node scripts/rebuild-blueprint-reward-missions.mjs')
  process.exit(1)
}

if (failures.length > 0) {
  console.error('\nFailures:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log('\nPASS: all reward blueprints use contract-accurate mission mappings.')
