import gameMiningSpawnsData from '../data/game-mining-spawns.json'
import type { MiningTrackerEntry } from './localGuestCache'
import { normalizeMiningOreName } from './miningOreCanonical'
import { isGuideLocationListOnlyOre } from './handMineables'
import {
  formatOverallTagLabel,
  getSpawnKeysForGuideLocation,
  isAsteroidFieldGuideLocation,
  isBroadGuideLocation,
  isSurfaceBodyGuideLocation,
  spawnKeyMatchesGuideLocation,
} from './miningLocationAliases'
import {
  getDisplayNameForSpawnKey,
  getPrimaryCompendiumGuideName,
  getSystemForGuideLocation,
} from './miningLocationNames'

export type DepositType = 'surface' | 'asteroid'
export type ProfileMode = 'overall' | 'location'

export interface ClusterRow {
  nodes: number
  rs: number
  chancePercent: number
  bestAtLocation?: string
  bestAtLocationDisplayName?: string
  minProximity?: number
  maxProximity?: number
}

export interface ClusterDisplayProfile {
  maxNodes: number
  clusterRows: ClusterRow[]
  bestLocation?: string
  bestLocationDisplayName?: string
  bestLocationSpawnPercent?: number
  scaleRange?: { min: number; max: number } | null
  scannerMassRange?: { min: number; max: number } | null
}

export interface CompositionPart {
  elementName: string
  minPercentage: number
  maxPercentage: number
  qualityScale: number
}

export interface LocationSpawnProfile {
  locationName: string
  spawnKey?: string
  displayName?: string
  guideName?: string
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
  compositionParts: CompositionPart[]
  clusterPresetKey: string
  probabilityOfClustering: number
  maxNodes: number
  clusterRows: ClusterRow[]
  scaleRange?: { min: number; max: number } | null
  scannerMassRange?: { min: number; max: number } | null
}

export interface OreSpawnProfile {
  oreName: string
  baseSignature: number
  depositTypes: DepositType[]
  overallByType: Partial<Record<DepositType, ClusterDisplayProfile>>
  locations: Record<string, LocationSpawnProfile>
  harvestablePresets: string[]
  compositionRecordIds: string[]
  clusterPresetKeys: string[]
}

export interface FormattedClusterDisplay {
  baseRs: number
  rows: Array<{ nodes: number; rs: number; chancePercent: number }>
  profile: ClusterDisplayProfile | LocationSpawnProfile
}

const spawns = gameMiningSpawnsData as {
  ores?: Record<string, OreSpawnProfile>
}

function getOreProfile(oreName: string): OreSpawnProfile | null {
  const canonical = normalizeMiningOreName(oreName)
  return spawns.ores?.[canonical] ?? null
}

export function getDepositTypes(oreName: string): DepositType[] {
  return getOreProfile(oreName)?.depositTypes ?? []
}

export function getOverallProfile(
  oreName: string,
  depositType: DepositType
): ClusterDisplayProfile | null {
  return getOreProfile(oreName)?.overallByType[depositType] ?? null
}

/** Optional chip/modal scope — Best-at must stay inside this system / site. */
export interface SpawnScope {
  system?: string
  guideLocationName?: string
}

export function spawnScopeForGuideLocation(guideLocationName: string): SpawnScope {
  const system = getSystemForGuideLocation(guideLocationName)
  return {
    guideLocationName,
    system: system && system !== 'Unknown' ? system : undefined,
  }
}

/**
 * Deposit types a guide chip may show at this site.
 * Asteroid-field names stay asteroid-only; planetary buckets stay surface-only.
 */
