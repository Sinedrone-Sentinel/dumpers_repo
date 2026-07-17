import type { MiningGadget } from '../data'
import {
  compareLoadoutToRock,
  type LoadoutBreakabilityComparison,
  type RockBreakabilityTarget,
} from './miningLoadoutCompare'
import type { MiningLaserSlotConfig } from './miningLaserStats'
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

export type GadgetSuggestionRole = 'resistance' | 'instability' | 'window'

export interface GadgetSuggestion {
  gadget: MiningGadget
  reason: string
  role: GadgetSuggestionRole
  /** Required MW after this gadget is attached, when fracture math applies. */
  requiredPower: number | null
  recommended: boolean
}

/** Smart Cracker output: head plan first (Mole), then final gadget fit. */
export interface SmartCrackerResult {
  shouldAdvise: boolean
  gadgetSuggestions: GadgetSuggestion[]
  moleStrategy: MoleLoadoutStrategy | null
}

/** @deprecated Use SmartCrackerResult */
export type MiningLoadoutRecommendations = SmartCrackerResult

export interface SmartCrackerOptions {
  /** Mole only — solo uses one head (Prospector-style). Crew allows multiple heads. */
  moleSoloMining?: boolean
}

interface GadgetCandidate {
  gadget: MiningGadget
  reason: string
  requiredPower: number | null
  score: number
}

