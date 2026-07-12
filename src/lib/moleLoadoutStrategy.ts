import {
  crackablePower,
  effectiveHudResistancePercent,
  equalizationPower,
} from './miningBreakability'
import {
  computeEffectiveLaserStats,
  describeLaserHead,
  laserResistanceMultiplier,
  type MiningLaserSlotConfig,
} from './miningLaserStats'
import { combinePassiveModuleModifiers, normalizeModuleSelection } from './miningModules'
import type { RockBreakabilityTarget } from './miningLoadoutCompare'
import { formatSignedNumber, formatSignedPercent } from './miningLoadoutStatSemantics'
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
/** Crew 2-head plan: target this % under resistance equalizer (before instability bump). */
export const CREW_UNDER_TWO_HEAD_PERCENT = 3
/** Crew 3-head plan: target this % under resistance equalizer (before instability bump). */
export const CREW_UNDER_THREE_HEAD_PERCENT = 6
/** Within this MW, heads are treated as a power tie for driver vs full-blast selection. */
export const POWER_TIE_MW = 150

const HIGH_INSTABILITY_SCANNER = 400
const HIGHEST_INSTABILITY_DRIVER_PENALTY = 450

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

export function buildMoleHeadProfile(
  slot: MiningLaserSlotConfig,
  slotIndex: number
): MoleHeadProfile | null {
  const laser = getMiningLaserByName(slot.laserName)
  const effective = computeEffectiveLaserStats(slot)
  if (!laser || !effective) return null

  const moduleMods = combinePassiveModuleModifiers(normalizeModuleSelection(slot.laserName, slot.modules))
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

/** Modifier benefit for driver selection: resistance > window > instability reduction. */
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
      rockInstability != null && rockInstability >= HIGH_INSTABILITY_SCANNER ? 2 : 0.75
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
    parts.push(`${formatSignedNumber(profile.instabilityModifier)} instability`)
  }
  return parts.length ? parts.join(', ') : null
}

function profileByIndex(
  profiles: MoleHeadProfile[],
  index: number
): MoleHeadProfile | undefined {
  return profiles.find((p) => p.slotIndex === index)
}

/**
 * Equalization power for heads — stable point where charge rate = decay rate.
 * Used for throttle targeting (crew wants to hold just under this).
 */
function equalizationPowerForHeads(
  mass: number,
  resistancePercent: number,
  profiles: MoleHeadProfile[],
  activeIndices: number[]
): number {
  const multipliers = activeIndices.map((index) => {
    const profile = profileByIndex(profiles, index)
    return laserResistanceMultiplier(profile?.resistanceModifier ?? 0)
  })
  const bestResistanceMultiplier = Math.min(...multipliers)
  return Math.round(equalizationPower(mass, resistancePercent, bestResistanceMultiplier))
}

/**
 * Crackable power for heads — actual power needed to fracture (includes instability margin).
 * Used for canBreak checks.
 */
function crackablePowerForHeads(
  mass: number,
  resistancePercent: number,
  instability: number | null,
  profiles: MoleHeadProfile[],
  activeIndices: number[]
): number {
  const multipliers = activeIndices.map((index) => {
    const profile = profileByIndex(profiles, index)
    return laserResistanceMultiplier(profile?.resistanceModifier ?? 0)
  })
  const bestResistanceMultiplier = Math.min(...multipliers)
  return Math.round(crackablePower(mass, resistancePercent, instability ?? 0, bestResistanceMultiplier))
}

