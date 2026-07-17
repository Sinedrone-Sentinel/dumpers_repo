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

/** Port indices (into a normalized module array) that hold an active module. */
export function getActivePortIndices(moduleNames: (string | null)[]): number[] {
  const ports: number[] = []
  for (let i = 0; i < moduleNames.length; i++) {
    const name = moduleNames[i]
    if (name && isActiveModule(name)) ports.push(i)
  }
  return ports
}

/** Display names for the modules at the given port indices (in ascending port order). */
export function describeActiveModuleNames(
  moduleNames: (string | null)[],
  ports: Iterable<number>
): string[] {
  const out: string[] = []
  for (const port of [...ports].sort((a, b) => a - b)) {
    const name = moduleNames[port]
    if (!name) continue
    out.push(modulesByName.get(name)?.displayName ?? name)
  }
  return out
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
 * Combine module effects. Passive modules are ALWAYS on. Active modules are only
 * folded in when their port index is present in `activePortsOn`.
 *
 * In-game an active module gives its bonus only while triggered, but every installed
 * active can run at the same time (up to the head's module-slot count). The passive
 * baseline (no `activePortsOn`, or an empty set) is the "actives off" resting state;
 * pass a port set to model specific actives being turned on.
 */
export function combineModuleModifiers(
  moduleNames: (string | null)[],
  activePortsOn?: ReadonlySet<number>
): CombinedModuleModifiers {
  const result = { ...NEUTRAL_MODIFIERS }

  for (let i = 0; i < moduleNames.length; i++) {
    const name = moduleNames[i]
    if (!name) continue
    const mod = modulesByName.get(name)
    if (!mod) continue
    if (mod.kind === 'active' && !(activePortsOn?.has(i) ?? false)) continue
    addModuleToModifiers(result, mod)
  }

  return result
}

/** Passive-only baseline (all actives off). */
export function combinePassiveModuleModifiers(
  moduleNames: (string | null)[]
): CombinedModuleModifiers {
  return combineModuleModifiers(moduleNames)
}

/** All equipped modules with every installed active turned on (for the "actives on" overlay). */
export function combineEquippedModuleModifiers(
  moduleNames: (string | null)[]
): CombinedModuleModifiers {
  return combineModuleModifiers(moduleNames, new Set(getActivePortIndices(moduleNames)))
}

/**
 * Effective power multiplier from stock base.
 *
 * Craft quality raises the head's BASE power FIRST (a crafted head literally has a
 * higher base stat), and module power % then stacks on that crafted base:
 *
 *   effectivePower = stockBase × craftMultiplier × (1 + sumModuleDeltas)
 *
 * so the returned multiplier (relative to stock base) is:
 *   craftMultiplier × (1 + sum(passiveDeltas) + sum(activeDeltas for ports turned on))
 *
 * Module deltas still stack additively among themselves; the change here is that they
 * apply to the crafted base rather than the stock base.
 */
export function effectivePowerMultiplierFromBase(
  headMultiplier: number,
  moduleNames: (string | null)[],
  activePortsOn?: ReadonlySet<number>
): number {
  const moduleChange = combineModuleModifiers(moduleNames, activePortsOn).powerChangeSum
  return headMultiplier * (1 + moduleChange)
}
