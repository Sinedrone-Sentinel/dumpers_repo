import blueprintMissionData from '../data/game-blueprint-missions.json'
import {
  getBlueprintUnlockStanding,
  getContractsForMissionLabel,
  getRewardMissionsForBlueprint,
} from './blueprintMissionRewards'
import { resolveMissionIsLawful } from './missionLawfulStatus'

export interface MissionRepInfo {
  repMin: number | null
  repMax: number | null
  minReputation: number | null
  minStandingName: string | null
  repCareerLabel: string | null
  variantCount: number
  missionGiver: string | null
  matched: boolean
  isLawful: boolean
  aUecMin: number
  aUecMax: number
  missionType: string | null
  missionLocations: string[]
  repPoints: number
  region: string | null
  system: string | null
  category: string | null
}

export interface BlueprintUnlockInfo {
  unlockMinReputation: number | null
  unlockStandingName: string | null
  factionName: string | null
  isAvailableByDefault: boolean
  matched: boolean
  matchedMissionCount: number
  unmatchedMissionCount: number
  isInferred: boolean
  missionPoolName: string | null
  repPoints: number
}

type MissionPoolBlueprint = {
  name: string
  weight: number
  path: string
}

type MissionPoolEntry = {
  title: string
  titleKey: string
  faction: string
  system: string
  region: string | null
  category: string | null
  minStanding: { name: string; minReputation: number } | null
  maxStanding: { name: string; minReputation: number } | null
  repCareerLabel?: string | null
  repPoints: number
}

const missionBlueprints = blueprintMissionData.missionBlueprints as Record<string, MissionPoolBlueprint[]>
const missionsByPool = blueprintMissionData.missionsByPool as Record<string, MissionPoolEntry[]>
const contractEntries = blueprintMissionData.contracts as Array<{
  debugName?: string
  title: string
  displayTitle?: string
  faction: string
  factionKey?: string
  repCareerLabel?: string | null
  blueprintPools?: { key: string }[]
}>

function findContractForPoolMission(poolKey: string, mission?: MissionPoolEntry): {
  factionKey?: string
  debugName?: string
  faction: string
} | null {
  const normalizedKey = poolKey.toLowerCase()
  const titleNeedle = (mission?.displayTitle || mission?.title || '').toLowerCase()

  for (const contract of contractEntries) {
    const pools = contract.blueprintPools ?? []
    if (!pools.some((pool) => pool.key.toLowerCase() === normalizedKey)) continue

    if (titleNeedle) {
      const contractTitle = (contract.displayTitle || contract.title || '').toLowerCase()
      if (
        contractTitle !== titleNeedle &&
        !contractTitle.includes(titleNeedle) &&
        !titleNeedle.includes(contractTitle)
      ) {
        continue
      }
    }

    return contract
  }

  return null
}

function buildBlueprintToPoolIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>()
  
  for (const [poolKey, blueprints] of Object.entries(missionBlueprints)) {
    for (const bp of blueprints) {
      const bpName = (bp.name || '').toLowerCase()
      if (!bpName) continue
      if (!index.has(bpName)) {
        index.set(bpName, [])
      }
      index.get(bpName)!.push(poolKey)
    }
  }
  
  return index
}

const blueprintToPoolIndex = buildBlueprintToPoolIndex()

function extractBlueprintInternalName(fileId: string): string | null {
  const normalized = fileId.replace(/\\/g, '/').toLowerCase()
  
  const scitemMatch = normalized.match(/bp_craft_([^/]+?)_scitem\.json$/i)
  if (scitemMatch) return scitemMatch[1]
  
  const simpleMatch = normalized.match(/bp_craft_([^/]+?)\.json$/i)
  if (simpleMatch) return simpleMatch[1]
  
  return null
}

/** Resolve blueprint ID from file path or direct internalName. */
function resolveBlueprintInternalName(blueprintId: string | null | undefined): string | null {
  if (!blueprintId?.trim()) return null

  const fromPath = extractBlueprintInternalName(blueprintId)
  if (fromPath) return fromPath

  // Post-migration IDs are stored as lowercase internalName keys
  return blueprintId.replace(/\\/g, '/').toLowerCase().trim()
}

