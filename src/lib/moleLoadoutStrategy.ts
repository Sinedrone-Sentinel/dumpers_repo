import { requiredLaserPower } from './miningBreakability'
import {
  computeEffectiveLaserStats,
  describeLaserHead,
  laserResistanceMultiplier,
  type MiningLaserSlotConfig,
} from './miningLaserStats'
import { combineModuleModifiers, normalizeModuleSelection } from './miningModules'
import type { RockBreakabilityTarget } from './miningLoadoutCompare'
import { assessMinPowerWarningForSlot, type MinPowerWarning } from './miningMinPowerWarning'
import { displayMinThrottlePercent, throttlePercentFromMw } from './miningThrottleDisplay'
import { getMiningLaserByName } from './miningVessels'

/** Driving head min output should be this % of equalizing power (ideal). */
export const DRIVING_MIN_IDEAL_PERCENT_OF_EQUALIZER = 3
/** Acceptable driving-min share of equalizing power. */
export const DRIVING_MIN_MIN_PERCENT_OF_EQUALIZER = 1
export const DRIVING_MIN_MAX_PERCENT_OF_EQUALIZER = 5
/** Solo driving throttle targets this % under equalizing power. */
export const SOLO_UNDER_EQUALIZER_IDEAL_PERCENT = 3
/** Supplementary laser is first brought to this % under equalizing power, then tuned down. */
export const SUPPLEMENTARY_INITIAL_UNDER_EQUALIZER_PERCENT = 1

/** Modifier-only supporters at min must stay below this fraction of driving min MW. */
const MODIFIER_SUPPORT_MAX_FRACTION_OF_DRIVING_MIN = 0.35

export type MoleHeadRole = 'primary' | 'support' | 'idle'

export interface MoleHeadProfile {
  slotIndex: number
  label: string
  laserPower: number
  throttleMinimumFraction: number
  throttleMinimumPercent: number
  minLaserMw: number
  resistanceModifier: number
  optimalWindowModifier: number
  instabilityModifier: number
}

export interface MoleHeadAssignment {
  slotIndex: number
  label: string
  role: MoleHeadRole
  /** Whole-number throttle % shown to the player. */
  throttlePercent: number
  detail: string | null
}

export interface MoleLoadoutStrategy {
  assignments: MoleHeadAssignment[]
  canBreak: boolean
  requiredPower: number
  combinedWindowModifier: number
  combinedInstabilityModifier: number
  summary: string
  soloMining: boolean
  minPowerWarnings: MinPowerWarning[]
}

interface CandidateStrategy {
  assignments: MoleHeadAssignment[]
  canBreak: boolean
  requiredPower: number
  combinedWindowModifier: number
  combinedInstabilityModifier: number
  score: number
  summary: string
}

function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0%'
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export function buildMoleHeadProfile(
  slot: MiningLaserSlotConfig,
  slotIndex: number
): MoleHeadProfile | null {
  const laser = getMiningLaserByName(slot.laserName)
  const effective = computeEffectiveLaserStats(slot)
  if (!laser || !effective) return null

  const moduleMods = combineModuleModifiers(normalizeModuleSelection(slot.laserName, slot.modules))
  const throttleMinimumFraction = laser.throttleMinimum
  const throttleMinimumPercent = displayMinThrottlePercent(throttleMinimumFraction)
  const label =
    slot.customLabel?.trim() ||
    describeLaserHead(slot, laser) +
      (effective.mode === 'custom' && effective.powerMultiplier !== 1
        ? ` (${effective.laserPower.toLocaleString()} MW)`
        : '')

  return {
    slotIndex,
    label,
    laserPower: effective.laserPower,
    throttleMinimumFraction,
    throttleMinimumPercent,
    minLaserMw: Math.round(effective.laserPower * throttleMinimumFraction),
    resistanceModifier: effective.resistanceModifier,
    optimalWindowModifier: laser.optimalWindowModifier + moduleMods.optimalWindowModifier,
    instabilityModifier: effective.instabilityModifier,
  }
}

/** Modifier-only supporters: resistance > window > instability (power handled by canBreak). */
function headModifierBenefit(
  profile: MoleHeadProfile,
  rockInstability: number | null
): number {
  let benefit = 0
  if (profile.resistanceModifier < 0) {
    benefit += Math.abs(profile.resistanceModifier) * 4
  }
  if (profile.optimalWindowModifier > 0) {
    benefit += profile.optimalWindowModifier * 2.5
  }
  if (profile.instabilityModifier < 0) {
    const instabilityWeight =
      rockInstability != null && rockInstability >= 400 ? 2 : 0.75
    benefit += Math.abs(profile.instabilityModifier) * instabilityWeight
  }
  return benefit
}