function combinedModifiers(
  profiles: MoleHeadProfile[],
  activeIndices: number[]
): { resistance: number; window: number; instability: number } {
  let resistance = 0
  let window = 0
  let instability = 0
  for (const index of activeIndices) {
    const profile = profileByIndex(profiles, index)
    if (!profile) continue
    resistance += profile.resistanceModifier
    window += profile.optimalWindowModifier
    instability += profile.instabilityModifier
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

export function crewUnderPercent(
  activeHeadCount: number,
  scannerInstability: number | null
): number {
  const base =
    activeHeadCount >= 3 ? CREW_UNDER_THREE_HEAD_PERCENT : CREW_UNDER_TWO_HEAD_PERCENT
  if (scannerInstability != null && scannerInstability >= HIGH_INSTABILITY_SCANNER) {
    return base + 1
  }
  return base
}

function powerWithinTie(a: MoleHeadProfile, b: MoleHeadProfile): boolean {
  return Math.abs(a.laserPower - b.laserPower) <= POWER_TIE_MW
}

function maxInstabilityModifier(profiles: MoleHeadProfile[]): number {
  return Math.max(...profiles.map((p) => p.instabilityModifier))
}

function soloDrivingThrottlePercent(
  profile: MoleHeadProfile,
  equalizingPower: number,
  underPercent = SOLO_UNDER_EQUALIZER_IDEAL_PERCENT
): number | null {
  const targetMw = equalizingPower * (1 - underPercent / 100)
  if (targetMw > profile.laserPower) return null

  const throttlePercent = throttlePercentFromMw(targetMw, profile.laserPower)
  const minPercent = profile.throttleMinimumPercent
  if (throttlePercent < minPercent) {
    if (profile.minLaserMw >= equalizingPower) return null
    return minPercent
  }
  return throttlePercent
}

function sortSupportIndices(
  profiles: MoleHeadProfile[],
  supportIndices: number[]
): number[] {
  return [...supportIndices].sort((a, b) => {
    const pa = profileByIndex(profiles, a)
    const pb = profileByIndex(profiles, b)
    if (!pa || !pb) return 0
    if (pa.laserPower !== pb.laserPower) return pa.laserPower - pb.laserPower
    return pa.slotIndex - pb.slotIndex
  })
}

function scoreCrewFullBlastStrategy(
  canBreak: boolean,
  activeHeadCount: number,
  driver: MoleHeadProfile,
  supports: MoleHeadProfile[],
  driverThrottle: number,
  combinedResistanceModifier: number,
  combinedWindowModifier: number,
  combinedInstabilityModifier: number,
  instability: number | null,
  allProfiles: MoleHeadProfile[],
  statDrivenDriver: boolean
): number {
  if (!canBreak) return -Infinity

  let score = 10_000

  score -= (activeHeadCount - 1) * 80
  score += headModifierBenefit(driver, instability) * 2
  score -= driverThrottle * 0.35

  if (driver.instabilityModifier >= maxInstabilityModifier(allProfiles)) {
    score -= HIGHEST_INSTABILITY_DRIVER_PENALTY
  }

  for (const support of supports) {
    if (headModifierBenefit(support, instability) > headModifierBenefit(driver, instability) + 15) {
      score -= 35
    }
  }

  if (statDrivenDriver) {
    score += 25
  }

  if (combinedResistanceModifier < 0) {
    score += Math.abs(combinedResistanceModifier) * 6
  } else if (combinedResistanceModifier > 0) {
    score -= combinedResistanceModifier * 8
  }

  score += combinedWindowModifier * 3

  if (instability != null && instability >= HIGH_INSTABILITY_SCANNER) {
    if (combinedInstabilityModifier < 0) {
      score += Math.abs(combinedInstabilityModifier) * 2
    } else if (combinedInstabilityModifier > 0) {
      score -= combinedInstabilityModifier * 3
    }
  } else if (combinedInstabilityModifier > 0) {
    score -= combinedInstabilityModifier
  }

  return score
}

function buildCrewSummary(
  driver: MoleHeadProfile,
  supports: MoleHeadProfile[],
  driverThrottle: number,
  underPercent: number,
  threeLaser: boolean
): string {
  const supportLabels = supports.map((s) => `Head ${s.slotIndex + 1}`).join(' + ')
  if (supports.length === 0) {
    return `Head ${driver.slotIndex + 1} drives at ${driverThrottle}% (~${underPercent}% under equalizer) — crew partner not needed on other turrets.`
  }
  if (threeLaser) {
    return `${supportLabels} full @ 100% first; Head ${driver.slotIndex + 1} drives at ${driverThrottle}% — three-laser crack (~${underPercent}% under equalizer).`
  }
  return `Head ${supports[0].slotIndex + 1} full @ 100% first; Head ${driver.slotIndex + 1} drives at ${driverThrottle}% (~${underPercent}% under equalizer).`
}

function buildPowerTieNote(
  driver: MoleHeadProfile,
  supports: MoleHeadProfile[]
): string | null {
  const tied = supports.some((s) => powerWithinTie(driver, s))
  if (!tied) return null
  return 'Heads within 150 MW — driver picked for module stack and lower laser instability'
}

function evaluateCrewFullBlastPlan(
  profiles: MoleHeadProfile[],
  driverIndex: number,
  supportIndices: number[],
  mass: number,
  resistancePercent: number,
  instability: number | null
): CandidateStrategy | null {
  const driver = profileByIndex(profiles, driverIndex)
  if (!driver) return null

  const sortedSupports = sortSupportIndices(profiles, supportIndices)
  const supportProfiles = sortedSupports
    .map((index) => profileByIndex(profiles, index))
    .filter((p): p is MoleHeadProfile => p != null)

  const activeIndices = [driverIndex, ...sortedSupports]
  const activeHeadCount = activeIndices.length
  const equalizingPower = equalizationPowerForHeads(
    mass,
    resistancePercent,
    profiles,
    activeIndices
  )
  const crackableThreshold = crackablePowerForHeads(
    mass,
    resistancePercent,
    instability,
    profiles,
    activeIndices
  )
  const underPercent = crewUnderPercent(activeHeadCount, instability)
  const mods = combinedModifiers(profiles, activeIndices)

  if (supportProfiles.length === 0) {
    const throttlePercent = soloDrivingThrottlePercent(driver, equalizingPower, underPercent)
    if (throttlePercent == null) return null

    const drivingDetail = [
      `Drive at ${throttlePercent}% (~${underPercent}% under resistance equalizer)`,
      modifierDetail(driver),
    ]
      .filter(Boolean)
      .join(' · ')

    const assignments = profiles.map((profile) => {
      if (profile.slotIndex === driverIndex) {
        return buildAssignment(profile, 'primary', throttlePercent, drivingDetail)
      }
      return buildAssignment(profile, 'idle', 0, 'Off — crew partner not needed on other turrets')
    })

    // Single driver must exceed crackable threshold
    if (driver.laserPower < crackableThreshold) return null

    return {
      assignments,
      canBreak: true,
      requiredPower: crackableThreshold,
      combinedWindowModifier: mods.window,
      combinedInstabilityModifier: mods.instability,
      summary: buildCrewSummary(driver, [], throttlePercent, underPercent, false),
      score: scoreCrewFullBlastStrategy(
        true,
        1,
        driver,
        [],
        throttlePercent,
        mods.resistance,
        mods.window,
        mods.instability,
        instability,
        profiles,
        false
      ),
    }
  }

  const targetTotalMw = equalizingPower * (1 - underPercent / 100)
  const supportMw = supportProfiles.reduce((sum, p) => sum + p.laserPower, 0)
  const maxCombinedMw = supportMw + driver.laserPower

  // Must be able to exceed crackable threshold (equalization + instability margin)
  if (maxCombinedMw < crackableThreshold) return null
  // Must also be able to reach coordination target
  if (maxCombinedMw < targetTotalMw) return null

  const driverMw = targetTotalMw - supportMw

  if (driverMw <= 0 || driverMw > driver.laserPower || driverMw < driver.minLaserMw) {
    return null
  }

  const driverThrottle = throttlePercentFromMw(driverMw, driver.laserPower)
  if (
    driverThrottle > 100 ||
    driverThrottle < driver.throttleMinimumPercent
  ) {
    return null
  }

  const statDrivenDriver = supportProfiles.some((s) => powerWithinTie(driver, s))
  const powerTieNote = buildPowerTieNote(driver, supportProfiles)
  const threeLaser = activeHeadCount >= 3

  const assignments = profiles.map((profile) => {
    if (profile.slotIndex === driverIndex) {
      const parts = [
        `Drive at ${driverThrottle}% after full-blast head(s) (~${underPercent}% under equalizer combined)`,
        powerTieNote,
        modifierDetail(profile),
      ].filter(Boolean)
      return buildAssignment(profile, 'primary', driverThrottle, parts.join(' · '))
    }

    if (sortedSupports.includes(profile.slotIndex)) {
      const order =
        sortedSupports.indexOf(profile.slotIndex) + 1
      const parts = [
        `Run at 100% first (full-blast #${order})`,
        modifierDetail(profile),
      ].filter(Boolean)
      return buildAssignment(profile, 'support', 100, parts.join(' · '))
    }

    return buildAssignment(profile, 'idle', 0, 'Off — not needed for this rock')
  })

  return {
    assignments,
    canBreak: true,
    requiredPower: crackableThreshold,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: buildCrewSummary(driver, supportProfiles, driverThrottle, underPercent, threeLaser),
    score: scoreCrewFullBlastStrategy(
      true,
      activeHeadCount,
      driver,
      supportProfiles,
      driverThrottle,
      mods.resistance,
      mods.window,
      mods.instability,
      instability,
      profiles,
      statDrivenDriver
    ),
  }
}

function soloHeadFractureNotes(
  profile: MoleHeadProfile,
  pilotResistancePercent: number,
  equalizingPower: number
): string {
  const effectiveHudRes = effectiveHudResistancePercent(
    pilotResistancePercent,
    profile.resistanceModifier
  )
  return [
    `pilot RES ${Math.round(pilotResistancePercent)}% → ${effectiveHudRes}% on this head`,
    `${profile.laserPower.toLocaleString()} MW after modules`,
    `${equalizingPower.toLocaleString()} MW required`,
  ].join(' · ')
}

function evaluateSingleHeadOnly(
  profiles: MoleHeadProfile[],
  primaryIndex: number,
  mass: number,
  resistancePercent: number,
  instability: number | null
): CandidateStrategy {
  const primary = profiles[primaryIndex]
  const activeIndices = [primaryIndex]
  const equalizingPower = equalizationPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const crackableThreshold = crackablePowerForHeads(mass, resistancePercent, instability, profiles, activeIndices)
  const canBreakAtFull = primary.laserPower >= crackableThreshold
  const throttlePercent = canBreakAtFull
    ? soloDrivingThrottlePercent(primary, equalizingPower)
    : null
  const canBreak = canBreakAtFull && throttlePercent != null
  const mods = combinedModifiers(profiles, activeIndices)
  const fractureNotes = soloHeadFractureNotes(primary, resistancePercent, equalizingPower)

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
              fractureNotes,
              modDetail,
            ]
              .filter(Boolean)
              .join(' · ')
          : `Cannot crack at full throttle — ${fractureNotes}${modDetail ? ` · ${modDetail}` : ''}`
      )
    }
    return buildAssignment(profile, 'idle', 0, 'Off — solo mining uses one head only')
  })

  return {
    assignments,
    canBreak,
    requiredPower: crackableThreshold,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: canBreak
      ? `Solo — Head ${primaryIndex + 1} fractures at ${throttlePercent}% throttle.`
      : `Solo — Head ${primaryIndex + 1} cannot crack this rock at full throttle.`,
    score: canBreak
      ? scoreCrewFullBlastStrategy(
          true,
          1,
          primary,
          [],
          throttlePercent!,
          mods.resistance,
          mods.window,
          mods.instability,
          null,
          profiles,
          false
        )
      : -crackableThreshold + primary.laserPower,
  }
}

