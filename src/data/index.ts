/**
 * Master Data Index
 * Central access point for all structured game data
 * 
 * Data is now sourced directly from Star Citizen game files
 * via the parse-extracted-data.mjs script.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface OreLocation {
  name: string
  locations: string[]
}

export interface MiningLocationsData {
  _source: string
  _extracted: string
  locationAliases?: Record<
    string,
    {
      spawnKey: string
      guideName?: string
      guideNames?: string[]
      displayName?: string
      system?: string
      source?: string
    }
  >
  guideToSpawnKeys?: Record<string, string[]>
  rarityTiers: {
    legendary: OreLocation[]
    epic: OreLocation[]
    rare: OreLocation[]
    uncommon: OreLocation[]
    common: OreLocation[]
    handMineable: OreLocation[]
  }
  oreLocations: Record<string, string[]>
  locationOres: Record<string, { name: string; rarity: string }[]>
  locationMineables: Record<string, {
    shipMineables: string[]
    groundVehicleMineables: string[]
    handMineables: string[]
    harvestables: string[]
    creatures: string[]
  }>
  /** FPS gem habitat per guide location (from in-game body descriptions). */
  handMineableHabitats?: Record<string, Record<string, 'surface' | 'caves' | 'both'>>
  /** Compendium subsite labels excluded from guide browsing (e.g. Magda Sand Caves). */
  redundantSubsiteGuideLocations?: string[]
  rarityOrder: string[]
  summary: {
    totalOres: number
    totalLocations: number
    locationsWithDetails: number
  }
}

export interface GameComponent {
  id: string
  name: string
  type: string
  displayName: string
  size: number
  grade: number
  manufacturerCode: string | null
  manufacturer: string | null
  tags: string
  typeParams: unknown
}

export interface GameComponentsData {
  _source: string
  _extracted: string
  components: GameComponent[]
  summary: {
    totalComponents: number
    byType: Record<string, number>
  }
}

export interface OrdnanceItem {
  internalId: string
  displayName: string
  guidance: string
  guidanceCode: string
  size: number
  isGimbal: boolean
  isTorpedo: boolean
  type: 'Missile' | 'Torpedo'
  manufacturer: string
  fullLabel: string
}

export interface GameOrdnanceData {
  _source: string
  _extracted: string
  ordnance: OrdnanceItem[]
  ordnanceByGuidance: Record<string, OrdnanceItem[]>
  ordnanceBySize: Record<string, OrdnanceItem[]>
  metadata: {
    guidanceCodes: Record<string, string>
    sizeRanges: {
      missile: number[]
      torpedo: number[]
    }
  }
  summary: {
    totalOrdnance: number
    missiles: number
    torpedoes: number
  }
}

export interface GameBlueprintMission {
  name: string
  weight: number
  path: string
}

export interface StandingThreshold {
  name: string
  minReputation: number
}

export interface BlueprintPool {
  key: string
  chance: number
  path: string
}

export interface MissionContract {
  id: string
  debugName: string
  title: string
  titleKey: string
  faction: string
  factionKey: string
  system: string
  region: string | null
  category: string | null
  blueprintPools: BlueprintPool[]
  minStanding: StandingThreshold | null
  maxStanding: StandingThreshold | null
  repPoints: number
}

export interface MissionPoolEntry {
  title: string
  titleKey: string
  faction: string
  system: string
  region: string | null
  category: string | null
  minStanding: StandingThreshold | null
  maxStanding: StandingThreshold | null
  repPoints: number
}

export interface GameBlueprintMissionsData {
  _source: string
  _extracted: string
  missionBlueprints: Record<string, GameBlueprintMission[]>
  blueprintMissions: Record<string, string[]>
  contracts: MissionContract[]
  missionsByPool: Record<string, MissionPoolEntry[]>
  summary: {
    totalPools: number
    totalBlueprints: number
    contractsWithBlueprints: number
    poolsWithMissionData: number
  }
}

export interface GameManufacturer {
  code: string
  name: string
  descKey: string
}

export interface GameManufacturersData {
  _source: string
  _extracted: string
  manufacturers: Record<string, GameManufacturer>
  summary: {
    totalManufacturers: number
  }
}