function modifierDetail(profile: MoleHeadProfile): string | null {
  const parts: string[] = []
  if (profile.resistanceModifier !== 0) {
    parts.push(`${formatSignedPercent(profile.resistanceModifier)} resistance`)
  }
  if (profile.optimalWindowModifier !== 0) {
    parts.push(`${formatSignedPercent(profile.optimalWindowModifier)} window`)
  }
  if (profile.instabilityModifier !== 0) {
    parts.push(`${formatSignedPercent(profile.instabilityModifier)} instability`)
  }
  return parts.length ? parts.join(', ') : null
}

function drivingMinSharePercent(profile: MoleHeadProfile, equalizingPower: number): number {
  if (equalizingPower <= 0) return 0
  return Math.round((profile.minLaserMw / equalizingPower) * 100)
}

function isDrivingMinShareValid(sharePercent: number): boolean {
  return (
    sharePercent >= DRIVING_MIN_MIN_PERCENT_OF_EQUALIZER &&
    sharePercent <= DRIVING_MIN_MAX_PERCENT_OF_EQUALIZER
  )
}

function isViableModifierSupporter(
  supporter: MoleHeadProfile,
  drivingMinMw: number,
  rockInstability: number | null
): boolean {
  if (headModifierBenefit(supporter, rockInstability) <= 0) return false
  if (drivingMinMw <= 0) return false
  return supporter.minLaserMw <= drivingMinMw * MODIFIER_SUPPORT_MAX_FRACTION_OF_DRIVING_MIN
}

function requiredPowerForHeads(
  mass: number,
  resistancePercent: number,
  profiles: MoleHeadProfile[],
  activeIndices: number[]
): number {
  const multipliers = activeIndices.map((index) =>
    laserResistanceMultiplier(profiles[index].resistanceModifier)
  )
  const bestResistanceMultiplier = Math.min(...multipliers)
  return Math.round(requiredLaserPower(mass, resistancePercent, bestResistanceMultiplier))
}

function combinedModifiers(
  profiles: MoleHeadProfile[],
  activeIndices: number[]
): { resistance: number; window: number; instability: number } {
  let resistance = 0
  let window = 0
  let instability = 0
  for (const index of activeIndices) {
    resistance += profiles[index].resistanceModifier
    window += profiles[index].optimalWindowModifier
    instability += profiles[index].instabilityModifier
  }
  return { resistance, window, instability }
}

function buildAssignment(
  profile: MoleHeadProfile,
  role: MoleHeadRole,
  throttlePercent: number,
  detail: string | null
): MoleHeadAssignment {
  return {
    slotIndex: profile.slotIndex,
    label: profile.label,
    role,
    throttlePercent,
    detail,
  }
}

function scoreStrategy(
  canBreak: boolean,
  drivingMinSharePercent: number,
  combinedResistanceModifier: number,
  combinedWindowModifier: number,
  combinedInstabilityModifier: number,
  modifierSupportCount: number,
  instability: number | null
): number {
  if (!canBreak) return -Infinity

  let score = 10_000
  score -= Math.abs(drivingMinSharePercent - DRIVING_MIN_IDEAL_PERCENT_OF_EQUALIZER) * 12

  // Power is satisfied by canBreak; rank remaining stats: resistance > window > instability.
  if (combinedResistanceModifier < 0) {
    score += Math.abs(combinedResistanceModifier) * 6
  } else if (combinedResistanceModifier > 0) {
    score -= combinedResistanceModifier * 8
  }

  score += combinedWindowModifier * 3
  score -= modifierSupportCount * 2

  if (instability != null && instability >= 400) {
    if (combinedInstabilityModifier < 0) {
      score += Math.abs(combinedInstabilityModifier) * 2
    } else if (combinedInstabilityModifier > 0) {
      score -= combinedInstabilityModifier * 3
    }
  } else if (combinedInstabilityModifier > 0) {
    score -= combinedInstabilityModifier
  }

  if (modifierSupportCount > 0 && combinedResistanceModifier < 0) {
    score += 20
  }
  if (modifierSupportCount > 0 && combinedWindowModifier > 0) {
    score += 10
  }

  return score
}