export function depositTypesForOreAtGuideLocation(
  oreName: string,
  rarity: string,
  location: string
): DepositType[] {
  if (isGuideLocationListOnlyOre(oreName, rarity)) return ['surface']

  if (isAsteroidFieldGuideLocation(location)) {
    const profiles = getGuideLocationProfiles(oreName, location)
    if (profiles.length > 0) return ['asteroid']
    if (isBroadGuideLocation(location) && getDepositTypes(oreName).includes('asteroid')) {
      return ['asteroid']
    }
    if (!isBroadGuideLocation(location)) return ['asteroid']
    return []
  }

  if (isSurfaceBodyGuideLocation(location)) {
    const profiles = getGuideLocationProfiles(oreName, location)
    if (profiles.some((p) => p.depositType === 'surface')) return ['surface']
    if (profiles.length === 0 && getDepositTypes(oreName).includes('surface')) return ['surface']
    return []
  }

  const profiles = getGuideLocationProfiles(oreName, location)
  if (profiles.length === 0) return ['surface']
  return [...new Set(profiles.map((p) => p.depositType))]
}

function profilesForScope(
  oreName: string,
  depositType: DepositType,
  scope?: SpawnScope
): LocationSpawnProfile[] {
  let pool = getLocationProfilesForOre(oreName)

  if (scope?.guideLocationName) {
    const atSite = getGuideLocationProfiles(oreName, scope.guideLocationName)
    if (atSite.length > 0) {
      pool = atSite
    } else if (!(isBroadGuideLocation(scope.guideLocationName) && scope.system)) {
      pool = []
    }
  }

  if (scope?.system) {
    pool = pool.filter((p) => p.system === scope.system)
  }

  if (scope?.guideLocationName && isAsteroidFieldGuideLocation(scope.guideLocationName)) {
    return pool
  }
  if (scope?.guideLocationName && isSurfaceBodyGuideLocation(scope.guideLocationName)) {
    return pool.filter((p) => p.depositType === 'surface')
  }
  return pool.filter((p) => p.depositType === depositType)
}

function pickBestScopedProfile(
  pool: LocationSpawnProfile[],
  guideLocationName?: string
): LocationSpawnProfile {
  const labeled = guideLocationName
    ? pool.filter((p) => (p.displayName ?? p.guideName) !== guideLocationName)
    : pool
  const candidates = labeled.length > 0 ? labeled : pool
  return candidates.reduce((best, loc) =>
    loc.effectiveSpawnPercent > best.effectiveSpawnPercent ? loc : best
  )
}

function displayNameForScopedBest(
  best: LocationSpawnProfile,
  guideLocationName?: string
): string | undefined {
  const display = best.displayName ?? best.guideName
  if (!display) return undefined
  if (guideLocationName && display === guideLocationName) return undefined
  return display
}

/**
 * Overall cluster/best-at for a chip. When scoped, never fall back to another system.
 */
export function getScopedOverallProfile(
  oreName: string,
  depositType: DepositType,
  scope?: SpawnScope
): ClusterDisplayProfile | null {
  if (!scope?.system && !scope?.guideLocationName) {
    return getOverallProfile(oreName, depositType)
  }

  const pool = profilesForScope(oreName, depositType, scope)
  if (pool.length === 0) return null

  const best = pickBestScopedProfile(pool, scope.guideLocationName)
  return {
    maxNodes: Math.max(...pool.map((p) => p.maxNodes)),
    clusterRows: best.clusterRows,
    bestLocation: best.spawnKey ?? best.locationName,
    bestLocationDisplayName: displayNameForScopedBest(best, scope.guideLocationName),
    bestLocationSpawnPercent: best.effectiveSpawnPercent,
    scaleRange: best.scaleRange,
    scannerMassRange: best.scannerMassRange,
  }
}

export function getLocationProfile(
  oreName: string,
  locationName: string,
  depositType?: DepositType
): LocationSpawnProfile | null {
  if (isBroadGuideLocation(locationName)) return null

  const profile = getOreProfile(oreName)
  if (!profile) return null

  const spawnKeys = getSpawnKeysForGuideLocation(locationName)

  const matches = Object.values(profile.locations ?? {}).filter(
    (loc) =>
      (loc.guideName === locationName ||
        spawnKeys.includes(loc.locationName) ||
        loc.locationName === locationName) &&
      (!depositType ||
        loc.depositType === depositType ||
        isAsteroidFieldGuideLocation(locationName))
  )
  if (matches.length === 0) return null
  const exact = matches.filter((loc) => loc.guideName === locationName)
  const pool = exact.length > 0 ? exact : matches
  return pool.reduce((best, loc) =>
    loc.effectiveSpawnPercent > best.effectiveSpawnPercent ? loc : best
  )
}

