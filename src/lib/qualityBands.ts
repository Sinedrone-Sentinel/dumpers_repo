/**
 * Star Citizen Quality Band System
 * 
 * Quality ranges from 0-1000 for all resources.
 * Each resource type has its own unique quality band thresholds.
 * Data is now extracted directly from game files via parse-extracted-data.mjs
 */

import { SALVAGE_ORDER_MIN_QUALITY } from '../config/extraResources'
import { stockQualityTiersForResource } from '../config/dfp'
import { isSalvageResource } from '../config/extraResources'
import { isHarvestResource } from '../config/resourceTypes'
import qualityBandsData from '../data/game-quality-bands.json'

/** Terminal-purchased stock — Q0 in UI maps to exactly Q500 for DFP (not a mined band). */
export const PURCHASED_STOCK_QUALITY = 500

/**
 * Resource-specific quality bands (8 bands per resource)
 * Key is the normalized resource name (lowercase)
 * Value is array of 8 mapped values (thresholds)
 */
export const RESOURCE_QUALITY_BANDS: Record<string, number[]> = qualityBandsData.bandThresholds

/**
 * Full band data including start/end ranges
 */
export const RESOURCE_QUALITY_BANDS_FULL = qualityBandsData.qualityBands

/**
 * Quality distribution data by mineable type
 */
export const QUALITY_DISTRIBUTION = qualityBandsData.qualityDistribution

/**
 * Normalize a resource name to match lookup keys
 */
export function normalizeResourceName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical suffixes like "(Ore)", "(Raw)"
    .replace(/^raw\s+/i, '') // Remove "Raw " prefix
    .replace(/\s+/g, '') // Remove spaces
    .replace(/_/g, '') // Remove underscores
    .trim()
}

/**
 * Known spelling variations/aliases in game data
 */
const RESOURCE_ALIASES: Record<string, string> = {
  'quantanium': 'quantainium',  // Blueprint uses "Quantanium", game uses "Quantainium"
  'aluminium': 'aluminum',      // RS Tracker / UK spelling vs game "Aluminum" bands
  'pressurizedice': 'rawice',   // Pressurized_Ice maps to RawIce
  'yormandieye': 'beryl',       // Yormandi Eye is a variant of Beryl (use Beryl's bands)
  'yormanditongue': 'beryl',    // Yormandi Tongue — harvest item, bands unused (Q0 only)
  'sileron': 'stileron',        // Game composition typo vs quality band key
}

/**
 * Get quality bands for a specific resource
 * Returns undefined if no bands are available for this resource
 */
export function getResourceBands(resourceName: string): number[] | undefined {
  const normalized = normalizeResourceName(resourceName)
  
  // Check alias first
  const aliased = RESOURCE_ALIASES[normalized] || normalized
  
  // Try direct match
  if (RESOURCE_QUALITY_BANDS[aliased]) {
    return RESOURCE_QUALITY_BANDS[aliased]
  }
  
  // Try common variations
  const variations = [
    aliased,
    aliased.replace('ore', ''),
    aliased.replace('raw', ''),
    `raw${aliased}`,
  ]
  
  for (const v of variations) {
    if (RESOURCE_QUALITY_BANDS[v]) {
      return RESOURCE_QUALITY_BANDS[v]
    }
  }
  
  return undefined
}

/**
 * Check if a resource has known quality bands
 */
export function hasKnownBands(resourceName: string): boolean {
  return getResourceBands(resourceName) !== undefined
}

/**
 * Default quality value for UI components when no bands are known
 */
export const DEFAULT_QUALITY = 500

/** 0-based index into band threshold arrays; Band 2 is the default picker tier. */
export const DEFAULT_QUALITY_BAND_INDEX = 1

/** Default quality value for a resource (Band 2 when bands are known). */
export function getDefaultBandQuality(resourceName: string): number {
  const bands = getResourceBands(resourceName)
  if (bands && bands.length > 0) {
    return bands[DEFAULT_QUALITY_BAND_INDEX] ?? bands[0]
  }
  return DEFAULT_QUALITY
}

/**
 * Quality tier classification based on approximate ranges
 */
export type QualityTier = 'low' | 'mid' | 'good' | 'high' | 'premium'

