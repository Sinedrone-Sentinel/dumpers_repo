import gameMiningSpawnsData from '../data/game-mining-spawns.json'
import { isHandMineableType } from './handMineables'
import { ORE_SIGNATURES } from './miningConstants'
import { normalizeMiningOreName } from './miningOreCanonical'

export type RsDepositType = 'surface' | 'asteroid'

/** One legal scanner reading: base RS, or a cluster size the game actually spawns. */
export interface RsSignatureMatch {
  oreName: string
  depositType: RsDepositType
  nodes: number
  rs: number
}

const DEPOSIT_ORDER: RsDepositType[] = ['asteroid', 'surface']

interface SpawnClusterRow {
  nodes?: number
  rs?: number
  chancePercent?: number
}

interface SpawnOre {
  oreName?: string
  baseSignature?: number
  overallByType?: Partial<
    Record<RsDepositType, { clusterRows?: SpawnClusterRow[] }>
  >
}

function addReading(map: Map<number, RsSignatureMatch[]>, match: RsSignatureMatch) {
  const list = map.get(match.rs)
  if (list) list.push(match)
  else map.set(match.rs, [match])
}

/**
 * Scanner values that can actually appear: one rock (base RS), plus cluster
 * sizes whose game-file chance is above zero. A multiple that only exists
 * because max-nodes × base divides evenly is left out when that size never spawns.
 */
function buildLegalSignatureIndex(): Map<number, RsSignatureMatch[]> {
  const map = new Map<number, RsSignatureMatch[]>()
  const ores = (gameMiningSpawnsData as { ores?: Record<string, SpawnOre> }).ores ?? {}

  for (const ore of Object.values(ores)) {
    const oreName = ore.oreName
    const base = ore.baseSignature
    if (!oreName || !Number.isFinite(base) || base == null || base <= 0) continue
    if (isHandMineableType(oreName)) continue
    if (ORE_SIGNATURES[normalizeMiningOreName(oreName)] == null) continue

    for (const depositType of DEPOSIT_ORDER) {
      const profile = ore.overallByType?.[depositType]
      if (!profile) continue

      addReading(map, { oreName, depositType, nodes: 1, rs: base })

      for (const row of profile.clusterRows ?? []) {
        const nodes = row.nodes
        const rs = row.rs
        if (nodes == null || nodes < 2 || !(row.chancePercent != null && row.chancePercent > 0)) continue
        if (!Number.isFinite(rs) || rs == null || rs <= 0) continue
        if (rs !== base * nodes) continue
        addReading(map, { oreName, depositType, nodes, rs })
      }
    }
  }

  for (const list of map.values()) sortMatches(list)

  return map
}

let legalSignatureIndex: Map<number, RsSignatureMatch[]> | null = null

function shipSpawnOres(): SpawnOre[] {
  const ores = (gameMiningSpawnsData as { ores?: Record<string, SpawnOre> }).ores ?? {}
  return Object.values(ores).filter((ore) => {
    const oreName = ore.oreName
    const base = ore.baseSignature
    if (!oreName || !Number.isFinite(base) || base == null || base <= 0) return false
    if (isHandMineableType(oreName)) return false
    if (ORE_SIGNATURES[normalizeMiningOreName(oreName)] == null) return false
    return true
  })
}

function depositTypesFor(ore: SpawnOre): RsDepositType[] {
  return DEPOSIT_ORDER.filter((depositType) => ore.overallByType?.[depositType] != null)
}

function sortMatches(list: RsSignatureMatch[]): RsSignatureMatch[] {
  return list.sort(
    (a, b) =>
      a.oreName.localeCompare(b.oreName) ||
      DEPOSIT_ORDER.indexOf(a.depositType) - DEPOSIT_ORDER.indexOf(b.depositType) ||
      a.nodes - b.nodes,
  )
}

/**
 * Ignore cluster-size limits. Any whole rock count whose base signature
 * divides the reading is included. Gems stay out — their entity files share
 * a placeholder signature, not a ship scanner value.
 */
function matchAnomalyOverride(reading: number): RsSignatureMatch[] {
  const matches: RsSignatureMatch[] = []
  for (const ore of shipSpawnOres()) {
    const base = ore.baseSignature
    const oreName = ore.oreName
    if (base == null || !oreName || reading % base !== 0) continue
    const nodes = reading / base
    if (!Number.isInteger(nodes) || nodes < 1) continue
    for (const depositType of depositTypesFor(ore)) {
      matches.push({ oreName, depositType, nodes, rs: reading })
    }
  }
  return sortMatches(matches)
}

export function matchRsSignature(
  reading: number,
  options?: { anomalyOverride?: boolean },
): RsSignatureMatch[] {
  if (!Number.isFinite(reading) || reading <= 0) return []
  if (options?.anomalyOverride) return matchAnomalyOverride(reading)
  if (!legalSignatureIndex) legalSignatureIndex = buildLegalSignatureIndex()
  return legalSignatureIndex.get(reading) ?? []
}

/** Whole scanner reading. Commas are allowed; anything else is not a signature yet. */
export function parseRsSignatureInput(raw: string): number | null {
  const digits = raw.trim().replace(/,/g, '')
  if (!/^\d+$/.test(digits)) return null
  const n = Number(digits)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

/** First N cluster RS readings for ship mining: base × 1 … base × N (includes base). */
export function getSignatureMultiples(baseSignature: number, count = 6): number[] {
  if (!Number.isFinite(baseSignature) || baseSignature <= 0) return []
  const n = Math.max(1, Math.floor(count))
  return Array.from({ length: n }, (_, i) => baseSignature * (i + 1))
}

export function getOreBaseSignature(oreName: string): number | undefined {
  const canonical = normalizeMiningOreName(oreName)
  return ORE_SIGNATURES[canonical]
}

export function formatRsReading(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString()
}
