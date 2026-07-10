import type { MiningGadget } from '../data'
import {
  compareLoadoutToRock,
  type LoadoutBreakabilityComparison,
  type RockBreakabilityTarget,
} from './miningLoadoutCompare'
import type { MiningLaserSlotConfig } from './miningLaserStats'
import { assessSlowCrackFromComparison, type SlowCrackAssessment } from './miningSlowCrack'
import type { MiningVesselId } from './miningVessels'
import { findBestMoleLoadoutStrategy, type MoleLoadoutStrategy } from './moleLoadoutStrategy'
import {
  formatGadgetModifierPercent,
  listMiningGadgets,
  rockInstabilityWithGadget,
  rockResistanceWithGadget,
} from './miningGadgets'

/** Loadout is within 10% of its fracture power ceiling. */
export const NEAR_LOADOUT_CAPACITY_RATIO = 0.9

/** Scanner instability above this is worth a stabilizing gadget suggestion. */
export const HIGH_INSTABILITY_THRESHOLD = 400

/** Power headroom above this with moderate instability = no gadget upsell. */
export const EASY_CRACK_POWER_MARGIN = 1.25

export interface GadgetRecommendation {
  gadget: MiningGadget
  reason: string
  requiredPower: number
}

/** Smart Cracker output: head plan first (Mole), then final gadget fit. */
export interface SmartCrackerResult {
  shouldAdvise: boolean
  crackGadget: GadgetRecommendation | null
  qualityGadget: GadgetRecommendation | null
  moleStrategy: MoleLoadoutStrategy | null
  slowCrack: SlowCrackAssessment | null
}

/** @deprecated Use SmartCrackerResult */
export type MiningLoadoutRecommendations = SmartCrackerResult

export interface SmartCrackerOptions {
  /** Mole only — solo uses one head (Prospector-style). Crew allows multiple heads. */
  moleSoloMining?: boolean
}

function targetWithGadgetResistance(
  target: RockBreakabilityTarget,
  gadget: MiningGadget
): RockBreakabilityTarget | null {
  if (target.resistancePercent == null) return null
  return {
    ...target,
    resistancePercent: rockResistanceWithGadget(target.resistancePercent, gadget),
  }
}

function isNearLoadoutCapacity(comparison: LoadoutBreakabilityComparison): boolean {
  if (comparison.totalLaserPower <= 0) return false
  return comparison.requiredPower / comparison.totalLaserPower >= NEAR_LOADOUT_CAPACITY_RATIO
}

function isNearCapacityFromMole(strategy: MoleLoadoutStrategy): boolean {
  if (!strategy.canBreak) return true
  const activeCount = strategy.assignments.filter((assignment) => assignment.role !== 'idle').length
  const primary = strategy.assignments.find((assignment) => assignment.role === 'primary')
  if (!primary) return true
  if (activeCount >= 3) return true
  if (primary.throttlePercent >= 80) return true
  const fullBlastSupports = strategy.assignments.filter(
    (assignment) => assignment.role === 'support' && assignment.throttlePercent === 100
  ).length
  if (fullBlastSupports >= 1 && primary.throttlePercent >= 50) return true
  return false
}

function isEasyCrackFromComparison(
  comparison: LoadoutBreakabilityComparison,
  instability: number | null
): boolean {
  if (!comparison.canBreak || comparison.requiredPower <= 0) return false
  const powerMargin = comparison.totalLaserPower / comparison.requiredPower
  if (powerMargin < EASY_CRACK_POWER_MARGIN) return false
  if (instability != null && instability >= HIGH_INSTABILITY_THRESHOLD) return false
  const maxThrottle = Math.max(...comparison.lasers.map((row) => row.throttlePercent), 0)
  if (maxThrottle >= 85) return false
  return true
}

function isEasyCrackFromMole(
  strategy: MoleLoadoutStrategy,
  instability: number | null
): boolean {
  if (!strategy.canBreak) return false
  const activeCount = strategy.assignments.filter((assignment) => assignment.role !== 'idle').length
  if (activeCount >= 3) return false
  const primary = strategy.assignments.find((assignment) => assignment.role === 'primary')
  if (!primary || primary.throttlePercent >= 75) return false
  if (instability != null && instability >= HIGH_INSTABILITY_THRESHOLD) return false
  return true
}

