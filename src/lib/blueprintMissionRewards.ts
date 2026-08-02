import blueprintMissionData from '../data/game-blueprint-missions.json'
import { formatMissionDisplayTitle, isValidBrowseMissionTitle } from './missionDisplay'
import type { MissionFrequency } from './missionFrequency'
import { resolveMissionIsLawful } from './missionLawfulStatus'

export { formatMissionDisplayTitle, isValidBrowseMissionTitle } from './missionDisplay'
export type { MissionFrequency } from './missionFrequency'

/** Reputation change on mission completion. Negative amounts are cross-faction losses. */
export interface MissionRepEffect {
  factionKey: string
  faction: string
  amount: number
}

/** A mission that must be completed before a gated mission starts appearing. */
export interface PrereqMissionRef {
  debugName?: string
  title: string
  faction: string
  factionKey?: string
  system?: string | null
  region?: string | null
  category?: string | null
  isLawful?: boolean
  /** False = starter/intro mission with no blueprint reward of its own. Still listed. */
  hasBlueprints?: boolean
  /** True = faction intro/invite mission (game's introContracts list). */
  isIntro?: boolean
  /** Where you must be for this prerequisite mission to appear. */
  locality?: MissionLocality | null
  /** Offer/share settings — present even when this prereq is not a BP-reward contract. */
  frequency?: MissionFrequency | null
}

/** One prerequisite group: complete `requiredCount` of the listed missions. */
export interface MissionPrereq {
  requiredCount: number
  missions: PrereqMissionRef[]
  totalEmitters: number
}

/** Where the player must be for the mission to appear in Contracts. */
export interface MissionLocality {
  key: string
  label: string
  systems: string[]
}

export interface BlueprintRewardMission {
  mission: string
  /** Effective per-completion probability this blueprint is selected from this contract's pools. */
  chance: number
  poolChance: number
  poolKey: string
  locations: string[]
  system: string | null
  region: string | null
  category: string | null
  repPoints: number
  minReputation: number | null
  maxReputation: number | null
  standingName: string | null
  maxStandingName: string | null
  /** mobiGlas career tab this standing belongs to (e.g. Security, Bounty, Standing). */
  repCareerLabel?: string | null
  repScopeKey?: string | null
  /** Clear Air / scenario milestone points — not faction rep. */
  scenarioPointsRequired?: number | null
  scenarioProgressLabel?: string | null
  faction: string
  factionKey?: string
  debugName?: string
  isLawful: boolean
  title: string
  /** All rep changes on completion (gains + any cross-faction losses). */
  repEffects: MissionRepEffect[]
  /** Intro/starter missions that must be completed before this mission appears. */
  prereqMissions: MissionPrereq[]
  /** Locality gate: where you must be for this mission to appear. */
  locality: MissionLocality | null
  /** Offer count / board refresh (and related cooldown fields). */
  frequency: MissionFrequency | null
  /** CIG notForRelease flag — listed with an NFR tag when true. */
  notForRelease?: boolean
}

type MissionPoolBlueprint = {
  name: string
  weight: number
  path: string
}

type ContractBlueprintPool = {
  key: string
  chance: number
  path?: string
}

type ContractEntry = {
  id?: string
  debugName?: string
  title: string
  displayTitle?: string
  titleKey?: string
  /** In-game Contracts mission body text (localized). */
  description?: string | null
  descriptionKey?: string | null
  faction: string
  factionKey?: string
  system: string
  region: string | null
  category: string | null
  blueprintPools: ContractBlueprintPool[]
  minStanding: { name: string; minReputation: number } | null
  maxStanding: { name: string; minReputation: number } | null
  repCareerLabel?: string | null
  repScopeKey?: string | null
  scenarioPointsRequired?: number | null
  scenarioProgressLabel?: string | null
  repPoints: number
  repEffects?: MissionRepEffect[]
  prereqMissions?: MissionPrereq[]
  locality?: MissionLocality | null
  frequency?: MissionFrequency | null
  notForRelease?: boolean
}

const missionBlueprints = blueprintMissionData.missionBlueprints as Record<string, MissionPoolBlueprint[]>
const contracts = blueprintMissionData.contracts as ContractEntry[]

