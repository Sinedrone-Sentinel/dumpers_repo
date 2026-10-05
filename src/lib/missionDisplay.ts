const BHG_NYX_DIFFICULTY_LABELS: Record<string, string> = {
  rehire: 'Rehire',
  veryeasy: 'Very Easy',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  veryhard: 'Very Hard',
  super: 'Super',
}

const BHG_PAF_DISPLAY_TITLE = 'Verified Bounty · Hathor · Planetary Alignment Facility'

function isUnresolvedDisplayName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true
  const trimmed = name.trim()
  return (
    trimmed.startsWith('@') ||
    trimmed.includes('PLACEHOLDER') ||
    trimmed.includes('UNINITIALIZED')
  )
}

function humanizeContractDebugName(debugName: string | null | undefined): string {
  if (!debugName) return 'Unknown Mission'
  return debugName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (lower === 'bhg') return 'BHG'
      if (lower === 'nyx') return 'Nyx'
      if (lower === 'paf') return 'Planetary Alignment Facility'
      if (lower === 'olp') return 'Orbital Laser Platform'
      if (lower === 'asd') return 'ASD'
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Per-spawn `~mission(...)` blanks → bracket label (keep in sync with scripts/lib/missionTitleTemplate.mjs). */
const MISSION_TOKEN_STAND_INS: Record<string, string> = {
  location: 'Location',
  'location|address': 'Location',
  defendlocationwrapperlocation: 'Location',
  ship: 'Ship',
  targetname: 'Target',
  'targetname|last': 'Target',
  objects: 'Objects',
  danger: 'Danger',
  reputationrank: 'Rank',
  cargogradetoken: 'Grade',
}

function missionTokenStandIn(inner: string): string {
  const key = inner.trim().toLowerCase()
  const label = MISSION_TOKEN_STAND_INS[key] ?? MISSION_TOKEN_STAND_INS[key.split('|')[0]]
  if (label) return `[${label}]`
  const words = (inner.split('|').pop() ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `[${words ? capitalizeFirst(words) : 'Value'}]`
}

function isWholeTitleToken(title: string): boolean {
  const match = title.trim().match(/^~mission\s*\(([^)]*)\)$/i)
  if (!match) return false
  const key = match[1].trim().toLowerCase()
  return !(key in MISSION_TOKEN_STAND_INS) && !(key.split('|')[0] in MISSION_TOKEN_STAND_INS)
}

/** "Keep ~mission(Location) Safe" → "Keep [Location] Safe". Null for whole-title tokens. */
function fillMissionTitleTemplate(title: string): string | null {
  if (!title.includes('~mission') || isWholeTitleToken(title)) return null
  return title
    .replace(/~mission\s*\(([^)]*)\)/gi, (_whole, inner: string) => missionTokenStandIn(inner))
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Search match for a mission title. Bracket stand-ins such as `[Location]`
 * match any words, so a pasted in-game title ("Keep Mining Base #IGB-FXW Safe")
 * finds "Keep [Location] Safe". `term` must already be lowercase.
 */
export function missionTitleMatchesSearch(title: string | null | undefined, term: string): boolean {
  const lowerTitle = (title || '').toLowerCase()
  const needle = term.trim()
  if (!needle) return true
  if (lowerTitle.includes(needle)) return true
  if (!/\[[^\]]+\]/.test(lowerTitle)) return false
  const pattern = lowerTitle
    .split(/\[[^\]]+\]/)
    .map((part) => escapeRegExp(part.trim()).replace(/\s+/g, '\\s+'))
    .join('\\s*.+?\\s*')
  return new RegExp(`^\\s*${pattern}\\s*$`, 'i').test(needle)
}

export interface MissionDisplayTitleInput {
  title?: string | null
  displayTitle?: string | null
  titleKey?: string | null
  debugName?: string | null
}

