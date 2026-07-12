/**
 * Runtime lookups for mining location display names and guide↔spawn resolution.
 * Data is generated in game-mining-locations.json by parse-extracted-data.mjs.
 */

import { miningLocations } from '../data'

export interface NavMarkerGroup {
  label: string
  note?: string
  markers: string[]
}

export interface LocationAlias {
  spawnKey: string
  guideName?: string
  guideNames?: string[]
  displayName?: string
  system?: string
  source?: string
  /** In-game "how to find it" — QT markers / starmap search terms. */
  navHint?: string
  /** Structured QT marker/station lists grouped by belt/region. */
  navMarkers?: NavMarkerGroup[]
}

const locationAliases = miningLocations.locationAliases ?? {}
const guideToSpawnKeys = miningLocations.guideToSpawnKeys ?? {}

export function getLocationAlias(spawnKey: string | undefined): LocationAlias | null {
  if (!spawnKey) return null
  return locationAliases[spawnKey] ?? null
}

/** Member-facing label for an internal HPP spawn key. */
export function getDisplayNameForSpawnKey(spawnKey: string | undefined): string {
  if (!spawnKey) return 'Unknown'
  return locationAliases[spawnKey]?.displayName ?? spawnKey
}

/** All guide/starmap names associated with a spawn key (includes broad buckets and PYR nav labels). */
export function getGuideNamesForSpawnKey(spawnKey: string | undefined): string[] {
  if (!spawnKey) return []
  const alias = locationAliases[spawnKey]
  if (alias?.guideNames?.length) return alias.guideNames
  if (alias?.guideName) return [alias.guideName]
  return []
}

/** Compendium site names only — excludes broad buckets and PYR Lagrange nav labels. */
export function getCompendiumGuideNamesForSpawnKey(spawnKey: string | undefined): string[] {
  return getGuideNamesForSpawnKey(spawnKey).filter(
    (name) => name !== 'Pyro Asteroid Clusters' && !/^PYR\d/i.test(name)
  )
}

/** When exactly one compendium site maps to this spawn key. */
export function getPrimaryCompendiumGuideName(spawnKey: string | undefined): string | null {
  const names = getCompendiumGuideNamesForSpawnKey(spawnKey)
  return names.length === 1 ? names[0] : null
}

/** Compendium / guide name → internal spawn profile keys. */
export function getSpawnKeysForGuideName(guideName: string): string[] {
  const mapped = guideToSpawnKeys[guideName]
  return mapped?.length ? [...mapped] : []
}

/** In-game nav hint (QT markers / starmap search) for a spawn key. */
export function getNavHintForSpawnKey(spawnKey: string | undefined): string | null {
  if (!spawnKey) return null
  return locationAliases[spawnKey]?.navHint ?? null
}

/** Guide/compendium location name → spawn key that carries nav data, if any. */
function resolveNavSpawnKey(guideLocationName: string): string | null {
  // Broad Pyro cluster bucket maps to the deep-space template.
  if (guideLocationName === 'Pyro Asteroid Clusters') return 'Pyro Deepspaceasteroids'
  if (locationAliases[guideLocationName]?.navHint) return guideLocationName
  for (const spawnKey of getSpawnKeysForGuideName(guideLocationName)) {
    if (locationAliases[spawnKey]?.navHint || locationAliases[spawnKey]?.navMarkers?.length) {
      return spawnKey
    }
  }
  return null
}

/** Nav hint for a guide/compendium location name. */
export function getNavHintForGuideLocation(guideLocationName: string): string | null {
  return getNavHintForSpawnKey(resolveNavSpawnKey(guideLocationName) ?? undefined)
}

/** Structured QT marker groups for a guide/compendium location name. */
export function getNavMarkersForGuideLocation(guideLocationName: string): NavMarkerGroup[] {
  const spawnKey = resolveNavSpawnKey(guideLocationName)
  if (!spawnKey) return []
  return locationAliases[spawnKey]?.navMarkers ?? []
}

/** Broad compendium buckets with no single spawn key — system is explicit. */
const BROAD_GUIDE_LOCATION_SYSTEMS: Record<string, string> = {
  'All Moons/Planets/Caves': 'Stanton',
  'All Pyro Planets': 'Pyro',
  'Pyro Asteroid Clusters': 'Pyro',
  'Found in All Stanton Deposits (Rare)': 'Stanton',
  'Found in All Stanton Deposits': 'Stanton',
  'QV Breaker Stations (Nyx)': 'Nyx',
}

function resolveSystemFromSpawnKeys(spawnKeys: string[]): string | null {
  for (const spawnKey of spawnKeys) {
    const system = locationAliases[spawnKey]?.system
    if (system && system !== 'Unknown') return system
  }
  return null
}

function buildGuideLocationSystemsMap(): Record<string, string> {
  const map: Record<string, string> = { ...BROAD_GUIDE_LOCATION_SYSTEMS }

  for (const [guideName, spawnKeys] of Object.entries(guideToSpawnKeys)) {
    const system = resolveSystemFromSpawnKeys(spawnKeys)
    if (system) map[guideName] = system
  }

  for (const alias of Object.values(locationAliases)) {
    if (!alias.system || alias.system === 'Unknown') continue
    if (alias.guideName) map[alias.guideName] = alias.system
    for (const name of alias.guideNames ?? []) {
      if (name === 'Pyro Asteroid Clusters') continue
      if (/^PYR\d/i.test(name)) continue
      map[name] = alias.system
    }
  }

  return map
}

/** Compendium / guide location name → star system (Stanton, Pyro, Nyx). */
export const GUIDE_LOCATION_SYSTEMS = buildGuideLocationSystemsMap()

export function getSystemForGuideLocation(guideLocationName: string): string | null {
  return GUIDE_LOCATION_SYSTEMS[guideLocationName] ?? null
}

export { locationAliases, guideToSpawnKeys }