function resolveBlueprintInternalName(blueprintId: string | null | undefined): string | null {
  if (!blueprintId?.trim()) return null

  const normalized = blueprintId.replace(/\\/g, '/').toLowerCase()

  const scitemMatch = normalized.match(/bp_craft_([^/]+?)_scitem\.json$/i)
  if (scitemMatch) return scitemMatch[1]

  const simpleMatch = normalized.match(/bp_craft_([^/]+?)\.json$/i)
  if (simpleMatch) return simpleMatch[1]

  return normalized.trim()
}

function _normalizeMissionTitle(title: string): string {
  return title.replace(/\\n/g, '').replace(/\n/g, '').trim()
}

function contractDisplayTitle(contract: ContractEntry): string {
  return formatMissionDisplayTitle({
    title: contract.title,
    displayTitle: contract.displayTitle,
    titleKey: contract.titleKey,
    debugName: contract.debugName,
  })
}

function contractMissionLabel(contract: ContractEntry): string {
  return `${contract.faction}: ${contractDisplayTitle(contract)}`
}

function poolTotalWeight(poolKey: string): number {
  const items = missionBlueprints[poolKey] ?? []
  return items.reduce((sum, item) => sum + (item.weight || 1), 0)
}

function buildBlueprintRewardIndex(): Map<string, BlueprintRewardMission[]> {
  const index = new Map<string, BlueprintRewardMission[]>()

  for (const contract of contracts) {
    for (const poolRef of contract.blueprintPools ?? []) {
      const poolItems = missionBlueprints[poolRef.key]
      if (!poolItems?.length) continue

      const totalWeight = poolItems.reduce((sum, item) => sum + (item.weight || 1), 0)
      const poolChance = poolRef.chance ?? 1

      for (const item of poolItems) {
        const bpName = (item.name || '').toLowerCase()
        if (!bpName) continue

        const itemWeight = item.weight || 1
        const dropChance = totalWeight > 0 ? poolChance * (itemWeight / totalWeight) : 0

        const reward: BlueprintRewardMission = {
          mission: contractMissionLabel(contract),
          chance: dropChance,
          poolChance,
          poolKey: poolRef.key,
          locations: contract.system ? [contract.system] : [],
          system: contract.system || null,
          region: contract.region ?? null,
          category: contract.category ?? null,
          repPoints: contract.repPoints ?? 0,
          repEffects: contract.repEffects ?? [],
          prereqMissions: contract.prereqMissions ?? [],
          locality: contract.locality ?? null,
          frequency: contract.frequency ?? null,
          notForRelease: contract.notForRelease === true,
          minReputation: contract.minStanding?.minReputation ?? null,
          maxReputation: contract.maxStanding?.minReputation ?? null,
          standingName: contract.minStanding?.name ?? null,
          maxStandingName: contract.maxStanding?.name ?? null,
          repCareerLabel: contract.repCareerLabel ?? null,
          repScopeKey: contract.repScopeKey ?? null,
          scenarioPointsRequired: contract.scenarioPointsRequired ?? null,
          scenarioProgressLabel: contract.scenarioProgressLabel ?? null,
          faction: contract.faction,
          factionKey: contract.factionKey,
          debugName: contract.debugName,
          isLawful: resolveMissionIsLawful({
            factionKey: contract.factionKey,
            factionName: contract.faction,
            debugName: contract.debugName,
          }),
          title: contractDisplayTitle(contract),
        }

        if (!index.has(bpName)) index.set(bpName, [])
        index.get(bpName)!.push(reward)
      }
    }
  }

  return index
}

const blueprintRewardIndex = buildBlueprintRewardIndex()

function rewardGroupKey(reward: BlueprintRewardMission): string {
  // Keep regional / pool variants distinct — merging only by mission+standing
  // made SnowBlind (Region D) navigate to Needs stomping Region A in Browse.
  return [
    reward.mission,
    reward.minReputation ?? 'null',
    reward.maxReputation ?? 'null',
    reward.scenarioPointsRequired ?? 'null',
    reward.region ?? 'null',
    reward.poolKey || 'null',
    reward.locality?.key ?? 'null',
  ].join('|')
}