export function normalizeMissionTitle(title: string): string {
  return title
    .replace(/~mission\s*\([^)]*\)/gi, '[param]')
    .replace(/\[Location[^\]]*\]/gi, '[location]')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function missionLookupKey(missionLabel: string): string {
  return missionLabel.replace('MissionBrokerEntry.', '')
}

export function formatScenarioPointsRequirement(
  scenarioPointsRequired: number | null | undefined,
  label?: string | null
): string | null {
  if (scenarioPointsRequired == null) return null
  const prefix = label?.trim() || 'Scenario progress'
  return `${prefix} (${scenarioPointsRequired.toLocaleString()} pts)`
}

export function formatRepReward(repMin: number | null, repMax: number | null): string | null {
  if (repMin == null && repMax == null) return null
  if (repMin != null && repMax != null && repMin !== repMax) {
    return `+${repMin.toLocaleString()}–${repMax.toLocaleString()} rep`
  }
  const value = repMin ?? repMax
  if (value == null) return null
  return `+${value.toLocaleString()} rep`
}

/** Standing tier gate only (e.g. "Jr. Contractor (800 rep)") — career path is a separate tag. */
export function formatStandingRequirement(
  standingName: string | null,
  minReputation: number | null,
): string | null {
  if (standingName == null && minReputation == null) return null
  if (minReputation === 0) {
    return 'Neutral (0 rep)'
  }
  if (standingName && minReputation != null) {
    return `${standingName} (${minReputation.toLocaleString()} rep)`
  }
  if (standingName) return standingName
  if (minReputation != null) return `${minReputation.toLocaleString()} rep`
  return null
}

export function formatStandingRange(
  minStanding: { name: string; minReputation: number } | null | undefined,
  maxStanding: { name: string; minReputation: number } | null | undefined,
): string | null {
  if (!minStanding && !maxStanding) return null

  if (
    minStanding &&
    maxStanding &&
    minStanding.minReputation !== maxStanding.minReputation
  ) {
    return `${minStanding.name} (${minStanding.minReputation.toLocaleString()}) – ${maxStanding.name} (${maxStanding.minReputation.toLocaleString()})`
  }

  const locked = minStanding ?? maxStanding
  return formatStandingRequirement(locked?.name ?? null, locked?.minReputation ?? null)
}

export function formatBlueprintDropChance(chance: number | null | undefined): string | null {
  if (chance == null || chance >= 1) return null
  const pct = chance * 100
  return pct >= 10 ? `${Math.round(pct)}% BP drop` : `${pct.toFixed(1)}% BP drop`
}

/**
 * Get mission rep info from the pool-based mission data.
 * Looks up by pool key or mission title.
 */
export function getMissionRepInfoFromPool(poolKey: string, missionTitle?: string): MissionRepInfo {
  const defaultReturn: MissionRepInfo = {
    repMin: null,
    repMax: null,
    minReputation: null,
    minStandingName: null,
    repCareerLabel: null,
    variantCount: 0,
    missionGiver: null,
    matched: false,
    isLawful: true,
    aUecMin: 0,
    aUecMax: 0,
    missionType: null,
    missionLocations: [],
    repPoints: 0,
    region: null,
    system: null,
    category: null,
  }

  // Normalize pool key - strip BP_MISSIONREWARD_ or BP_REWARDS_ prefix and lowercase
  const normalizedKey = poolKey
    .replace(/^BP_MISSIONREWARD_/i, '')
    .replace(/^BP_REWARDS_/i, '')
    .toLowerCase()
  const poolMissions = missionsByPool[normalizedKey] || missionsByPool[poolKey.toLowerCase()]
  if (!poolMissions || poolMissions.length === 0) {
    return defaultReturn
  }

  // If a specific title is provided, try to match it
  let mission: MissionPoolEntry | undefined
  if (missionTitle) {
    const normalizedTitle = missionTitle.toLowerCase()
    mission = poolMissions.find(m => {
      const mTitle = (m.title || '').toLowerCase()
      return mTitle.includes(normalizedTitle) || normalizedTitle.includes(mTitle)
    })
  }
  
  // Fall back to first mission in pool
  if (!mission) {
    mission = poolMissions[0]
  }

  const matchedContract = findContractForPoolMission(normalizedKey, mission)

  return {
    repMin: mission.repPoints,
    repMax: mission.repPoints,
    minReputation: mission.minStanding?.minReputation ?? null,
    minStandingName: mission.minStanding?.name ?? null,
    repCareerLabel: mission.repCareerLabel ?? matchedContract?.repCareerLabel ?? null,
    variantCount: poolMissions.length,
    missionGiver: mission.faction,
    matched: true,
    isLawful: resolveMissionIsLawful({
      factionKey: matchedContract?.factionKey,
      factionName: matchedContract?.faction ?? mission.faction,
      debugName: matchedContract?.debugName,
    }),
    aUecMin: 0,
    aUecMax: 0,
    missionType: null,
    missionLocations: mission.system ? [mission.system] : [],
    repPoints: mission.repPoints,
    region: mission.region ?? null,
    system: mission.system ?? null,
    category: mission.category ?? null,
  }
}

