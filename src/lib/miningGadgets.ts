import { gameMining, type MiningGadget } from '../data'

const gadgetsByName = new Map<string, MiningGadget>()
for (const gadget of gameMining.miningGadgets) {
  gadgetsByName.set(gadget.name, gadget)
}

export function getMiningGadgetByName(name: string): MiningGadget | undefined {
  return gadgetsByName.get(name)
}

/** The game allows one mining gadget on a rock at a time. */
export const MAX_GADGETS_PER_ROCK = 1

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
 * A gadget modifies the rock's BASE stats (resistance + instability) the same way a
 * crafted head modifies a laser's base stats — the adjusted values become the new
 * base that head/module modifiers then apply on top of. Returns adjusted resistance %
 * and instability.
 */
export function applyGadgetToRockStats(
  stats: RockBaseStats,
  gadget: MiningGadget | null | undefined
): RockBaseStats {
  if (!gadget) return stats
  const { resistancePercent, instability } = stats
  return {
    resistancePercent:
      resistancePercent != null && Number.isFinite(resistancePercent)
        ? rockResistanceWithGadget(resistancePercent, gadget)
        : resistancePercent,
    instability:
      instability != null && Number.isFinite(instability)
        ? rockInstabilityWithGadget(instability, gadget)
        : instability,
  }
}

export function formatGadgetModifierPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0%'
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
