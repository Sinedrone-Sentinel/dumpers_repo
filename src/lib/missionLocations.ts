/**
 * Mission location tagging — system regions and physical locations.
 *
 * Standard pattern:
 * - System-wide missions: one tag (e.g. "Pyro")
 * - Region-specific missions: region tag (e.g. "Pyro A") + location tags (e.g. "Monox")
 *
 * Extend SYSTEM_REGION_REGISTRY when new region data appears in game files.
 */

import type { Region } from './missions'
import { isHathorPafOlpSignal } from './hathorPafSites'

export type MissionStarSystem = 'pyro' | 'stanton' | 'nyx'
export type SystemRegionCode = 'A' | 'B' | 'C' | 'D'

export type MissionLocationTagKind = 'system' | 'region' | 'location'

export interface MissionLocationTag {
  key: string
  label: string
  kind: MissionLocationTagKind
}

export interface SystemRegionDefinition {
  system: MissionStarSystem
  region: SystemRegionCode
  /** Planet/moon group label, e.g. "Pyro I" */
  groupLabel: string
  /** Planets/moons where players pull contracts */
  locations: string[]
}

/** Registry keyed by `${system}:${region}` — add Stanton entries when game data provides them */
export const SYSTEM_REGION_REGISTRY: Record<string, SystemRegionDefinition> = {
  'pyro:A': {
    system: 'pyro',
    region: 'A',
    groupLabel: 'Pyro I',
    locations: ['Monox'],
  },
  'pyro:B': {
    system: 'pyro',
    region: 'B',
    groupLabel: 'Pyro II',
    locations: ['Bloom', 'Ignis'],
  },
  'pyro:C': {
    system: 'pyro',
    region: 'C',
    groupLabel: 'Pyro III',
    locations: ['Fairo'],
  },
  'pyro:D': {
    system: 'pyro',
    region: 'D',
    groupLabel: 'Pyro IV/V',
    locations: ['Terminus', 'Vatra'],
  },
}

const SYSTEM_LABELS: Record<MissionStarSystem, string> = {
  pyro: 'Pyro',
  stanton: 'Stanton',
  nyx: 'Nyx',
}

function normalizeSystem(value: string | null | undefined): MissionStarSystem | null {
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower.includes('pyro')) return 'pyro'
  if (lower.includes('stanton')) return 'stanton'
  if (lower.includes('nyx')) return 'nyx'
  return null
}

function normalizeRegionCode(value: string | null | undefined): SystemRegionCode | null {
  if (!value) return null
  const upper = value.trim().toUpperCase()
  if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D') {
    return upper
  }
  return null
}

export function getSystemRegionDefinition(
  system: string | MissionStarSystem | Region,
  region: string | SystemRegionCode
): SystemRegionDefinition | null {
  const sys = typeof system === 'string' ? normalizeSystem(system) : system
  const reg = normalizeRegionCode(region)
  if (!sys || !reg) return null
  return SYSTEM_REGION_REGISTRY[`${sys}:${reg}`] ?? null
}

/**
 * Parse region letter(s) from mission pool keys like `cfp_outpost_regionab`.
 */
export function parseRegionCodesFromPoolKey(poolKey: string): SystemRegionCode[] {
  const match = poolKey.match(/region([a-d]+)$/i)
  if (!match) return []
  return [...match[1].toUpperCase()].filter(
    (c): c is SystemRegionCode => c === 'A' || c === 'B' || c === 'C' || c === 'D'
  )
}

export function formatSystemLabel(system: MissionStarSystem | Region | string): string {
  const normalized = normalizeSystem(String(system))
  if (normalized) return SYSTEM_LABELS[normalized]
  return String(system).charAt(0).toUpperCase() + String(system).slice(1)
}

export function formatRegionLabel(system: string | Region, region: string): string {
  return `${formatSystemLabel(system)} ${region.toUpperCase()}`
}

function inferSystemFromPoolKey(poolKey: string): MissionStarSystem | null {
  const lower = poolKey.toLowerCase()

  if (/_stanton(?:_|$)/.test(lower) || lower.endsWith('stanton')) return 'stanton'
  if (lower.includes('pyronyx')) return 'pyro'
  if (/_pyro(?:_|$)/.test(lower) || lower.endsWith('pyro')) return 'pyro'
  if (/_nyx(?:_|$)/.test(lower) || lower.endsWith('nyx')) return 'nyx'
  if (/_paf(?:_|$)/.test(lower) || /_olp(?:_|$)/.test(lower)) return 'stanton'
  if (isHathorPafOlpSignal(lower)) return 'stanton'

  // Stanton-based operators whose reward pools carry no system marker.
  if (lower.includes('rayari')) return 'stanton'
  if (lower.includes('superheavy')) return 'stanton'

  if (!/region[a-d]/i.test(lower)) return null

  // Pyro regional contract pools (CFP outposts, Headhunters mercenary, etc.)
  if (lower.includes('cfp') || lower.includes('headhunter')) {
    return 'pyro'
  }

  return null
}