/** One row per mission variant (region/pool/locality), sorted for the reward modal. */
export function getRewardMissionsForBlueprint(blueprintId: string): BlueprintRewardMission[] {
  const internalName = resolveBlueprintInternalName(blueprintId)
  if (!internalName) return []

  const raw = blueprintRewardIndex.get(internalName) ?? []
  const grouped = new Map<string, BlueprintRewardMission>()

  for (const reward of raw) {
    const key = rewardGroupKey(reward)
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, {
        ...reward,
        locations: [...reward.locations],
        chance: reward.chance,
      })
      continue
    }

    for (const loc of reward.locations) {
      if (!existing.locations.includes(loc)) existing.locations.push(loc)
    }
    if (reward.chance > existing.chance) existing.chance = reward.chance
  }

  return [...grouped.values()].sort((a, b) => {
    const repDiff = (a.minReputation ?? 0) - (b.minReputation ?? 0)
    if (repDiff !== 0) return repDiff
    const regionDiff = (a.region || '').localeCompare(b.region || '')
    if (regionDiff !== 0) return regionDiff
    return a.mission.localeCompare(b.mission)
  })
}

export interface BlueprintUnlockStanding {
  standingName: string
  minReputation: number | null
  scenarioPointsRequired?: number | null
  isExactTierLock: boolean
  isScenarioProgress: boolean
}

/**
 * Required standing to farm this blueprint from mission rewards.
 * Uses exact-tier-locked contracts first (minStanding === maxStanding), then lowest rep.
 * Scenario progress tiers use scenarioPointsRequired instead of faction rep.
 */
export function getBlueprintUnlockStanding(blueprintId: string): BlueprintUnlockStanding | null {
  const rewards = getRewardMissionsForBlueprint(blueprintId)
  if (rewards.length === 0) return null

  const scenarioRewards = rewards.filter((r) => r.scenarioPointsRequired != null)
  if (scenarioRewards.length > 0) {
    let best = scenarioRewards[0]
    for (const reward of scenarioRewards) {
      if (
        reward.scenarioPointsRequired != null &&
        (best.scenarioPointsRequired == null || reward.scenarioPointsRequired < best.scenarioPointsRequired)
      ) {
        best = reward
      }
    }
    return {
      standingName: best.scenarioProgressLabel || 'Clear Air progress',
      minReputation: null,
      scenarioPointsRequired: best.scenarioPointsRequired ?? null,
      isExactTierLock: true,
      isScenarioProgress: true,
    }
  }

  const exactTier = rewards.filter(
    (reward) =>
      reward.minReputation != null &&
      reward.maxReputation != null &&
      reward.minReputation === reward.maxReputation
  )
  const candidates = exactTier.length > 0 ? exactTier : rewards

  let best = candidates[0]
  for (const reward of candidates) {
    if (reward.minReputation == null) continue
    if (best.minReputation == null || reward.minReputation < best.minReputation) {
      best = reward
    }
  }

  if (best.minReputation == null) return null

  return {
    standingName: best.standingName ?? 'Unknown',
    minReputation: best.minReputation,
    isExactTierLock: exactTier.length > 0,
    isScenarioProgress: false,
  }
}

export function getContractsForMissionLabel(missionLabel: string): ContractEntry[] {
  const trimmed = missionLabel.trim()
  return contracts.filter((contract) => contractMissionLabel(contract) === trimmed)
}

const contractsById = new Map<string, ContractEntry>()
const contractsByDebugName = new Map<string, ContractEntry>()
for (const contract of contracts) {
  if (contract.id) contractsById.set(contract.id.toLowerCase(), contract)
  if (contract.debugName) contractsByDebugName.set(contract.debugName.toLowerCase(), contract)
}

/** Resolve a live dumper mission to catalog contract data (UUID or debugName). */
export function findContractForLiveMission(
  contractDefinitionId: string | null | undefined,
  debugName: string | null | undefined
): ContractEntry | null {
  const idKey = contractDefinitionId?.trim().toLowerCase()
  if (idKey) {
    return contractsById.get(idKey) ?? contractsByDebugName.get(idKey) ?? null
  }
  const debugKey = debugName?.trim().toLowerCase()
  if (debugKey) return contractsByDebugName.get(debugKey) ?? null
  return null
}

export function getContractMissionLabel(contract: ContractEntry): string {
  return contractMissionLabel(contract)
}

export type MissionCatalogHint = {
  faction: string
  factionKey?: string
  category: string | null
  system: string | null
  region: string | null
  isLawful: boolean
}