/**
 * Legacy getMissionRepInfo for backwards compatibility.
 * Tries to match mission label to pool data.
 */
export function getMissionRepInfo(missionLabel: string): MissionRepInfo {
  const defaultReturn: MissionRepInfo = {
    repMin: null,
    repMax: null,
    minReputation: null,
    minStandingName: null,
    repCareerLabel: null,
    variantCount: 0,
    missionGiver: null,
    matched: false,
    isLawful: true,
    aUecMin: 0,
    aUecMax: 0,
    missionType: null,
    missionLocations: [],
    repPoints: 0,
    region: null,
    system: null,
    category: null,
  }

  if (/uninitialized/i.test(missionLabel)) {
    return defaultReturn
  }

  const exactContracts = getContractsForMissionLabel(missionLabel)
  if (exactContracts.length === 1) {
    return contractToMissionRepInfo(exactContracts[0])
  }
  if (exactContracts.length > 1) {
    const lockedTier = exactContracts.filter(
      (contract) =>
        contract.minStanding?.minReputation != null &&
        contract.maxStanding?.minReputation != null &&
        contract.minStanding.minReputation === contract.maxStanding.minReputation
    )
    const candidates = lockedTier.length > 0 ? lockedTier : exactContracts
    const best = [...candidates].sort(
      (a, b) => (b.minStanding?.minReputation ?? 0) - (a.minStanding?.minReputation ?? 0)
    )[0]
    return contractToMissionRepInfo(best)
  }

  // Try to find matching pool by searching all pools for matching titles
  for (const [_poolKey, missions] of Object.entries(missionsByPool)) {
    for (const mission of missions) {
      const mTitle = (mission.title || '').toLowerCase()
      const labelLower = (missionLabel || '').toLowerCase()
      if (mTitle === labelLower || labelLower.includes(mTitle)) {
        return {
          repMin: mission.repPoints,
          repMax: mission.repPoints,
          minReputation: mission.minStanding?.minReputation ?? null,
          minStandingName: mission.minStanding?.name ?? null,
    repCareerLabel: mission.repCareerLabel ?? matchedContract?.repCareerLabel ?? null,
          variantCount: missions.length,
          missionGiver: mission.faction,
          matched: true,
          isLawful: resolveMissionIsLawful({
            factionName: mission.faction,
          }),
          aUecMin: 0,
          aUecMax: 0,
          missionType: null,
          missionLocations: mission.system ? [mission.system] : [],
          repPoints: mission.repPoints,
          region: mission.region ?? null,
          system: mission.system ?? null,
          category: mission.category ?? null,
        }
      }
    }
  }

  return defaultReturn
}

function contractToMissionRepInfo(contract: {
  faction: string
  factionKey?: string
  debugName?: string
  title: string
  system: string
  region: string | null
  category: string | null
  minStanding: { name: string; minReputation: number } | null
  repCareerLabel?: string | null
  repPoints: number
}): MissionRepInfo {
  return {
    repMin: contract.repPoints,
    repMax: contract.repPoints,
    minReputation: contract.minStanding?.minReputation ?? null,
    minStandingName: contract.minStanding?.name ?? null,
    repCareerLabel: contract.repCareerLabel ?? null,
    variantCount: 1,
    missionGiver: contract.faction,
    matched: true,
    isLawful: resolveMissionIsLawful({
      factionKey: contract.factionKey,
      factionName: contract.faction,
      debugName: contract.debugName,
    }),
    aUecMin: 0,
    aUecMax: 0,
    missionType: null,
    missionLocations: contract.system ? [contract.system] : [],
    repPoints: contract.repPoints,
    region: contract.region ?? null,
    system: contract.system ?? null,
    category: contract.category ?? null,
  }
}