function crewMinPowerWarnings(
  lasers: MiningLaserSlotConfig[],
  assignments: MoleHeadAssignment[],
  equalizingPower: number,
  underPercent: number
): MinPowerWarning[] {
  const warnings: MinPowerWarning[] = []

  for (const assignment of assignments) {
    if (assignment.role !== 'primary') continue
    const slot = lasers[assignment.slotIndex]
    if (!slot) continue
    const profile = buildMoleHeadProfile(slot, assignment.slotIndex)
    if (!profile) continue

    const targetMw = Math.round(equalizingPower * (1 - underPercent / 100))
    const warning = assessMinPowerWarningForSlot(
      slot.laserName,
      targetMw,
      profile.laserPower,
      assignment.label,
      assignment.slotIndex
    )
    if (warning) warnings.push(warning)
  }

  return warnings
}

function activeHeadCountFromAssignments(assignments: MoleHeadAssignment[]): number {
  return assignments.filter((a) => a.role !== 'idle').length
}

function maxCombinedLaserMw(profiles: MoleHeadProfile[]): number {
  return profiles.reduce((sum, profile) => sum + profile.laserPower, 0)
}

function buildUncrackableCrewStrategy(
  profiles: MoleHeadProfile[],
  mass: number,
  resistancePercent: number,
  instability: number | null
): MoleLoadoutStrategy {
  const allIndices = profiles.map((profile) => profile.slotIndex)
  const crackableThreshold = crackablePowerForHeads(
    mass,
    resistancePercent,
    instability,
    profiles,
    allIndices
  )
  const mods = combinedModifiers(profiles, allIndices)

  const assignments = profiles.map((profile) =>
    buildAssignment(profile, 'idle', 0, 'Off — rock exceeds this loadout')
  )

  const maxMw = maxCombinedLaserMw(profiles)
  const summary =
    maxMw < crackableThreshold
      ? 'This rock is too large for three full-blast turrets on this loadout — skip it or bring more moles.'
      : 'No two- or three-head crew plan can crack this rock on this loadout — skip it or bring more moles.'

  return {
    assignments,
    canBreak: false,
    requiredPower: crackableThreshold,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary,
    soloMining: false,
    minPowerWarnings: [],
  }
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
      candidates.push(evaluateSingleHeadOnly(profiles, primary.slotIndex, mass, resistancePercent, instability))
    }
  } else {
    if (profiles.length < 2) return null

    const allIndices = profiles.map((profile) => profile.slotIndex)
    const crackableThreshold = crackablePowerForHeads(
      mass,
      resistancePercent,
      instability,
      profiles,
      allIndices
    )
    // Early exit if max combined power can't reach crackable threshold
    if (maxCombinedLaserMw(profiles) < crackableThreshold) {
      return buildUncrackableCrewStrategy(
        profiles,
        mass,
        resistancePercent,
        instability
      )
    }

    for (const driver of profiles) {
      const oneHead = evaluateCrewFullBlastPlan(
        profiles,
        driver.slotIndex,
        [],
        mass,
        resistancePercent,
        instability
      )
      if (oneHead) candidates.push(oneHead)

      for (const support of profiles) {
        if (support.slotIndex === driver.slotIndex) continue
        const twoHead = evaluateCrewFullBlastPlan(
          profiles,
          driver.slotIndex,
          [support.slotIndex],
          mass,
          resistancePercent,
          instability
        )
        if (twoHead) candidates.push(twoHead)
      }

      if (profiles.length >= 3) {
        for (let i = 0; i < profiles.length; i++) {
          for (let j = i + 1; j < profiles.length; j++) {
            const s1 = profiles[i]
            const s2 = profiles[j]
            if (s1.slotIndex === driver.slotIndex || s2.slotIndex === driver.slotIndex) continue
            const threeHead = evaluateCrewFullBlastPlan(
              profiles,
              driver.slotIndex,
              [s1.slotIndex, s2.slotIndex],
              mass,
              resistancePercent,
              instability
            )
            if (threeHead) candidates.push(threeHead)
          }
        }
      }
    }
  }

  if (!candidates.length) {
    return options.soloMining
      ? null
      : buildUncrackableCrewStrategy(profiles, mass, resistancePercent, instability)
  }

  candidates.sort((a, b) => {
    if (a.canBreak !== b.canBreak) return a.canBreak ? -1 : 1
    return b.score - a.score
  })
  const best = candidates[0]
  const activeCount = activeHeadCountFromAssignments(best.assignments)
  const crewUnder = crewUnderPercent(activeCount, instability)

  return {
    assignments: best.assignments,
    canBreak: best.canBreak,
    requiredPower: best.requiredPower,
    combinedWindowModifier: best.combinedWindowModifier,
    combinedInstabilityModifier: best.combinedInstabilityModifier,
    summary: best.summary,
    soloMining: options.soloMining,
    minPowerWarnings: options.soloMining
      ? crewMinPowerWarnings(lasers, best.assignments, best.requiredPower, SOLO_UNDER_EQUALIZER_IDEAL_PERCENT)
      : crewMinPowerWarnings(lasers, best.assignments, best.requiredPower, crewUnder),
  }
}
