import type { MiningData } from '../hooks/useArchiveData'
import { miningLocations } from '../data'
import { MINING_RARITY_ORDER } from './miningConstants'
import { isHandMineableType, normalizeMiningOreName } from './handMineables'
import { LOCATION_SYSTEMS } from './miningConstants'
import { isBroadGuideLocation, isNonSiteBroadGuideLocation, isRedundantSubsiteGuideLocation } from './miningLocationAliases'

const RARITY_RANK = Object.fromEntries(MINING_RARITY_ORDER.map((r, i) => [r, i]))

/** When merging duplicate rows, keep ship tier (common/rare/…) over handMineable bucket. */
function pickDisplayRarity(a: string, b: string): string {
  if (a === 'handMineable' && b !== 'handMineable') return b
  if (b === 'handMineable' && a !== 'handMineable') return a
  const rankA = RARITY_RANK[a] ?? 99
  const rankB = RARITY_RANK[b] ?? 99
  return rankB < rankA ? b : a
}

function normalizeMineableLabel(label: string): string {
  return normalizeMiningOreName(label.trim())
}

/** Guide sites where extracted localization lists this ore (ship / hand / ground). */
export function getSiteMineableGuideLocations(oreName: string): string[] {
  const canonical = normalizeMiningOreName(oreName).toLowerCase()
  const sites: string[] = []

  for (const [guideLoc, mineables] of Object.entries(miningLocations.locationMineables ?? {})) {
    const labels = [
      ...(mineables.shipMineables ?? []),
      ...(mineables.handMineables ?? []),
      ...(mineables.groundVehicleMineables ?? []),
    ]
    if (labels.some((label) => normalizeMineableLabel(label).toLowerCase() === canonical)) {
      sites.push(guideLoc)
    }
  }

  return sites
}

/**
 * Locations used when indexing a specific planet/moon/station site.
 * Broad compendium buckets (e.g. "All Pyro Planets") are excluded — those are
 * not guaranteed on every body in the system.
 */
export function getSpecificGuideLocations(ore: MiningData): string[] {
  const fromCompendium = (ore.locations ?? []).filter(
    (loc) => !isBroadGuideLocation(loc) && !isRedundantSubsiteGuideLocation(loc)
  )
  const fromSiteData = getSiteMineableGuideLocations(ore.ore_name)
  return [...new Set([...fromCompendium, ...fromSiteData])]
}

/** Normalize names, merge alias duplicates (e.g. Beradon → Beradom), union locations. */
export function enrichMiningCatalog(rows: MiningData[]): MiningData[] {
  const byKey = new Map<string, MiningData>()

  for (const row of rows) {
    const ore_name = normalizeMiningOreName(row.ore_name)
    const key = ore_name.toLowerCase()
    const existing = byKey.get(key)

    const siteLocations = getSiteMineableGuideLocations(ore_name)
    const locations = [...new Set([...(row.locations ?? []), ...siteLocations])].filter(
      (loc) => !isRedundantSubsiteGuideLocation(loc)
    )

    if (!existing) {
      byKey.set(key, { ...row, ore_name, locations })
      continue
    }

    const mergedLocations = [...new Set([...(existing.locations ?? []), ...locations])]
    const rarity = pickDisplayRarity(existing.rarity, row.rarity)

    byKey.set(key, { ...existing, ore_name, locations: mergedLocations, rarity })
  }

  return Array.from(byKey.values())
}

export function countGuideRarityBucket(data: MiningData[], bucket: string): number {
  if (bucket === 'handMineable') {
    return data.filter((item) => isHandMineableType(item.ore_name)).length
  }
  return data.filter((item) => item.rarity === bucket).length
}

export function buildLocationOresMap(data: MiningData[]): Record<string, MiningData[]> {
  const map: Record<string, MiningData[]> = {}

  const addOreToLocation = (loc: string, ore: MiningData) => {
    if (!map[loc]) map[loc] = []
    if (!map[loc].some((entry) => entry.id === ore.id)) {
      map[loc].push(ore)
    }
  }

  for (const ore of data) {
    for (const loc of getSpecificGuideLocations(ore)) {
      addOreToLocation(loc, ore)
    }

    for (const loc of ore.locations ?? []) {
      if (isBroadGuideLocation(loc) && !isNonSiteBroadGuideLocation(loc)) {
        addOreToLocation(loc, ore)
      }
    }
  }

  return map
}

/** Hide location chips that would open an empty location modal. */
export function canOpenGuideLocationModal(
  location: string,
  locationOresMap: Record<string, MiningData[]>
): boolean {
  if (isNonSiteBroadGuideLocation(location)) return false
  return (locationOresMap[location]?.length ?? 0) > 0
}

/** Star system for a guide site; unmapped names are Unknown. */
export function systemForGuideLocation(location: string): string {
  return LOCATION_SYSTEMS[location] || 'Unknown'
}

const GUIDE_SYSTEM_SORT_ORDER = ['Stanton', 'Pyro', 'Nyx'] as const

/** Distinct systems present in the guide, All-button companions — canonical order then extras. */
export function collectGuideSystems(locations: readonly string[]): string[] {
  const found = new Set(locations.map(systemForGuideLocation))
  const head = GUIDE_SYSTEM_SORT_ORDER.filter((name) => found.has(name))
  const extras = [...found]
    .filter(
      (name) =>
        name !== 'Unknown' &&
        !(GUIDE_SYSTEM_SORT_ORDER as readonly string[]).includes(name)
    )
    .sort((a, b) => a.localeCompare(b))
  if (found.has('Unknown')) extras.push('Unknown')
  return [...head, ...extras]
}

export function getSortedLocations(locationOresMap: Record<string, MiningData[]>): string[] {
  return Object.keys(locationOresMap).sort((a, b) => {
    const sysA = systemForGuideLocation(a)
    const sysB = systemForGuideLocation(b)
    if (sysA !== sysB) return sysA.localeCompare(sysB)
    return a.localeCompare(b)
  })
}

export function findOreByName(data: MiningData[], oreName: string): MiningData | undefined {
  const canonical = normalizeMiningOreName(oreName).toLowerCase()
  return data.find((o) => o.ore_name.toLowerCase() === canonical)
}