function buildMissionTitleHintIndex(): Map<string, MissionCatalogHint> {
  const index = new Map<string, MissionCatalogHint>()

  const register = (title: string | null | undefined, hint: MissionCatalogHint) => {
    const key = _normalizeMissionTitle(title || '').toLowerCase()
    if (!key || index.has(key)) return
    index.set(key, hint)
  }

  const hintFrom = (source: {
    faction: string
    factionKey?: string
    category?: string | null
    system?: string | null
    region?: string | null
    isLawful?: boolean
    debugName?: string
  }): MissionCatalogHint => ({
    faction: source.faction,
    factionKey: source.factionKey,
    category: source.category ?? null,
    system: source.system ?? null,
    region: source.region ?? null,
    isLawful:
      source.isLawful ??
      resolveMissionIsLawful({
        factionKey: source.factionKey,
        factionName: source.faction,
        debugName: source.debugName,
      }),
  })

  for (const contract of contracts) {
    const hint = hintFrom(contract)
    register(contract.title, hint)
    register(contractDisplayTitle(contract), hint)
    for (const prereq of contract.prereqMissions ?? []) {
      for (const mission of prereq.missions ?? []) {
        register(mission.title, hintFrom(mission))
      }
    }
  }

  const missionsByPool = blueprintMissionData.missionsByPool as Record<
    string,
    Array<{
      title: string
      displayTitle?: string
      faction: string
      factionKey?: string
      system?: string | null
      region?: string | null
      category?: string | null
      isLawful?: boolean
      debugName?: string
    }>
  >

  for (const entries of Object.values(missionsByPool ?? {})) {
    for (const mission of entries) {
      register(mission.title, hintFrom(mission))
      register(mission.displayTitle, hintFrom(mission))
    }
  }

  return index
}

const missionTitleHintIndex = buildMissionTitleHintIndex()

/** Resolve faction/location metadata for rep-only missions missing from the contracts catalog. */
export function findMissionHintByTitle(title: string): MissionCatalogHint | null {
  const key = _normalizeMissionTitle(title).toLowerCase()
  if (!key) return null
  return missionTitleHintIndex.get(key) ?? null
}

export interface ContractBlueprintDrop {
  name: string
  dropChance: number
  poolKey: string
}

export interface ContractMissionBrowseEntry {
  entryKey: string
  mission: string
  title: string
  /** Localized Contracts mission body text, when available. */
  description?: string | null
  faction: string
  factionKey?: string
  debugName?: string
  isLawful: boolean
  system: string | null
  region: string | null
  category: string | null
  minStanding: { name: string; minReputation: number } | null
  maxStanding: { name: string; minReputation: number } | null
  repCareerLabel?: string | null
  repScopeKey?: string | null
  repPoints: number
  repEffects: MissionRepEffect[]
  prereqMissions: MissionPrereq[]
  locality: MissionLocality | null
  frequency: MissionFrequency | null
  notForRelease?: boolean
  poolKeys: string[]
  /** Lowest pool roll chance when any attached pool is < 100%. */
  minPoolChance: number
  hasPartialPoolRoll: boolean
  blueprints: ContractBlueprintDrop[]
}

function isValidBrowseContract(contract: ContractEntry): boolean {
  // Only the member-facing display title must be valid. The raw game title is
  // sometimes an unresolved @key / "<= UNINITIALIZED =>" even when a clean
  // humanized display title exists — hiding those would drop real contracts
  // (and their blueprints) from Browse for no member-visible reason.
  return isValidBrowseMissionTitle(contractDisplayTitle(contract))
}