export interface GameReputationStanding {
  id: string
  name: string
  displayName: string
  displayNameKey: string
  minReputation: number
  driftReputation: number
  driftTimeHours: number
  gated: boolean
  category: string
  recordName: string
  filePath: string
}

export interface GameFaction {
  id: string
  key: string
  name: string
  displayNameKey: string
  descriptionKey: string
  recordName: string
  filePath: string
}

export interface GameFactionStanding {
  faction: string
  factionKey: string
  scopeName: string
  standings: Array<{
    displayName: string
    minReputation: number
    gated: boolean
  }>
}

export interface FactionContext {
  primaryScope: {
    scopeKey: string
    standings: GameReputationStanding[]
  }
  careerScopes: Array<{
    scopeKey: string
    standings: GameReputationStanding[]
  }>
}

export interface GameReputationData {
  _source: string
  _extracted: string
  factions: Record<string, GameFaction>
  factionContexts: Record<string, FactionContext>
  factionStandings: Record<string, GameFactionStanding>
  standingsByCategory: Record<string, GameReputationStanding[]>
  scopes: Record<string, unknown>
  rewardAmounts: Record<string, { name: string; amount: number; editorName: string }>
  missions: Record<string, unknown>
  missionsByFaction: Record<string, string[]>
  summary: {
    totalStandings: number
    totalScopes: number
    totalFactions: number
    totalContexts: number
    totalRewardTypes: number
    totalMissions: number
    missionsWithBlueprints: number
    missionsWithRepRequirements: number
  }
}

export interface GameLoreResourceEntry {
  key: string
  label: string
  description: string
  kind?: 'commodity' | 'item'
}

export interface GameLoreData {
  _source: string
  _extracted: string
  resources: Record<string, GameLoreResourceEntry>
  summary: {
    totalDescriptions: number
  }
}

export interface MineableElement {
  id: string
  name: string
  recordName: string
  instability: number
  resistance: number
  optimalWindowMidpoint: number
  optimalWindowRandomness: number
  optimalWindowThinness: number
  explosionMultiplier: number
  clusterFactor: number
  isFPS: boolean
  isGroundVehicle: boolean
  isShip: boolean
}

export interface MiningLaser {
  id: string
  name: string
  displayName: string
  size: number
  laserPower: number
  optimalRange: number
  maxRange: number
  extractionEfficiency: number
  instabilityModifier: number
  resistanceModifier: number
  optimalWindowModifier: number
  filterModifier: number
  throttleLerpSpeed: number
  throttleMinimum: number
  tags: string
}

export interface GameMiningData {
  _source: string
  _extracted: string
  mineableElements: MineableElement[]
  /** RS scanner base value per ship-minable ore (from mineable rock entity defs). */
  oreSignatures: Record<string, number>
  miningLasers: MiningLaser[]
  summary: {
    elements: number
    signatureOres: number
    lasers: number
  }
}

export type DepositType = 'surface' | 'asteroid'

export interface MiningClusterRow {
  nodes: number
  rs: number
  chancePercent: number
  bestAtLocation?: string
}

export interface MiningClusterDisplayProfile {
  maxNodes: number
  clusterRows: MiningClusterRow[]
  bestLocation?: string
  bestLocationSpawnPercent?: number
  scaleRange?: { min: number; max: number } | null
  massRangeScu?: { min: number; max: number } | null
}

export interface MiningCompositionPart {
  elementName: string
  minPercentage: number
  maxPercentage: number
  qualityScale: number
}

export interface MiningLocationSpawnProfile {
  locationName: string
  hppKey: string
  system: string
  depositType: DepositType
  groupName: string
  groupSpawnPercent: number
  relativeSpawnWeight: number
  poolSharePercent: number
  effectiveSpawnPercent: number
  harvestablePreset: string
  compositionRecordName: string | null
  compositionParts: MiningCompositionPart[]
  clusterPresetKey: string
  probabilityOfClustering: number
  maxNodes: number
  clusterRows: MiningClusterRow[]
  scaleRange?: { min: number; max: number } | null
  massRangeScu?: { min: number; max: number } | null
}

