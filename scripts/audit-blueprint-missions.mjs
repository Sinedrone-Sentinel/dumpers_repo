#!/usr/bin/env node
/**
 * Audit blueprint contract missions: system tags, display titles, browse coverage.
 * Exit 1 when contracts with blueprint pools have suspicious Unknown systems or bad titles.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { HATHOR_PAF_OLP_MARKERS } from './lib/hathorPafSites.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const missionData = JSON.parse(readFileSync(join(root, 'src/data/game-blueprint-missions.json'), 'utf-8'))
const missionBlueprints = missionData.missionBlueprints || {}
const contracts = missionData.contracts || []

const SYSTEM_SIGNALS = [
  {
    pattern: new RegExp(
      [
        'stanton',
        'asdfacility',
        'onyxfacility',
        'microtech',
        'hurston',
        'crusader',
        'arccorp',
        'delamar',
        ...HATHOR_PAF_OLP_MARKERS,
      ].join('|'),
      'i'
    ),
    system: 'Stanton',
  },
  { pattern: /pyro|_region[a-d]_/i, system: 'Pyro' },
  { pattern: /nyx|levski|rockcracker|keeger|claw salamander/i, system: 'Nyx' },
]

function contractHasBlueprints(contract) {
  return (contract.blueprintPools || []).some((pool) => (missionBlueprints[pool.key] || []).length > 0)
}

function contractSignals(contract) {
  const pools = (contract.blueprintPools || []).map((pool) => pool.key).join(' ')
  return `${contract.debugName || ''} ${contract.title || ''} ${contract.titleKey || ''} ${pools}`.toLowerCase()
}

function expectedSystems(contract) {
  const text = contractSignals(contract)
  return SYSTEM_SIGNALS.filter(({ pattern }) => pattern.test(text)).map(({ system }) => system)
}

function isBadTitle(contract) {
  const title = contract.displayTitle || contract.title || ''
  if (!title.trim()) return true
  if (title.includes('UNINITIALIZED') || title.includes('PLACEHOLDER')) return true
  if (title.startsWith('@')) return true
  if (title === contract.debugName && !contract.displayTitle) return true
  return false
}

function isHeadhunterLawfulEscort(contract) {
  return /_(defendentitiesandescort|defenddestructibleentities)_/i.test(contract.debugName || '')
}

function resolveContractIsLawful(contract) {
  const factionKey = String(contract.factionKey || '').toLowerCase()

  // Board escort/defend templates stay lawful even under an unlawful faction's
  // generator (mirrors src/lib/missionLawfulStatus.ts ordering).
  if (isHeadhunterLawfulEscort(contract)) return true

  if (factionKey.startsWith('unlawful_')) return false
  if (factionKey.startsWith('lawful_')) return true

  return true
}

function isBrowseEligible(contract) {
  const title = contract.displayTitle || contract.title || ''
  if (!title.trim()) return false
  if (title.includes('UNINITIALIZED') || title.includes('PLACEHOLDER')) return false
  if (title.startsWith('@')) return false
  return contractHasBlueprints(contract)
}

const issues = []
const factionSummary = {}

for (const contract of contracts) {
  if (!contractHasBlueprints(contract)) continue

  const faction = contract.faction || 'Unknown'
  if (!factionSummary[faction]) {
    factionSummary[faction] = { total: 0, browse: 0, unknownSystem: 0, badTitle: 0 }
  }
  factionSummary[faction].total++
  if (isBrowseEligible(contract)) factionSummary[faction].browse++
  if (contract.system === 'Unknown') factionSummary[faction].unknownSystem++
  if (isBadTitle(contract)) factionSummary[faction].badTitle++

  if (contract.system === 'Unknown') {
    const expected = expectedSystems(contract)
    if (expected.length > 0) {
      issues.push(
        `Unknown system [${faction}] ${contract.debugName} — expected ${expected.join(' or ')}`
      )
    }
  }

  if (isBadTitle(contract)) {
    issues.push(`Bad title [${faction}] ${contract.debugName} → "${contract.displayTitle || contract.title}"`)
  }

  if (isHeadhunterLawfulEscort(contract) && !resolveContractIsLawful(contract)) {
    issues.push(
      `Board escort resolves unlawful [${contract.debugName}] factionKey=${contract.factionKey}`
    )
  }
}

// Locality gates: most blueprint contracts carry a "where you must be" gate.
// If the parser's MissionLocality extraction breaks (path/schema change in a
// patch), this count collapses — fail loudly instead of shipping empty tags.
const blueprintContracts = contracts.filter(contractHasBlueprints)
const withLocality = blueprintContracts.filter((c) => c.locality?.label)
const localityCoverage = blueprintContracts.length > 0 ? withLocality.length / blueprintContracts.length : 0
if (localityCoverage < 0.5) {
  issues.push(
    `Locality coverage collapsed: ${withLocality.length}/${blueprintContracts.length} blueprint contracts have a locality gate (expected most of them)`
  )
}

console.log('Blueprint mission audit')
console.log('=======================')
console.log(`Contracts with blueprint pools: ${contracts.filter(contractHasBlueprints).length}`)
console.log(`Browse-eligible: ${contracts.filter(isBrowseEligible).length}`)
console.log(`Unknown system (with blueprint pools): ${contracts.filter((c) => contractHasBlueprints(c) && c.system === 'Unknown').length}`)
console.log('')
console.log('Per-faction summary:')
for (const [faction, stats] of Object.entries(factionSummary).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(
    `  ${faction}: ${stats.browse}/${stats.total} browse, ${stats.unknownSystem} unknown system, ${stats.badTitle} bad title`
  )
}

const bhg = contracts.filter((c) => c.faction === 'Bounty Hunters Guild' && contractHasBlueprints(c))
if (bhg.length) {
  console.log('')
  console.log('Bounty Hunters Guild contracts:')
  for (const contract of bhg) {
    console.log(
      `  [${contract.system}] ${contract.displayTitle || contract.title} (${contract.debugName})`
    )
  }
}

console.log('')
console.log('Lawful / illegal summary (by factionKey):')
const lawfulSummary = {}
for (const contract of contracts) {
  if (!contractHasBlueprints(contract)) continue
  const faction = contract.faction || 'Unknown'
  if (!lawfulSummary[faction]) {
    lawfulSummary[faction] = { lawful: 0, illegal: 0, unknownKey: 0 }
  }
  if (resolveContractIsLawful(contract)) lawfulSummary[faction].lawful++
  else lawfulSummary[faction].illegal++
  if ((contract.factionKey || 'unknown') === 'unknown') lawfulSummary[faction].unknownKey++
}
for (const [faction, stats] of Object.entries(lawfulSummary).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(
    `  ${faction}: ${stats.lawful} lawful, ${stats.illegal} illegal (${stats.unknownKey} unknown factionKey)`
  )
}

if (issues.length) {
  console.log('')
  console.log(`Issues (${issues.length}):`)
  for (const issue of issues.slice(0, 40)) {
    console.log(`  - ${issue}`)
  }
  if (issues.length > 40) {
    console.log(`  ... and ${issues.length - 40} more`)
  }
  process.exit(1)
}

console.log('')
console.log('No issues found.')
