/** Shared blueprint name resolution for site + log-watcher-webhook. */

export interface BlueprintLookupData {
  byInternalName: Record<string, { blueprintName: string; categoryName: string | null }>
  byDisplayName: Record<string, unknown>
  byContractDefinitionId: Record<string, string[]>
}

export interface BlueprintResolveContext {
  contractDefinitionId?: string | null
}

export interface BlueprintResolveSuccess {
  ok: true
  internalName: string
  blueprintName: string
  resolvedVia: 'internal' | 'display' | 'contract'
}

export interface BlueprintResolveFailure {
  ok: false
  error: 'unknown_blueprint' | 'ambiguous_blueprint'
  displayName?: string
  rawInput: string
  candidates?: Array<{
    internalName: string
    blueprintName: string
    categoryName: string | null
  }>
}

export type BlueprintResolveResult = BlueprintResolveSuccess | BlueprintResolveFailure

function normalizeDisplayKey(value: string): string {
  let val = value.trim().toLowerCase()
  val = val.replace(/^(?:civ|ind|mil|ste|com)\/[0-9]\/[a-d]\s+/i, '')
  val = val.replace(/\s+'[^']+'\s*$/, '')
  return val.trim()
}

/** Extract catalog internalName from bp_craft file paths or return normalized key. */
export function normalizeInternalKey(input: string): string {
  let normalized = input.replace(/\\/g, '/').trim().toLowerCase()
  if (normalized.endsWith(',p')) {
    normalized = normalized.slice(0, -2)
  }
  if (normalized.startsWith('bp_craft_')) {
    normalized = normalized.slice(9)
  }
  if (normalized.endsWith('_scitem.json')) {
    normalized = normalized.slice(0, -12)
  } else if (normalized.endsWith('.json')) {
    normalized = normalized.slice(0, -5)
  } else if (normalized.endsWith('_scitem')) {
    normalized = normalized.slice(0, -7)
  }
  return normalized
}

function canonicalInternalKey(input: string): string {
  const normalized = normalizeInternalKey(input)
  return normalized.startsWith('scitem_') ? normalized.slice(7) : normalized
}

const STARSTRINGS_DISPLAY_ALIASES: Record<string, string> = {
  'lawson mining laser': 'klein-sv mining laser',
  'pitman mining laser': 'mining laser drak golem s1',
}

const ABBREVIATED_MINING_PREFIXES: Record<string, string> = {
  helix: 'mining_laser_thcn_helix',
  hofstede: 'mining_laser_shin_hofstede',
  klein: 'mining_laser_shin_klein',
  lawson: 'mining_laser_shin_klein',
  pitman: 'mining_laser_drak_golem',
  golem: 'mining_laser_drak_golem',
}

function resolveFromInternalKey(
  byInternal: Record<string, { blueprintName: string; categoryName: string | null }>,
  internalKey: string,
  resolvedVia: BlueprintResolveSuccess['resolvedVia']
): BlueprintResolveSuccess | null {
  const entry = byInternal[internalKey]
  if (!entry) return null
  return {
    ok: true,
    internalName: internalKey,
    blueprintName: entry.blueprintName,
    resolvedVia,
  }
}

function tryAbbreviatedMiningLaserResolve(
  rawInput: string,
  byInternal: Record<string, { blueprintName: string; categoryName: string | null }>
): BlueprintResolveSuccess | null {
  const trimmed = rawInput.trim()

  let size: number
  let product: string

  const s00Match = trimmed.match(/^s00\s+(.+)$/i)
  if (s00Match) {
    size = 0
    product = s00Match[1].trim().toLowerCase()
  } else {
    const sizeMatch = trimmed.match(/^s(\d+)\s+(.+)$/i)
    if (!sizeMatch) return null
    size = Number.parseInt(sizeMatch[1], 10)
    product = sizeMatch[2].trim().toLowerCase()
  }

  const prefix = ABBREVIATED_MINING_PREFIXES[product]
  if (prefix == null || Number.isNaN(size)) return null

  return resolveFromInternalKey(byInternal, `${prefix}_s${size}`, 'display')
}