function findBestCrackGadgetForSlowGrind(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  slowCrack: SlowCrackAssessment
): GadgetRecommendation | null {
  const candidates: GadgetRecommendation[] = []

  for (const gadget of listMiningGadgets()) {
    if (gadget.resistanceModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget)
    if (!adjustedTarget) continue
    const comparison = compareLoadoutToRock(lasers, adjustedTarget)
    if (!comparison?.canBreak) continue

    const adjustedResistance = rockResistanceWithGadget(target.resistancePercent!, gadget)
    candidates.push({
      gadget,
      requiredPower: comparison.requiredPower,
      reason: `${gadget.displayName} drops rock resistance to ${Math.round(adjustedResistance)}% (${formatGadgetModifierPercent(gadget.resistanceModifier)}) — bumps headroom from +${slowCrack.marginPercent}% over the equalizer so the crack finishes faster.`,
    })
  }

  if (!candidates.length) return null

  candidates.sort((a, b) => {
    const marginA =
      compareLoadoutToRock(lasers, targetWithGadgetResistance(target, a.gadget)!)!.totalLaserPower /
      a.requiredPower
    const marginB =
      compareLoadoutToRock(lasers, targetWithGadgetResistance(target, b.gadget)!)!.totalLaserPower /
      b.requiredPower
    return marginB - marginA
  })

  return candidates[0]
}