export interface MiningOreSpawnProfile {
  oreName: string
  baseSignature: number
  depositTypes: DepositType[]
  overallByType: Partial<Record<DepositType, MiningClusterDisplayProfile>>
  locations: Record<string, MiningLocationSpawnProfile>
  harvestablePresets: string[]
  compositionRecordIds: string[]
  clusterPresetKeys: string[]
}

export interface GameMiningSpawnsData {
  _source: string
  _extracted: string
  clusterPresets: Record<string, unknown>
  ores: Record<string, MiningOreSpawnProfile>
  audit: {
    unmappedHppLinks: unknown[]
    oresMissingProfile: string[]
  }
  summary: {
    signatureOres: number
    oresWithProfiles: number
    totalSpawnLinks: number
    totalLocationProfiles: number
  }
}

export interface FpsWeapon {
  id: string
  name: string
  displayName: string
  type: string
  size: number
  fireRate: number
  idealCombatRange: number
  maxFiringRange: number
  damageMultiplier: number
  combatRangeCategory: string
  tags: string
}

export interface GameFpsWeaponsData {
  _source: string
  _extracted: string
  weapons: FpsWeapon[]
  summary: {
    totalWeapons: number
  }
}

// ============================================================================
// DATA IMPORTS
// ============================================================================

import gameMiningLocationsData from './game-mining-locations.json'
import gameComponentsData from './game-components.json'
import gameOrdnanceData from './game-ordnance.json'
import gameBlueprintMissionsData from './game-blueprint-missions.json'
import gameManufacturersData from './game-manufacturers.json'
import gameReputationData from './game-reputation.json'
import gameLoreData from './game-lore.json'
import gameMiningData from './game-mining.json'
import gameMiningSpawnsData from './game-mining-spawns.json'
import gameFpsWeaponsData from './game-fps-weapons.json'

// Cast to proper types
export const miningLocations = gameMiningLocationsData as MiningLocationsData
export const gameComponents = gameComponentsData as GameComponentsData
export const gameOrdnance = gameOrdnanceData as GameOrdnanceData
export const blueprintMissions = gameBlueprintMissionsData as GameBlueprintMissionsData
export const manufacturers = gameManufacturersData as GameManufacturersData
export const reputation = gameReputationData as GameReputationData
export const lore = gameLoreData as GameLoreData
export const gameMining = gameMiningData as GameMiningData
export const miningSpawns = gameMiningSpawnsData as GameMiningSpawnsData
export const fpsWeapons = gameFpsWeaponsData as GameFpsWeaponsData

// Legacy aliases for backward compatibility
export const ordnance = gameOrdnance

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all locations where a specific ore can be found
 */
export function getOreLocations(oreName: string): string[] {
  return miningLocations.oreLocations[oreName] ?? []
}

/**
 * Get all ores available at a specific location
 */
export function getLocationOres(location: string): { name: string; rarity: string }[] {
  return miningLocations.locationOres[location] ?? []
}

/**
 * Get ore rarity tier
 */
export function getOreRarity(oreName: string): string | null {
  for (const [rarity, ores] of Object.entries(miningLocations.rarityTiers)) {
    if (ores.some(o => o.name.toLowerCase() === oreName.toLowerCase())) {
      return rarity
    }
  }
  return null
}

/**
 * Find components by criteria
 */
export function findComponents(criteria: {
  type?: string
  manufacturer?: string
  size?: number
  grade?: number
}): GameComponent[] {
  let results = gameComponents.components

  if (criteria.type) {
    results = results.filter(c => c.type === criteria.type)
  }
  if (criteria.manufacturer) {
    results = results.filter(c => 
      c.manufacturer === criteria.manufacturer || 
      c.manufacturerCode === criteria.manufacturer
    )
  }
  if (criteria.size !== undefined) {
    results = results.filter(c => c.size === criteria.size)
  }
  if (criteria.grade !== undefined) {
    results = results.filter(c => c.grade === criteria.grade)
  }

  return results
}

/**
 * Get component by name
 */
export function getComponentByName(name: string): GameComponent | null {
  const normalized = name.toLowerCase()
  return gameComponents.components.find(c => 
    c.displayName.toLowerCase() === normalized ||
    c.name.toLowerCase().includes(normalized)
  ) ?? null
}

