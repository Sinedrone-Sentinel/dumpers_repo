import { requiredLaserPower } from './miningBreakability'
import {
  computeEffectiveLaserStats,
  describeLaserHead,
  laserResistanceMultiplier,
  type MiningLaserSlotConfig,
} from './miningLaserStats'
import { combineModuleModifiers, normalizeModuleSelection } from './miningModules'
import type { RockBreakabilityTarget } from './miningLoadoutCompare'
import { getMiningLaserByName } from './miningVessels'

/** Supporter min MW must stay below this fraction of primary crack output. */
const SUPPORT_CHARGE_DOMINANCE_RATIO = 0.12

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
  throttlePercent: number
  /** Why this head is in this role (module modifiers, min throttle, etc.). */
  detail: string | null
}

export interface MoleLoadoutStrategy {
  assignments: MoleHeadAssignment[]
  canBreak: boolean
  requiredPower: number
  combinedWindowModifier: number
  combinedInstabilityModifier: number
  summary: string
  /** Solo = one laser (like Prospector). Crew = multiple heads active. */
  soloMining: boolean
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
  const throttleMinimumPercent = Math.round(throttleMinimumFraction * 1000) / 10
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

function headModifierBenefit(profile: MoleHeadProfile): number {
  let benefit = 0
  if (profile.optimalWindowModifier > 0) benefit += profile.optimalWindowModifier
  if (profile.instabilityModifier < 0) benefit += Math.abs(profile.instabilityModifier) * 1.5
  if (profile.resistanceModifier < 0) benefit += Math.abs(profile.resistanceModifier) * 0.75
  return benefit
}

function modifierDetail(profile: MoleHeadProfile): string | null {
  const parts: string[] = []
  if (profile.optimalWindowModifier !== 0) {
    parts.push(`${formatSignedPercent(profile.optimalWindowModifier)} window`)
  }
  if (profile.instabilityModifier !== 0) {
    parts.push(`${formatSignedPercent(profile.instabilityModifier)} instability`)
  }
  if (profile.resistanceModifier !== 0) {
    parts.push(`${formatSignedPercent(profile.resistanceModifier)} resistance`)
  }
  return parts.length ? parts.join(', ') : null
}

function isViableSupporter(
  supporter: MoleHeadProfile,
  primaryOutputMw: number
): boolean {
  if (headModifierBenefit(supporter) <= 0) return false
  if (primaryOutputMw <= 0) return false
  return supporter.minLaserMw <= primaryOutputMw * SUPPORT_CHARGE_DOMINANCE_RATIO
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
): { window: number; instability: number } {
  let window = 0
  let instability = 0
  for (const index of activeIndices) {
    window += profiles[index].optimalWindowModifier
    instability += profiles[index].instabilityModifier
  }
  return { window, instability }
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
  primaryThrottlePercent: number,
  combinedWindowModifier: number,
  combinedInstabilityModifier: number,
  totalSupportMw: number,
  supportCount: number,
  instability: number | null
): number {
  if (!canBreak) return -Infinity

  let score = 10_000
  score -= primaryThrottlePercent * 8
  score += combinedWindowModifier * 4
  score -= totalSupportMw * 0.02
  score -= supportCount * 3

  if (instability != null && instability >= 400) {
    if (combinedInstabilityModifier < 0) {
      score += Math.abs(combinedInstabilityModifier) * 3
    }
    score += combinedWindowModifier * 2
  }

  if (supportCount > 0 && combinedWindowModifier > 0) {
    score += 40
  }

  return score
}

function evaluateSoloPrimaryStrategy(
  profiles: MoleHeadProfile[],
  primaryIndex: number,
  supporterIndices: number[],
  mass: number,
  resistancePercent: number,
  instability: number | null
): CandidateStrategy | null {
  const primary = profiles[primaryIndex]
  const activeIndices = [primaryIndex, ...supporterIndices]
  const requiredPower = requiredPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const primaryThrottlePercent =
    primary.laserPower > 0
      ? Math.min(100, Math.ceil((requiredPower / primary.laserPower) * 100))
      : 100

  if (primaryThrottlePercent > 100) return null

  const primaryOutputMw = primary.laserPower * (primaryThrottlePercent / 100)
  const viableSupporters = supporterIndices.filter((index) =>
    isViableSupporter(profiles[index], primaryOutputMw)
  )

  if (viableSupporters.length !== supporterIndices.length) return null

  const mods = combinedModifiers(profiles, activeIndices)
  const totalSupportMw = viableSupporters.reduce((sum, index) => sum + profiles[index].minLaserMw, 0)
  const assignments = profiles.map((profile) => {
    if (profile.slotIndex === primaryIndex) {
      return buildAssignment(
        profile,
        'primary',
        primaryThrottlePercent,
        `Fracture at ${primaryThrottlePercent}%`
      )
    }
    if (viableSupporters.includes(profile.slotIndex)) {
      const modDetail = modifierDetail(profile)
      return buildAssignment(
        profile,
        'support',
        profile.throttleMinimumPercent,
        [
          `Hold at ${profile.throttleMinimumPercent}% min throttle (${profile.minLaserMw.toLocaleString()} MW)`,
          modDetail,
        ]
          .filter(Boolean)
          .join(' · ')
      )
    }
    return buildAssignment(profile, 'idle', 0, 'Off — not needed for this rock')
  })

  const supportLabels = viableSupporters.map((index) => `Head ${index + 1}`)
  const summary =
    viableSupporters.length > 0
      ? `Head ${primaryIndex + 1} fractures at ${primaryThrottlePercent}% with ${supportLabels.join(' + ')} at min throttle for module bonuses.`
      : `Head ${primaryIndex + 1} solo at ${primaryThrottlePercent}% throttle.`

  return {
    assignments,
    canBreak: true,
    requiredPower,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary,
    score: scoreStrategy(
      true,
      primaryThrottlePercent,
      mods.window,
      mods.instability,
      totalSupportMw,
      viableSupporters.length,
      instability
    ),
  }
}

function evaluateEqualShareStrategy(
  profiles: MoleHeadProfile[],
  mass: number,
  resistancePercent: number,
  instability: number | null
): CandidateStrategy | null {
  const activeIndices = profiles.map((profile) => profile.slotIndex)
  const requiredPower = requiredPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const slotCount = profiles.length
  const requiredShare = Math.round(requiredPower / slotCount)

  const assignments = profiles.map((profile) => {
    const canBreakShare = profile.laserPower >= requiredShare
    const throttlePercent =
      profile.laserPower > 0
        ? Math.min(100, Math.round((requiredShare / profile.laserPower) * 100))
        : 100

    return buildAssignment(
      profile,
      canBreakShare ? 'primary' : 'idle',
      canBreakShare ? throttlePercent : 0,
      canBreakShare
        ? `Equal share ${requiredShare.toLocaleString()} MW @ ${throttlePercent}%`
        : `Short ${(requiredShare - profile.laserPower).toLocaleString()} MW for its share`
    )
  })

  const canBreak = assignments.every((assignment) => assignment.role !== 'idle')
  const mods = combinedModifiers(profiles, activeIndices)
  const maxThrottle = Math.max(
    ...assignments.filter((a) => a.role === 'primary').map((a) => a.throttlePercent),
    0
  )

  return {
    assignments,
    canBreak,
    requiredPower,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: canBreak
      ? `All heads share load — ${requiredShare.toLocaleString()} MW each.`
      : 'Equal split — not every head meets its share.',
    score: scoreStrategy(
      canBreak,
      maxThrottle,
      mods.window,
      mods.instability,
      0,
      0,
      instability
    ),
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
  const requiredPower = requiredPowerForHeads(mass, resistancePercent, profiles, activeIndices)
  const rawThrottle =
    primary.laserPower > 0 ? Math.ceil((requiredPower / primary.laserPower) * 100) : 100
  const canBreak = rawThrottle <= 100
  const primaryThrottlePercent = canBreak ? rawThrottle : 100
  const mods = combinedModifiers(profiles, activeIndices)
  const shortfallMw = canBreak ? 0 : requiredPower - primary.laserPower

  const assignments = profiles.map((profile) => {
    if (profile.slotIndex === primaryIndex) {
      const modDetail = modifierDetail(profile)
      return buildAssignment(
        profile,
        'primary',
        primaryThrottlePercent,
        canBreak
          ? [`Solo fracture at ${primaryThrottlePercent}%`, modDetail].filter(Boolean).join(' · ')
          : `Short ${shortfallMw.toLocaleString()} MW at full throttle`
      )
    }
    return buildAssignment(profile, 'idle', 0, 'Off — solo mining uses one head only')
  })

  return {
    assignments,
    canBreak,
    requiredPower,
    combinedWindowModifier: mods.window,
    combinedInstabilityModifier: mods.instability,
    summary: canBreak
      ? `Solo — Head ${primaryIndex + 1} fractures at ${primaryThrottlePercent}% throttle.`
      : `Solo — Head ${primaryIndex + 1} is closest but still short ${shortfallMw.toLocaleString()} MW.`,
    score: canBreak
      ? scoreStrategy(true, primaryThrottlePercent, mods.window, mods.instability, 0, 0, null)
      : -requiredPower + primary.laserPower,
  }
}

function enumerateSupporterSubsets(
  profiles: MoleHeadProfile[],
  primaryIndex: number
): number[][] {
  const others = profiles
    .map((profile) => profile.slotIndex)
    .filter((index) => index !== primaryIndex)
  const subsets: number[][] = [[]]

  for (const index of others) {
    const next = subsets.map((subset) => [...subset, index])
    subsets.push(...next)
  }

  return subsets
}

export interface MoleStrategyOptions {
  /** Solo = one laser at a time (Prospector-style). Crew = multiple heads can run together. */
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

    for (const primary of profiles) {
      for (const supporterIndices of enumerateSupporterSubsets(profiles, primary.slotIndex)) {
        const candidate = evaluateSoloPrimaryStrategy(
          profiles,
          primary.slotIndex,
          supporterIndices,
          mass,
          resistancePercent,
          instability
        )
        if (candidate) candidates.push(candidate)
      }
    }

    const equalShare = evaluateEqualShareStrategy(profiles, mass, resistancePercent, instability)
    if (equalShare) candidates.push(equalShare)
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
  }
}
