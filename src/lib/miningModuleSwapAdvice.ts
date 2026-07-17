import { crackablePower, equalizationPower } from './miningBreakability'
import { laserResistanceMultiplier, type MiningLaserSlotConfig } from './miningLaserStats'
import type { RockBreakabilityTarget } from './miningLoadoutCompare'
import { isRockBreakabilityTargetReady } from './miningLoadoutCompare'
import { formatSignedPercent } from './miningLoadoutStatSemantics'
import { recommendActiveModulesForHeads } from './miningActiveModuleAdvice'
import { getMiningModuleByName, listPassiveModules, normalizeModuleSelection } from './miningModules'
import { throttlePercentFromMw } from './miningThrottleDisplay'
import {
  buildMoleHeadProfile,
  SOLO_IDEAL_THROTTLE_MAX,
  type MoleHeadProfile,
} from './moleLoadoutStrategy'

export type ModuleSwapKind = 'unlock' | 'headroom' | 'window'

export interface ModuleSwapSuggestion {
  slotIndex: number
  headLabel: string
  /** Module port (0-based) being changed. */
  portIndex: number
  /** Display name of the module coming out; null = empty port (pure add). */
  removeModule: string | null
  /** Display name of the module going in. */
  addModule: string
  kind: ModuleSwapKind
  /** Solo drive throttle % after the swap. */
  resultThrottlePercent: number
  reason: string
}

interface HeadVerdict {
  profile: MoleHeadProfile
  canCrack: boolean
  throttlePercent: number
}

function evaluateProfile(
  profile: MoleHeadProfile,
  mass: number,
  resistancePercent: number,
  instability: number
): HeadVerdict {
  const resMultiplier = laserResistanceMultiplier(profile.resistanceModifier)
  const effectiveInstability = Math.max(0, instability * (1 + profile.instabilityModifier / 100))
  const eq = equalizationPower(mass, resistancePercent, resMultiplier)
  const crackable = crackablePower(mass, resistancePercent, effectiveInstability, resMultiplier)
  const canCrack = Number.isFinite(crackable) && profile.laserPower >= crackable
  const throttle = Math.max(
    profile.throttleMinimumPercent,
    throttlePercentFromMw(eq, profile.laserPower)
  )
  return { profile, canCrack, throttlePercent: throttle }
}

function moduleDisplayName(internalName: string | null): string | null {
  if (!internalName) return null
  return getMiningModuleByName(internalName)?.displayName ?? internalName
}

interface SwapCandidate {
  suggestion: ModuleSwapSuggestion
  sortKey: number
}

function trySwapsForHead(
  slot: MiningLaserSlotConfig,
  slotIndex: number,
  current: HeadVerdict,
  mass: number,
  resistancePercent: number,
  instability: number,
  kind: ModuleSwapKind
): SwapCandidate[] {
  const currentModules = normalizeModuleSelection(slot.laserName, slot.modules)
  const passives = listPassiveModules()
  const results: SwapCandidate[] = []

  for (let port = 0; port < currentModules.length; port++) {
    const existing = currentModules[port]
    // Leave active ports alone — actives are toggled, not swapped, and the active-module
    // plan handles which ones to switch on. Swap advice only rearranges passive modules.
    if (existing && getMiningModuleByName(existing)?.kind === 'active') continue

    for (const candidate of passives) {
      if (candidate.name === existing) continue

      const swappedModules = [...currentModules]
      swappedModules[port] = candidate.name
      const swappedProfile = buildMoleHeadProfile({ ...slot, modules: swappedModules }, slotIndex)
      if (!swappedProfile) continue

      const after = evaluateProfile(swappedProfile, mass, resistancePercent, instability)
      if (!after.canCrack) continue

      if (kind === 'unlock') {
        // Must flip cannot → can. Also require sane driving headroom after swap.
        if (current.canCrack) continue
        if (after.throttlePercent > 90) continue
      } else if (kind === 'headroom') {
        // Must bring the head under the comfortable throttle cap.
        if (after.throttlePercent > SOLO_IDEAL_THROTTLE_MAX) continue
        if (after.throttlePercent >= current.throttlePercent) continue
      } else {
        // Window: keep crackable with headroom, materially widen the window.
        if (after.throttlePercent > SOLO_IDEAL_THROTTLE_MAX) continue
        if (after.profile.optimalWindowModifier < current.profile.optimalWindowModifier + 30) continue
      }

      const removeDisplay = moduleDisplayName(existing)
      const addDisplay = candidate.displayName
      const action = removeDisplay
        ? `swap ${removeDisplay} → ${addDisplay}`
        : `add ${addDisplay} to the empty port`
      const reason =
        kind === 'unlock'
          ? `${action} — makes this head crackable, drive @ ${after.throttlePercent}%`
          : kind === 'headroom'
            ? `${action} — drops drive throttle ${current.throttlePercent}% → ${after.throttlePercent}%`
            : `${action} — widens the optimal window (${formatSignedPercent(current.profile.optimalWindowModifier)} → ${formatSignedPercent(after.profile.optimalWindowModifier)}), still crackable @ ${after.throttlePercent}%`

      results.push({
        suggestion: {
          slotIndex,
          headLabel: current.profile.label,
          portIndex: port,
          removeModule: removeDisplay,
          addModule: addDisplay,
          kind,
          resultThrottlePercent: after.throttlePercent,
          reason,
        },
        sortKey:
          kind === 'window'
            ? -after.profile.optimalWindowModifier
            : after.throttlePercent,
      })
    }
  }

  return results
}

