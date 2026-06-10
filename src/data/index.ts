/**
 * Master Data Index
 * Central access point for all structured game data
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface OreLocation {
  name: string
  locations: string[]
}

export interface MiningData {
  _source: string
  _extracted: string
  rarityTiers: {
    legendary: OreLocation[]
    epic: OreLocation[]
    rare: OreLocation[]
    uncommon: OreLocation[]
    common: OreLocation[]
    handMineable: OreLocation[]
  }
  oreLocations: Record<string, { rarity: string; locations: string[] }>
  locationOres: Record<string, { name: string; rarity: string }[]>
  rarityOrder: string[]
}

export interface ComponentData {
  internalId: string
  displayName: string
  type: string
  typeCode: string
  manufacturer: string
  manufacturerCode: string
  size: number
  class: string
  classCode: string
  grade: string
  gradeRank: number
  fullLabel: string
}

export interface ComponentTypes {
  _source: string
  _extracted: string
  components: ComponentData[]
  componentsByType: Record<string, ComponentData[]>
  componentsByManufacturer: Record<string, ComponentData[]>
  componentsByClass: Record<string, ComponentData[]>
  metadata: {
    manufacturerCodes: Record<string, string>
    typeCodes: Record<string, string>
    classCodes: Record<string, string>
    gradeOrder: string[]
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

export interface OrdnanceData {
  _source: string
  _extracted: string
  ordnance: OrdnanceItem[]
  ordnanceByGuidance: Record<string, OrdnanceItem[]>
  ordnanceBySize: Record<number, OrdnanceItem[]>
  metadata: {
    guidanceCodes: Record<string, string>
    sizeRanges: {
      missile: number[]
      torpedo: number[]
    }
  }
}

export interface BlueprintPool {
  contractKey: string
  blueprints: string[]
  standingTier: string
}

export interface ContractBlueprints {
  _source: string
  _extracted: string
  blueprintPools: BlueprintPool[]
  standingTierBlueprints: Record<string, string[]>
  blueprintStandings: Record<string, { minStanding: string; contracts: string[] }>
  reputationAmounts: number[]
  summary: {
    totalPoolsFound: number
    uniqueBlueprintsFound: number
  }
}

export interface StarstringsGlobal {
  _source: string
  _extracted: string
  standingLevels: {
    lawful: string[]
    unlawful: string[]
  }
  contractTypeCounts: Record<string, number>
  bpMissions: {
    totalBpTagged: number
    conditionalBp: number
    guaranteedBp: number
  }
}

// ============================================================================
// DATA IMPORTS
// ============================================================================

import miningLocationsData from './mining-locations.json'
import componentTypesData from './component-types.json'
import ordnanceData from './ordnance.json'
import contractBlueprintsData from './contract-blueprints.json'
import starstringsGlobalData from './starstrings-global.json'

// Cast to proper types
export const miningLocations = miningLocationsData as MiningData
export const componentTypes = componentTypesData as ComponentTypes
export const ordnance = ordnanceData as OrdnanceData
export const contractBlueprints = contractBlueprintsData as ContractBlueprints
export const starstringsGlobal = starstringsGlobalData as StarstringsGlobal

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all locations where a specific ore can be found
 */
export function getOreLocations(oreName: string): string[] {
  const ore = miningLocations.oreLocations[oreName]
  return ore?.locations ?? []
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
  return miningLocations.oreLocations[oreName]?.rarity ?? null
}

/**
 * Find components by criteria
 */
export function findComponents(criteria: {
  type?: string
  manufacturer?: string
  class?: string
  size?: number
  grade?: string
}): ComponentData[] {
  let results = componentTypes.components

  if (criteria.type) {
    results = results.filter(c => c.type === criteria.type || c.typeCode === criteria.type)
  }
  if (criteria.manufacturer) {
    results = results.filter(c => 
      c.manufacturer === criteria.manufacturer || 
      c.manufacturerCode === criteria.manufacturer
    )
  }
  if (criteria.class) {
    results = results.filter(c => c.class === criteria.class || c.classCode === criteria.class)
  }
  if (criteria.size !== undefined) {
    results = results.filter(c => c.size === criteria.size)
  }
  if (criteria.grade) {
    results = results.filter(c => c.grade === criteria.grade)
  }

  return results
}

/**
 * Get component by name
 */
export function getComponentByName(name: string): ComponentData | null {
  const normalized = name.toLowerCase()
  return componentTypes.components.find(c => 
    c.displayName.toLowerCase() === normalized ||
    c.internalId.toLowerCase().includes(normalized)
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
  let results = ordnance.ordnance

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
 * Get blueprints available at a standing tier
 */
export function getBlueprintsAtStanding(tier: string): string[] {
  return contractBlueprints.standingTierBlueprints[tier] ?? []
}

/**
 * Get standing requirement for a blueprint
 */
export function getBlueprintStanding(blueprintName: string): string | null {
  return contractBlueprints.blueprintStandings[blueprintName]?.minStanding ?? null
}

/**
 * Get all unique manufacturers
 */
export function getAllManufacturers(): string[] {
  return Object.keys(componentTypes.componentsByManufacturer)
}

/**
 * Get all component types
 */
export function getAllComponentTypes(): string[] {
  return Object.keys(componentTypes.componentsByType)
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

// ============================================================================
// DATA SUMMARY
// ============================================================================

export const dataSummary = {
  mining: {
    totalOres: Object.keys(miningLocations.oreLocations).length,
    totalLocations: Object.keys(miningLocations.locationOres).length,
  },
  components: {
    total: componentTypes.components.length,
    types: Object.keys(componentTypes.componentsByType).length,
    manufacturers: Object.keys(componentTypes.componentsByManufacturer).length,
  },
  ordnance: {
    total: ordnance.ordnance.length,
    missiles: ordnance.ordnance.filter(o => o.type === 'Missile').length,
    torpedoes: ordnance.ordnance.filter(o => o.type === 'Torpedo').length,
  },
  blueprints: {
    totalPools: contractBlueprints.summary.totalPoolsFound,
    uniqueBlueprints: contractBlueprints.summary.uniqueBlueprintsFound,
  },
}
