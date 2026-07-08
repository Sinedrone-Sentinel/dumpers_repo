import aliasData from '../data/mining-ore-aliases.json'
import { stripMineableLabel } from './miningOreLabel'

/** Known CIG localization typos → canonical ore spellings (see mining-ore-aliases.json). */
export const ORE_SPELLING_ALIASES: Record<string, string> = aliasData.aliases

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

export function resolveCanonicalOreName(rawName: string): string {
  const label = stripMineableLabel(rawName)
  if (!label) return label

  if (ORE_SPELLING_ALIASES[label]) return ORE_SPELLING_ALIASES[label]

  const lower = label.toLowerCase()
  for (const canonical of RUNTIME_ORE_MASTER_LIST) {
    if (canonical.toLowerCase() === lower) return canonical
  }

  let best: string | null = null
  let bestDist = Infinity
  for (const canonical of RUNTIME_ORE_MASTER_LIST) {
    const dist = levenshtein(lower, canonical.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      best = canonical
    } else if (dist === bestDist) {
      best = null
    }
  }

  if (best != null && bestDist > 0 && bestDist <= 2 && label.length >= 4) {
    return best
  }

  return label
}

export function normalizeMiningOreName(name: string): string {
  return resolveCanonicalOreName(name.trim())
}
