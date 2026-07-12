import type { ClusterDisplayProfile, LocationSpawnProfile } from './miningClusterProfiles'
import { getMineableElementStats, oreResistanceToHudPercent } from './mineableElementStats'
import { applyRockMultiplicativePercent } from './miningGadgets'

/** Ship mining global mass coefficient (from MiningGlobalParamsShip). */
export const MINING_MASS_COEFFICIENT = 0.2

export interface BreakabilityRange {
  min: number
  max: number
}

export interface BreakabilityResult {
  scannerMassRange: BreakabilityRange | null
  breakabilityRange: BreakabilityRange | null
  resistance: number | null
}

type MassSource = Pick<ClusterDisplayProfile | LocationSpawnProfile, 'scannerMassRange'>

function roundDisplay(value: number): number {
  return Math.round(value)
}

/**
 * Effective resistance fraction (0–1) from scanner resistance % and optional laser modifier.
 * `resistancePercent` is the HUD value (e.g. 50 for 50%, not 0.5).
 */
export function effectiveResistanceFraction(
  resistancePercent: number,
  resistanceModifier = 1
): number {
  return Math.max(0, Math.min(1, (resistancePercent / 100) * resistanceModifier))
}

/**
 * Mining-seat HUD resistance from the pilot scan plus head/module resistance shift.
 * Example: pilot 74% with Helix −30% → ~52% on that turret.
 */
export function effectiveHudResistancePercent(
  pilotResistancePercent: number,
  headResistanceModifierPercent: number
): number {
  return Math.round(
    Math.max(
      0,
      Math.min(100, applyRockMultiplicativePercent(pilotResistancePercent, headResistanceModifierPercent))
    )
  )
}

/**
 * Required laser power (MW) to fracture a rock from scanner mass and resistance.
 */
export function requiredLaserPower(
  scannerMass: number,
  resistancePercent: number,
  resistanceModifier = 1
): number {
  if (!Number.isFinite(scannerMass) || scannerMass <= 0) return 0
  const effective = effectiveResistanceFraction(resistancePercent, resistanceModifier)
  const denominator = 1 - effective
  if (denominator <= 0) return Infinity
  return (scannerMass * MINING_MASS_COEFFICIENT) / denominator
}

export function computeBreakabilityForOre(
  oreName: string,
  profile?: MassSource | null,
  resistanceOverride?: number | null
): BreakabilityResult {
  const stats = getMineableElementStats(oreName)
  const scannerMassRange = profile?.scannerMassRange ?? null
  const resistance =
    resistanceOverride != null && Number.isFinite(resistanceOverride)
      ? resistanceOverride
      : stats?.resistance != null
        ? oreResistanceToHudPercent(stats.resistance)
        : null

  if (resistance == null) {
    return { scannerMassRange, breakabilityRange: null, resistance: null }
  }

  if (!scannerMassRange) {
    return { scannerMassRange: null, breakabilityRange: null, resistance }
  }

  return {
    scannerMassRange,
    breakabilityRange: {
      min: roundDisplay(requiredLaserPower(scannerMassRange.min, resistance)),
      max: roundDisplay(requiredLaserPower(scannerMassRange.max, resistance)),
    },
    resistance,
  }
}

export function formatScannerMassRange(range: BreakabilityRange | null): string | null {
  if (!range) return null
  const min = roundDisplay(range.min)
  const max = roundDisplay(range.max)
  if (min === max) return min.toLocaleString()
  return `${min.toLocaleString()}–${max.toLocaleString()}`
}

export function formatBreakabilityRange(range: BreakabilityRange | null): string | null {
  if (!range) return null
  const min = roundDisplay(range.min)
  const max = roundDisplay(range.max)
  if (min === max) return min.toLocaleString()
  return `${min.toLocaleString()}–${max.toLocaleString()}`
}

export function formatRequiredPower(scannerMass: number | null, resistancePercent: number | null): string | null {
  if (scannerMass == null || resistancePercent == null) return null
  if (!Number.isFinite(scannerMass) || scannerMass <= 0) return null
  if (!Number.isFinite(resistancePercent)) return null
  const power = requiredLaserPower(scannerMass, resistancePercent)
  if (!Number.isFinite(power)) return null
  return roundDisplay(power).toLocaleString()
}