function buildRegionTags(sys: MissionStarSystem, regionCode: SystemRegionCode): MissionLocationTag[] {
  const tags: MissionLocationTag[] = [
    {
      key: `${sys}-${regionCode}`,
      label: formatRegionLabel(sys, regionCode),
      kind: 'region',
    },
  ]

  const regionDef = getSystemRegionDefinition(sys, regionCode)
  for (const location of regionDef?.locations ?? []) {
    tags.push({
      key: `${sys}-${regionCode}-${location.toLowerCase()}`,
      label: location,
      kind: 'location',
    })
  }

  return tags
}

export type MissionBrowseSystem = 'stanton' | 'pyro' | 'nyx' | 'unknown'

/** Build visible location tags for mission UI (no tooltips). */
export function buildMissionLocationTags(options: {
  regions?: Region[]
  subRegion?: string | null
  system?: string | null
  poolKey?: string | null
  /** Systems from the mission's locality gate — used when `system` is Unknown. */
  localitySystems?: (string | null)[] | null
}): MissionLocationTag[] {
  const { regions = [], subRegion, system, poolKey, localitySystems } = options
  const regionCode = normalizeRegionCode(subRegion)
  const poolRegionCodes = poolKey ? parseRegionCodesFromPoolKey(poolKey) : []

  let systems: MissionStarSystem[] =
    regions.length > 0
      ? regions
          .map((r) => normalizeSystem(r))
          .filter((s): s is MissionStarSystem => s !== null)
      : normalizeSystem(system)
        ? [normalizeSystem(system)!]
        : []

  if (systems.length === 0 && poolKey) {
    const inferred = inferSystemFromPoolKey(poolKey)
    if (inferred) systems = [inferred]
  }

  // Fall back to the locality gate (e.g. "Anywhere in Stanton or Nyx") when the
  // contract's own system field is Unknown.
  if (systems.length === 0 && localitySystems?.length) {
    const fromLocality = localitySystems
      .map((s) => normalizeSystem(s))
      .filter((s): s is MissionStarSystem => s !== null)
    if (fromLocality.length > 0) {
      systems = [...new Set(fromLocality)]
    }
  }

  if (systems.length === 0) {
    return [{ key: 'unknown', label: 'Unknown', kind: 'system' }]
  }

  if (regionCode && systems.length === 1) {
    return buildRegionTags(systems[0], regionCode)
  }

  if (!regionCode && poolRegionCodes.length === 1 && systems.length === 1) {
    return buildRegionTags(systems[0], poolRegionCodes[0])
  }

  if (!regionCode && poolRegionCodes.length > 1 && systems.length === 1) {
    const tags: MissionLocationTag[] = []
    for (const reg of poolRegionCodes) {
      tags.push(...buildRegionTags(systems[0], reg))
    }
    return tags
  }

  return systems.map((sys) => ({
    key: sys,
    label: SYSTEM_LABELS[sys],
    kind: 'system' as const,
  }))
}

/** Browse buckets: unknown only when location tags cannot resolve anywhere. */
export function getBrowseSystemsForMission(options: {
  regions?: Region[]
  subRegion?: string | null
  system?: string | null
  poolKey?: string | null
  localitySystems?: (string | null)[] | null
}): MissionBrowseSystem[] {
  const tags = buildMissionLocationTags(options)

  if (tags.length === 1 && tags[0].key === 'unknown') {
    const poolLower = options.poolKey?.toLowerCase() ?? ''
    if (poolLower.includes('pyronyx')) return ['pyro', 'nyx']
    return ['unknown']
  }

  const systems = new Set<MissionBrowseSystem>()
  for (const tag of tags) {
    if (tag.kind === 'system') {
      const sys = normalizeSystem(tag.key)
      if (sys) systems.add(sys)
      continue
    }

    const sys = normalizeSystem(tag.key.split('-')[0])
    if (sys) systems.add(sys)
  }

  const poolLower = options.poolKey?.toLowerCase() ?? ''
  if (poolLower.includes('pyronyx')) {
    systems.add('pyro')
    systems.add('nyx')
  }

  return systems.size > 0 ? [...systems] : ['unknown']
}

export const MISSION_LOCATION_TAG_STYLES: Record<MissionLocationTagKind, string> = {
  system: 'bg-violet-950/50 text-violet-300 border-violet-500/40',
  region: 'bg-violet-950/50 text-violet-300 border-violet-500/40',
  location: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40',
}
