import { gameMining, type MiningGadget } from '../data'

const gadgetsByName = new Map<string, MiningGadget>()
for (const gadget of gameMining.miningGadgets) {
  gadgetsByName.set(gadget.name, gadget)
}

export function getMiningGadgetByName(name: string): MiningGadget | undefined {
  return gadgetsByName.get(name)
}

/** Resolve an ordered list of gadget names to gadget records, skipping blanks/unknowns. */
export function getMiningGadgetsByNames(
  names: readonly (string | null | undefined)[]
): MiningGadget[] {
  const resolved: MiningGadget[] = []
  for (const name of names) {
    if (!name) continue
    const gadget = gadgetsByName.get(name)
    if (gadget) resolved.push(gadget)
  }
  return resolved
}

export function listMiningGadgets(): MiningGadget[] {
  return gameMining.miningGadgets
}

/** SC rock modifiers from gadgets are multiplicative % deltas on the base scanner value. */
export function applyRockMultiplicativePercent(
  baseValue: number,
  modifierPercent: number
): number {
  if (!Number.isFinite(baseValue)) return baseValue
  return baseValue * (1 + modifierPercent / 100)
}

export function rockResistanceWithGadget(
  resistancePercent: number,
  gadget: MiningGadget
): number {
  return applyRockMultiplicativePercent(resistancePercent, gadget.resistanceModifier)
}

/**
 * Gadget "Laser Instability" modifies the rock's displayed instability multiplicatively,
 * the same way the resistance modifier works (e.g. BoreMax −70% → instability × 0.30).
 */
export function rockInstabilityWithGadget(
  instability: number,
  gadget: MiningGadget
): number {
  return Math.max(0, applyRockMultiplicativePercent(instability, gadget.instabilityModifier))
}

export interface RockBaseStats {
  resistancePercent: number | null
  instability: number | null
}

/**
 * Gadgets modify the rock's BASE stats (resistance + instability) the same way a
 * crafted head modifies a laser's base stats — the adjusted values become the new
 * base that head/module modifiers then apply on top of. Multiple gadgets stack
 * multiplicatively. Returns adjusted resistance % and instability.
 */
export function applyGadgetsToRockStats(
  stats: RockBaseStats,
  gadgets: readonly MiningGadget[]
): RockBaseStats {
  let resistancePercent = stats.resistancePercent
  let instability = stats.instability
  for (const gadget of gadgets) {
    if (resistancePercent != null && Number.isFinite(resistancePercent)) {
      resistancePercent = rockResistanceWithGadget(resistancePercent, gadget)
    }
    if (instability != null && Number.isFinite(instability)) {
      instability = rockInstabilityWithGadget(instability, gadget)
    }
  }
  return { resistancePercent, instability }
}

export function formatGadgetModifierPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0%'
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