/**
 * Find ordnance by criteria
 */
export function findOrdnance(criteria: {
  guidance?: string
  size?: number
  type?: 'Missile' | 'Torpedo'
  isGimbal?: boolean
}): OrdnanceItem[] {
  let results = gameOrdnance.ordnance

  if (criteria.guidance) {
    results = results.filter(o => 
      o.guidance === criteria.guidance || 
      o.guidanceCode === criteria.guidance
    )
  }
  if (criteria.size !== undefined) {
    results = results.filter(o => o.size === criteria.size)
  }
  if (criteria.type) {
    results = results.filter(o => o.type === criteria.type)
  }
  if (criteria.isGimbal !== undefined) {
    results = results.filter(o => o.isGimbal === criteria.isGimbal)
  }

  return results
}

/**
 * Get blueprints for a mission
 */
export function getMissionBlueprints(missionKey: string): GameBlueprintMission[] {
  return blueprintMissions.missionBlueprints[missionKey] ?? []
}

/**
 * Get missions that can reward a blueprint
 */
export function getBlueprintMissions(blueprintName: string): string[] {
  return blueprintMissions.blueprintMissions[blueprintName] ?? []
}

/**
 * Get manufacturer by code
 */
export function getManufacturer(code: string): GameManufacturer | null {
  return manufacturers.manufacturers[code.toUpperCase()] ?? null
}

/**
 * Get all manufacturer codes
 */
export function getAllManufacturers(): string[] {
  return Object.keys(manufacturers.manufacturers)
}

/**
 * Get all component types
 */
export function getAllComponentTypes(): string[] {
  return Object.keys(gameComponents.summary.byType)
}

/**
 * Get rarity color for display
 */
export function getRarityColor(rarity: string): string {
  const colors: Record<string, string> = {
    legendary: '#ff8000', // Orange
    epic: '#a335ee',      // Purple
    rare: '#0070dd',      // Blue
    uncommon: '#1eff00',  // Green
    common: '#ffffff',    // White
    handMineable: '#ffff00' // Yellow
  }
  return colors[rarity] ?? colors.common
}

/**
 * Get lore description for a resource
 */
export function getResourceLore(resourceKey: string): string | null {
  const entry = lore.resources[resourceKey.toLowerCase()]
  return entry?.description ?? null
}

export interface ResourceLoreListEntry {
  resourceKey: string
  label: string
  description: string
  locKey: string
  kind?: 'commodity' | 'item'
}

/**
 * All game lore entries for Archive display.
 */
export function getResourceLoreEntries(): ResourceLoreListEntry[] {
  return Object.entries(lore.resources)
    .map(([resourceKey, entry]) => ({
      resourceKey,
      label: entry.label,
      description: entry.description,
      locKey: entry.key,
      kind: entry.kind,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ============================================================================
// DATA SUMMARY
// ============================================================================

export const dataSummary = {
  mining: {
    totalOres: miningLocations.summary.totalOres,
    totalLocations: miningLocations.summary.totalLocations,
  },
  miningStats: {
    elements: gameMining.summary.elements,
    lasers: gameMining.summary.lasers,
  },
  components: {
    total: gameComponents.summary.totalComponents,
    byType: gameComponents.summary.byType,
  },
  ordnance: {
    total: gameOrdnance.summary.totalOrdnance,
    missiles: gameOrdnance.summary.missiles,
    torpedoes: gameOrdnance.summary.torpedoes,
  },
  blueprints: {
    totalMissions: blueprintMissions.summary.missionsWithBlueprints,
    uniqueBlueprints: blueprintMissions.summary.uniqueBlueprints,
  },
  reputation: {
    totalFactions: reputation.summary.totalFactions,
    totalStandings: reputation.summary.totalStandings,
    totalMissions: reputation.summary.totalMissions,
  },
  manufacturers: {
    total: manufacturers.summary.totalManufacturers,
  },
  lore: {
    totalDescriptions: lore.summary.totalDescriptions,
  },
  fpsWeapons: {
    total: fpsWeapons.summary.totalWeapons,
  },
}