function tryStarStringsDisplayAlias(
  rawInput: string,
  lookup: BlueprintLookupData
): BlueprintResolveSuccess | null {
  const aliasKey = STARSTRINGS_DISPLAY_ALIASES[normalizeDisplayKey(rawInput)]
  if (!aliasKey) return null
  const displayEntry = lookup.byDisplayName[aliasKey]
  if (
    !displayEntry ||
    (typeof displayEntry === 'object' &&
      displayEntry !== null &&
      'ambiguous' in displayEntry &&
      displayEntry.ambiguous)
  ) {
    return null
  }
  const unique = displayEntry as { internalName: string; blueprintName: string }
  if (!unique.internalName) return null
  return {
    ok: true,
    internalName: unique.internalName,
    blueprintName: unique.blueprintName,
    resolvedVia: 'display',
  }
}

/**
 * 1. Match catalog internalName (client may send internalName directly).
 * 2. Else map Game.log display text via byDisplayName.
 * 3. Else contract-based disambiguation for ambiguous display names.
 */
export function resolveBlueprintInput(
  input: string,
  context: BlueprintResolveContext,
  lookup: BlueprintLookupData
): BlueprintResolveResult {
  const rawInput = input.trim()
  if (!rawInput) {
    return { ok: false, error: 'unknown_blueprint', rawInput }
  }

  const internalKey = canonicalInternalKey(rawInput)
  const byInternal = lookup.byInternalName

  const internalMatch = resolveFromInternalKey(byInternal, internalKey, 'internal')
  if (internalMatch) return internalMatch

  const displayEntry = lookup.byDisplayName[normalizeDisplayKey(rawInput)]
  if (!displayEntry) {
    const aliasMatch = tryStarStringsDisplayAlias(rawInput, lookup)
    if (aliasMatch) return aliasMatch
    const abbreviatedMatch = tryAbbreviatedMiningLaserResolve(rawInput, byInternal)
    if (abbreviatedMatch) return abbreviatedMatch
    return { ok: false, error: 'unknown_blueprint', rawInput }
  }

  if (
    !(
      typeof displayEntry === 'object' &&
      displayEntry !== null &&
      'ambiguous' in displayEntry &&
      displayEntry.ambiguous
    )
  ) {
    const unique = displayEntry as { internalName: string; blueprintName: string }
    return {
      ok: true,
      internalName: unique.internalName,
      blueprintName: unique.blueprintName,
      resolvedVia: 'display',
    }
  }

  const ambiguous = displayEntry as {
    ambiguous: true
    displayName: string
    candidates: Array<{
      internalName: string
      blueprintName: string
      categoryName: string | null
    }>
  }

  let candidates = ambiguous.candidates
  const prefixMatch = rawInput.match(/^(?:civ|ind|mil|ste|com)\/([0-9])\/[a-d]\s+/i)
  if (prefixMatch) {
    const sizeDigit = prefixMatch[1]
    const filtered = candidates.filter((c) => c.categoryName && c.categoryName.includes('S' + sizeDigit))
    if (filtered.length > 0) candidates = filtered
  }

  const contractKey = context.contractDefinitionId?.trim().toLowerCase()
  if (contractKey) {
    const poolIds = new Set(lookup.byContractDefinitionId[contractKey] ?? [])
    if (poolIds.size > 0) {
      const filtered = candidates.filter((c) => poolIds.has(c.internalName))
      if (filtered.length > 0) candidates = filtered
    }
  }

  if (candidates.length === 1) {
    return {
      ok: true,
      internalName: candidates[0].internalName,
      blueprintName: candidates[0].blueprintName,
      resolvedVia: contractKey ? 'contract' : 'display',
    }
  }

  return {
    ok: false,
    error: 'ambiguous_blueprint',
    displayName: ambiguous.displayName,
    rawInput,
    candidates,
  }
}
