/**
 * Parse mission broker entries from full DCB record folders (replaces mission-broker-query.json).
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { MISSION_BROKER_LABEL_ORDER } from './missionBrokerOrder.mjs'

const MISSION_BROKER_DIR = 'libs/foundry/records/missionbroker'

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function walkJsonFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(fullPath, acc)
    else if (entry.name.endsWith('.json')) acc.push(fullPath)
  }
  return acc
}

export function parseMissionBrokerRecord(record, localization = {}) {
  if (!record?._RecordName_?.startsWith('MissionBrokerEntry.')) return null

  const recordName = record._RecordName_
  const val = record._RecordValue_
  if (!val) return null

  const missionLabel = recordName.replace('MissionBrokerEntry.', '')

  let repRequirements = null
  if (val.reputationRequirements?.expression) {
    repRequirements = val.reputationRequirements.expression.map((expr) => ({
      factionRef: expr.factionReputation || '',
      scopeRef: expr.reputationScope || '',
      comparison: expr.comparison || '',
      standingRef: expr.standing || '',
    }))
  }

  const repRewards = []
  if (val.reputationRewards) {
    for (const reward of val.reputationRewards) {
      if (reward.reward) {
        repRewards.push({
          rewardRef: reward.reward,
          factionRef: reward.factionReputation || '',
        })
      }
    }
  }

  const repAmounts = { success: [], fail: [] }
  if (val.missionResultReputationRewards && Array.isArray(val.missionResultReputationRewards)) {
    const successRewards = val.missionResultReputationRewards[0]
    if (successRewards?.reputationAmounts) {
      for (const ra of successRewards.reputationAmounts) {
        if (ra.reward && ra.factionReputation) {
          const rewardMatch = ra.reward.match(/reputationrewardamount_(\w+)\.json/i)
          const factionMatch = ra.factionReputation.match(/factionreputation_(\w+)\.json/i)
          repAmounts.success.push({
            rewardType: rewardMatch ? rewardMatch[1] : 'unknown',
            factionKey: factionMatch ? factionMatch[1].toLowerCase() : 'unknown',
            rewardRef: ra.reward,
          })
        }
      }
    }
  }

  const blueprintRewards = []
  if (val.rewards) {
    for (const reward of val.rewards) {
      if (reward._Type_ === 'MissionReward_BlueprintPool' && reward.rewardPool) {
        blueprintRewards.push({
          poolRef: reward.rewardPool,
          weight: reward.weight || 1.0,
        })
      }
    }
  }

  const titleKey = val.title || ''
  const resolvedTitle = titleKey.startsWith('@')
    ? localization[titleKey.substring(1)] || titleKey
    : titleKey

  const descKey = val.description || ''
  const resolvedDesc = descKey.startsWith('@') ? localization[descKey.substring(1)] || '' : descKey

  let faction = 'unknown'
  if (repRequirements?.length > 0) {
    const factionMatch = repRequirements[0].factionRef.match(/factionreputation_(\w+)\.json/i)
    if (factionMatch) faction = factionMatch[1].toLowerCase()
  }

  const isLawful = val.lawfulMission === true

  const locations = []
  if (val.localityAvailable) {
    const locPath = typeof val.localityAvailable === 'string' ? val.localityAvailable : ''
    const locMatch = locPath.match(/locality_(\w+)\.json/i)
    if (locMatch) locations.push(locMatch[1])
  }
  if (val.locationMissionAvailable) {
    const locPath = typeof val.locationMissionAvailable === 'string' ? val.locationMissionAvailable : ''
    const locMatch = locPath.match(/([^/]+)\.json$/i)
    if (locMatch && locMatch[1] !== 'null') locations.push(locMatch[1])
  }

  let missionType = 'unknown'
  if (val.type) {
    const typeMatch = val.type.match(/missiontype\/pu\/(\w+)\.json/i)
    if (typeMatch) missionType = typeMatch[1]
  }

  const aUecReward = {
    min: val.missionReward?.reward || 0,
    max: val.missionReward?.max || val.missionReward?.reward || 0,
    currency: val.missionReward?.currencyType || 'UEC',
  }

  const difficulty = val.missionDifficulty ?? -1

  const missionGiverKey = val.missionGiver || ''
  const missionGiver = missionGiverKey.startsWith('@')
    ? localization[missionGiverKey.substring(1)] || missionGiverKey
    : missionGiverKey

  const notForRelease = val.notForRelease === true

  return {
    label: missionLabel,
    title: resolvedTitle,
    titleKey: titleKey,
    description: resolvedDesc,
    faction,
    missionGiver,
    missionType,
    isLawful,
    notForRelease,
    locations,
    difficulty,
    aUecReward,
    reputationRequirements: repRequirements,
    reputationRewards: repRewards,
    repAmounts,
    blueprintRewards,
    hasRepRequirement: !!repRequirements,
    hasBlueprintReward: blueprintRewards.length > 0,
  }
}

export function parseMissionBrokerData(extractedDataRoot, localization = {}) {
  console.log('  Parsing mission broker data...')

  const brokerDir = join(extractedDataRoot, MISSION_BROKER_DIR)
  if (!existsSync(brokerDir)) {
    console.log(`  Mission broker path not found: ${MISSION_BROKER_DIR}`)
    return { missions: {}, missionsByFaction: {} }
  }

  const recordsByLabel = new Map()

  for (const file of walkJsonFiles(brokerDir)) {
    const record = readJson(file)
    if (!record) continue

    const label = record._RecordName_?.replace('MissionBrokerEntry.', '')
    if (label) recordsByLabel.set(label, record)
  }

  const knownLabels = new Set(MISSION_BROKER_LABEL_ORDER)
  const orderedLabels = [...MISSION_BROKER_LABEL_ORDER]
  for (const label of [...recordsByLabel.keys()].sort()) {
    if (!knownLabels.has(label)) orderedLabels.push(label)
  }

  const missions = {}
  const missionsByFaction = {}

  for (const label of orderedLabels) {
    const record = recordsByLabel.get(label)
    if (!record) continue

    const mission = parseMissionBrokerRecord(record, localization)
    if (!mission) continue

    missions[mission.label] = mission

    if (!missionsByFaction[mission.faction]) {
      missionsByFaction[mission.faction] = []
    }
    missionsByFaction[mission.faction].push(mission.label)
  }

  console.log(`  Parsed ${Object.keys(missions).length} mission broker entries`)
  console.log(`  Factions with missions: ${Object.keys(missionsByFaction).length}`)
  console.log(`  Lawful missions: ${Object.values(missions).filter((m) => m.isLawful).length}`)
  console.log(`  Unlawful missions: ${Object.values(missions).filter((m) => !m.isLawful).length}`)

  return { missions, missionsByFaction }
}