interface GadgetSuggestionContext {
  canBreak: boolean
  needResistance: boolean
  needInstability: boolean
  needWindow: boolean
  instability: number | null
  lasers: MiningLaserSlotConfig[]
  target: RockBreakabilityTarget
  comparison: LoadoutBreakabilityComparison
  moleStrategy: MoleLoadoutStrategy | null
  soloMining: boolean
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

function formatWindowGadgetReason(
  gadget: MiningGadget,
  instability: number | null
): string {
  const parts: string[] = []
  if (gadget.optimalWindowModifier !== 0) {
    parts.push(`${formatGadgetModifierPercent(gadget.optimalWindowModifier)} fracture window`)
  }
  if (gadget.optimalWindowRateModifier !== 0) {
    parts.push(`${formatGadgetModifierPercent(gadget.optimalWindowRateModifier)} window charge rate`)
  }

  const highInstability =
    instability != null && instability >= HIGH_INSTABILITY_THRESHOLD
      ? ' on this high-instability rock'
      : ''

  return `${gadget.displayName} widens the fracture charge window (${parts.join(', ')}) — easier to land a clean crack${highInstability}.`
}

/** Gadgets already placed on the rock (their effect is folded into target stats). */
function equippedGadgetNames(ctx: GadgetSuggestionContext): ReadonlySet<string> {
  return new Set(ctx.target.selectedGadgetNames ?? [])
}

function findResistanceGadgetCandidates(ctx: GadgetSuggestionContext): GadgetCandidate[] {
  const candidates: GadgetCandidate[] = []
  const { lasers, target, moleStrategy, soloMining } = ctx
  const equipped = equippedGadgetNames(ctx)

  for (const gadget of listMiningGadgets()) {
    if (equipped.has(gadget.name)) continue
    if (gadget.resistanceModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget)
    if (!adjustedTarget) continue

    const comparison = compareLoadoutToRock(lasers, adjustedTarget)
    if (!comparison) continue

    let makesCrackable = comparison.canBreak
    let requiredPower = comparison.requiredPower

    if (moleStrategy) {
      const strategy = findBestMoleLoadoutStrategy(lasers, adjustedTarget, {
        soloMining: soloMining,
      })
      if (!strategy) continue
      makesCrackable = strategy.canBreak
      requiredPower = strategy.requiredPower
    }

    if (!makesCrackable && moleStrategy?.canBreak === false) continue
    if (!makesCrackable && !moleStrategy && !comparison.canBreak) continue

    const adjustedResistance = rockResistanceWithGadget(target.resistancePercent!, gadget)
    const margin = comparison.totalLaserPower - comparison.requiredPower

    let reason: string
    if (!ctx.canBreak && makesCrackable) {
      reason = `${gadget.displayName} drops rock resistance to ${Math.round(adjustedResistance)}% (${formatGadgetModifierPercent(gadget.resistanceModifier)}) — makes this rock crackable on your loadout.`
    } else {
      reason = `${gadget.displayName} drops rock resistance to ${Math.round(adjustedResistance)}% (${formatGadgetModifierPercent(gadget.resistanceModifier)}) — ${margin.toLocaleString()} MW headroom after fracture math.`
    }

    candidates.push({
      gadget,
      reason,
      requiredPower,
      score: Math.abs(gadget.resistanceModifier) * 10 + margin,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

function findInstabilityGadgetCandidates(ctx: GadgetSuggestionContext): GadgetCandidate[] {
  const instability = ctx.instability
  if (instability == null || instability < HIGH_INSTABILITY_THRESHOLD) return []

  const candidates: GadgetCandidate[] = []
  const { lasers, target, moleStrategy, soloMining } = ctx
  const equipped = equippedGadgetNames(ctx)

  for (const gadget of listMiningGadgets()) {
    if (equipped.has(gadget.name)) continue
    if (gadget.instabilityModifier >= 0) continue
    const adjustedTarget = targetWithGadgetResistance(target, gadget) ?? target

    const comparison = compareLoadoutToRock(lasers, adjustedTarget)
    if (!comparison?.canBreak) continue

    if (moleStrategy) {
      const strategy = findBestMoleLoadoutStrategy(lasers, adjustedTarget, {
        soloMining: soloMining,
      })
      if (!strategy?.canBreak) continue
    }

    const adjusted = rockInstabilityWithGadget(instability, gadget)
    const tradeoff =
      gadget.resistanceModifier > 0
        ? ` Note: also ${formatGadgetModifierPercent(gadget.resistanceModifier)} rock resistance while attached.`
        : ''

    candidates.push({
      gadget,
      reason: `${gadget.displayName} cuts instability from ${Math.round(instability).toLocaleString()} to ~${Math.round(adjusted).toLocaleString()} (${formatGadgetModifierPercent(gadget.instabilityModifier)}).${tradeoff}`,
      requiredPower: comparison.requiredPower,
      score: Math.abs(gadget.instabilityModifier) - gadget.resistanceModifier * 2,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

function findWindowGadgetCandidates(ctx: GadgetSuggestionContext): GadgetCandidate[] {
  if (!ctx.needWindow) return []

  const candidates: GadgetCandidate[] = []
  const equipped = equippedGadgetNames(ctx)

  for (const gadget of listMiningGadgets()) {
    if (equipped.has(gadget.name)) continue
    const windowScore = gadget.optimalWindowModifier + gadget.optimalWindowRateModifier * 0.5
    if (windowScore <= 0) continue

    candidates.push({
      gadget,
      reason: formatWindowGadgetReason(gadget, ctx.instability),
      requiredPower: null,
      score: windowScore,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

function pickPrimaryRole(ctx: GadgetSuggestionContext): GadgetSuggestionRole {
  if (!ctx.canBreak || ctx.needResistance) return 'resistance'
  if (ctx.needInstability) return 'instability'
  if (ctx.needWindow) return 'window'
  return 'resistance'
}

function candidatesForRole(
  role: GadgetSuggestionRole,
  ctx: GadgetSuggestionContext
): GadgetCandidate[] {
  switch (role) {
    case 'resistance':
      return findResistanceGadgetCandidates(ctx)
    case 'instability':
      return findInstabilityGadgetCandidates(ctx)
    case 'window':
      return findWindowGadgetCandidates(ctx)
  }
}

function shouldOfferRole(role: GadgetSuggestionRole, ctx: GadgetSuggestionContext): boolean {
  switch (role) {
    case 'resistance':
      return ctx.needResistance || !ctx.canBreak
    case 'instability':
      return ctx.needInstability
    case 'window':
      return ctx.needWindow
  }
}

function buildGadgetSuggestions(ctx: GadgetSuggestionContext): GadgetSuggestion[] {
  if (!ctx.needResistance && !ctx.needInstability && !ctx.needWindow) {
    return []
  }
  // Both gadget ports are already filled — nothing left to suggest.
  if ((ctx.target.selectedGadgetNames?.length ?? 0) >= 2) {
    return []
  }

  const primaryRole = pickPrimaryRole(ctx)
  const used = new Set<string>()
  const suggestions: GadgetSuggestion[] = []

  const addCandidate = (
    candidate: GadgetCandidate,
    role: GadgetSuggestionRole,
    recommended: boolean
  ) => {
    if (used.has(candidate.gadget.name)) return
    used.add(candidate.gadget.name)
    suggestions.push({
      gadget: candidate.gadget,
      reason: candidate.reason,
      role,
      requiredPower: candidate.requiredPower,
      recommended,
    })
  }

  const primaryCandidates = candidatesForRole(primaryRole, ctx)
  if (primaryCandidates[0]) {
    addCandidate(primaryCandidates[0], primaryRole, true)
  }
  if (primaryCandidates[1]) {
    addCandidate(primaryCandidates[1], primaryRole, false)
  }

  const alternateRoles: GadgetSuggestionRole[] = ['resistance', 'instability', 'window']
  for (const role of alternateRoles) {
    if (role === primaryRole) continue
    if (!shouldOfferRole(role, ctx)) continue
    const alternates = candidatesForRole(role, ctx)
    if (alternates[0]) {
      addCandidate(alternates[0], role, false)
    }
  }

  return suggestions
}

function buildGadgetContext(
  comparison: LoadoutBreakabilityComparison,
  target: RockBreakabilityTarget,
  lasers: MiningLaserSlotConfig[],
  moleStrategy: MoleLoadoutStrategy | null,
  soloMining: boolean
): GadgetSuggestionContext {
  const instability = target.instability ?? null
  const canBreak = moleStrategy?.canBreak ?? comparison.canBreak
  const easyCrack = moleStrategy
    ? isEasyCrackFromMole(moleStrategy, instability)
    : isEasyCrackFromComparison(comparison, instability)
  const nearCapacity = moleStrategy
    ? isNearCapacityFromMole(moleStrategy)
    : isNearLoadoutCapacity(comparison)
  const windowPressure =
    (instability != null && instability >= HIGH_INSTABILITY_THRESHOLD) ||
    (moleStrategy?.combinedWindowModifier ?? 0) < 0 ||
    nearCapacity

  const needResistance = !canBreak || nearCapacity
  const needInstability =
    canBreak && instability != null && instability >= HIGH_INSTABILITY_THRESHOLD && !easyCrack
  const needWindow = canBreak && windowPressure && !easyCrack

  return {
    canBreak,
    needResistance,
    needInstability,
    needWindow,
    instability,
    lasers,
    target,
    comparison,
    moleStrategy,
    soloMining,
  }
}

export function buildSmartCracker(
  vesselId: MiningVesselId,
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget,
  comparison: LoadoutBreakabilityComparison,
  options: SmartCrackerOptions = {}
): SmartCrackerResult {
  const moleSoloMining = options.moleSoloMining ?? true

  if (vesselId === 'mole') {
    const moleStrategy = findBestMoleLoadoutStrategy(lasers, target, { soloMining: moleSoloMining })
    if (!moleStrategy) {
      return {
        shouldAdvise: false,
        gadgetSuggestions: [],
        moleStrategy: null,
      }
    }

    const gadgetCtx = buildGadgetContext(
      comparison,
      target,
      lasers,
      moleStrategy,
      moleSoloMining
    )
    const gadgetSuggestions = buildGadgetSuggestions(gadgetCtx)
    const shouldAdvise =
      !moleStrategy.canBreak ||
      isNearCapacityFromMole(moleStrategy) ||
      gadgetSuggestions.length > 0

    return {
      shouldAdvise,
      gadgetSuggestions,
      moleStrategy,
    }
  }

  const gadgetCtx = buildGadgetContext(comparison, target, lasers, null, true)
  const gadgetSuggestions = buildGadgetSuggestions(gadgetCtx)
  const shouldAdvise =
    !comparison.canBreak ||
    isNearLoadoutCapacity(comparison) ||
    gadgetSuggestions.length > 0

  return {
    shouldAdvise,
    gadgetSuggestions,
    moleStrategy: null,
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
