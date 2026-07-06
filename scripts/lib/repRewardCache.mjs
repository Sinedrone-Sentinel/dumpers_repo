/**
 * Single-pass load of reputation reward amount records.
 */

import { readFileSync, readdirSync } from 'fs'
import { join, basename } from 'path'

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function walkJsonFiles(basePath, acc = []) {
  if (!basePath) return acc
  const entries = readdirSync(basePath, { withFileTypes: true })
  for (const entry of entries) {
    const fullEntryPath = join(basePath, entry.name)
    if (entry.isDirectory()) walkJsonFiles(fullEntryPath, acc)
    else if (entry.name.endsWith('.json')) acc.push(fullEntryPath)
  }
  return acc
}

/**
 * Contract parser shape: reward file basename → numeric amount.
 */
export function buildContractRepRewardAmounts(rewardFiles) {
  const repRewardAmounts = {}
  for (const file of rewardFiles) {
    const json = readJson(file)
    if (json?._RecordValue_?.reputationAmount !== undefined) {
      repRewardAmounts[basename(file, '.json').toLowerCase()] = json._RecordValue_.reputationAmount
    }
  }
  return repRewardAmounts
}

/**
 * Reputation system shape: reward file basename → { name, amount, editorName }.
 */
export function buildReputationRewardAmounts(missionRewardFiles) {
  const rewards = {}
  for (const file of missionRewardFiles) {
    const json = readJson(file)
    if (!json?._RecordValue_?.reputationAmount) continue

    const recordName = json._RecordName_ || basename(file, '.json')
    rewards[basename(file, '.json').toLowerCase()] = {
      name: recordName,
      amount: json._RecordValue_.reputationAmount,
      editorName: json._RecordValue_.editorName || '',
    }
  }
  return rewards
}

export { walkJsonFiles }