function buildContractBrowseCatalog(): ContractMissionBrowseEntry[] {
  const entries: ContractMissionBrowseEntry[] = []

  for (const contract of contracts) {
    if (!isValidBrowseContract(contract)) continue

    const poolKeys = (contract.blueprintPools ?? []).map((pool) => pool.key)
    const blueprints: ContractBlueprintDrop[] = []
    const seenBp = new Set<string>()

    for (const poolRef of contract.blueprintPools ?? []) {
      const poolItems = missionBlueprints[poolRef.key]
      if (!poolItems?.length) continue

      const totalWeight = poolTotalWeight(poolRef.key)
      const poolChance = poolRef.chance ?? 1

      for (const item of poolItems) {
        const name = (item.name || '').toLowerCase()
        if (!name || seenBp.has(name)) continue
        seenBp.add(name)

        const itemWeight = item.weight || 1
        const dropChance = totalWeight > 0 ? poolChance * (itemWeight / totalWeight) : 0
        blueprints.push({ name, dropChance, poolKey: poolRef.key })
      }
    }

    if (blueprints.length === 0) continue

    const poolChances = (contract.blueprintPools ?? []).map((pool) => pool.chance ?? 1)
    const minPoolChance = poolChances.length > 0 ? Math.min(...poolChances) : 1

    entries.push({
      entryKey: [
        contract.id || contract.debugName || contract.title,
        contract.minStanding?.minReputation ?? 'null',
        contract.maxStanding?.minReputation ?? 'null',
        contract.system || 'unknown',
      ].join('|'),
      mission: contractMissionLabel(contract),
      title: contractDisplayTitle(contract),
      description: contract.description?.trim() || null,
      faction: contract.faction,
      factionKey: contract.factionKey,
      debugName: contract.debugName,
      isLawful: resolveMissionIsLawful({
        factionKey: contract.factionKey,
        factionName: contract.faction,
        debugName: contract.debugName,
      }),
      system: contract.system || null,
      region: contract.region ?? null,
      category: contract.category ?? null,
      minStanding: contract.minStanding,
      maxStanding: contract.maxStanding,
      repCareerLabel: contract.repCareerLabel ?? null,
      repScopeKey: contract.repScopeKey ?? null,
      repPoints: contract.repPoints ?? 0,
      repEffects: contract.repEffects ?? [],
      prereqMissions: contract.prereqMissions ?? [],
      locality: contract.locality ?? null,
      frequency: contract.frequency ?? null,
      notForRelease: contract.notForRelease === true,
      poolKeys,
      minPoolChance,
      hasPartialPoolRoll: minPoolChance < 1,
      blueprints,
    })
  }

  return entries.sort((a, b) => a.title.localeCompare(b.title))
}

export const contractMissionBrowseCatalog = buildContractBrowseCatalog()

export function getContractMissionBrowseCatalog(): ContractMissionBrowseEntry[] {
  return contractMissionBrowseCatalog
}

export function findBrowseMissionEntry(
  missionLabel: string,
  options?: {
    system?: string | null
    faction?: string | null
    region?: string | null
    poolKey?: string | null
    debugName?: string | null
    localityKey?: string | null
  }
): ContractMissionBrowseEntry | null {
  const catalog = getContractMissionBrowseCatalog()
  const trimmed = missionLabel.trim()
  if (!trimmed) return null

  // Prefer exact contract debugName when the reward row carries it.
  if (options?.debugName) {
    const byDebug = catalog.find(
      (entry) => entry.debugName?.toLowerCase() === options.debugName!.toLowerCase()
    )
    if (byDebug) return byDebug
  }

  let matches = catalog.filter((entry) => entry.mission === trimmed)

  if (matches.length === 0 && options?.faction) {
    const title = trimmed.startsWith(`${options.faction}: `)
      ? trimmed.slice(options.faction.length + 2).trim()
      : trimmed
    matches = catalog.filter(
      (entry) => entry.faction === options.faction && entry.title === title
    )
  }

  if (matches.length === 0) {
    const colon = trimmed.indexOf(':')
    if (colon > 0) {
      const faction = trimmed.slice(0, colon).trim()
      const title = trimmed.slice(colon + 1).trim()
      matches = catalog.filter((entry) => entry.faction === faction && entry.title === title)
    }
  }

  if (matches.length === 0) {
    matches = catalog.filter((entry) => entry.title === trimmed)
  }

  if (options?.system && matches.length > 1) {
    const bySystem = matches.filter(
      (entry) => entry.system?.toLowerCase() === options.system!.toLowerCase()
    )
    if (bySystem.length > 0) matches = bySystem
  }

  if (options?.region && matches.length > 1) {
    const want = options.region.toUpperCase()
    const byRegion = matches.filter((entry) => (entry.region || '').toUpperCase() === want)
    if (byRegion.length > 0) matches = byRegion
  }

  if (options?.poolKey && matches.length > 1) {
    const want = options.poolKey.toLowerCase()
    const byPool = matches.filter((entry) =>
      entry.poolKeys.some((key) => key.toLowerCase() === want)
    )
    if (byPool.length > 0) matches = byPool
  }

  if (options?.localityKey && matches.length > 1) {
    const want = options.localityKey.toLowerCase()
    const byLocality = matches.filter(
      (entry) => (entry.locality?.key || '').toLowerCase() === want
    )
    if (byLocality.length > 0) matches = byLocality
  }

  return matches[0] ?? null
}
