import { gameMining, type MiningGadget } from '../data'

const gadgetsByName = new Map<string, MiningGadget>()
for (const gadget of gameMining.miningGadgets) {
  gadgetsByName.set(gadget.name, gadget)
}

export function getMiningGadgetByName(name: string): MiningGadget | undefined {
  return gadgetsByName.get(name)
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

export function formatGadgetModifierPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0%'
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