function soloDrivingThrottlePercent(
  profile: MoleHeadProfile,
  equalizingPower: number,
  underPercent = SOLO_UNDER_EQUALIZER_IDEAL_PERCENT
): number | null {
  const targetMw = equalizingPower * (1 - underPercent / 100)
  const throttlePercent = throttlePercentFromMw(targetMw, profile.laserPower)
  const minPercent = profile.throttleMinimumPercent

  if (throttlePercent > 100) return null
  if (throttlePercent < minPercent) {
    const minMw = profile.minLaserMw
    if (minMw >= equalizingPower) return null
    return minPercent
  }
  return throttlePercent
}

function supplementaryThrottleForCrew(
  profile: MoleHeadProfile,
  equalizingPower: number,
  drivingMinMw: number,
  modifierSupportMinMw: number
): number | null {
  const targetMw = equalizingPower - drivingMinMw - modifierSupportMinMw
  if (targetMw <= 0) return null

  const throttlePercent = throttlePercentFromMw(targetMw, profile.laserPower)
  if (throttlePercent > 100) return null
  if (throttlePercent < profile.throttleMinimumPercent) return null

  const initialUnderMw =
    equalizingPower * (1 - SUPPLEMENTARY_INITIAL_UNDER_EQUALIZER_PERCENT / 100)
  const initialThrottle = throttlePercentFromMw(initialUnderMw, profile.laserPower)
  if (initialThrottle > 100) return null

  return throttlePercent
}

function evaluateCrewStrategy(
  profiles: MoleHeadProfile[],
  drivingIndex: number,
  mainSupplementaryIndex: number | null,
  modifierOnlyIndices: number[],
  mass: number,
  resistancePercent: number,
  instability: number | null
): CandidateStrategy | null {
  const driving = profiles.find((p) => p.slotIndex === drivingIndex)
  if (!driving) return null

  const activeIndices = [drivingIndex]
  if (mainSupplementaryIndex != null) activeIndices.push(mainSupplementaryIndex)
  for (const index of modifierOnlyIndices) {
    if (!activeIndices.includes(index)) activeIndices.push(index)
  }

  const equalizingPower = requiredPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const drivingShare = drivingMinSharePercent(driving, equalizingPower)

  if (mainSupplementaryIndex != null) {
    if (!isDrivingMinShareValid(drivingShare)) return null

    const mainSupp = profiles.find((p) => p.slotIndex === mainSupplementaryIndex)
    if (!mainSupp) return null

    const viableModifiers = modifierOnlyIndices.filter((index) => {
      if (index === mainSupplementaryIndex || index === drivingIndex) return false
      return isViableModifierSupporter(
        profiles.find((p) => p.slotIndex === index)!,
        driving.minLaserMw,
        instability
      )
    })
    if (viableModifiers.length !== modifierOnlyIndices.length) return null

    const modifierSupportMinMw = viableModifiers.reduce(
      (sum, index) => sum + (profiles.find((p) => p.slotIndex === index)?.minLaserMw ?? 0),
      0
    )

    const suppThrottle = supplementaryThrottleForCrew(
      mainSupp,
      equalizingPower,
      driving.minLaserMw,
      modifierSupportMinMw
    )
    if (suppThrottle == null) return null

    const mods = combinedModifiers(profiles, activeIndices)
    const drivingDetail = [
      `Driving laser at min throttle (${driving.throttleMinimumPercent}%) — ${drivingShare}% of resistance equalizer`,
      'Raise throttle from min for fine fracture control',
      modifierDetail(driving),
    ]
      .filter(Boolean)
      .join(' · ')

    const suppDetail = [
      `Resistance match at ${suppThrottle}% (tuned from ${SUPPLEMENTARY_INITIAL_UNDER_EQUALIZER_PERCENT}% under equalizer)`,
      modifierDetail(mainSupp),
    ]
      .filter(Boolean)
      .join(' · ')

    const assignments = profiles.map((profile) => {
      if (profile.slotIndex === drivingIndex) {
        return buildAssignment(profile, 'primary', driving.throttleMinimumPercent, drivingDetail)
      }
      if (profile.slotIndex === mainSupplementaryIndex) {
        return buildAssignment(profile, 'support', suppThrottle, suppDetail)
      }
      if (viableModifiers.includes(profile.slotIndex)) {
        const modDetail = modifierDetail(profile)
        return buildAssignment(
          profile,
          'support',
          profile.throttleMinimumPercent,
          [
            `Module bonuses at min throttle (${profile.throttleMinimumPercent}%)`,
            modDetail,
          ]
            .filter(Boolean)
            .join(' · ')
        )
      }
      return buildAssignment(profile, 'idle', 0, 'Off — not needed for this rock')
    })

    const modifierLabels = viableModifiers.map((i) => `Head ${i + 1}`)
    const summary =
      modifierLabels.length > 0
        ? `Head ${drivingIndex + 1} drives at ${driving.throttleMinimumPercent}% min; Head ${mainSupplementaryIndex + 1} matches resistance at ${suppThrottle}%; ${modifierLabels.join(' + ')} at min for modules.`
        : `Head ${drivingIndex + 1} drives at ${driving.throttleMinimumPercent}% min; Head ${mainSupplementaryIndex + 1} matches resistance at ${suppThrottle}%.`

    return {
      assignments,
      canBreak: true,
      requiredPower: equalizingPower,
      combinedWindowModifier: mods.window,
      combinedInstabilityModifier: mods.instability,
      summary,
      score: scoreStrategy(
        true,
        drivingShare,
        mods.resistance,
        mods.window,
        mods.instability,
        viableModifiers.length,
        instability
      ),
    }
  }

  const soloThrottle = soloDrivingThrottlePercent(driving, equalizingPower)
  if (soloThrottle == null) return null

  const mods = combinedModifiers(profiles, [drivingIndex])
  const drivingDetail = [
    `Fracture at ${soloThrottle}% (~${SOLO_UNDER_EQUALIZER_IDEAL_PERCENT}% under resistance equalizer)`,
    modifierDetail(driving),
  ]
    .filter(Boolean)
    .join(' · ')

  const assignments = profiles.map((profile) => {
    if (profile.slotIndex === drivingIndex) {
      return buildAssignment(profile, 'primary', soloThrottle, drivingDetail)
    }
    return buildAssignment(profile, 'idle', 0, 'Off — crew partner not running a second laser')
  })

  return {
    assignments,
    canBreak: true,
    requiredPower: equalizingPower,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: `Head ${drivingIndex + 1} fractures at ${soloThrottle}% — no supplementary laser needed.`,
    score: scoreStrategy(
      true,
      drivingShare,
      mods.resistance,
      mods.window,
      mods.instability,
      0,
      instability
    ) - 5,
  }
}

