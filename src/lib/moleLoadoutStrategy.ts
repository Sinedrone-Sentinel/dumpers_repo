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
import { getOreWindowProfile } from './mineableElementStats'
import { combinePassiveModuleModifiers, normalizeModuleSelection } from './miningModules'
import type { RockBreakabilityTarget } from './miningLoadoutCompare'
import { formatSignedPercent } from './miningLoadoutStatSemantics'
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
  /** Beam optimal range (m) — beyond this, power transfer falls off. */
  optimalRange: number
}

export interface MoleHeadAssignment {
  slotIndex: number
  label: string
  role: MoleHeadRole
  /** Whole-number throttle % shown to the player. */
  throttlePercent: number
  detail: string | null
  /** For idle heads in solo mode: could this seat crack the rock on its own? */
  backupViability?: 'works' | 'cannot'
  /** Combined laser + passive module optimal-window modifier % for this head. */
  windowModifierPercent: number
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
  /** Crew plan composition — used for the benefit-seat augmentation pass. */
  driverIndex?: number
  supportIndices?: number[]
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
    optimalRange: laser.optimalRange,
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
    parts.push(`${formatSignedPercent(profile.instabilityModifier)} instability`)
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
 *
 * Head/module "Laser Instability" % modifies the rock's effective instability on that seat
 * MULTIPLICATIVELY, the same way the resistance modifier works (confirmed in-game: seat HUD
 * shows a lower instability than the pilot scan on stabilizing heads).
 * Uses the best (lowest) multiplier across active heads, matching resistance handling.
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

  const instabilityMultipliers = activeIndices.map((index) => {
    const profile = profileByIndex(profiles, index)
    return 1 + (profile?.instabilityModifier ?? 0) / 100
  })
  const bestInstabilityMultiplier = Math.min(...instabilityMultipliers)
  const effectiveInstability = Math.max(0, (instability ?? 0) * bestInstabilityMultiplier)