export function getLocationProfilesForOre(oreName: string): LocationSpawnProfile[] {
  const profile = getOreProfile(oreName)
  if (!profile?.locations) return []
  return Object.values(profile.locations)
}

export function getGuideLocationProfiles(
  oreName: string,
  guideLocationName: string
): LocationSpawnProfile[] {
  const matched = getLocationProfilesForOre(oreName).filter(
    (loc) =>
      loc.guideName === guideLocationName ||
      spawnKeyMatchesGuideLocation(loc.locationName, guideLocationName)
  )
  // Compound guide keys (e.g. Hurston → Stanton1 + moons) must not fan out to
  // child-body spawn profiles when the card already lists those moons separately.
  const exact = matched.filter((loc) => loc.guideName === guideLocationName)
  return exact.length > 0 ? exact : matched
}

export function getTrackerProfile(entry: MiningTrackerEntry): FormattedClusterDisplay | null {
  const ore = getOreProfile(entry.oreName)
  if (!ore) return null

  const depositType: DepositType = entry.depositType === 'asteroid' ? 'asteroid' : 'surface'

  if (entry.profileMode === 'location' && entry.locationName) {
    const locProfile = getLocationProfile(entry.oreName, entry.locationName, depositType)
    if (locProfile) return formatClusterRows(locProfile, ore.baseSignature)
    return null
  }

  const overall = getOverallProfile(entry.oreName, depositType)
  if (overall) return formatClusterRows(overall, ore.baseSignature)
  return null
}

export function formatClusterRows(
  profile: ClusterDisplayProfile | LocationSpawnProfile,
  baseSignature?: number
): FormattedClusterDisplay {
  const clusterRows = profile.clusterRows ?? []
  const resolvedBase =
    baseSignature != null && Number.isFinite(baseSignature) && baseSignature > 0
      ? baseSignature
      : clusterRows[0]?.nodes &&
          clusterRows[0]?.rs != null &&
          Number.isFinite(clusterRows[0].rs)
        ? Math.round(clusterRows[0].rs / clusterRows[0].nodes)
        : 0

  const baseRs = resolvedBase

  return {
    baseRs,
    rows: clusterRows.map((row) => ({
      nodes: row.nodes,
      rs:
        row.rs != null && Number.isFinite(row.rs)
          ? row.rs
          : resolvedBase > 0 && row.nodes
            ? resolvedBase * row.nodes
            : 0,
      chancePercent: row.chancePercent,
    })),
    profile,
  }
}

export type SpawnTagTier = 'best' | 'high' | 'medium' | 'low' | 'trace' | 'broad'

export function getOverallSpawnTag(
  oreName: string,
  depositType: DepositType,
  scope?: SpawnScope
): { label: string; tier: SpawnTagTier } {
  const overall = getScopedOverallProfile(oreName, depositType, scope)
  if (!overall) return { label: 'Overall', tier: 'broad' }
  return {
    label: formatOverallTagLabel(overall.bestLocation, overall.bestLocationDisplayName),
    tier: 'broad',
  }
}

