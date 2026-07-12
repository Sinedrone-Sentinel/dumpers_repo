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

export function listPassiveModules(): MiningModule[] {
  return gameMining.miningModules.filter((mod) => mod.kind === 'passive')
}

export function listActiveModules(): MiningModule[] {
  return gameMining.miningModules.filter((mod) => mod.kind === 'active')
}

export function isActiveModule(moduleName: string): boolean {
  const mod = modulesByName.get(moduleName)
  return mod?.kind === 'active'
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

/** Get names of equipped active modules from a module slot array. */
export function getEquippedActiveModules(moduleNames: (string | null)[]): string[] {
  return moduleNames.filter((name): name is string => name != null && isActiveModule(name))
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

function addModuleToModifiers(result: CombinedModuleModifiers, mod: MiningModule): void {
  result.powerChangeSum += mod.powerMultiplier - 1
  result.resistanceModifier += mod.resistanceModifier
  result.optimalWindowModifier += mod.optimalWindowModifier
  result.filterModifier += mod.filterModifier
  result.instabilityModifier += mod.instabilityModifier
  result.shatterDamageModifier += mod.shatterDamageModifier
}

/**
 * Combine PASSIVE module effects only. Active modules must be activated one-at-a-time
 * and should be calculated separately via `getActiveModuleModifiers`.
 */
export function combinePassiveModuleModifiers(moduleNames: (string | null)[]): CombinedModuleModifiers {
  const result = { ...NEUTRAL_MODIFIERS }

  for (const name of moduleNames) {
    if (!name) continue
    const mod = modulesByName.get(name)
    if (!mod || mod.kind === 'active') continue
    addModuleToModifiers(result, mod)
  }

  return result
}

/**
 * Get the modifiers for a single active module. Only ONE active can run at a time in-game.
 * Returns neutral modifiers if the module is not found or is passive.
 */
export function getActiveModuleModifiers(moduleName: string | null): CombinedModuleModifiers {
  const result = { ...NEUTRAL_MODIFIERS }
  if (!moduleName) return result

  const mod = modulesByName.get(moduleName)
  if (!mod || mod.kind !== 'active') return result

  addModuleToModifiers(result, mod)
  return result
}

/**
 * @deprecated Use combinePassiveModuleModifiers for base calculation,
 * then add getActiveModuleModifiers for active boost scenarios.
 * This legacy function combines ALL modules (passive + active) which is incorrect
 * since only one active can run at a time.
 */
export function combineModuleModifiers(moduleNames: (string | null)[]): CombinedModuleModifiers {
  const result = { ...NEUTRAL_MODIFIERS }

  for (const name of moduleNames) {
    if (!name) continue
    const mod = modulesByName.get(name)
    if (!mod) continue
    addModuleToModifiers(result, mod)
  }

  return result
}

/**
 * Effective power multiplier from stock base using PASSIVE modules only.
 * Formula: 1 + craftDelta + sum(passiveModuleDeltas)
 */
export function effectivePowerMultiplierFromBase(
  headMultiplier: number,
  moduleNames: (string | null)[]
): number {
  const headChange = headMultiplier - 1
  const passiveChange = combinePassiveModuleModifiers(moduleNames).powerChangeSum
  return 1 + headChange + passiveChange
}

/**
 * Effective power multiplier with an active module boost.
 * Formula: 1 + craftDelta + sum(passiveModuleDeltas) + activeModuleDelta
 */
export function effectivePowerMultiplierWithActive(
  headMultiplier: number,
  moduleNames: (string | null)[],
  activeModuleName: string | null
): number {
  const base = effectivePowerMultiplierFromBase(headMultiplier, moduleNames)
  if (!activeModuleName) return base
  const activeChange = getActiveModuleModifiers(activeModuleName).powerChangeSum
  return base + activeChange
}
