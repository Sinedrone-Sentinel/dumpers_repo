import type { LoadoutBreakabilityComparison, RockBreakabilityTarget } from './miningLoadoutCompare'
import type { MiningLaserSlotConfig } from './miningLaserStats'
import {
  buildMoleHeadProfile,
  type MoleHeadAssignment,
  type MoleLoadoutStrategy,
} from './moleLoadoutStrategy'

/** Full-blast power is 1–5% over equalizer — fracture works but takes forever. */
export const EXTREME_GRIND_MARGIN_MIN = 1.01
export const EXTREME_GRIND_MARGIN_MAX = 1.05
/** Full-blast power is 5–20% over equalizer — expect a long grind (roughly 5–20 min). */
export const SLOW_GRIND_MARGIN_MIN = 1.05
export const SLOW_GRIND_MARGIN_MAX = 1.2
/** Q bands worth waiting on for slow (5–20%) vs extreme (1–5%) grinds. */
export const SLOW_GRIND_MIN_QUALITY = 900
export const EXTREME_GRIND_MIN_QUALITY = 1000

export type SlowCrackTier = 'extreme' | 'slow'

export interface RockMaterialQuality {
  elementName: string
  percent: number
  quality: number
  label?: string
}

export interface SlowCrackAssessment {
  tier: SlowCrackTier
  /** Whole-number % over the equalizer at full blast (e.g. 12 = 12% over). */
  marginPercent: number
  deliveredMw: number
  equalizingMw: number
  peakQuality: number | null
  peakMaterial: string | null
  peakPercent: number | null
  rockSummary: string | null
  worthWaiting: boolean
  headline: string
  detail: string
}

function summarizeRockQuality(target: RockBreakabilityTarget): {
  peakQuality: number | null
  peakMaterial: string | null
  peakPercent: number | null
  rockSummary: string | null
} {
  const materials =
    target.materials?.filter((row) => row.percent > 0 && row.quality > 0) ?? []
  if (!materials.length) {
    return {
      peakQuality: null,
      peakMaterial: null,
      peakPercent: null,
      rockSummary: null,
    }
  }

  const best = materials.reduce((leading, row) => {
    if (row.quality > leading.quality) return row
    if (row.quality === leading.quality && row.percent > leading.percent) return row
    return leading
  })

  const label = best.label?.trim() || best.elementName
  const parts = [`${label} Q${best.quality}`, `${Math.round(best.percent)}% of rock`]
  if (target.totalScu != null && target.totalScu > 0) {
    parts.push(`${target.totalScu.toLocaleString()} SCU total`)
  }
  if (target.oreName) {
    parts.unshift(target.oreName)
  }

  return {
    peakQuality: best.quality,
    peakMaterial: best.elementName,
    peakPercent: best.percent,
    rockSummary: parts.join(' · '),
  }
}

function tierFromMargin(margin: number): SlowCrackTier | null {
  if (margin >= EXTREME_GRIND_MARGIN_MIN && margin < EXTREME_GRIND_MARGIN_MAX) return 'extreme'
  if (margin >= SLOW_GRIND_MARGIN_MIN && margin <= SLOW_GRIND_MARGIN_MAX) return 'slow'
  return null
}

function planDeliveredMw(
  assignments: MoleHeadAssignment[],
  lasers: MiningLaserSlotConfig[]
): number {
  return assignments
    .filter((assignment) => assignment.role !== 'idle')
    .reduce((sum, assignment) => {
      const profile = buildMoleHeadProfile(lasers[assignment.slotIndex], assignment.slotIndex)
      if (!profile) return sum
      return sum + profile.laserPower * (assignment.throttlePercent / 100)
    }, 0)
}

function molePlanSitsUnderEqualizer(
  strategy: MoleLoadoutStrategy,
  lasers: MiningLaserSlotConfig[]
): boolean {
  if (!strategy.canBreak || strategy.requiredPower <= 0) return false
  const deliveredMw = planDeliveredMw(strategy.assignments, lasers)
  return deliveredMw <= strategy.requiredPower * 1.01
}

function buildSlowCrackAssessment(
  tier: SlowCrackTier,
  margin: number,
  deliveredMw: number,
  equalizingMw: number,
  target: RockBreakabilityTarget
): SlowCrackAssessment {
  const marginPercent = Math.round((margin - 1) * 100)
  const quality = summarizeRockQuality(target)
  const minQuality =
    tier === 'extreme' ? EXTREME_GRIND_MIN_QUALITY : SLOW_GRIND_MIN_QUALITY
  const worthWaiting =
    quality.peakQuality != null && quality.peakQuality >= minQuality

  const qualityHint = quality.rockSummary
    ? `Your scan: ${quality.rockSummary}.`
    : 'Add composition % and Q bands in the calculator to judge whether this rock is worth the wait.'

  if (tier === 'extreme') {
    return {
      tier,
      marginPercent,
      deliveredMw,
      equalizingMw,
      peakQuality: quality.peakQuality,
      peakMaterial: quality.peakMaterial,
      peakPercent: quality.peakPercent,
      rockSummary: quality.rockSummary,
      worthWaiting,
      headline: worthWaiting
        ? `Barely over the equalizer (+${marginPercent}%) — brutal grind`
        : `Only +${marginPercent}% over the equalizer — probably not worth it`,
      detail: worthWaiting
        ? `Full-blast power is only ~${marginPercent}% above the resistance equalizer, so fracture will crawl. Q${quality.peakQuality} on your scan clears the unicorn bar — wait it out if you are patient. ${qualityHint}`
        : `Full-blast power is only ~${marginPercent}% above the resistance equalizer. That is a marathon crack unless you have Q${EXTREME_GRIND_MIN_QUALITY} material in the rock. ${qualityHint}`,
    }
  }

  return {
    tier,
    marginPercent,
    deliveredMw,
    equalizingMw,
    peakQuality: quality.peakQuality,
    peakMaterial: quality.peakMaterial,
    peakPercent: quality.peakPercent,
    rockSummary: quality.rockSummary,
    worthWaiting,
    headline: worthWaiting
      ? `Slow grind (+${marginPercent}% over equalizer)`
      : `Slow grind (+${marginPercent}%) — likely not worth waiting`,
    detail: worthWaiting
      ? `Expect roughly 5–20 minutes at full blast with only ~${marginPercent}% headroom over the equalizer. Your scan shows Q${quality.peakQuality} — high enough that some crews will wait it out. ${qualityHint}`
      : `Expect roughly 5–20 minutes at full blast with only ~${marginPercent}% headroom over the equalizer. Unless quality is ${SLOW_GRIND_MIN_QUALITY}+ on the valuable material, skip it and find an easier rock. ${qualityHint}`,
  }
}

export function assessSlowCrackFromComparison(
  comparison: LoadoutBreakabilityComparison,
  target: RockBreakabilityTarget,
  moleStrategy?: MoleLoadoutStrategy | null,
  lasers?: MiningLaserSlotConfig[]
): SlowCrackAssessment | null {
  if (!comparison.canBreak || comparison.requiredPower <= 0) return null

  if (moleStrategy?.canBreak && lasers?.length && molePlanSitsUnderEqualizer(moleStrategy, lasers)) {
    return null
  }

  const margin = comparison.totalLaserPower / comparison.requiredPower
  const tier = tierFromMargin(margin)
  if (!tier) return null

  return buildSlowCrackAssessment(
    tier,
    margin,
    comparison.totalLaserPower,
    comparison.requiredPower,
    target
  )
}
