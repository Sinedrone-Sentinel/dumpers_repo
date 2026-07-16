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

function stripMissionTemplatePlaceholders(title: string): string {
  return title
    .replace(/~mission\s*\([^)]*\)/gi, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s*:\s*(\s|$)/g, ': ')
    .replace(/\s+/g, ' ')
    .replace(/\s+at\s*$/i, '')
    .trim()
}

export interface MissionDisplayTitleInput {
  title?: string | null
  displayTitle?: string | null
  titleKey?: string | null
  debugName?: string | null
}

/**
 * Strip leftover template artifacts from an already-humanized title, e.g. the
 * dangling "Rank -" left behind when the `~mission(ReputationRank) Rank` token
 * is removed (Covalex hauling contracts).
 */
function cleanTitleArtifacts(title: string): string {
  return title
    .replace(/^\s*Rank\s*-\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
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
  const stripped = cleanTitleArtifacts(stripMissionTemplatePlaceholders(raw)).replace(/:\s*$/, '').trim()
  if (stripped.length >= 3 && !/^verified bounty:?$/i.test(stripped) && !stripped.includes('~mission')) {
    return capitalizeFirst(stripped)
  }
  return extractTemplateTokenIntent(raw)
}

/** Member-facing mission title for browse cards and tracker rows. */
export function formatMissionDisplayTitle(input: MissionDisplayTitleInput): string {
  const displayTitle = input.displayTitle?.trim()
  if (displayTitle) {
    if (!displayTitle.includes('~mission') && !displayTitle.includes('~(')) {
      return cleanTitleArtifacts(displayTitle)
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

  if (debugLower.includes('rockcracker') || titleLower.includes('qv breaker station')) {
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
