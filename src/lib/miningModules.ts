import { gameMining, type MiningModule } from '../data'

const modulesByName = new Map<string, MiningModule>()
for (const mod of gameMining.miningModules) {
  modulesByName.set(mod.name, mod)
}

export function getMiningModuleByName(name: string): MiningModule | undefined {
  return modulesByName.get(name)
}

export function listMiningModules(): MiningModule[] {
  return gameMining.miningModules
}

export function emptyModuleSlots(moduleSlotCount: number): (string | null)[] {
  return Array.from({ length: moduleSlotCount }, () => null)
}

export function normalizeModuleSelection(
  laserName: string,
  modules: (string | null)[] | undefined
): (string | null)[] {
  const laser = gameMining.miningLasers.find((l) => l.name === laserName)
  const slotCount = laser?.moduleSlotCount ?? 0
  if (!slotCount) return []

  const input = modules ?? []
  const normalized = emptyModuleSlots(slotCount)
  for (let i = 0; i < slotCount; i++) {
    const name = input[i]
    normalized[i] = name && modulesByName.has(name) ? name : null
  }
  return normalized
}

export interface CombinedModuleModifiers {
  /**
   * Sum of per-module power deltas (multiplier − 1). SC stacks module power % additively
   * against stock laser base, not as a running product.
   */
  powerChangeSum: number
  resistanceModifier: number
  optimalWindowModifier: number
  filterModifier: number
  instabilityModifier: number
  shatterDamageModifier: number
}

const NEUTRAL_MODIFIERS: CombinedModuleModifiers = {
  powerChangeSum: 0,
  resistanceModifier: 0,
  optimalWindowModifier: 0,
  filterModifier: 0,
  instabilityModifier: 0,
  shatterDamageModifier: 0,
}

export function combineModuleModifiers(moduleNames: (string | null)[]): CombinedModuleModifiers {
  const result = { ...NEUTRAL_MODIFIERS }

  for (const name of moduleNames) {
    if (!name) continue
    const mod = modulesByName.get(name)
    if (!mod) continue
    result.powerChangeSum += mod.powerMultiplier - 1
    result.resistanceModifier += mod.resistanceModifier
    result.optimalWindowModifier += mod.optimalWindowModifier
    result.filterModifier += mod.filterModifier
    result.instabilityModifier += mod.instabilityModifier
    result.shatterDamageModifier += mod.shatterDamageModifier
  }

  return result
}

/** Effective power multiplier from stock base: 1 + craftDelta + sum(moduleDeltas). */
export function effectivePowerMultiplierFromBase(
  headMultiplier: number,
  moduleNames: (string | null)[]
): number {
  const headChange = headMultiplier - 1
  const moduleChange = combineModuleModifiers(moduleNames).powerChangeSum
  return 1 + headChange + moduleChange
}