function evaluateSingleHeadOnly(
  profiles: MoleHeadProfile[],
  primaryIndex: number,
  mass: number,
  resistancePercent: number
): CandidateStrategy {
  const primary = profiles[primaryIndex]
  const activeIndices = [primaryIndex]
  const equalizingPower = requiredPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const throttlePercent = soloDrivingThrottlePercent(primary, equalizingPower)
  const canBreak = throttlePercent != null && throttlePercent <= 100
  const mods = combinedModifiers(profiles, activeIndices)

  const assignments = profiles.map((profile) => {
    if (profile.slotIndex === primaryIndex) {
      const modDetail = modifierDetail(profile)
      return buildAssignment(
        profile,
        'primary',
        canBreak ? throttlePercent! : 100,
        canBreak
          ? [
              `Fracture at ${throttlePercent}% (~${SOLO_UNDER_EQUALIZER_IDEAL_PERCENT}% under resistance equalizer)`,
              modDetail,
            ]
              .filter(Boolean)
              .join(' · ')
          : `Short at full throttle — need a stronger head or support laser`
      )
    }
    return buildAssignment(profile, 'idle', 0, 'Off — solo mining uses one head only')
  })

  return {
    assignments,
    canBreak,
    requiredPower: equalizingPower,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: canBreak
      ? `Solo — Head ${primaryIndex + 1} fractures at ${throttlePercent}% throttle.`
      : `Solo — Head ${primaryIndex + 1} cannot crack this rock at full throttle.`,
    score: canBreak
      ? scoreStrategy(
          true,
          drivingMinSharePercent(primary, equalizingPower),
          mods.resistance,
          mods.window,
          mods.instability,
          0,
          null
        )
      : -equalizingPower + primary.laserPower,
  }
}

function enumerateModifierSubsets(
  profiles: MoleHeadProfile[],
  drivingIndex: number,
  mainSupplementaryIndex: number
): number[][] {
  const others = profiles
    .map((profile) => profile.slotIndex)
    .filter((index) => index !== drivingIndex && index !== mainSupplementaryIndex)
  const subsets: number[][] = [[]]

  for (const index of others) {
    const next = subsets.map((subset) => [...subset, index])
    subsets.push(...next)
  }

  return subsets
}