export function getQualityTier(quality: number): QualityTier {
  if (quality < 400) return 'low'
  if (quality < 700) return 'mid'
  if (quality < 850) return 'good'
  if (quality < 950) return 'high'
  return 'premium'
}

/**
 * Get CSS color class for a quality tier
 */
export function getQualityTierColor(tier: QualityTier): string {
  switch (tier) {
    case 'low':
      return 'text-slate-400'
    case 'mid':
      return 'text-blue-400'
    case 'good':
      return 'text-green-400'
    case 'high':
      return 'text-purple-400'
    case 'premium':
      return 'text-amber-400'
  }
}

/**
 * Get the band tier (1-8) for a quality value within a resource's bands
 */
export function getBandTier(quality: number, bands: number[]): number {
  for (let i = 0; i < bands.length; i++) {
    if (quality <= bands[i]) return i + 1
  }
  return 8
}

/**
 * Get the band range (start-end) for a quality value
 */
export function getBandRange(resourceName: string, quality: number): { start: number; end: number; mappedValue: number } | null {
  const normalized = normalizeResourceName(resourceName)
  const fullData = RESOURCE_QUALITY_BANDS_FULL[normalized as keyof typeof RESOURCE_QUALITY_BANDS_FULL]
  
  if (!fullData?.bands) return null
  
  for (const band of fullData.bands) {
    if (quality >= band.start && quality <= band.end) {
      return band
    }
  }
  
  return null
}

/**
 * Get all available resource names with quality bands
 */
export function getAllResourcesWithBands(): string[] {
  return Object.keys(RESOURCE_QUALITY_BANDS)
}

/** True when a resource normally has mined/refined quality tiers (not salvage-only Q0). */
export function supportsPurchasedQuality(resourceKey: string, label?: string): boolean {
  return stockQualityTiersForResource(resourceKey, label).length > 1
}

/** Valid ledger/calculator quality values for a resource (Purchased Q0 + bands, or stock tiers). */
export function getLedgerQualityOptions(resourceKey: string, resourceLabel: string): number[] {
  const tiers = stockQualityTiersForResource(resourceKey, resourceLabel)
  const selectedIsSalvage = tiers.length === 1 && tiers[0] === SALVAGE_ORDER_MIN_QUALITY
  if (selectedIsSalvage) return [SALVAGE_ORDER_MIN_QUALITY]

  const bands = getResourceBands(resourceLabel)
  const showPurchased = supportsPurchasedQuality(resourceKey, resourceLabel)
  if (bands && bands.length > 0) {
    return [...(showPurchased ? [PURCHASED_STOCK_QUALITY] : []), ...bands]
  }
  return [...tiers]
}

/** Snap quality to a known band tier (Q0 + game bands, or stock tiers) for ledger storage. */
export function resolveLedgerQuality(
  resourceKey: string,
  resourceLabel: string,
  quality: number
): number {
  const options = getLedgerQualityOptions(resourceKey, resourceLabel)
  if (options.includes(quality)) return quality

  if (quality === PURCHASED_STOCK_QUALITY && options.includes(PURCHASED_STOCK_QUALITY)) {
    return PURCHASED_STOCK_QUALITY
  }

  const bands = getResourceBands(resourceLabel)
  if (bands && bands.length > 0) {
    let closest = bands[0]
    let minDist = Math.abs(quality - closest)
    for (const band of bands) {
      const dist = Math.abs(quality - band)
      if (dist < minDist) {
        minDist = dist
        closest = band
      }
    }
    return closest
  }

  let closest = options[0] ?? DEFAULT_QUALITY
  let minDist = Math.abs(quality - closest)
  for (const tier of options) {
    const dist = Math.abs(quality - tier)
    if (dist < minDist) {
      minDist = dist
      closest = tier
    }
  }
  return closest
}

/** User-facing quality label for Resource Tracker stock cards and add panel preview. */
export function formatInventoryQualityLabel(resourceKey: string, quality: number): string {
  if (isSalvageResource(resourceKey)) return 'Q0 (salvage)'
  if (isHarvestResource(resourceKey)) return 'Harvest'
  if (quality === PURCHASED_STOCK_QUALITY) return 'Purchased (Q0)'
  return `Q${quality}`
}