export function getLocationSpawnTag(
  oreName: string,
  locationName: string,
  depositType: DepositType
): { label: string; tier: SpawnTagTier } {
  if (isBroadGuideLocation(locationName)) {
    return getOverallSpawnTag(oreName, depositType, spawnScopeForGuideLocation(locationName))
  }

  const loc = getLocationProfile(oreName, locationName, depositType)
  if (!loc) return { label: 'Broad spawn', tier: 'broad' }

  const allOfType = getLocationProfilesForOre(oreName).filter(
    (l) => l.depositType === depositType
  )
  const maxSpawn = Math.max(...allOfType.map((l) => l.effectiveSpawnPercent), 0)
  const pct = loc.effectiveSpawnPercent

  if (pct >= maxSpawn && maxSpawn > 0) {
    return { label: 'Best', tier: 'best' }
  }
  if (pct >= 1) return { label: `${pct.toFixed(1)}% spawn`, tier: 'high' }
  if (pct >= 0.3) return { label: `${pct.toFixed(2)}% spawn`, tier: 'medium' }
  // Real but effectively negligible odds — don't round down to a confusing "0.00%".
  if (pct < 0.01) return { label: 'trace spawn (<0.01%)', tier: 'trace' }
  return { label: `${pct.toFixed(2)}% spawn`, tier: 'low' }
}

export function isLocationTrackerEntry(entry: MiningTrackerEntry): boolean {
  return entry.profileMode === 'location' && Boolean(entry.locationName)
}

export function getTrackerSubtitle(entry: MiningTrackerEntry): string {
  const depositType: DepositType = entry.depositType === 'asteroid' ? 'asteroid' : 'surface'

  if (isLocationTrackerEntry(entry) && entry.locationName) {
    return `Spawn & cluster · ${entry.locationName}`
  }
  const overall = getOverallProfile(entry.oreName, depositType)
  if (overall) {
    return formatOverallTagLabel(overall.bestLocation, overall.bestLocationDisplayName)
  }
  return 'Overall'
}

export function getTrackerProfileMissingMessage(entry: MiningTrackerEntry): string | null {
  if (!isLocationTrackerEntry(entry) || !entry.locationName) return null
  if (isBroadGuideLocation(entry.locationName)) return null
  const depositType: DepositType = entry.depositType === 'asteroid' ? 'asteroid' : 'surface'
  if (getLocationProfile(entry.oreName, entry.locationName, depositType)) return null
  return `No spawn profile on file for ${entry.locationName}`
}

export function depositTypeLabel(depositType: DepositType): string {
  return depositType === 'surface' ? 'Surface' : 'Asteroid'
}

export function depositTypeUpper(depositType: DepositType | undefined): string {
  return depositType === 'asteroid' ? 'ASTEROID' : 'SURFACE'
}

export interface RockCompositionProfile {
  compositionParts: CompositionPart[]
  sourceLabel: string
  depositType: DepositType
}

export interface RockCalculatorLocationOption {
  /** Guide/spawn key passed to getLocationProfile. */
  value: string
  label: string
}

/** Every distinct site where this ore spawns for the given deposit type (sorted A–Z). */
export function getRockCalculatorLocationOptions(
  oreName: string,
  depositType: DepositType
): RockCalculatorLocationOption[] {
  const profiles = getLocationProfilesForOre(oreName).filter(
    (loc) => loc.depositType === depositType && loc.compositionParts?.length
  )

  const seen = new Set<string>()
  const options: RockCalculatorLocationOption[] = []

  for (const loc of profiles) {
    const label = loc.displayName ?? loc.guideName ?? loc.locationName
    // Site-specific spawn key — never broad guide buckets (e.g. "Pyro Asteroid Clusters").
    const value = loc.spawnKey ?? loc.locationName
    if (seen.has(value)) continue
    seen.add(value)
    options.push({ value, label })
  }

  return options.sort((a, b) => a.label.localeCompare(b.label))
}