function crewMinPowerWarnings(
  lasers: MiningLaserSlotConfig[],
  assignments: MoleHeadAssignment[],
  equalizingPower: number
): MinPowerWarning[] {
  const warnings: MinPowerWarning[] = []

  for (const assignment of assignments) {
    if (assignment.role !== 'primary') continue
    const slot = lasers[assignment.slotIndex]
    if (!slot) continue
    const profile = buildMoleHeadProfile(slot, assignment.slotIndex)
    if (!profile) continue

    const share = drivingMinSharePercent(profile, equalizingPower)
    if (assignment.throttlePercent === profile.throttleMinimumPercent) {
      if (share < DRIVING_MIN_MIN_PERCENT_OF_EQUALIZER) {
        warnings.push({
          slotIndex: assignment.slotIndex,
          label: assignment.label,
          requiredMw: Math.round(equalizingPower * (DRIVING_MIN_IDEAL_PERCENT_OF_EQUALIZER / 100)),
          minLaserMw: profile.minLaserMw,
          throttleMinimumPercent: profile.throttleMinimumPercent,
          level: 'misconfigured',
        })
      } else if (share > DRIVING_MIN_MAX_PERCENT_OF_EQUALIZER) {
        warnings.push({
          slotIndex: assignment.slotIndex,
          label: assignment.label,
          requiredMw: Math.round(equalizingPower * (DRIVING_MIN_IDEAL_PERCENT_OF_EQUALIZER / 100)),
          minLaserMw: profile.minLaserMw,
          throttleMinimumPercent: profile.throttleMinimumPercent,
          level: 'misconfigured',
        })
      }
    } else {
      const warning = assessMinPowerWarningForSlot(
        slot.laserName,
        equalizingPower,
        profile.laserPower,
        assignment.label,
        assignment.slotIndex
      )
      if (warning) warnings.push(warning)
    }
  }

  return warnings
}

export interface MoleStrategyOptions {
  soloMining: boolean
}

export function findBestMoleLoadoutStrategy(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  options: MoleStrategyOptions
): MoleLoadoutStrategy | null {
  if (target.scannerMass == null || target.resistancePercent == null) return null

  const profiles = lasers
    .map((slot, slotIndex) => buildMoleHeadProfile(slot, slotIndex))
    .filter((profile): profile is MoleHeadProfile => profile != null)

  if (!profiles.length) return null

  const mass = target.scannerMass
  const resistancePercent = target.resistancePercent
  const instability = target.instability

  const candidates: CandidateStrategy[] = []

  if (options.soloMining) {
    for (const primary of profiles) {
      candidates.push(evaluateSingleHeadOnly(profiles, primary.slotIndex, mass, resistancePercent))
    }
  } else {
    if (profiles.length < 2) return null

    for (const driving of profiles) {
      const soloCrew = evaluateCrewStrategy(
        profiles,
        driving.slotIndex,
        null,
        [],
        mass,
        resistancePercent,
        instability
      )
      if (soloCrew) candidates.push(soloCrew)

      for (const supplementary of profiles) {
        if (supplementary.slotIndex === driving.slotIndex) continue
        for (const modifierOnly of enumerateModifierSubsets(
          profiles,
          driving.slotIndex,
          supplementary.slotIndex
        )) {
          const candidate = evaluateCrewStrategy(
            profiles,
            driving.slotIndex,
            supplementary.slotIndex,
            modifierOnly,
            mass,
            resistancePercent,
            instability
          )
          if (candidate) candidates.push(candidate)
        }
      }
    }
  }

  if (!candidates.length) return null

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]

  return {
    assignments: best.assignments,
    canBreak: best.canBreak,
    requiredPower: best.requiredPower,
    combinedWindowModifier: best.combinedWindowModifier,
    combinedInstabilityModifier: best.combinedInstabilityModifier,
    summary: best.summary,
    soloMining: options.soloMining,
    minPowerWarnings: options.soloMining
      ? primaryMinPowerWarningsSolo(lasers, best.assignments, best.requiredPower)
      : crewMinPowerWarnings(lasers, best.assignments, best.requiredPower),
  }
}

function primaryMinPowerWarningsSolo(
  lasers: MiningLaserSlotConfig[],
  assignments: MoleHeadAssignment[],
  equalizingPower: number
): MinPowerWarning[] {
  const warnings: MinPowerWarning[] = []

  for (const assignment of assignments) {
    if (assignment.role !== 'primary') continue
    const slot = lasers[assignment.slotIndex]
    if (!slot) continue
    const profile = buildMoleHeadProfile(slot, assignment.slotIndex)
    if (!profile) continue

    const targetMw = equalizingPower * (1 - SOLO_UNDER_EQUALIZER_IDEAL_PERCENT / 100)
    const warning = assessMinPowerWarningForSlot(
      slot.laserName,
      Math.round(targetMw),
      profile.laserPower,
      assignment.label,
      assignment.slotIndex
    )
    if (warning) warnings.push(warning)
  }

  return warnings
}