function bestPerHead(candidates: SwapCandidate[]): ModuleSwapSuggestion[] {
  const byHead = new Map<number, SwapCandidate>()
  for (const c of candidates) {
    const existing = byHead.get(c.suggestion.slotIndex)
    if (!existing || c.sortKey < existing.sortKey) byHead.set(c.suggestion.slotIndex, c)
  }
  return [...byHead.values()].sort((a, b) => a.sortKey - b.sortKey).map((c) => c.suggestion)
}

/**
 * On-the-fly module swap suggestions for the current rock.
 * Modules can be swapped at the head any time, so when the equipped set
 * leaves every head blocked or the best head marginal, we search every
 * single-module swap (passive modules only — active ports are toggled, not
 * swapped, and are handled by the active-module plan) and suggest ones that
 * actually fix the problem:
 *
 *  - unlock:   no head can crack → a swap makes one crackable (never suggested
 *              when no swap gets a head over the line)
 *  - headroom: best crackable head runs hot (> SOLO_IDEAL_THROTTLE_MAX) → a swap
 *              brings a head under the cap
 *  - window:   easy rock but combined window is negative → a swap widens the
 *              window while keeping comfortable crack headroom
 */
export function suggestModuleSwaps(
  lasers: MiningLaserSlotConfig[],
  target: RockBreakabilityTarget | null
): ModuleSwapSuggestion[] {
  if (!isRockBreakabilityTargetReady(target) || !target) return []

  const mass = target.scannerMass!
  const resistancePercent = target.resistancePercent!
  const instability = target.instability ?? 0

  const verdicts = lasers
    .map((slot, slotIndex) => {
      const profile = buildMoleHeadProfile(slot, slotIndex)
      return profile ? { slot, slotIndex, verdict: evaluateProfile(profile, mass, resistancePercent, instability) } : null
    })
    .filter((v): v is NonNullable<typeof v> => v != null)

  if (!verdicts.length) return []

  const crackableHeads = verdicts.filter((v) => v.verdict.canCrack)

  // Case 1: nothing can crack. If switching on equipped actives would crack a head,
  // defer to the active-module plan and stay quiet here. Otherwise look for unlock swaps.
  if (crackableHeads.length === 0) {
    const activesCanCrack = recommendActiveModulesForHeads(lasers, target).some(
      (advice) => advice.cracksWithRecommended && advice.recommendedModuleNames.length > 0
    )
    if (activesCanCrack) return []
    const candidates = verdicts.flatMap((v) =>
      trySwapsForHead(v.slot, v.slotIndex, v.verdict, mass, resistancePercent, instability, 'unlock')
    )
    return bestPerHead(candidates).slice(0, 2)
  }

  // Case 2: everything that can crack runs hot — look for headroom swaps.
  const comfortable = crackableHeads.filter(
    (v) => v.verdict.throttlePercent <= SOLO_IDEAL_THROTTLE_MAX
  )
  if (comfortable.length === 0) {
    const candidates = verdicts.flatMap((v) =>
      trySwapsForHead(v.slot, v.slotIndex, v.verdict, mass, resistancePercent, instability, 'headroom')
    )
    return bestPerHead(candidates).slice(0, 2)
  }

  // Case 3: easy rock but every comfortable head has a shrunken window.
  const easyRock = comfortable.some((v) => v.verdict.throttlePercent <= 50)
  const allNegativeWindows = comfortable.every((v) => v.verdict.profile.optimalWindowModifier < 0)
  if (easyRock && allNegativeWindows) {
    const candidates = comfortable.flatMap((v) =>
      trySwapsForHead(v.slot, v.slotIndex, v.verdict, mass, resistancePercent, instability, 'window')
    )
    return bestPerHead(candidates).slice(0, 1)
  }

  return []
}
