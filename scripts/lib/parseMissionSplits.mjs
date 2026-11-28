/**
 * Party split flags on contracts.
 * A flag that names rewards or reputation keeps that word.
 * A flag that only says the payout is split stays unspecified.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

function splitKind(key) {
  if (!/split/i.test(key) || /targetsplit|checkpoint/i.test(key)) return null
  if (/reward|currency|payout|uec/i.test(key) && !/rep/i.test(key)) return 'rewards'
  if (/rep/i.test(key)) return 'rep'
  return 'unspecified'
}

export function classifyRewardSplit(contract) {
  const found = { rewards: false, rep: false, unspecified: false }

  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    for (const [key, value] of Object.entries(node)) {
      if (value === true) {
        const kind = splitKind(key)
        if (kind) found[kind] = true
      } else if (value && typeof value === 'object') {
        walk(value)
      }
    }
  }

  walk(contract)
  if (found.rewards && found.rep) return 'both'
  if (found.rewards) return 'rewards'
  if (found.rep) return 'rep'
  if (found.unspecified) return 'unspecified'
  return null
}

function contractsInFile(json) {
  const generators = json?._RecordValue_?.generators
  if (!Array.isArray(generators)) return []
  const contracts = []
  for (const generator of generators) {
    for (const contract of generator?.contracts || []) {
      if (contract?.id) contracts.push(contract)
    }
  }
  return contracts
}

function walkJsonFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(full, out)
    else if (entry.name.endsWith('.json')) out.push(full)
  }
  return out
}

export function parseMissionSplits(extractedRoot) {
  const generatorRoot = join(extractedRoot, 'libs/foundry/records/contracts/contractgenerator')
  const byId = {}
  for (const file of walkJsonFiles(generatorRoot)) {
    let json
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const contract of contractsInFile(json)) {
      const kind = classifyRewardSplit(contract)
      if (kind) byId[String(contract.id).toLowerCase()] = kind
    }
  }
  return byId
}

export function writeMissionSplits({ extractedRoot, outFile }) {
  const byId = parseMissionSplits(extractedRoot)
  const payload = {
    _source: 'Star Citizen Game Files (contract generators)',
    byId,
  }
  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`)
  return { contracts: Object.keys(byId).length }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const summary = writeMissionSplits({
    extractedRoot: join(projectRoot, 'extracted-data'),
    outFile: join(projectRoot, 'src/data/game-mission-splits.json'),
  })
  console.log(`Mission splits: ${summary.contracts} contracts`)
}
