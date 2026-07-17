import { crackablePower, equalizationPower } from './miningBreakability'
import { laserResistanceMultiplier, type MiningLaserSlotConfig } from './miningLaserStats'
import { isRockBreakabilityTargetReady, type RockBreakabilityTarget } from './miningLoadoutCompare'
import {
  describeActiveModuleNames,
  getActivePortIndices,
  normalizeModuleSelection,
} from './miningModules'
import { throttlePercentFromMw } from './miningThrottleDisplay'
import { buildMoleHeadProfile } from './moleLoadoutStrategy'

/**
 * Per-head recommendation of which equipped active modules to switch on for a rock.
 *
 * Actives are OFF by default. We only recommend turning some on when the head cannot
 * crack the rock on its passive baseline, and we return the FEWEST actives that make it
 * crackable (best throttle headroom breaks ties) — avoiding unnecessary drain/instability.
 */
export interface HeadActiveModuleAdvice {
  slotIndex: number
  headLabel: string
  hasEquippedActives: boolean
  cracksOnPassive: boolean
  /** Minimal active module display names to switch on (empty when passive is enough). */
  recommendedModuleNames: string[]
  cracksWithRecommended: boolean
  /** Drive throttle % after applying the recommendation (or on passive when enough). */
  throttlePercent: number | null
}

interface CrackVerdict {
  cracks: boolean
  throttlePercent: number
}

function evaluateHeadCrack(
  slot: MiningLaserSlotConfig,
  slotIndex: number,
  activePorts: ReadonlySet<number> | undefined,
  mass: number,
  resistancePercent: number,
  instability: number
): CrackVerdict | null {
  const profile = buildMoleHeadProfile(slot, slotIndex, activePorts)
  if (!profile) return null

  const resMultiplier = laserResistanceMultiplier(profile.resistanceModifier)
  const effectiveInstability = Math.max(0, instability * (1 + profile.instabilityModifier / 100))
  const eq = equalizationPower(mass, resistancePercent, resMultiplier)
  const crackable = crackablePower(mass, resistancePercent, effectiveInstability, resMultiplier)
  const cracks = Number.isFinite(crackable) && profile.laserPower >= crackable
  const throttlePercent = Math.max(
    profile.throttleMinimumPercent,
    throttlePercentFromMw(eq, profile.laserPower)
  )
  return { cracks, throttlePercent }
}

function* portCombinations(ports: number[], size: number): Generator<number[]> {
  if (size === 0) {
    yield []
    return
  }
  for (let i = 0; i <= ports.length - size; i++) {
    for (const rest of portCombinations(ports.slice(i + 1), size - 1)) {
      yield [ports[i], ...rest]
    }
  }
}

export function recommendActiveModulesForHead(
  slot: MiningLaserSlotConfig,
  slotIndex: number,
  target: RockBreakabilityTarget | null
): HeadActiveModuleAdvice | null {
  if (!isRockBreakabilityTargetReady(target) || !target) return null

  const mass = target.scannerMass!
  const resistancePercent = target.resistancePercent!
  const instability = target.instability ?? 0

  const moduleNames = normalizeModuleSelection(slot.laserName, slot.modules)
  const activePorts = getActivePortIndices(moduleNames)

  const baseProfile = buildMoleHeadProfile(slot, slotIndex)
  const passive = evaluateHeadCrack(slot, slotIndex, undefined, mass, resistancePercent, instability)
  if (!baseProfile || !passive) return null

  const base = {
    slotIndex,
    headLabel: baseProfile.label,
    hasEquippedActives: activePorts.length > 0,
  }

  // Passive baseline already cracks → keep actives off (minimal).
  if (passive.cracks) {
    return {
      ...base,
      cracksOnPassive: true,
      recommendedModuleNames: [],
      cracksWithRecommended: true,
      throttlePercent: passive.throttlePercent,
    }
  }

  // Nothing to activate.
  if (!activePorts.length) {
    return {
      ...base,
      cracksOnPassive: false,
      recommendedModuleNames: [],
      cracksWithRecommended: false,
      throttlePercent: null,
    }
  }

  // Fewest actives that crack; best (lowest) throttle breaks ties within a size.
  for (let size = 1; size <= activePorts.length; size++) {
    let best: { subset: number[]; throttlePercent: number } | null = null
    for (const subset of portCombinations(activePorts, size)) {
      const verdict = evaluateHeadCrack(
        slot,
        slotIndex,
        new Set(subset),
        mass,
        resistancePercent,
        instability
      )
      if (verdict?.cracks && (!best || verdict.throttlePercent < best.throttlePercent)) {
        best = { subset, throttlePercent: verdict.throttlePercent }
      }
    }
    if (best) {
      return {
        ...base,
        cracksOnPassive: false,
        recommendedModuleNames: describeActiveModuleNames(moduleNames, best.subset),
        cracksWithRecommended: true,
        throttlePercent: best.throttlePercent,
      }
    }
  }

  // Even every active on cannot crack.
  return {
    ...base,
    cracksOnPassive: false,
    recommendedModuleNames: describeActiveModuleNames(moduleNames, activePorts),
    cracksWithRecommended: false,
    throttlePercent: null,
  }
}

export function recommendActiveModulesForHeads(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget | null
): HeadActiveModuleAdvice[] {
  return lasers
    .map((slot, slotIndex) => recommendActiveModulesForHead(slot, slotIndex, target))
    .filter((advice): advice is HeadActiveModuleAdvice => advice != null)
}