export function getBlueprintUnlockInfo(blueprintFileId: string): BlueprintUnlockInfo {
  const internalName = resolveBlueprintInternalName(blueprintFileId)

  const defaultReturn: BlueprintUnlockInfo = {
    unlockMinReputation: null,
    unlockStandingName: null,
    factionName: null,
    isAvailableByDefault: true,
    matched: false,
    matchedMissionCount: 0,
    unmatchedMissionCount: 0,
    isInferred: false,
    missionPoolName: null,
    repPoints: 0,
  }

  if (!internalName) return defaultReturn

  const rewardMissions = getRewardMissionsForBlueprint(internalName)
  if (rewardMissions.length === 0) return defaultReturn

  const unlockStanding = getBlueprintUnlockStanding(internalName)
  const poolKeys = blueprintToPoolIndex.get(internalName) ?? []
  const factionName = rewardMissions[0]?.faction ?? null
  const repPoints = rewardMissions.reduce((max, reward) => Math.max(max, reward.repPoints), 0)

  return {
    unlockMinReputation: unlockStanding?.isScenarioProgress ? null : (unlockStanding?.minReputation ?? null),
    unlockStandingName: unlockStanding?.standingName ?? null,
    factionName,
    isAvailableByDefault: unlockStanding?.minReputation === 0 && !unlockStanding?.isScenarioProgress,
    matched: true,
    matchedMissionCount: rewardMissions.length,
    unmatchedMissionCount: Math.max(0, poolKeys.length - rewardMissions.length),
    isInferred: false,
    missionPoolName: rewardMissions[0]?.poolKey ?? poolKeys[0] ?? null,
    repPoints,
  }
}

export function formatBlueprintUnlockBadge(blueprintFileId: string, isReward?: boolean): string {
  const info = getBlueprintUnlockInfo(blueprintFileId)

  if (!info.matched) {
    if (isReward === false) return 'Craft-only — no mission unlock'
    return 'Rep unknown'
  }

  const unlockStanding = getBlueprintUnlockStanding(blueprintFileId)
  if (unlockStanding?.isScenarioProgress && unlockStanding.scenarioPointsRequired != null) {
    return `${unlockStanding.standingName} (${unlockStanding.scenarioPointsRequired.toLocaleString()} pts)`
  }

  if (info.unlockMinReputation != null && info.unlockMinReputation > 0) {
    return info.unlockStandingName
      ? `${info.unlockStandingName} (${info.unlockMinReputation.toLocaleString()} rep)`
      : `${info.unlockMinReputation.toLocaleString()} rep`
  }

  if (info.unlockMinReputation === 0) {
    return 'Neutral (0 rep)'
  }

  if (info.unlockStandingName) {
    return info.unlockStandingName
  }

  return 'Rep unknown'
}

/**
 * Get all missions that reward a specific blueprint pool
 */
export function getMissionsForPool(poolKey: string): MissionPoolEntry[] {
  // Normalize pool key - strip BP_MISSIONREWARD_ or BP_REWARDS_ prefix and lowercase
  const normalizedKey = poolKey
    .replace(/^BP_MISSIONREWARD_/i, '')
    .replace(/^BP_REWARDS_/i, '')
    .toLowerCase()
  return missionsByPool[normalizedKey] || missionsByPool[poolKey.toLowerCase()] || []
}

/**
 * Get all pool keys that contain a specific blueprint
 */
export function getPoolsForBlueprint(blueprintFileId: string): string[] {
  const internalName = resolveBlueprintInternalName(blueprintFileId)
  if (!internalName) return []
  return blueprintToPoolIndex.get(internalName) || []
}

export const acquisitionDataVersion = blueprintMissionData._extracted
export const acquisitionStats = { 
  totalMissionPools: Object.keys(missionBlueprints).length,
  totalBlueprintsInPools: Object.values(missionBlueprints).reduce((sum, arr) => sum + arr.length, 0),
  contractsWithMissionData: Object.keys(missionsByPool).length,
}