  return Math.round(crackablePower(mass, resistancePercent, effectiveInstability, bestResistanceMultiplier))
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
  detail: string | null,
  backupViability?: 'works' | 'cannot'
): MoleHeadAssignment {
  return {
    slotIndex: profile.slotIndex,
    label: profile.label,
    role,
    throttlePercent,
    detail,
    windowModifierPercent: profile.optimalWindowModifier,
    ...(backupViability ? { backupViability } : {}),
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

/**
 * Solo cracking throttle: target equalization power (stable point).
 * User feathers up from equalization to build charge — instability fluctuations help.
 * For easy rocks, equalization is enough. For tough rocks, user adds power as needed.
 *
 * Returns null only if laser max power cannot reach equalization.
 * If minimum throttle exceeds target, use minimum — caller handles crackability.
 */
function soloCrackingThrottlePercent(
  profile: MoleHeadProfile,
  equalizingPower: number
): number | null {
  const targetMw = equalizingPower
  if (targetMw > profile.laserPower) return null

  const throttlePercent = throttlePercentFromMw(targetMw, profile.laserPower)
  const minPercent = profile.throttleMinimumPercent
  // If target < minimum throttle output, use minimum — slight overshoot is fine for solo
  if (throttlePercent < minPercent) {
    return minPercent
  }
  return throttlePercent
}

/**
 * Crew plan scoring — fewest lasers with the best power headroom wins.
 *
 * Field-verified driver rules:
 * - The driver does the final ramp-up and window filling, so lighter (lower MW)
 *   heads are generally preferred as drivers.
 * - Exception: if the light head ADDS laser instability and the window is tight
 *   (or the rock itself is highly unstable), a stable head — usually the medium
 *   power seat — takes driver instead.
 * - Exact ties go round-robin clockwise: seat 1 → seat 3 → seat 2.
 */
const DRIVER_ROUND_ROBIN_BONUS: Record<number, number> = { 0: 0.3, 2: 0.2, 1: 0.1 }

function scoreCrewPlan(
  activeHeadCount: number,
  driver: MoleHeadProfile,
  mods: { resistance: number; window: number; instability: number },
  instability: number | null,
  windowTight: boolean,
  maxCombinedMw: number,
  crackableThreshold: number
): number {
  let score = 10_000

  // Fewest lasers dominates all other preferences.
  score -= (activeHeadCount - 1) * 300

  // Power headroom over the crackable threshold — more room = smoother crack.
  const headroom =
    crackableThreshold > 0 ? (maxCombinedMw - crackableThreshold) / crackableThreshold : 0
  score += Math.min(headroom, 1.5) * 100

  // Lighter drivers preferred — they ramp with finer control.
  score -= driver.laserPower * 0.02

  const rockUnstable = instability != null && instability >= HIGH_INSTABILITY_SCANNER
  if (driver.instabilityModifier > 0) {
    // Unstable laser driving a tight window or twitchy rock is a recipe for a blowout.
    score -=
      windowTight || rockUnstable
        ? HIGHEST_INSTABILITY_DRIVER_PENALTY
        : driver.instabilityModifier * 3
  } else if (driver.instabilityModifier < 0 && (windowTight || rockUnstable)) {
    score += Math.abs(driver.instabilityModifier) * 1.5
  }

  if (mods.resistance < 0) {
    score += Math.abs(mods.resistance) * 4
  } else if (mods.resistance > 0) {
    score -= mods.resistance * 6
  }

  score += mods.window * 3

  if (rockUnstable) {
    if (mods.instability < 0) score += Math.abs(mods.instability) * 2
    else if (mods.instability > 0) score -= mods.instability * 3
  } else if (mods.instability > 0) {
    score -= mods.instability
  }

  score += DRIVER_ROUND_ROBIN_BONUS[driver.slotIndex] ?? 0

  return score
}

function buildPowerTieNote(
  driver: MoleHeadProfile,
  supports: MoleHeadProfile[]
): string | null {
  const tied = supports.some((s) => powerWithinTie(driver, s))
  if (!tied) return null
  return 'Heads within 150 MW — driver picked for stability and module stack'
}

interface CrewPlanInputs {
  profiles: MoleHeadProfile[]
  driverIndex: number
  supportIndices: number[]
  /** Extra seats held at MIN power purely for their window/stat benefit. */
  benefitIndices: number[]
  mass: number
  resistancePercent: number
  instability: number | null
  /** Rock's natural window is narrow (from ore data) — drives driver stability rules. */
  oreWindowTight: boolean
}

/**
 * Crew plan (field tactic):
 * 1. Full-blast supports fire first at 100%.
 * 2. The highest-MW support is the ONLY seat that backs down — it ramps up, then
 *    settles just under the equalizer to leave room for the driver's minimum power.
 *    Never multi-drop across several seats.
 * 3. The driver fires last from minimum throttle and ramps up to fill the window.
 * Benefit seats (window modules) hold minimum power the whole time.
 */
function evaluateCrewPlan(inputs: CrewPlanInputs): CandidateStrategy | null {
  const {
    profiles,
    driverIndex,
    supportIndices,
    benefitIndices,
    mass,
    resistancePercent,
    instability,
    oreWindowTight,
  } = inputs

  const driver = profileByIndex(profiles, driverIndex)
  if (!driver) return null

  const supportProfiles = supportIndices
    .map((index) => profileByIndex(profiles, index))
    .filter((p): p is MoleHeadProfile => p != null)
  const benefitProfiles = benefitIndices
    .map((index) => profileByIndex(profiles, index))
    .filter((p): p is MoleHeadProfile => p != null)

  const activeIndices = [driverIndex, ...supportIndices, ...benefitIndices]
  const activeHeadCount = activeIndices.length
  const equalizingPower = equalizationPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const crackableThreshold = crackablePowerForHeads(
    mass,
    resistancePercent,
    instability,
    profiles,
    activeIndices
  )
  if (!Number.isFinite(crackableThreshold)) return null

  const underPercent = crewUnderPercent(activeHeadCount, instability)
  const mods = combinedModifiers(profiles, activeIndices)
  const windowTight = oreWindowTight || mods.window <= -20

  const maxCombinedMw = [driver, ...supportProfiles, ...benefitProfiles].reduce(
    (sum, p) => sum + p.laserPower,
    0
  )
  if (maxCombinedMw < crackableThreshold) return null

  const score = scoreCrewPlan(
    activeHeadCount,
    driver,
    mods,
    instability,
    windowTight,
    maxCombinedMw,
    crackableThreshold
  )

  // ── Single head, no companions ─────────────────────────────────────────────
  if (supportProfiles.length === 0 && benefitProfiles.length === 0) {
    if (driver.laserPower < crackableThreshold) return null
    const throttlePercent = soloCrackingThrottlePercent(driver, equalizingPower)
    if (throttlePercent == null) return null

    const drivingDetail = [`Drive @ ${throttlePercent}%`, modifierDetail(driver)]
      .filter(Boolean)
      .join(' · ')

    const assignments = profiles.map((profile) => {
      if (profile.slotIndex === driverIndex) {
        return buildAssignment(profile, 'primary', throttlePercent, drivingDetail)
      }
      return buildAssignment(profile, 'idle', 0, 'Off — crew partner not needed on other turrets')
    })

    return {
      assignments,
      canBreak: true,
      requiredPower: crackableThreshold,
      combinedWindowModifier: mods.window,
      combinedInstabilityModifier: mods.instability,
      summary: `Head ${driverIndex + 1} @ ${throttlePercent}% — crew partner not needed on other turrets.`,
      score,
      driverIndex,
      supportIndices: [],
    }
  }

  const targetTotalMw = equalizingPower * (1 - underPercent / 100)
  const benefitMw = benefitProfiles.reduce((sum, p) => sum + p.minLaserMw, 0)

  // ── Benefit seats only (driver + min-power window seats) ───────────────────
  if (supportProfiles.length === 0) {
    if (driver.laserPower < crackableThreshold - benefitMw) return null
    const driverHoldMw = targetTotalMw - benefitMw
    if (driverHoldMw < 0) return null
    const driverThrottle = Math.max(
      driver.throttleMinimumPercent,
      throttlePercentFromMw(driverHoldMw, driver.laserPower)
    )
    // Even at both minimums the pair must stay under the equalizer.
    if (driver.minLaserMw + benefitMw >= equalizingPower) return null

    const assignments = profiles.map((profile) => {
      if (profile.slotIndex === driverIndex) {
        const parts = [`Drive @ ${driverThrottle}% — ramp up from there to fill the window`, modifierDetail(profile)]
        return buildAssignment(profile, 'primary', driverThrottle, parts.filter(Boolean).join(' · '))
      }
      if (benefitIndices.includes(profile.slotIndex)) {
        return buildAssignment(
          profile,
          'support',
          profile.throttleMinimumPercent,
          `Hold min power (${profile.throttleMinimumPercent}%) — window benefit only (${formatSignedPercent(profile.optimalWindowModifier)} window)`
        )
      }
      return buildAssignment(profile, 'idle', 0, 'Off — not needed for this rock')
    })

    const benefitLabels = benefitProfiles.map((p) => `Head ${p.slotIndex + 1}`).join(' + ')
    return {
      assignments,
      canBreak: true,
      requiredPower: crackableThreshold,
      combinedWindowModifier: mods.window,
      combinedInstabilityModifier: mods.instability,
      summary: `${benefitLabels} @ min for window; Head ${driverIndex + 1} drives @ ${driverThrottle}%.`,
      score,
      driverIndex,
      supportIndices: [],
    }
  }

  // ── Full crew tactic: supports first, one adjuster, driver ramps last ──────
  // Highest-MW support is the one (and only one) that backs down if needed.
  const sortedByPowerDesc = [...supportProfiles].sort(
    (a, b) => b.laserPower - a.laserPower || a.slotIndex - b.slotIndex
  )
  const adjuster = sortedByPowerDesc[0]
  const fullSupports = sortedByPowerDesc.slice(1).sort(
    (a, b) => a.laserPower - b.laserPower || a.slotIndex - b.slotIndex
  )
  const fullSupportMw = fullSupports.reduce((sum, p) => sum + p.laserPower, 0)

  const adjusterRoom = targetTotalMw - fullSupportMw - benefitMw - driver.minLaserMw
  let adjusterMw: number
  if (adjusterRoom >= adjuster.laserPower) {
    adjusterMw = adjuster.laserPower
  } else if (adjusterRoom < adjuster.minLaserMw) {
    // Even the adjuster's minimum power overshoots the hold point — combo infeasible.
    return null
  } else {
    adjusterMw = adjusterRoom
  }
  const adjusterAtFull = adjusterMw >= adjuster.laserPower
  const adjusterThrottle = adjusterAtFull
    ? 100
    : Math.max(adjuster.throttleMinimumPercent, throttlePercentFromMw(adjusterMw, adjuster.laserPower))

  const powerTieNote = buildPowerTieNote(driver, supportProfiles)

  const assignments = profiles.map((profile) => {
    if (profile.slotIndex === driverIndex) {
      const parts = [
        `Fire last — ramp up from ${driver.throttleMinimumPercent}% to drive the charge home`,
        powerTieNote,
        modifierDetail(profile),
      ].filter(Boolean)
      return buildAssignment(profile, 'primary', driver.throttleMinimumPercent, parts.join(' · '))
    }

    if (profile.slotIndex === adjuster.slotIndex) {
      const parts = [
        adjusterAtFull
          ? 'Run at 100% — fits under the equalizer at full blast'
          : `Fire full, then back down to ~${adjusterThrottle}% once the charge bar starts moving`,
        modifierDetail(profile),
      ].filter(Boolean)
      return buildAssignment(profile, 'support', adjusterAtFull ? 100 : adjusterThrottle, parts.join(' · '))
    }

    if (fullSupports.some((p) => p.slotIndex === profile.slotIndex)) {
      const parts = ['Fire first — run at 100%', modifierDetail(profile)].filter(Boolean)
      return buildAssignment(profile, 'support', 100, parts.join(' · '))
    }

    if (benefitIndices.includes(profile.slotIndex)) {
      return buildAssignment(
        profile,
        'support',
        profile.throttleMinimumPercent,
        `Hold min power (${profile.throttleMinimumPercent}%) — window benefit only (${formatSignedPercent(profile.optimalWindowModifier)} window)`
      )
    }

    return buildAssignment(profile, 'idle', 0, 'Off — not needed for this rock')
  })

  const summaryParts: string[] = []
  if (fullSupports.length > 0) {
    summaryParts.push(
      `${fullSupports.map((p) => `Head ${p.slotIndex + 1}`).join(' + ')} full @ 100% first`
    )
  }
  summaryParts.push(
    adjusterAtFull
      ? `Head ${adjuster.slotIndex + 1} full @ 100%${fullSupports.length ? '' : ' first'}`
      : `Head ${adjuster.slotIndex + 1} backs down to ~${adjusterThrottle}%`
  )
  if (benefitProfiles.length > 0) {
    summaryParts.push(
      `${benefitProfiles.map((p) => `Head ${p.slotIndex + 1}`).join(' + ')} @ min for window`
    )
  }
  summaryParts.push(
    `Head ${driverIndex + 1} drives — ramp from ${driver.throttleMinimumPercent}% (~${underPercent}% under combined equalizer)`
  )

  return {
    assignments,
    canBreak: true,
    requiredPower: crackableThreshold,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: `${summaryParts.join('; ')}.`,
    score,
    driverIndex,
    supportIndices,
  }
}

/** Solo throttle above this % leaves too little headroom to push charge past equalization. */
export const SOLO_IDEAL_THROTTLE_MAX = 65

/**
 * Solo head scoring — throttle headroom dominates.
 *
 * Field-verified: the same rock needing ~3,400 MW was "way easier, smoother and
 * faster" on a 7,140 MW head (~47% throttle) than a 4,692 MW head (72% throttle),
 * despite the smaller head carrying a +39% window bonus and the big head -43%.
 * Cracking requires pushing power ABOVE equalization; a head running near its
 * ceiling has no room to do that. Window/resistance modifiers are tiebreakers.
 *
 * Also penalizes overshoot: if equalization sits below the laser's minimum
 * output, even the lowest throttle overpowers the rock (explosion risk on
 * small rocks), so finesse heads win those.
 */
function scoreSoloHeadStrategy(
  profile: MoleHeadProfile,
  throttlePercent: number,
  equalizingPower: number,
  mods: { resistance: number; window: number; instability: number },
  instability: number | null
): number {
  let score = 10_000

  score -= throttlePercent * 1.5
  if (throttlePercent > SOLO_IDEAL_THROTTLE_MAX) {
    score -= (throttlePercent - SOLO_IDEAL_THROTTLE_MAX) * 40
  }

  const rawThrottle = throttlePercentFromMw(equalizingPower, profile.laserPower)
  if (rawThrottle < profile.throttleMinimumPercent) {
    score -= (profile.throttleMinimumPercent - rawThrottle) * 40
  }

  score += headModifierBenefit(profile, instability)
  score += mods.window * 1.5
  if (mods.resistance < 0) score += Math.abs(mods.resistance) * 2

  return score
}

function soloHeadFractureNotes(
  profile: MoleHeadProfile,
  pilotResistancePercent: number,
  requiredMw: number,
  requiredLabel: string
): string {
  const effectiveHudRes = effectiveHudResistancePercent(
    pilotResistancePercent,
    profile.resistanceModifier
  )
  return [
    `pilot RES ${Math.round(pilotResistancePercent)}% → ${effectiveHudRes}% on this head`,
    `${profile.laserPower.toLocaleString()} MW after modules`,
    `${requiredMw.toLocaleString()} MW ${requiredLabel}`,
    `hold within ${profile.optimalRange}m — power falls off past optimal range`,
  ].join(' · ')
}

/**
 * Backup verdict for a head left OFF in the solo plan — tells the player
 * whether that seat could crack this rock on its own if they used it instead.
 */
function idleSoloBackupVerdict(
  profile: MoleHeadProfile,
  profiles: MoleHeadProfile[],
  mass: number,
  resistancePercent: number,
  instability: number | null
): { detail: string; viability: 'works' | 'cannot' } {
  const activeIndices = [profile.slotIndex]
  const equalizingPower = equalizationPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const crackableThreshold = crackablePowerForHeads(mass, resistancePercent, instability, profiles, activeIndices)

  const cannotDetail = `Off — cannot crack this rock (needs ~${crackableThreshold.toLocaleString()} MW · head max ${profile.laserPower.toLocaleString()} MW)`
  if (profile.laserPower < crackableThreshold) {
    return { detail: cannotDetail, viability: 'cannot' }
  }

  const throttlePercent = soloCrackingThrottlePercent(profile, equalizingPower)
  if (throttlePercent == null) {
    return { detail: cannotDetail, viability: 'cannot' }
  }
  return {
    detail: `Would also work — drive @ ${throttlePercent}%, but not the best pick for this rock`,
    viability: 'works',
  }
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
    ? soloCrackingThrottlePercent(primary, equalizingPower)
    : null
  const canBreak = canBreakAtFull && throttlePercent != null
  const mods = combinedModifiers(profiles, activeIndices)
  const fractureNotes = canBreak
    ? soloHeadFractureNotes(primary, resistancePercent, equalizingPower, 'required')
    : soloHeadFractureNotes(
        primary,
        resistancePercent,
        crackableThreshold,
        'needed with instability margin'
      )

  const assignments = profiles.map((profile) => {
    if (profile.slotIndex === primaryIndex) {
      const modDetail = modifierDetail(profile)
      return buildAssignment(
        profile,
        'primary',
        canBreak ? throttlePercent! : 100,
        canBreak
          ? [
              `Drive @ ${throttlePercent}%`,
              fractureNotes,
              modDetail,
            ]
              .filter(Boolean)
              .join(' · ')
          : `Cannot crack at full throttle — ${fractureNotes}${modDetail ? ` · ${modDetail}` : ''}`
      )
    }
    const verdict = idleSoloBackupVerdict(profile, profiles, mass, resistancePercent, instability)
    return buildAssignment(profile, 'idle', 0, verdict.detail, verdict.viability)
  })

  return {
    assignments,
    canBreak,
    requiredPower: crackableThreshold,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: canBreak
      ? `Solo — Head ${primaryIndex + 1} @ ${throttlePercent}% throttle.`
      : `Solo — Head ${primaryIndex + 1} cannot crack this rock at full throttle.`,
    score: canBreak
      ? scoreSoloHeadStrategy(primary, throttlePercent!, equalizingPower, mods, instability)
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
  /** Crew mode only — how many seats are manned. 2 = two-person crew, 3 = full crew. */
  crewSize?: 2 | 3
}

/** Rock's natural charge window is narrow enough to change driver preference. */
function oreWindowIsTight(oreName: string | null | undefined): boolean {
  if (!oreName) return false
  const profile = getOreWindowProfile(oreName)
  if (!profile) return false
  return profile.rating === 'narrow' || profile.rating === 'very narrow'
}

/**
 * If a seat is unused, the crew has a spare member, and that seat's window
 * modifier is positive, try adding it at MIN power purely for the wider window.
 * The plan is re-balanced (the adjuster support gives up the min MW) and only
 * kept when it stays feasible and actually widens the combined window.
 */
function tryAddBenefitSeat(
  best: CandidateStrategy,
  profiles: MoleHeadProfile[],
  maxActive: number,
  mass: number,
  resistancePercent: number,
  instability: number | null,
  oreWindowTight: boolean
): CandidateStrategy | null {
  if (best.driverIndex == null || best.supportIndices == null) return null
  const activeCount = 1 + best.supportIndices.length
  if (activeCount >= maxActive) return null

  const usedIndices = new Set([best.driverIndex, ...best.supportIndices])
  const candidates = profiles
    .filter((p) => !usedIndices.has(p.slotIndex) && p.optimalWindowModifier > 0)
    .sort((a, b) => b.optimalWindowModifier - a.optimalWindowModifier)

  for (const benefit of candidates) {
    const augmented = evaluateCrewPlan({
      profiles,
      driverIndex: best.driverIndex,
      supportIndices: best.supportIndices,
      benefitIndices: [benefit.slotIndex],
      mass,
      resistancePercent,
      instability,
      oreWindowTight,
    })
    if (augmented && augmented.combinedWindowModifier > best.combinedWindowModifier) {
      return augmented
    }
  }
  return null
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
  const oreWindowTight = oreWindowIsTight(target.oreName)

  const candidates: CandidateStrategy[] = []

  if (options.soloMining) {
    for (const primary of profiles) {
      candidates.push(evaluateSingleHeadOnly(profiles, primary.slotIndex, mass, resistancePercent, instability))
    }
  } else {
    if (profiles.length < 2) return null

    const maxActive = Math.min(options.crewSize ?? 3, profiles.length)
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

    const evaluate = (driverIndex: number, supportIndices: number[]) => {
      const plan = evaluateCrewPlan({
        profiles,
        driverIndex,
        supportIndices,
        benefitIndices: [],
        mass,
        resistancePercent,
        instability,
        oreWindowTight,
      })
      if (plan) candidates.push(plan)
    }

    for (const driver of profiles) {
      evaluate(driver.slotIndex, [])

      if (maxActive >= 2) {
        for (const support of profiles) {
          if (support.slotIndex === driver.slotIndex) continue
          evaluate(driver.slotIndex, [support.slotIndex])
        }
      }

      if (maxActive >= 3 && profiles.length >= 3) {
        for (let i = 0; i < profiles.length; i++) {
          for (let j = i + 1; j < profiles.length; j++) {
            const s1 = profiles[i]
            const s2 = profiles[j]
            if (s1.slotIndex === driver.slotIndex || s2.slotIndex === driver.slotIndex) continue
            evaluate(driver.slotIndex, [s1.slotIndex, s2.slotIndex])
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
  let best = candidates[0]

  if (!options.soloMining && best.canBreak) {
    const maxActive = Math.min(options.crewSize ?? 3, profiles.length)
    const augmented = tryAddBenefitSeat(
      best,
      profiles,
      maxActive,
      mass,
      resistancePercent,
      instability,
      oreWindowTight
    )
    if (augmented) best = augmented
  }

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
