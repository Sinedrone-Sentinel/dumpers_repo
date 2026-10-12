#!/usr/bin/env node
/**
 * Live Mission Tracker rewards (src/data/game-mission-rewards.json) — patch-day audit.
 *
 * Live-tracker only: this file is not part of the ticker digest or BP Dumper.
 *
 * Fails when:
 *  - the file is missing or its gameBuild stamp does not match game-build-version.json
 *  - (with extracted-data/) a contract in the game files awards rep / event points but has no
 *    entry, an entry points at a contract that no longer exists, or event points differ
 *  - a sub-contract alias points at nothing
 *
 * Also prints added / removed / changed contracts vs git HEAD (informational).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScenarioPointsResolver } from './lib/missionRewardsIndex.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const rewardsRel = 'src/data/game-mission-rewards.json'
const rewardsPath = path.join(root, rewardsRel)
const missionsPath = path.join(root, 'src/data/game-blueprint-missions.json')
const recordsRoot = path.join(root, 'extracted-data/libs/foundry/records')
const generatorsDir = path.join(recordsRoot, 'contracts/contractgenerator')
const localizationPath = path.join(root, 'extracted-data/Data/Localization/english/global.ini')

const failures = []
const fail = (msg) => failures.push(msg)

if (!existsSync(rewardsPath)) {
  console.error(`✗ ${rewardsRel} is missing — run npm run parse-game-data`)
  process.exit(1)
}

const rewards = JSON.parse(readFileSync(rewardsPath, 'utf8'))
const byId = rewards.byId ?? {}
const aliases = rewards.aliases ?? {}
const missions = JSON.parse(readFileSync(missionsPath, 'utf8'))

// 1. Rebuilt for the current game build
const buildPath = path.join(root, 'src/data/game-build-version.json')
if (existsSync(buildPath)) {
  const build = JSON.parse(readFileSync(buildPath, 'utf8'))
  const current = build.launcherVersion || build.version || null
  if (!rewards.gameBuild) {
    fail('rewards file has no gameBuild stamp — re-run npm run parse-game-data')
  } else if (current && rewards.gameBuild !== current) {
    fail(`rewards file is for ${rewards.gameBuild} but game data is ${current} — re-run npm run parse-game-data`)
  }
}

// 2. Blueprint contracts' rep matches the rewards entry (catches a half-updated pair).
// Rows the parser synthesises (scenario tiers, bridged pools) are not game contracts.
for (const contract of missions.contracts ?? []) {
  if (contract.source) continue
  const expected = (contract.repEffects ?? []).filter((e) => e.amount)
  if (!expected.length) continue
  const entry = byId[contract.id]
  if (!entry?.rep) {
    fail(`missing rep for blueprint contract ${contract.debugName}`)
    continue
  }
  const got = new Map(entry.rep.map((r) => [r.faction, r.amount]))
  for (const effect of expected) {
    if (got.get(effect.faction) !== effect.amount) {
      fail(`rep mismatch for ${contract.debugName}: ${effect.faction} ${effect.amount} vs ${got.get(effect.faction)}`)
    }
  }
}

// 3. Aliases resolve
for (const [sub, parent] of Object.entries(aliases)) {
  if (!byId[parent] && !(missions.contracts ?? []).some((c) => c.id === parent)) {
    fail(`sub-contract alias ${sub} points at unknown contract ${parent}`)
  }
}

// 4. Raw game files cross-check (additions / removals / edits)
function listJson(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listJson(full))
    else if (name.endsWith('.json')) out.push(full)
  }
  return out
}

function loadLocalization(file) {
  const map = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx > 0) map[line.slice(0, idx).replace(/^\uFEFF/, '')] = line.slice(idx + 1)
  }
  return map
}

if (existsSync(generatorsDir) && existsSync(localizationPath)) {
  const resolveScenarioPoints = createScenarioPointsResolver({
    recordsRoot,
    localization: loadLocalization(localizationPath),
  })
  const rawIds = new Set()
  let checked = 0

  for (const file of listJson(generatorsDir)) {
    let json
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const generator of json?._RecordValue_?.generators ?? []) {
      for (const contract of [...(generator.introContracts ?? []), ...(generator.contracts ?? [])]) {
        const id = contract.id || contract.debugName
        if (!id) continue
        rawIds.add(id)
        const points = resolveScenarioPoints(contract)
        const got = (byId[id]?.scenario ?? []).map((p) => `${p.track}:${p.points}`).sort().join(',')
        const want = points.map((p) => `${p.track}:${p.points}`).sort().join(',')
        if (points.length) checked++
        if (want !== got) {
          fail(`event points out of date for ${contract.debugName}: game ${want || 'none'} vs data ${got || 'none'}`)
        }
      }
    }
  }

  const removed = Object.keys(byId).filter((id) => !rawIds.has(id))
  for (const id of removed.slice(0, 20)) fail(`rewards entry ${id} no longer exists in the game files`)
  if (removed.length > 20) fail(`... and ${removed.length - 20} more removed contracts still listed`)
  console.log(`  Cross-checked ${rawIds.size} game contracts (${checked} with event points) against the extract`)
} else {
  console.log('  − Raw extract not present; skipped game-file cross-check')
}

// 5. Patch report vs git HEAD (informational)
try {
  const prev = JSON.parse(
    execFileSync('git', ['show', `HEAD:${rewardsRel}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  ).byId ?? {}
  const added = Object.keys(byId).filter((id) => !(id in prev))
  const removed = Object.keys(prev).filter((id) => !(id in byId))
  const changed = Object.keys(byId).filter((id) => id in prev && JSON.stringify(prev[id]) !== JSON.stringify(byId[id]))
  console.log(`  vs HEAD: ${added.length} added, ${removed.length} removed, ${changed.length} changed contract reward(s)`)
} catch {
  console.log('  vs HEAD: no committed rewards file yet')
}

console.log(`  ${Object.keys(byId).length} contracts with rewards, ${Object.keys(aliases).length} sub-contract aliases`)

if (failures.length) {
  for (const msg of failures.slice(0, 40)) console.error(`  ✗ ${msg}`)
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`)
  console.error(`\nLive Mission Tracker rewards audit FAILED (${failures.length} issue(s)).`)
  process.exit(1)
}
console.log('\nLive Mission Tracker rewards audit passed.')