function capitalizeFirst(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Recover the mission's intent from an unresolved `~mission(Namespace|SomeTitle)`
 * token when nothing else survives stripping, e.g.
 * `~mission(Contractor|RecoverItemTitle)` -> "Recover Item".
 */
function extractTemplateTokenIntent(raw: string): string | null {
  const match = raw.match(/~mission\s*\(([^)]*)\)/i)
  if (!match) return null
  let inner = match[1].split('|').pop() ?? ''
  // Drop the trailing "Title" marker and any difficulty suffix after it.
  inner = inner.replace(/Title.*$/i, '')
  inner = inner.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim()
  if (inner.length < 3) return null
  return capitalizeFirst(inner)
}

/**
 * Turn a title that still contains `~mission(...)` tokens into something
 * member-facing. Returns null when nothing usable can be recovered.
 */
function resolveTemplateTitle(raw: string): string | null {
  const filled = fillMissionTitleTemplate(raw)
  if (filled) return capitalizeFirst(filled)
  return extractTemplateTokenIntent(raw)
}

/** Member-facing mission title for browse cards and tracker rows. */
export function formatMissionDisplayTitle(input: MissionDisplayTitleInput): string {
  const displayTitle = input.displayTitle?.trim()
  if (displayTitle) {
    if (!displayTitle.includes('~mission') && !displayTitle.includes('~(')) {
      return displayTitle
    }
    // displayTitle still carries an unresolved template token — recover intent.
    const recovered = resolveTemplateTitle(displayTitle)
    if (recovered) return recovered
  }

  const title = (input.title || '').replace(/\\n/g, '').replace(/\n/g, '').trim()
  const debugName = input.debugName || ''
  const debugLower = debugName.toLowerCase()
  const titleLower = title.toLowerCase()

  const nyxBhgMatch = debugName.match(/^BountyHuntersGuild_Bounty_Nyx_(.+)$/i)
  if (nyxBhgMatch) {
    const suffixLower = nyxBhgMatch[1].toLowerCase()
    const diffLabel =
      BHG_NYX_DIFFICULTY_LABELS[suffixLower] || humanizeContractDebugName(nyxBhgMatch[1])
    return `Nyx Bounty · ${diffLabel}`
  }

  if (debugLower.includes('asdfacilitydelv')) {
    if (debugLower.includes('researchwing')) return 'Verified Bounty · ASD Research Wing'
    if (debugLower.includes('engineeringwing')) return 'Verified Bounty · ASD Engineering Wing'
    return 'Verified Bounty · ASD Facility'
  }

  // Only BHG Rockcracker bounties use the Verified Bounty title — Vaughn/HH/CFP
  // share the Rockcracker location under Unverified (or other) contractors.
  const isBhgRockcracker =
    (debugLower.includes('bhg_') || debugLower.includes('bountyhuntersguild')) &&
    (debugLower.includes('rockcracker') || titleLower.includes('qv breaker station'))
  if (isBhgRockcracker) {
    if (titleLower.includes('high-risk')) return 'High-Risk Bounty · QV Breaker Station'
    return 'Verified Bounty · QV Breaker Station'
  }

  if (debugLower.includes('bountyhuntersguild_paf') || (debugLower.includes('_paf_') && debugLower.includes('bounty'))) {
    return BHG_PAF_DISPLAY_TITLE
  }

  if (title.includes('~mission')) {
    const recovered = resolveTemplateTitle(title)
    if (recovered) return recovered
  }

  if (!title || title === debugName || isUnresolvedDisplayName(title)) {
    return humanizeContractDebugName(debugName)
  }

  return title
}

export function isValidBrowseMissionTitle(title: string | null | undefined): boolean {
  const normalized = (title || '').replace(/\\n/g, '').replace(/\n/g, '').trim()
  if (!normalized) return false
  return (
    !normalized.startsWith('@') &&
    !normalized.includes('UNINITIALIZED') &&
    !normalized.includes('PLACEHOLDER')
  )
}