function findBestCrackGadgetForMoleSlowGrind(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  soloMining: boolean,
  slowCrack: SlowCrackAssessment
): GadgetRecommendation | null {
  const candidates: GadgetRecommendation[] = []

  for (const gadget of listMiningGadgets()) {
    if (gadget.resistanceModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget)
    if (!adjustedTarget) continue
    const strategy = findBestMoleLoadoutStrategy(lasers, adjustedTarget, { soloMining })
    if (!strategy?.canBreak) continue

    const adjustedResistance = rockResistanceWithGadget(target.resistancePercent!, gadget)
    candidates.push({
      gadget,
      requiredPower: strategy.requiredPower,
      reason: `${gadget.displayName} drops rock resistance to ${Math.round(adjustedResistance)}% (${formatGadgetModifierPercent(gadget.resistanceModifier)}) — eases the +${slowCrack.marginPercent}% full-blast grind on your head plan.`,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => a.requiredPower - b.requiredPower)
  return candidates[0]
}

function findBestCrackGadgetForComparison(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget
): GadgetRecommendation | null {
  const candidates: GadgetRecommendation[] = []

  for (const gadget of listMiningGadgets()) {
    if (gadget.resistanceModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget)
    if (!adjustedTarget) continue
    const comparison = compareLoadoutToRock(lasers, adjustedTarget)
    if (!comparison?.canBreak) continue

    const margin = comparison.totalLaserPower - comparison.requiredPower
    const adjustedResistance = rockResistanceWithGadget(target.resistancePercent!, gadget)
    candidates.push({
      gadget,
      requiredPower: comparison.requiredPower,
      reason: `${gadget.displayName} drops rock resistance to ${Math.round(adjustedResistance)}% (${formatGadgetModifierPercent(gadget.resistanceModifier)}) — ${margin.toLocaleString()} MW headroom after fracture math.`,
    })
  }

  if (!candidates.length) return null

  candidates.sort((a, b) => {
    const marginA =
      compareLoadoutToRock(lasers, targetWithGadgetResistance(target, a.gadget)!)!.totalLaserPower -
      a.requiredPower
    const marginB =
      compareLoadoutToRock(lasers, targetWithGadgetResistance(target, b.gadget)!)!.totalLaserPower -
      b.requiredPower
    return marginB - marginA
  })

  return candidates[0]
}

function findBestCrackGadgetForMolePlan(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  soloMining: boolean,
  moleStrategy: MoleLoadoutStrategy
): GadgetRecommendation | null {
  if (moleStrategy.canBreak) return null

  const candidates: GadgetRecommendation[] = []

  for (const gadget of listMiningGadgets()) {
    if (gadget.resistanceModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget)
    if (!adjustedTarget) continue
    const strategy = findBestMoleLoadoutStrategy(lasers, adjustedTarget, { soloMining })
    if (!strategy?.canBreak) continue

    const adjustedResistance = rockResistanceWithGadget(target.resistancePercent!, gadget)
    candidates.push({
      gadget,
      requiredPower: strategy.requiredPower,
      reason: `${gadget.displayName} drops rock resistance to ${Math.round(adjustedResistance)}% (${formatGadgetModifierPercent(gadget.resistanceModifier)}) — makes your Smart Cracker plan crackable.`,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => a.requiredPower - b.requiredPower)
  return candidates[0]
}

function findBestInstabilityGadgetForComparison(
  instability: number,
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget
): GadgetRecommendation | null {
  const candidates: GadgetRecommendation[] = []

  for (const gadget of listMiningGadgets()) {
    if (gadget.instabilityModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget) ?? target
    const comparison = compareLoadoutToRock(lasers, adjustedTarget)
    if (!comparison?.canBreak) continue

    const adjusted = rockInstabilityWithGadget(instability, gadget)
    candidates.push({
      gadget,
      requiredPower: comparison.requiredPower,
      reason: `${gadget.displayName} cuts instability from ${Math.round(instability).toLocaleString()} to ~${Math.round(adjusted).toLocaleString()} (${formatGadgetModifierPercent(gadget.instabilityModifier)}).`,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => a.gadget.instabilityModifier - b.gadget.instabilityModifier)
  return candidates[0]
}

function findBestInstabilityGadgetForMolePlan(
  instability: number,
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  soloMining: boolean,
  moleStrategy: MoleLoadoutStrategy
): GadgetRecommendation | null {
  const candidates: GadgetRecommendation[] = []

  for (const gadget of listMiningGadgets()) {
    if (gadget.instabilityModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget) ?? target
    const strategy = findBestMoleLoadoutStrategy(lasers, adjustedTarget, { soloMining })
    if (!strategy?.canBreak) continue

    const adjusted = rockInstabilityWithGadget(instability, gadget)
    candidates.push({
      gadget,
      requiredPower: strategy.requiredPower,
      reason: `${gadget.displayName} cuts instability from ${Math.round(instability).toLocaleString()} to ~${Math.round(adjusted).toLocaleString()} (${formatGadgetModifierPercent(gadget.instabilityModifier)}) — based on your Smart Cracker head plan.`,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => a.gadget.instabilityModifier - b.gadget.instabilityModifier)
  return candidates[0]
}

export function buildSmartCracker(
  vesselId: MiningVesselId,
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  comparison: LoadoutBreakabilityComparison,
  options: SmartCrackerOptions = {}
): SmartCrackerResult {
  const instability = target.instability
  const moleSoloMining = options.moleSoloMining ?? true

  if (vesselId === 'mole') {
    const moleStrategy = findBestMoleLoadoutStrategy(lasers, target, { soloMining: moleSoloMining })
    if (!moleStrategy) {
      return {
        shouldAdvise: false,
        crackGadget: null,
        qualityGadget: null,
        moleStrategy: null,
        slowCrack: null,
      }
    }

    const slowCrack = assessSlowCrackFromComparison(
      comparison,
      target,
      moleStrategy,
      lasers
    )
    const shouldAdvise =
      !moleStrategy.canBreak || isNearCapacityFromMole(moleStrategy) || slowCrack != null
    let crackGadget: GadgetRecommendation | null = null
    let qualityGadget: GadgetRecommendation | null = null

    if (!moleStrategy.canBreak) {
      crackGadget = findBestCrackGadgetForMolePlan(lasers, target, moleSoloMining, moleStrategy)
    } else if (slowCrack && !slowCrack.worthWaiting) {
      crackGadget = findBestCrackGadgetForMoleSlowGrind(
        lasers,
        target,
        moleSoloMining,
        slowCrack
      )
    } else if (shouldAdvise && !isEasyCrackFromMole(moleStrategy, instability ?? null)) {
      if (instability != null && instability >= HIGH_INSTABILITY_THRESHOLD) {
        qualityGadget = findBestInstabilityGadgetForMolePlan(
          instability,
          lasers,
          target,
          moleSoloMining,
          moleStrategy
        )
      }
    }

    if (slowCrack && !crackGadget) {
      crackGadget = findBestCrackGadgetForMoleSlowGrind(
        lasers,
        target,
        moleSoloMining,
        slowCrack
      )
    }

    return {
      shouldAdvise,
      crackGadget,
      qualityGadget,
      moleStrategy,
      slowCrack,
    }
  }

  const slowCrack = assessSlowCrackFromComparison(comparison, target)
  const shouldAdvise =
    !comparison.canBreak || isNearLoadoutCapacity(comparison) || slowCrack != null
  let crackGadget: GadgetRecommendation | null = null
  let qualityGadget: GadgetRecommendation | null = null

  if (!comparison.canBreak) {
    crackGadget = findBestCrackGadgetForComparison(lasers, target)
  } else if (slowCrack && !slowCrack.worthWaiting) {
    crackGadget = findBestCrackGadgetForSlowGrind(lasers, target, slowCrack)
  } else if (shouldAdvise && !isEasyCrackFromComparison(comparison, instability ?? null)) {
    if (instability != null && instability >= HIGH_INSTABILITY_THRESHOLD) {
      qualityGadget = findBestInstabilityGadgetForComparison(instability, lasers, target)
    }
  }

  if (slowCrack && !crackGadget) {
    crackGadget = findBestCrackGadgetForSlowGrind(lasers, target, slowCrack)
  }

  return {
    shouldAdvise,
    crackGadget,
    qualityGadget,
    moleStrategy: null,
    slowCrack,
  }
}

/** @deprecated Use buildSmartCracker */
export function buildMiningLoadoutRecommendations(
  vesselId: MiningVesselId,
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  comparison: LoadoutBreakabilityComparison,
  options?: SmartCrackerOptions
): SmartCrackerResult {
  return buildSmartCracker(vesselId, lasers, target, comparison, options)
}