/** Match a spawn key or guide label to a Rock Calculator location dropdown option. */
export function findRockCalculatorLocationOption(
  oreName: string,
  depositType: DepositType,
  locationRef: string,
  options: RockCalculatorLocationOption[]
): RockCalculatorLocationOption | undefined {
  if (!locationRef || options.length === 0) return undefined

  const direct = options.find((opt) => opt.value === locationRef || opt.label === locationRef)
  if (direct) return direct

  const loc = getLocationProfile(oreName, locationRef, depositType)
  if (loc) {
    const siteKey = loc.spawnKey ?? loc.locationName
    const bySiteKey = options.find((opt) => opt.value === siteKey)
    if (bySiteKey) return bySiteKey

    const candidates = [loc.guideName, loc.locationName, loc.displayName, loc.spawnKey].filter(
      Boolean
    ) as string[]
    const byProfile = options.find(
      (opt) => candidates.includes(opt.value) || candidates.includes(opt.label)
    )
    if (byProfile) return byProfile
  }

  const displayName = getDisplayNameForSpawnKey(locationRef)
  if (displayName && displayName !== locationRef) {
    const byDisplay = options.find((opt) => opt.value === displayName || opt.label === displayName)
    if (byDisplay) return byDisplay
  }

  const guideName = getPrimaryCompendiumGuideName(locationRef)
  if (guideName) {
    return options.find((opt) => opt.value === guideName || opt.label === guideName)
  }

  return undefined
}

/** Preferred Rock Calculator site when loading a tracked ore card (overall → best spawn). */
export function resolveRockCalculatorLocationFromEntry(
  entry: MiningTrackerEntry | null,
  oreName: string,
  depositType: DepositType,
  locationOptions: RockCalculatorLocationOption[]
): RockCalculatorLocationOption | undefined {
  if (!entry || entry.oreName !== oreName || locationOptions.length === 0) return undefined

  const entryDeposit: DepositType = entry.depositType === 'asteroid' ? 'asteroid' : 'surface'
  if (entryDeposit !== depositType) return undefined

  if (entry.profileMode === 'location' && entry.locationName) {
    return findRockCalculatorLocationOption(
      oreName,
      depositType,
      entry.locationName,
      locationOptions
    )
  }

  if (entry.profileMode === 'overall') {
    const overall = getOverallProfile(oreName, depositType)
    if (overall?.bestLocation) {
      return findRockCalculatorLocationOption(
        oreName,
        depositType,
        overall.bestLocation,
        locationOptions
      )
    }
  }

  return undefined
}

function rockProfileFromLocation(
  loc: LocationSpawnProfile | null,
  depositType: DepositType
): RockCompositionProfile | null {
  if (!loc?.compositionParts?.length) return null
  return {
    compositionParts: loc.compositionParts,
    sourceLabel: loc.displayName ?? loc.guideName ?? loc.locationName,
    depositType,
  }
}

/** Resolve preset rock composition for the Rock Calculator (mirrors tracker profile rules). */
export function getRockCompositionProfile(
  oreName: string,
  depositType: DepositType,
  options?: { profileMode?: ProfileMode; locationName?: string }
): RockCompositionProfile | null {
  if (options?.profileMode === 'location' && options.locationName) {
    return rockProfileFromLocation(
      getLocationProfile(oreName, options.locationName, depositType),
      depositType
    )
  }

  const overall = getOverallProfile(oreName, depositType)
  if (overall?.bestLocation) {
    const fromBest = rockProfileFromLocation(
      getLocationProfile(oreName, overall.bestLocation, depositType),
      depositType
    )
    if (fromBest) return fromBest
  }

  const candidates = getLocationProfilesForOre(oreName).filter(
    (loc) => loc.depositType === depositType && loc.compositionParts?.length
  )
  if (candidates.length === 0) return null

  const best = candidates.reduce((a, b) =>
    a.effectiveSpawnPercent > b.effectiveSpawnPercent ? a : b
  )
  return rockProfileFromLocation(best, depositType)
}

export function getRockCompositionProfileForEntry(
  entry: MiningTrackerEntry
): RockCompositionProfile | null {
  const depositType: DepositType = entry.depositType === 'asteroid' ? 'asteroid' : 'surface'
  return getRockCompositionProfile(entry.oreName, depositType, {
    profileMode: entry.profileMode,
    locationName: entry.locationName,
  })
}

export { spawns as miningSpawnData }
