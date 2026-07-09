import aliasData from '../data/mining-ore-aliases.json'
import qualityBandData from '../data/game-quality-bands.json'
import { ORE_SIGNATURES } from './miningConstants'
import { stripMineableLabel } from './miningOreLabel'

/** Known CIG localization typos → canonical ore spellings (see mining-ore-aliases.json). */
export const ORE_SPELLING_ALIASES: Record<string, string> = aliasData.aliases

export interface ResolvedOreName {
  name: string
  correctedFrom: string | null
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

/** Compendium / rarity-tier canonical ship ore names for fuzzy desc matching. */
const RUNTIME_ORE_MASTER_LIST = [
  'Quantainium',
  'Savrilium',
  'Stileron',
  'Lindinium',
  'Ouratite',
  'Riccite',
  'Beryl',
  'Bexalite',
  'Laranite',
  'Agricium',
  'Borase',
  'Hephaestanite',
  'Gold',
  'Aslarite',
  'Corundum',
  'Quartz',
  'Titanium',
  'Tungsten',
  'Diamond',
  'Taranite',
  'Aluminum',
  'Copper',
  'Iron',
  'Silicon',
  'Tin',
  'Aphorite',
  'Dolivine',
  'Hadanite',
  'Janalite',
  'Glacosite',
  'Feynmaline',
  'Sadaryx',
  'Beradom',
  'Carinite',
  'Ice',
  'Torite',
]

const OCR_ORE_CANDIDATES = [
  ...new Set([
    ...RUNTIME_ORE_MASTER_LIST,
    ...Object.keys(ORE_SIGNATURES),
    ...Object.values(qualityBandData.qualityBands ?? {})
      .map((entry) => entry?.name)
      .filter((name): name is string => Boolean(name)),
  ]),
].sort((a, b) => a.localeCompare(b))

function lookupSpellingAlias(label: string): string | null {
  if (ORE_SPELLING_ALIASES[label]) return ORE_SPELLING_ALIASES[label]

  const lower = label.toLowerCase()
  for (const [alias, canonical] of Object.entries(ORE_SPELLING_ALIASES)) {
    if (alias.toLowerCase() === lower) return canonical
  }
  return null
}

function resolveByUniquePrefix(label: string, candidates: string[]): string | null {
  const lower = label.toLowerCase()
  if (lower.length < 3) return null

  const matches = candidates.filter((candidate) => candidate.toLowerCase().startsWith(lower))
  if (matches.length === 1) return matches[0]
  return null
}

function fuzzyMatchOre(label: string, candidates: string[]): string | null {
  const lower = label.toLowerCase()
  let best: string | null = null
  let bestDist = Infinity

  for (const canonical of candidates) {
    const dist = levenshtein(lower, canonical.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      best = canonical
    } else if (dist === bestDist) {
      best = null
    }
  }

  const minLength = label.length <= 5 ? 3 : 4
  if (best != null && bestDist > 0 && bestDist <= 2 && label.length >= minLength) {
    return best
  }

  return null
}

/**
 * Resolve OCR / CIG typo labels to canonical ore or composition element names.
 * Uses alias table, RS ore list, quality-band resources, unique prefixes (e.g. Heph), and fuzzy match.
 */
export function resolveOcrOreName(rawName: string): ResolvedOreName {
  const label = stripMineableLabel(rawName)
  if (!label) return { name: label, correctedFrom: null }

  const alias = lookupSpellingAlias(label)
  if (alias) {
    return alias === label ? { name: alias, correctedFrom: null } : { name: alias, correctedFrom: label }
  }

  const lower = label.toLowerCase()
  for (const canonical of OCR_ORE_CANDIDATES) {
    if (canonical.toLowerCase() === lower) {
      return { name: canonical, correctedFrom: null }
    }
  }

  const prefixMatch = resolveByUniquePrefix(label, OCR_ORE_CANDIDATES)
  if (prefixMatch) {
    return { name: prefixMatch, correctedFrom: label }
  }

  const fuzzy = fuzzyMatchOre(label, OCR_ORE_CANDIDATES)
  if (fuzzy) {
    return { name: fuzzy, correctedFrom: label }
  }

  return { name: label, correctedFrom: null }
}

export function resolveCanonicalOreName(rawName: string): string {
  return resolveOcrOreName(rawName).name
}

export function normalizeMiningOreName(name: string): string {
  return resolveOcrOreName(name.trim()).name
}

/** True when the name maps to a ship RS Tracker ore with a base signature. */
export function isRsTrackerOre(name: string): boolean {
  const canonical = normalizeMiningOreName(name)
  return Object.prototype.hasOwnProperty.call(ORE_SIGNATURES, canonical)
}
