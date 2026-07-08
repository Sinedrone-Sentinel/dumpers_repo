import type { ClusterDisplayProfile, LocationSpawnProfile } from './miningClusterProfiles'
import { getMineableElementStats } from './mineableElementStats'

export interface BreakabilityRange {
  min: number
  max: number
}

export interface BreakabilityResult {
  massRangeScu: BreakabilityRange | null
  breakabilityRange: BreakabilityRange | null
  resistance: number | null
}

type MassSource = Pick<ClusterDisplayProfile | LocationSpawnProfile, 'massRangeScu'>

function roundPower(value: number): number {
  return Math.round(value)
}

export function computeBreakabilityForOre(
  oreName: string,
  profile?: MassSource | null
): BreakabilityResult {
  const stats = getMineableElementStats(oreName)
  const massRangeScu = profile?.massRangeScu ?? null

  if (!stats) {
    return { massRangeScu, breakabilityRange: null, resistance: null }
  }

  const resistance = stats.resistance
  const multiplier = 1 + resistance / 100

  if (!massRangeScu) {
    return { massRangeScu: null, breakabilityRange: null, resistance }
  }

  return {
    massRangeScu,
    breakabilityRange: {
      min: roundPower(massRangeScu.min * multiplier),
      max: roundPower(massRangeScu.max * multiplier),
    },
    resistance,
  }
}

export function formatMassRangeScu(range: BreakabilityRange | null): string | null {
  if (!range) return null
  const min = roundPower(range.min)
  const max = roundPower(range.max)
  if (min === max) return `${min.toLocaleString()} SCU`
  return `${min.toLocaleString()}–${max.toLocaleString()} SCU`
}

export function formatBreakabilityRange(range: BreakabilityRange | null): string | null {
  if (!range) return null
  const min = roundPower(range.min)
  const max = roundPower(range.max)
  if (min === max) return min.toLocaleString()
  return `${min.toLocaleString()}–${max.toLocaleString()}`
}
