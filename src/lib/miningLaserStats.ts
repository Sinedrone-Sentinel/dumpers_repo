import gameBlueprintsData from '../data/game-blueprints.json'
import type { MiningLaser } from '../data'
import {
  computeBlueprintEffectiveModifiers,
  type BlueprintForEffectiveStats,
} from './blueprintEffectiveStats'
import {
  combineModuleModifiers,
  effectivePowerMultiplierFromBase,
  normalizeModuleSelection,
} from './miningModules'
import { getMiningLaserByName } from './miningVessels'

const blueprintsByInternalName = new Map<string, BlueprintForEffectiveStats>()
for (const bp of gameBlueprintsData.blueprints) {
  if (bp.internalName) {
    blueprintsByInternalName.set(bp.internalName.toLowerCase(), bp as BlueprintForEffectiveStats)
  }
}

/** Map `Mining_Laser_THCN_Helix_S2` → `mining_laser_thcn_helix_s2` */
export function laserNameToBlueprintInternal(laserName: string): string {
  return laserName.replace(/^Mining_Laser_/i, 'mining_laser_').toLowerCase()
}

export function getBlueprintForLaser(laserName: string): BlueprintForEffectiveStats | null {
  const key = laserNameToBlueprintInternal(laserName)
  return blueprintsByInternalName.get(key) ?? null
}

export type LaserHeadMode = 'stock' | 'custom'

export interface MiningLaserSlotConfig {
  laserName: string
  mode: LaserHeadMode
  /** Per blueprint craft slot qualities when `mode === 'custom'` */
  slotQualities?: Record<number, number>
  /** Optional nickname for a crafted head, e.g. "Q847 Helix" */
  customLabel?: string
  /** Equipped consumable modules per head itemport (null = empty slot). */
  modules?: (string | null)[]
}

export interface EffectiveMiningLaserStats {
  laserName: string
  displayName: string
  laserPower: number
  /** Stock baseline power from game files (factory head, no craft roll) */
  stockLaserPower: number
  resistanceModifier: number
  instabilityModifier: number
  size: number
  mode: LaserHeadMode
  customLabel?: string
  /** Combined weapon_damage multiplier from blueprint craft (1.0 = stock) */
  powerMultiplier: number
}

function weaponDamageMultiplier(
  blueprint: BlueprintForEffectiveStats | null,
  slotQualities: Record<number, number> | null | undefined
): number {
  if (!blueprint?.slots?.length) return 1

  const modifiers = computeBlueprintEffectiveModifiers(blueprint, slotQualities ?? null)
  const damageMod = modifiers.find((m) => m.property.toLowerCase() === 'weapon_damage')
  return damageMod?.combinedModifier ?? 1
}

/**
 * Converts laser resistance modifier % from game data into breakability multiplier.
 * Negative modifiers (Helix) reduce effective rock resistance; positive (Arbor) increase it.
 */
export function laserResistanceMultiplier(laserResistanceModifierPercent: number): number {
  return 1 + laserResistanceModifierPercent / 100
}

export function computeEffectiveLaserStats(
  slot: MiningLaserSlotConfig
): EffectiveMiningLaserStats | null {
  const laser = getMiningLaserByName(slot.laserName)
  if (!laser) return null

  const blueprint = getBlueprintForLaser(slot.laserName)
  const useCustom = slot.mode === 'custom' && blueprint != null
  const headMultiplier = useCustom
    ? weaponDamageMultiplier(blueprint, slot.slotQualities)
    : 1

  const moduleNames = normalizeModuleSelection(slot.laserName, slot.modules)
  const moduleMods = combineModuleModifiers(moduleNames)
  const powerMultiplier = effectivePowerMultiplierFromBase(headMultiplier, moduleNames)
  const effectiveResistance = laser.resistanceModifier + moduleMods.resistanceModifier

  return {
    laserName: laser.name,
    displayName: laser.displayName,
    laserPower: Math.round(laser.laserPower * powerMultiplier),
    stockLaserPower: laser.laserPower,
    resistanceModifier: effectiveResistance,
    instabilityModifier: laser.instabilityModifier + moduleMods.instabilityModifier,
    size: laser.size,
    mode: slot.mode,
    customLabel: slot.customLabel,
    powerMultiplier,
  }
}

export function buildDefaultLaserSlots(
  laserName: string,
  count: number
): MiningLaserSlotConfig[] {
  return Array.from({ length: count }, () => ({
    laserName,
    mode: 'stock' as const,
  }))
}

export function laserHasBlueprint(laserName: string): boolean {
  return getBlueprintForLaser(laserName) != null
}

export function formatLaserPowerMw(power: number): string {
  return power.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function describeLaserHead(slot: MiningLaserSlotConfig, laser?: MiningLaser | null): string {
  const base = laser?.displayName ?? slot.laserName
  if (slot.mode === 'custom') {
    return slot.customLabel?.trim() ? slot.customLabel.trim() : `${base} (crafted)`
  }
  return base
}
